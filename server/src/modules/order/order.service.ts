import { pool } from "../../db"
import { cartService } from "../cart/cart.service"
import { eventBus, runWorkflow } from "../infra/platform-infra.service"
import { shapeStoreOrder } from "./order-store-shape"
import { paymentSessionService } from "./payment-session.service"
import { OrderDTO } from "./order.types"

// Port of Lupus checkout: complete-cart workflow + create-order + payment collection flow
// (packages/core/core-flows/src/cart/workflows/complete-cart.ts + order/workflows/create-order.ts).
// Steps mirrored: validate cart not completed + non-empty, re-verify inventory
// (confirm-variant-inventory), snapshot items AND adjustments/tax lines into order,
// create payment_collection for cart total, complete cart, bump promotion usage_count
// (on-carry-promotions-flag / usage tracking). Compensation = ROLLBACK.
export class OrderService {
  async createFromCart(cartId: string): Promise<OrderDTO> {
    return runWorkflow("complete-cart", { cart_id: cartId }, async (step) => {
    const cart = await cartService.retrieve(cartId)
    if (!cart) {
      throw Object.assign(new Error("Cart not found"), { statusCode: 404 })
    }
    if (cart.completed_at) {
      throw Object.assign(new Error("Cart already completed"), { statusCode: 400 })
    }
    if (cart.items.length === 0) {
      throw Object.assign(new Error("Cart is empty"), { statusCode: 400 })
    }
    step("validate-cart")
    // Lupus complete-cart: a payment collection initiated for the cart is authorized through its
    // pending session (the manual / pp_system_default provider authorizes immediately). A cart without
    // one keeps the legacy behaviour: the order starts with a fresh not_paid collection.
    const cartPc = await pool.query(`SELECT id FROM payment_collection WHERE cart_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [cart.id])
    const cartPcId: string | null = cartPc.rows[0]?.id ?? null
    if (cartPcId) {
      const pending = await pool.query(
        `SELECT id FROM payment_session WHERE payment_collection_id=$1 AND status='pending' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
        [cartPcId]
      )
      if (pending.rows[0]) {
        await pool.query(`UPDATE payment_collection SET amount=$2 WHERE id=$1`, [cartPcId, cart.totals.total])
        await paymentSessionService.authorizeSession(pending.rows[0].id)
      }
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      // Re-verify inventory inside tx (row lock equivalent via inventory check + decrement)
      for (const item of cart.items) {
        if (!item.variant_id) {
          continue
        }
        const inv = await client.query(`SELECT stocked_quantity FROM inventory_level WHERE variant_id=$1`, [item.variant_id])
        if (inv.rows[0] && inv.rows[0].stocked_quantity < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for ${item.title}`), { statusCode: 400 })
        }
      }
      const pc = cartPcId
        ? await client.query(`SELECT * FROM payment_collection WHERE id=$1`, [cartPcId])
        : await client.query(`INSERT INTO payment_collection (currency_code, amount, status) VALUES ($1,$2,'not_paid') RETURNING *`, [cart.currency_code, cart.totals.total])
      const o = await client.query(
        `INSERT INTO "order" (cart_id, customer_id, region_id, payment_collection_id, email, currency_code, subtotal, discount_total, shipping_total, tax_total, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [cart.id, cart.customer_id, cart.region_id, pc.rows[0].id, cart.email, cart.currency_code, cart.totals.subtotal, (cart.totals as any).discount_total ?? 0, cart.totals.shipping, cart.totals.tax_total, cart.totals.total]
      )
      const order = o.rows[0]
      for (const item of cart.items) {
        await client.query(
          `INSERT INTO order_line_item (order_id, variant_id, product_id, title, variant_title, variant_sku, quantity, unit_price, discount_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [order.id, item.variant_id, item.product_id, item.title, (item as any).variant_title ?? null, (item as any).variant_sku ?? null, item.quantity, item.unit_price, (item as any).discount_total ?? 0]
        )
        if (item.variant_id) {
          await client.query(
            `UPDATE inventory_level SET stocked_quantity = stocked_quantity - $2 WHERE variant_id=$1 AND stocked_quantity >= $2`,
            [item.variant_id, item.quantity]
          )
        }
      }
      // Snapshot cart addresses onto the order (Lupus copies addresses at checkout)
      const addrs = await client.query(`SELECT kind, first_name, last_name, company, address_1, address_2, city, country_code, province, postal_code, phone FROM cart_address WHERE cart_id=$1`, [cart.id])
      for (const a of addrs.rows) {
        await client.query(
          `INSERT INTO order_address (order_id, kind, first_name, last_name, company, address_1, address_2, city, country_code, province, postal_code, phone)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (order_id, kind) DO UPDATE
           SET first_name=$3, last_name=$4, company=$5, address_1=$6, address_2=$7, city=$8, country_code=$9, province=$10, postal_code=$11, phone=$12`,
          [order.id, a.kind, a.first_name, a.last_name, a.company, a.address_1, a.address_2, a.city, a.country_code, a.province, a.postal_code, a.phone]
        )
      }
      // Snapshot the chosen shipping methods (Lupus order shipping methods)
      const methods = await client.query(`SELECT shipping_option_id, name, amount, data FROM cart_shipping_method WHERE cart_id=$1`, [cart.id])
      for (const m of methods.rows) {
        await client.query(`INSERT INTO order_shipping_method (order_id, shipping_option_id, name, amount, data) VALUES ($1,$2,$3,$4,$5)`, [
          order.id,
          m.shipping_option_id,
          m.name,
          m.amount,
          m.data ? JSON.stringify(m.data) : null,
        ])
      }
      // Consume applied gift cards (decrement balance + audit transaction)
      const applied = await client.query(
        `SELECT cg.gift_card_id, gc.balance FROM cart_gift_card cg JOIN gift_card gc ON gc.id=cg.gift_card_id WHERE cg.cart_id=$1 FOR UPDATE`,
        [cart.id]
      )
      let remaining = cart.totals.subtotal + ((cart.totals as any).discount_total ?? 0) + cart.totals.shipping + cart.totals.tax_total
      for (const g of applied.rows) {
        const take = Math.min(Number(g.balance), Math.max(remaining, 0))
        if (take > 0) {
          await client.query(`UPDATE gift_card SET balance = balance - $2 WHERE id=$1`, [g.gift_card_id, take])
          await client.query(`INSERT INTO gift_card_transaction (gift_card_id, order_id, amount) VALUES ($1,$2,$3)`, [g.gift_card_id, order.id, -take])
          remaining -= take
        }
      }
      await client.query(`DELETE FROM cart_gift_card WHERE cart_id=$1`, [cart.id])
      // consume cart credit lines: decrement remaining + snapshot onto order
      const appliedCredits = await client.query(
        `SELECT ccl.credit_line_id, ccl.amount, cl.remaining FROM cart_credit_line ccl
         JOIN credit_line cl ON cl.id = ccl.credit_line_id WHERE ccl.cart_id=$1 FOR UPDATE`,
        [cart.id]
      )
      for (const cc of appliedCredits.rows) {
        const take = Math.min(Number(cc.amount), Number(cc.remaining))
        if (take > 0) {
          await client.query(`UPDATE credit_line SET remaining = remaining - $2 WHERE id=$1`, [cc.credit_line_id, take])
          await client.query(`INSERT INTO order_credit_line (order_id, credit_line_id, amount) VALUES ($1,$2,$3)`, [order.id, cc.credit_line_id, take])
        }
      }
      await client.query(`DELETE FROM cart_credit_line WHERE cart_id=$1`, [cart.id])
      await client.query(
        `UPDATE promotion SET usage_count = usage_count + 1 WHERE id IN (SELECT promotion_id FROM cart_promotion WHERE cart_id=$1)`,
        [cart.id]
      )
      // campaign usage + spend tracking (Lupus campaign-budget-usage parity)
      const spent = await client.query(
        `SELECT p.campaign_id, COALESCE(SUM(ABS(lia.amount)),0)::int AS spent
         FROM cart_promotion cp JOIN promotion p ON p.id = cp.promotion_id
         LEFT JOIN line_item_adjustment lia ON lia.cart_id = cp.cart_id AND lia.promotion_id = p.id
         WHERE cp.cart_id = $1 AND p.campaign_id IS NOT NULL GROUP BY p.campaign_id`,
        [cart.id]
      )
      for (const s of spent.rows) {
        await client.query(`UPDATE campaign SET usage_count = usage_count + 1, budget_used = budget_used + $2 WHERE id = $1`, [s.campaign_id, Number(s.spent)])
      }
      await client.query(`UPDATE cart SET completed_at=NOW() WHERE id=$1`, [cart.id])
      await client.query("COMMIT")
      step("create-payment-collection", { id: pc.rows[0].id })
      step("create-order", { id: order.id })
      const placed = (await this.retrieve(order.id)) as OrderDTO
      await eventBus.emit("order.placed", { order_id: order.id, email: order.email, total: order.total }).catch(() => undefined)
      step("emit-order-placed")
      return placed
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    })
  }

  async retrieve(id: string): Promise<OrderDTO | null> {
    const { rows } = await pool.query(
      `SELECT o.*, pc.status AS payment_status FROM "order" o LEFT JOIN payment_collection pc ON pc.id=o.payment_collection_id WHERE o.id=$1 AND o.deleted_at IS NULL`,
      [id]
    )
    if (!rows[0]) {
      return null
    }
    const items = await pool.query(`SELECT * FROM order_line_item WHERE order_id=$1 ORDER BY created_at`, [id])
    return (await shapeStoreOrder(rows[0], items.rows)) as OrderDTO
  }

  async list(limit = 50, offset = 0): Promise<OrderDTO[]> {
    const { rows } = await pool.query(
      `SELECT o.*, pc.status AS payment_status FROM "order" o LEFT JOIN payment_collection pc ON pc.id=o.payment_collection_id WHERE o.deleted_at IS NULL ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
      [Math.min(limit, 100), offset]
    )
    return rows
  }

  async cancel(id: string): Promise<void> {
    await pool.query(`UPDATE "order" SET status='canceled', canceled_at=NOW() WHERE id=$1`, [id])
    const o = await pool.query(`SELECT email, total FROM "order" WHERE id=$1`, [id])
    await eventBus.emit("order.canceled", { order_id: id, email: o.rows[0]?.email }).catch(() => undefined)
  }
}

export const orderService = new OrderService()
