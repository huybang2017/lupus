import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import {
  ORDER_FILTERS,
  ORDER_Q_COLUMNS,
  ORDER_SORT,
  PAYMENT_COLLECTION_FILTERS,
  PAYMENT_COLLECTION_Q_COLUMNS,
  PAYMENT_COLLECTION_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { orderService } from "./order.service"
import { paymentService } from "./payment.service"

// Port of Lupus store checkout + admin order/payment endpoints
// (upstream/src/api/store/carts/*/complete + admin/orders + admin/payments).
export const orderRouter = Router()

// ?fulfillment_status has no column on "order" in this schema, so it is derived
// from the fulfillment rows. The switch returns a paramless EXISTS fragment (no
// user value ever reaches the SQL string); an unknown status yields "" and the
// filter is simply ignored.
function fulfillmentStatusCondition(status: unknown): string {
  const key = String(Array.isArray(status) ? status[0] ?? "" : status ?? "")
    .trim()
    .toLowerCase()
  const live = `EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL`
  switch (key) {
    case "not_fulfilled":
      return `NOT ${live})`
    case "fulfilled":
      return `${live})`
    case "shipped":
      return `${live} AND f.shipped_at IS NOT NULL)`
    case "delivered":
      return `${live} AND f.delivered_at IS NOT NULL)`
    default:
      return ""
  }
}

orderRouter.post("/store/carts/:id/complete", async (req, res, next) => {
  try {
    // Lupus complete-cart answer: { type: "order", order }; a failure is an HTTP error (the storefront shows it)
    res.status(201).json({ type: "order", order: await orderService.createFromCart(req.params.id) })
  } catch (e) {
    next(e)
  }
})

orderRouter.get("/store/orders/:id", async (req, res, next) => {
  try {
    const order = await orderService.retrieve(req.params.id)
    if (!order) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    res.json({ order })
  } catch (e) {
    next(e)
  }
})

// Filtered + sorted + paged through the shared helper. The SELECT is the exact
// one orderService.list() used to run (o.* plus the joined payment_collection
// status), so the response shape is unchanged; the COUNT is now filtered too,
// which it was not before.
orderRouter.get("/admin/orders", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "\"order\"",
      alias: "o",
      select: `o.*, pc.status AS payment_status, sc.name AS sales_channel_name,
        COALESCE(NULLIF(TRIM(CONCAT(cu.first_name, ' ', cu.last_name)), ''), NULLIF(TRIM(CONCAT(sa.first_name, ' ', sa.last_name)), '')) AS customer_name,
        sa.country_code AS shipping_country_code,
        CASE
          WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.delivered_at IS NOT NULL) THEN 'delivered'
          WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.shipped_at IS NOT NULL) THEN 'shipped'
          WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL) THEN 'fulfilled'
          ELSE 'not_fulfilled'
        END AS fulfillment_status`,
      joins: `LEFT JOIN payment_collection pc ON pc.id = o.payment_collection_id
        LEFT JOIN sales_channel sc ON sc.id = o.sales_channel_id
        LEFT JOIN customer cu ON cu.id = o.customer_id
        LEFT JOIN order_address sa ON sa.order_id = o.id AND sa.kind = 'shipping'`,
      base: ["o.deleted_at IS NULL", fulfillmentStatusCondition(req.query.fulfillment_status)],
      specs: ORDER_FILTERS,
      q: { columns: ORDER_Q_COLUMNS },
      order: ORDER_SORT,
      defaultOrder: "o.created_at DESC",
      key: "orders",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

orderRouter.post("/admin/orders/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await orderService.cancel(req.params.id)
    res.json({ id: req.params.id, status: "canceled" })
  } catch (e) {
    next(e)
  }
})

orderRouter.post("/admin/payments/:collectionId/authorize", requireAuth, async (req, res, next) => {
  try {
    const { provider_id } = z.object({ provider_id: z.string().optional() }).parse(req.body)
    await paymentService.authorize(req.params.collectionId, provider_id ?? "manual")
    res.json({ status: "authorized" })
  } catch (e) {
    next(e)
  }
})

// Lupus addresses a payment by its own id; lupus tracks status on the collection, so accept either.
async function collectionOf(id: string): Promise<string> {
  const { rows } = await pool.query(`SELECT payment_collection_id FROM payment WHERE id=$1 AND deleted_at IS NULL`, [id])
  return rows[0]?.payment_collection_id ?? id
}

orderRouter.post("/admin/payments/:collectionId/capture", requireAuth, async (req, res, next) => {
  try {
    await paymentService.capture(await collectionOf(req.params.collectionId))
    res.json({ status: "captured" })
  } catch (e) {
    next(e)
  }
})

orderRouter.post("/admin/payments/:collectionId/refund", requireAuth, async (req, res, next) => {
  try {
    const { amount, refund_reason_id, note } = z
      .object({ amount: z.number().int().positive().optional(), refund_reason_id: z.string().nullish(), note: z.string().nullish() })
      .passthrough()
      .parse(req.body ?? {})
    await paymentService.refund(await collectionOf(req.params.collectionId), amount, { refund_reason_id, note, created_by: (req as any).auth?.email })
    res.json({ status: "refunded" })
  } catch (e) {
    next(e)
  }
})

