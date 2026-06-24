import { pool } from "../../db"
import { fulfillmentService } from "../fulfillment/fulfillment.service"
import { inventoryService } from "../inventory/inventory.service"
import { pricingService } from "../pricing/pricing.service"
import { promotionService } from "../promotion/promotion.service"
import { taxService } from "../tax/tax.service"
import { shapeStoreCart } from "./cart-store-shape"
import { AddLineItemInput, CartDTO, CreateCartInput } from "./cart.types"

// Full-logic port of CartModuleService + core-flows cart workflows:
// add-to-cart (with confirm-variant-inventory + get-variants-and-items-with-prices),
// update-line-item-in-cart, refresh-cart-items, update-cart-promotions, update-tax-lines,
// list-shipping-options-for-cart, transfer-cart-customer.
// Totals mirror Lupus: subtotal - discount (adjustments) +/- tax (inclusive/exclusive per line)
// + shipping + shipping tax. Adjustments and tax lines are persisted tables, recomputed on
// every mutation exactly like the refresh steps.
export class CartService {
  async create(input: CreateCartInput): Promise<CartDTO> {
    const { rows } = await pool.query(
      `INSERT INTO cart (region_id, customer_id, sales_channel_id, email, currency_code) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.region_id ?? null, input.customer_id ?? null, (input as any).sales_channel_id ?? null, input.email ?? null, (input.currency_code ?? "vnd").toLowerCase()]
    )
    return this.withItems(rows[0])
  }

  async retrieveActive(cartId: string | null): Promise<CartDTO | null> {
    if (!cartId) return null
    return this.retrieve(cartId)
  }

  async retrieve(id: string): Promise<CartDTO | null> {
    const { rows } = await pool.query(`SELECT * FROM cart WHERE id=$1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) {
      return null
    }
    return this.withItems(rows[0])
  }

