import { pool } from "../../db"
import { eventBus } from "../infra/platform-infra.service"

// Port of Lupus manual payment flow (payment collection authorize/capture/refund).
// Lupus supports pluggable providers + sessions + webhooks; lupus uses provider='manual'
// with direct status transitions. Transitions guarded to avoid double-capture/refund.
export class PaymentService {
  async authorize(collectionId: string, providerId = "manual") {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const c = await client.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [collectionId])
      if (!c.rows[0]) {
        throw Object.assign(new Error("Payment collection not found"), { statusCode: 404 })
      }
      await client.query(
        `INSERT INTO payment (payment_collection_id, provider_id, amount, currency_code, status) VALUES ($1,$2,$3,$4,'authorized')`,
        [collectionId, providerId, c.rows[0].amount, c.rows[0].currency_code]
      )
      await client.query(`UPDATE payment_collection SET authorized_amount=$2, status='authorized' WHERE id=$1`, [collectionId, c.rows[0].amount])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async capture(collectionId: string) {
    const { rows } = await pool.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL`, [collectionId])
    if (!rows[0]) {
      throw Object.assign(new Error("Payment collection not found"), { statusCode: 404 })
    }
    if (!["authorized", "partially_captured"].includes(rows[0].status)) {
      throw Object.assign(new Error(`Cannot capture from status ${rows[0].status}`), { statusCode: 400 })
    }
    await pool.query(
      `UPDATE payment_collection SET captured_amount=$2, status='captured', completed_at=NOW() WHERE id=$1`,
      [collectionId, rows[0].amount]
    )
    await pool.query(`UPDATE payment SET status='captured', updated_at=NOW() WHERE payment_collection_id=$1 AND status='authorized'`, [collectionId])
    await pool.query(`UPDATE "order" SET status='completed' WHERE payment_collection_id=$1`, [collectionId])
    const ord = await pool.query(`SELECT id, email FROM "order" WHERE payment_collection_id=$1 LIMIT 1`, [collectionId])
    await eventBus.emit("payment.captured", { payment_collection_id: collectionId, order_id: ord.rows[0]?.id, email: ord.rows[0]?.email }).catch(() => undefined)
  }

  async refund(collectionId: string, amount?: number, extra: { refund_reason_id?: string | null; note?: string | null; created_by?: string | null } = {}) {
    const { rows } = await pool.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL`, [collectionId])
    if (!rows[0]) {
      throw Object.assign(new Error("Payment collection not found"), { statusCode: 404 })
    }
    if (rows[0].status !== "captured") {
      throw Object.assign(new Error("Only captured payments can be refunded"), { statusCode: 400 })
    }
    if (extra.refund_reason_id) {
      const reason = await pool.query(`SELECT 1 FROM refund_reason WHERE id=$1 AND deleted_at IS NULL`, [extra.refund_reason_id])
      if (!reason.rows[0]) {
        throw Object.assign(new Error(`Refund reason with id ${extra.refund_reason_id} was not found`), { statusCode: 404 })
      }
    }
    const refundAmount = amount ?? rows[0].amount
    const newRefundedAmount = Math.min(Number(rows[0].refunded_amount ?? 0) + refundAmount, rows[0].amount)
    await pool.query(`UPDATE payment_collection SET refunded_amount=$2, status=$3 WHERE id=$1`, [
      collectionId, newRefundedAmount, Number(newRefundedAmount) >= Number(rows[0].amount) ? "refunded" : rows[0].status,
    ])
    const payments = await pool.query(`SELECT * FROM payment WHERE payment_collection_id=$1 AND deleted_at IS NULL`, [collectionId])
    let remaining = newRefundedAmount - Number(rows[0].refunded_amount ?? 0)
    for (const p of payments.rows) {
      const currentRefunded = Number(p.refunded_amount ?? 0)
      if (currentRefunded < Number(p.amount) && remaining > 0) {
        const paymentRefund = Math.min(Number(p.amount) - currentRefunded, remaining)
        await pool.query(`UPDATE payment SET refunded_amount=$2, status=$3, updated_at=NOW() WHERE id=$1`, [
          p.id, currentRefunded + paymentRefund, currentRefunded + paymentRefund >= Number(p.amount) ? "refunded" : "partially_refunded"
        ])
        remaining -= paymentRefund
      }
    }
    const refunded = newRefundedAmount - Number(rows[0].refunded_amount ?? 0)
    if (refunded > 0) {
      await pool.query(
        `INSERT INTO payment_refund (payment_collection_id, payment_id, amount, refund_reason_id, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [collectionId, payments.rows[0]?.id ?? null, refunded, extra.refund_reason_id ?? null, extra.note?.trim() || null, extra.created_by ?? null]
      )
    }
    await eventBus.emit("payment.refunded", { payment_collection_id: collectionId, amount: newRefundedAmount }).catch(() => undefined)
  }
}

export const paymentService = new PaymentService()