// Order summary (order-summary parity): totals + items + adjustments + payments +
// fulfillments + returns/claims/exchanges + credit lines in one view.
orderRouter.get("/admin/orders/:id/summary", requireAuth, async (req, res, next) => {
  try {
    const order = await orderService.retrieve(req.params.id)
    if (!order) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    const [payments, fulfillments, credits, addresses, changes, returns, claims, exchanges] = await Promise.all([
      pool.query(`SELECT * FROM payment WHERE payment_collection_id = (SELECT payment_collection_id FROM "order" WHERE id=$1) AND deleted_at IS NULL`, [req.params.id]),
      pool.query(`SELECT * FROM fulfillment WHERE order_id=$1 AND deleted_at IS NULL`, [req.params.id]),
      pool.query(`SELECT * FROM order_credit_line WHERE order_id=$1`, [req.params.id]),
      pool.query(`SELECT * FROM order_address WHERE order_id=$1`, [req.params.id]),
      pool.query(`SELECT * FROM order_change WHERE order_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [req.params.id]),
      pool.query(`SELECT * FROM return_request WHERE order_id=$1 AND deleted_at IS NULL`, [req.params.id]),
      pool.query(`SELECT * FROM claim WHERE order_id=$1 AND deleted_at IS NULL`, [req.params.id]),
      pool.query(`SELECT * FROM exchange WHERE order_id=$1 AND deleted_at IS NULL`, [req.params.id]),
    ])
    res.json({ order, payments: payments.rows, fulfillments: fulfillments.rows, credit_lines: credits.rows, addresses: addresses.rows, changes: changes.rows, returns: returns.rows, claims: claims.rows, exchanges: exchanges.rows })
  } catch (e) {
    next(e)
  }
})

// Payment collections list/get (payment-collection parity).
orderRouter.get("/admin/payment-collections", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "payment_collection",
      alias: "p",
      select: "p.*",
      base: "p.deleted_at IS NULL",
      specs: PAYMENT_COLLECTION_FILTERS,
      q: { columns: PAYMENT_COLLECTION_Q_COLUMNS },
      order: PAYMENT_COLLECTION_SORT,
      defaultOrder: "p.created_at DESC",
      key: "payment_collections",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

orderRouter.get("/admin/payment-collections/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      res.status(404).json({ message: "Payment collection not found" })
      return
    }
    const payments = await pool.query(`SELECT * FROM payment WHERE payment_collection_id=$1 AND deleted_at IS NULL`, [req.params.id])
    const sessions = await pool.query(`SELECT * FROM payment_session WHERE payment_collection_id=$1 AND deleted_at IS NULL`, [req.params.id])
    res.json({ payment_collection: rows[0], payments: payments.rows, payment_sessions: sessions.rows })
  } catch (e) {
    next(e)
  }
})

// Credit lines: grant to customer, apply to cart (cart totals deduct them).
orderRouter.post("/admin/credit-lines", requireAuth, async (req, res, next) => {
  try {
    const { customer_id, currency_code, amount, reference } = z.object({ customer_id: z.string().optional(), currency_code: z.string().length(3), amount: z.number().int().positive(), reference: z.string().optional() }).parse(req.body)
    const { rows } = await pool.query(
      `INSERT INTO credit_line (customer_id, currency_code, amount, remaining, reference) VALUES ($1,$2,$3,$3,$4) RETURNING *`,
      [customer_id ?? null, currency_code.toLowerCase(), amount, reference ?? null]
    )
    res.status(201).json({ credit_line: rows[0] })
  } catch (e) {
    next(e)
  }
})

orderRouter.post("/store/carts/:id/credit-lines", async (req, res, next) => {
  try {
    const { credit_line_id, amount } = z.object({ credit_line_id: z.string(), amount: z.number().int().positive() }).parse(req.body)
    const cart = await pool.query(`SELECT currency_code FROM cart WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!cart.rows[0]) throw Object.assign(new Error("Cart not found"), { statusCode: 404 })
    const cl = await pool.query(`SELECT * FROM credit_line WHERE id=$1 AND deleted_at IS NULL`, [credit_line_id])
    if (!cl.rows[0] || cl.rows[0].currency_code !== cart.rows[0].currency_code) {
      throw Object.assign(new Error("Credit line invalid or currency mismatch"), { statusCode: 400 })
    }
    if (Number(cl.rows[0].remaining) < amount) throw Object.assign(new Error("Credit line balance insufficient"), { statusCode: 400 })
    await pool.query(`INSERT INTO cart_credit_line (cart_id, credit_line_id, amount) VALUES ($1,$2,$3) ON CONFLICT (cart_id, credit_line_id) DO UPDATE SET amount=$3`, [req.params.id, credit_line_id, amount])
    const { cartService } = await import("../cart/cart.service")
    res.status(201).json({ cart: await cartService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})