  async addItem(cartId: string, input: AddLineItemInput): Promise<CartDTO> {
    const cart = await pool.query(`SELECT * FROM cart WHERE id=$1 AND deleted_at IS NULL AND completed_at IS NULL`, [
      cartId,
    ])
    if (!cart.rows[0]) {
      throw Object.assign(new Error("Active cart not found"), { statusCode: 404 })
    }
    const currency = cart.rows[0].currency_code as string
    const v = await pool.query(
      `SELECT v.id, v.product_id, v.title, v.sku, p.title AS product_title
       FROM product_variant v LEFT JOIN product p ON p.id=v.product_id
       WHERE v.id=$1 AND v.deleted_at IS NULL`,
      [input.variant_id]
    )
    const variant = v.rows[0]
    if (!variant) {
      throw Object.assign(new Error("Variant not found"), { statusCode: 404 })
    }
    // confirm-variant-inventory: existing qty + new qty must be available
    const existing = await pool.query(
      `SELECT id, quantity FROM cart_line_item WHERE cart_id=$1 AND variant_id=$2 AND deleted_at IS NULL`,
      [cartId, input.variant_id]
    )
    const wantQty = (existing.rows[0]?.quantity ?? 0) + input.quantity
    await inventoryService.ensureAvailable(input.variant_id, wantQty)
    // get-variants-and-items-with-prices: price-list + customer-group aware resolution
    const unitPrice = await pricingService.resolveUnitPrice(input.variant_id, currency, wantQty, cart.rows[0].customer_id)
    // sales-channel publish check (product_sales_channel pivot + link module)
    if (cart.rows[0].sales_channel_id && variant.product_id) {
      const pub = await pool.query(`SELECT 1 FROM product_sales_channel WHERE product_id=$1 AND sales_channel_id=$2`, [
        variant.product_id,
        cart.rows[0].sales_channel_id,
      ])
      if (pub.rows.length === 0) {
        throw Object.assign(new Error("Product is not published to this sales channel"), { statusCode: 400 })
      }
    }
    if (existing.rows[0]) {
      await pool.query(`UPDATE cart_line_item SET quantity = quantity + $1, unit_price=$2, updated_at=NOW() WHERE id=$3`, [
        input.quantity,
        unitPrice,
        existing.rows[0].id,
      ])
    } else {
      await pool.query(
        `INSERT INTO cart_line_item (cart_id, variant_id, product_id, title, variant_title, variant_sku, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [cartId, variant.id, variant.product_id, variant.product_title ?? variant.title, variant.title, variant.sku, input.quantity, unitPrice]
      )
    }
    await this.refresh(cartId)
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  async updateItem(cartId: string, lineId: string, quantity: number): Promise<CartDTO> {
    if (quantity <= 0) {
      return this.removeItem(cartId, lineId)
    }
    const line = await pool.query(`SELECT variant_id FROM cart_line_item WHERE id=$1 AND cart_id=$2 AND deleted_at IS NULL`, [
      lineId,
      cartId,
    ])
    if (!line.rows[0]) {
      throw Object.assign(new Error("Line item not found"), { statusCode: 404 })
    }
    await inventoryService.ensureAvailable(line.rows[0].variant_id, quantity)
    await pool.query(`UPDATE cart_line_item SET quantity=$1, updated_at=NOW() WHERE id=$2`, [quantity, lineId])
    await this.refresh(cartId)
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  async removeItem(cartId: string, lineId: string): Promise<CartDTO> {
    await pool.query(`UPDATE cart_line_item SET deleted_at=NOW() WHERE id=$1 AND cart_id=$2`, [lineId, cartId])
    await pool.query(`DELETE FROM line_item_adjustment WHERE line_item_id=$1`, [lineId])
    await pool.query(`DELETE FROM line_item_tax_line WHERE line_item_id=$1`, [lineId])
    await this.refresh(cartId)
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  async setShipping(cartId: string, name: string, amount: number, shippingOptionId?: string | null, data?: Record<string, unknown> | null): Promise<CartDTO> {
    await pool.query(`DELETE FROM cart_shipping_method WHERE cart_id=$1`, [cartId])
    await pool.query(`INSERT INTO cart_shipping_method (cart_id, name, amount, shipping_option_id, data) VALUES ($1,$2,$3,$4,$5)`, [cartId, name, amount, shippingOptionId ?? null, data ? JSON.stringify(data) : null])
    await this.refresh(cartId)
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  /** Lupus add-shipping-method: the price always comes from the option the cart is offered, never from the client. */
  async addShippingMethodByOption(cartId: string, optionId: string, data?: Record<string, unknown> | null): Promise<CartDTO> {
    const cart = await pool.query(`SELECT id FROM cart WHERE id=$1 AND deleted_at IS NULL AND completed_at IS NULL`, [cartId])
    if (!cart.rows[0]) {
      throw Object.assign(new Error("Active cart not found"), { statusCode: 404 })
    }
    const offered = await fulfillmentService.optionsForCart(cartId)
    const option = offered.find((o: any) => o.id === optionId)
    if (!option) {
      throw Object.assign(new Error("Shipping option is not available for this cart"), { statusCode: 400 })
    }
    return this.setShipping(cartId, option.name, Number(option.amount), option.id, data)
  }

  async setAddress(cartId: string, kind: "shipping" | "billing", address: Record<string, string | null | undefined>): Promise<CartDTO> {
    await pool.query(
      `INSERT INTO cart_address (cart_id, kind, first_name, last_name, address_1, address_2, company, city, country_code, province, postal_code, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (cart_id, kind) DO UPDATE SET first_name=$3, last_name=$4, address_1=$5, address_2=$6, company=$7, city=$8, country_code=$9, province=$10, postal_code=$11, phone=$12`,
      [cartId, kind, address.first_name ?? null, address.last_name ?? null, address.address_1 ?? null, address.address_2 ?? null, address.company ?? null, address.city ?? null, address.country_code?.toLowerCase() ?? null, (address.province ?? null), address.postal_code ?? null, address.phone ?? null]
    )
    await this.refresh(cartId)
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  /**
   * Lupus update-cart region move: the cart takes the region's currency, line items are repriced
   * in it and shipping methods (priced in the old currency) are dropped so they get re-selected.
   */
  async setRegion(cartId: string, regionId: string): Promise<CartDTO> {
    const [cart, region] = await Promise.all([
      pool.query(`SELECT * FROM cart WHERE id=$1 AND deleted_at IS NULL`, [cartId]),
      pool.query(`SELECT id, currency_code FROM region WHERE id=$1 AND deleted_at IS NULL`, [regionId]),
    ])
    if (!cart.rows[0]) {
      throw Object.assign(new Error("Cart not found"), { statusCode: 404 })
    }
    if (!region.rows[0]) {
      throw Object.assign(new Error("Region not found"), { statusCode: 404 })
    }
    const currency = String(region.rows[0].currency_code).toLowerCase()
    if (cart.rows[0].region_id === regionId && cart.rows[0].currency_code === currency) {
      return this.retrieve(cartId) as Promise<CartDTO>
    }
    const lines = await pool.query(`SELECT id, variant_id, quantity FROM cart_line_item WHERE cart_id=$1 AND deleted_at IS NULL`, [cartId])
    const repriced: { id: string; price: number }[] = []
    for (const l of lines.rows) {
      if (!l.variant_id) {
        continue
      }
      repriced.push({ id: l.id, price: await pricingService.resolveUnitPrice(l.variant_id, currency, l.quantity, cart.rows[0].customer_id) })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`UPDATE cart SET region_id=$2, currency_code=$3, updated_at=NOW() WHERE id=$1`, [cartId, regionId, currency])
      for (const r of repriced) {
        await client.query(`UPDATE cart_line_item SET unit_price=$2, updated_at=NOW() WHERE id=$1`, [r.id, r.price])
      }
      await client.query(`DELETE FROM cart_shipping_method WHERE cart_id=$1`, [cartId])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    await this.refresh(cartId)
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  async transferCustomer(cartId: string, customerId: string): Promise<CartDTO> {
    await pool.query(`UPDATE cart SET customer_id=$2, updated_at=NOW() WHERE id=$1`, [cartId, customerId])
    return this.retrieve(cartId) as Promise<CartDTO>
  }

  /** Mirrors refresh-cart-items + update-cart-promotions + update-tax-lines steps. */
  private async refresh(cartId: string): Promise<void> {
    await promotionService.recompute(cartId)
    await taxService.refreshForCart(cartId)
  }

  private async withItems(cart: any): Promise<CartDTO> {
    const items = await pool.query(
      `SELECT li.*,
              COALESCE((SELECT SUM(amount) FROM line_item_adjustment WHERE line_item_id=li.id),0)::int AS discount_total,
              COALESCE((SELECT json_agg(json_build_object('code',code,'amount',amount)) FROM line_item_adjustment WHERE line_item_id=li.id), '[]') AS adjustments,
              COALESCE((SELECT json_agg(json_build_object('code',code,'rate',rate)) FROM line_item_tax_line WHERE line_item_id=li.id), '[]') AS tax_lines
       FROM cart_line_item li WHERE li.cart_id=$1 AND li.deleted_at IS NULL ORDER BY li.created_at`,
      [cart.id]
    )
    const ship = await pool.query(`SELECT COALESCE(SUM(amount),0)::int AS s FROM cart_shipping_method WHERE cart_id=$1`, [cart.id])
    // shipping promotions (free shipping, shipping discounts) are negative adjustments on the methods
    const shipAdj = await pool.query(`SELECT COALESCE(SUM(amount),0)::int AS s FROM shipping_method_adjustment WHERE cart_id=$1`, [cart.id])
    const shippingDiscount = Number(shipAdj.rows[0]?.s ?? 0)
    const shipping = Math.max(Number(ship.rows[0]?.s ?? 0) + shippingDiscount, 0)
    const subtotal = items.rows.reduce((s: number, i: any) => s + i.quantity * Number(i.unit_price), 0)
    const discount = items.rows.reduce((s: number, i: any) => s + Number(i.discount_total), 0) // negative
    const { itemTax, shippingTax } = await taxService.computeTotals(cart.id)
    const tax = itemTax + shippingTax
    // gift-cardable totals: applied cards reduce payable, capped by balance and payable
    const gifts = await pool.query(
      `SELECT gc.balance FROM cart_gift_card cg JOIN gift_card gc ON gc.id=cg.gift_card_id
       WHERE cg.cart_id=$1 AND gc.deleted_at IS NULL AND gc.is_disabled=FALSE AND (gc.ends_at IS NULL OR gc.ends_at > NOW())`,
      [cart.id]
    )
    const giftBalance = gifts.rows.reduce((s: number, g: any) => s + Number(g.balance), 0)
    const hasInclusive = items.rows.some((i: any) => i.is_tax_inclusive)
    const payable = Math.max(subtotal + discount + shipping + (hasInclusive ? 0 : tax), 0)
    const gift_card_total = Math.min(giftBalance, payable)
    // credit lines granted to the customer (currency must match)
    const credits = await pool.query(
      `SELECT ccl.amount FROM cart_credit_line ccl JOIN credit_line cl ON cl.id = ccl.credit_line_id
       WHERE ccl.cart_id = $1 AND cl.deleted_at IS NULL AND cl.currency_code = $2`,
      [cart.id, cart.currency_code]
    )
    const creditApplied = credits.rows.reduce((s: number, r: any) => s + Number(r.amount), 0)
    const credit_total = Math.min(creditApplied, payable - gift_card_total)
    const totals = { subtotal, discount_total: discount, shipping_discount_total: shippingDiscount, shipping, tax_total: tax, gift_card_total, credit_total, total: payable - gift_card_total - credit_total }
    return (await shapeStoreCart(cart, items.rows, totals)) as CartDTO
  }
}

export const cartService = new CartService()
