import { pool } from "../../db"

// Port of Lupus order-edit / return / exchange / claim lifecycle
// (order-change.ts status machine + create/confirm/decline/cancel-order-change workflows).
// Flow: request (pending) -> confirm (applies actions to order_line_item in tx) |
// decline | cancel. Return additionally refunds via payment_collection when confirmed
// with refund_amount. Exchange adds replacement items at given prices.
export type ChangeType = "edit" | "return" | "exchange" | "claim"
export interface ChangeAction {
  action: "add_item" | "remove_item" | "update_qty"
  line_item_id?: string
  variant_id?: string
  title?: string
  quantity?: number
  unit_price?: number
}

export class OrderChangeService {
  async request(orderId: string, changeType: ChangeType, description: string | undefined, actions: ChangeAction[]) {
    const o = await pool.query(`SELECT version FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [orderId])
    if (!o.rows[0]) {
      throw Object.assign(new Error("Order not found"), { statusCode: 404 })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ch = await client.query(
        `INSERT INTO order_change (order_id, change_type, description, status, version, requested_at) VALUES ($1,$2,$3,'requested',$4,NOW()) RETURNING *`,
        [orderId, changeType, description ?? null, (o.rows[0].version ?? 1) + 1]
      )
      for (const a of actions) {
        await client.query(
          `INSERT INTO order_change_action (order_change_id, action, line_item_id, variant_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ch.rows[0].id, a.action, a.line_item_id ?? null, a.variant_id ?? null, a.title ?? null, a.quantity ?? null, a.unit_price ?? null]
        )
      }
      await client.query("COMMIT")
      return ch.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async confirm(changeId: string, refundAmount?: number) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ch = await client.query(`SELECT * FROM order_change WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [changeId])
      if (!ch.rows[0] || !["pending", "requested"].includes(ch.rows[0].status)) {
        throw Object.assign(new Error("Change is not confirmable"), { statusCode: 400 })
      }
      const actions = await client.query(`SELECT * FROM order_change_action WHERE order_change_id=$1`, [changeId])
      for (const a of actions.rows) {
        if (a.action === "remove_item" && a.line_item_id) {
          await client.query(`DELETE FROM order_line_item WHERE id=$1`, [a.line_item_id])
        } else if (a.action === "update_qty" && a.line_item_id && a.quantity != null) {
          await client.query(`UPDATE order_line_item SET quantity=$2 WHERE id=$1`, [a.line_item_id, a.quantity])
        } else if (a.action === "add_item") {
          const orderId = ch.rows[0].order_id as string
          const cur = await client.query(`SELECT currency_code FROM "order" WHERE id=$1`, [orderId])
          await client.query(
            `INSERT INTO order_line_item (order_id, variant_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)`,
            [orderId, a.variant_id, a.title ?? "Replacement item", a.quantity ?? 1, a.unit_price ?? 0]
          )
          void cur
        }
      }
      // Recompute order totals from lines (exclusive-tax assumption consistent with cart math)
      const orderId = ch.rows[0].order_id as string
      const lines = await client.query(`SELECT quantity, unit_price, discount_total FROM order_line_item WHERE order_id=$1`, [orderId])
      const subtotal = lines.rows.reduce((s: number, l: any) => s + l.quantity * Number(l.unit_price), 0)
      const discount = lines.rows.reduce((s: number, l: any) => s + Number(l.discount_total ?? 0), 0)
      await client.query(`UPDATE "order" SET subtotal=$2, discount_total=$3, total=subtotal+$3+shipping_total+tax_total, version=$4 WHERE id=$1`, [
        orderId,
        subtotal,
        discount,
        ch.rows[0].version,
      ])
      if (refundAmount && refundAmount > 0) {
        await client.query(
          `UPDATE payment_collection SET refunded_amount = refunded_amount + $2, status='refunded' WHERE id=(SELECT payment_collection_id FROM "order" WHERE id=$1)`,
          [orderId, refundAmount]
        )
      }
      await client.query(`UPDATE order_change SET status='confirmed', confirmed_at=NOW() WHERE id=$1`, [changeId])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async decline(changeId: string) {
    const r = await pool.query(`UPDATE order_change SET status='declined', declined_at=NOW() WHERE id=$1 AND status IN ('pending','requested')`, [changeId])
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Change is not declinable"), { statusCode: 400 })
    }
  }

  async cancel(changeId: string) {
    const r = await pool.query(`UPDATE order_change SET status='canceled', canceled_at=NOW() WHERE id=$1 AND status IN ('pending','requested')`, [changeId])
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Change is not cancelable"), { statusCode: 400 })
    }
  }

  async listForOrder(orderId: string) {
    const { rows } = await pool.query(`SELECT * FROM order_change WHERE order_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [orderId])
    return rows
  }
}

export const orderChangeService = new OrderChangeService()
