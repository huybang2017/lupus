import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import { fulfillmentService } from "../fulfillment/fulfillment.service"
import { orderChangeService } from "./order-change.service"
import { paymentSessionService } from "./payment-session.service"
import { pricingService } from "../pricing/pricing.service"

// Lupus-compat order endpoints (dashboard parity: orders retrieve/update/preview,
// order edits, order changes, payment collections/payments, refund reasons).
//
// Source refs (paths/verbs):
//   upstream/packages/core/js-sdk/src/admin/order.ts        (retrieve/update/preview/transfer/credit-lines/export/authorizePaymentSession/updateOrderChange/...)
//   upstream/packages/core/js-sdk/src/admin/order-edit.ts   (initiateRequest/request/confirm/cancelRequest/addItems/...)
//   upstream/packages/core/js-sdk/src/admin/payment-collection.ts (create/delete/markAsPaid)
//   upstream/packages/core/js-sdk/src/admin/payment.ts      (retrieve/listPaymentProviders)
//   upstream/packages/core/js-sdk/src/admin/fulfillment.ts  (create/createShipment)
// Response shapes mirror upstream/src/api/admin/<path>/route.ts:
//   retrieve -> { <singular> }, lists -> { <plural>, count, offset, limit },
//   create -> 201, delete -> { id, object, deleted: true }.
//
// Simplifications vs Lupus (this module creates no tables of its own):
// - Order edits are modeled as order_change rows (change_type='edit') via the
//   existing orderChangeService; confirming applies add/remove/update-qty actions
//   directly to order_line_item. Action names are exposed as ITEM_ADD /
//   ITEM_REMOVE / ITEM_UPDATE for dashboard compat.
// - Order transfer requests are recorded as order_change rows
//   (change_type='transfer', pending customer acceptance). There is no store-side
//   accept endpoint, so requested transfers stay pending; transfer/guest applies
//   immediately (find-or-create guest customer).
// - POST .../fulfillments/:id/mark-as-delivered auto-ships first when the
//   fulfillment was never shipped, so the dashboard action never 400s.
// - POST /admin/orders/export returns a transaction id only; no async CSV worker
//   exists, so nothing is generated (dashboard polling will find no file).
// - updateOrderChange accepts carry_over_promotions (no-op, no column exists)
//   and persists internal_note into the change description.
export const ordersCompatRouter = Router()

const addressSchema = z.object({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  phone: z.string().nullish(),
  company: z.string().nullish(),
  address_1: z.string().nullish(),
  address_2: z.string().nullish(),
  city: z.string().nullish(),
  country_code: z.string().nullish(),
  province: z.string().nullish(),
  postal_code: z.string().nullish(),
})

function mapChangeAction(a: any) {
  const action = a.action === "add_item" ? "ITEM_ADD" : a.action === "remove_item" ? "ITEM_REMOVE" : a.action === "update_qty" ? "ITEM_UPDATE" : a.action
  return { ...a, action }
}

async function changeWithActions(changeId: string) {
  const ch = await pool.query(`SELECT * FROM order_change WHERE id=$1 AND deleted_at IS NULL`, [changeId])
  if (!ch.rows[0]) {
    return null
  }
  const actions = await pool.query(`SELECT * FROM order_change_action WHERE order_change_id=$1 ORDER BY created_at`, [changeId])
  return { ...ch.rows[0], actions: actions.rows.map(mapChangeAction) }
}

async function activeEdit(orderId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM order_change WHERE order_id=$1 AND change_type='edit' AND status IN ('pending','requested') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}

function mapPaymentStatus(raw: unknown, collection: any): string {
  const s = String(raw ?? collection?.status ?? "not_paid")
  if (s === "requires_more" || s === "requires_action") {
    return "requires_action"
  }
  if (s === "captured" && Number(collection?.refunded_amount ?? 0) > 0) {
    return Number(collection.refunded_amount) >= Number(collection.amount ?? 0) ? "refunded" : "partially_refunded"
  }
  return s
}

async function buildAdminOrder(orderId: string) {
  const o = await pool.query(
    `SELECT o.*, pc.status AS payment_status FROM "order" o LEFT JOIN payment_collection pc ON pc.id=o.payment_collection_id WHERE o.id=$1 AND o.deleted_at IS NULL`,
    [orderId]
  )
  if (!o.rows[0]) {
    return null
  }
  const base = o.rows[0]
  const [itemsR, paymentsR, fulfR, creditsR, addrR, pcR, custR, scR, creditSumR, smR] = await Promise.all([
    pool.query(
      `SELECT oli.*, v.sku AS variant_sku, v.title AS variant_title, p.thumbnail AS thumbnail, p.title AS product_title
       FROM order_line_item oli LEFT JOIN product_variant v ON v.id=oli.variant_id LEFT JOIN product p ON p.id=oli.product_id
       WHERE oli.order_id=$1 ORDER BY oli.created_at`,
      [orderId]
    ),
    pool.query(
      `SELECT p.* FROM payment p WHERE p.payment_collection_id=$1 AND p.deleted_at IS NULL ORDER BY p.created_at`,
      [base.payment_collection_id]
    ),
    pool.query(`SELECT * FROM fulfillment WHERE order_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [orderId]),
    pool.query(`SELECT * FROM order_credit_line WHERE order_id=$1 ORDER BY created_at`, [orderId]),
    pool.query(`SELECT * FROM order_address WHERE order_id=$1`, [orderId]),
    base.payment_collection_id
      ? pool.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL`, [base.payment_collection_id])
      : Promise.resolve({ rows: [] }),
    base.customer_id
      ? pool.query(`SELECT * FROM customer WHERE id=$1 AND deleted_at IS NULL`, [base.customer_id])
      : Promise.resolve({ rows: [] }),
    base.sales_channel_id
      ? pool.query(`SELECT id, name FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [base.sales_channel_id])
      : Promise.resolve({ rows: [] }),
    pool.query(`SELECT COALESCE(SUM(amount),0)::int AS total FROM order_credit_line WHERE order_id=$1`, [orderId]),
    pool.query(`SELECT * FROM order_shipping_method WHERE order_id=$1 ORDER BY created_at`, [orderId]),
  ])
  const items = itemsR.rows.map((li: any) => {
    const subtotal = Number(li.quantity) * Number(li.unit_price)
    return {
      ...li,
      quantity: Number(li.quantity),
      unit_price: Number(li.unit_price),
      discount_total: Number(li.discount_total ?? 0),
      subtitle: li.variant_title ?? null,
      variant_title: li.variant_title ?? null,
      variant_sku: li.variant_sku ?? null,
      thumbnail: li.thumbnail ?? null,
      subtotal,
      total: subtotal - Number(li.discount_total ?? 0),
      tax_total: 0,
      fulfillment_status: "not_fulfilled",
    }
  })
  const fulfillments = []
  for (const f of fulfR.rows) {
    const fi = await pool.query(
      `SELECT fi.*, oli.title FROM fulfillment_item fi LEFT JOIN order_line_item oli ON oli.id=fi.line_item_id WHERE fi.fulfillment_id=$1`,
      [f.id]
    )
    fulfillments.push({ ...f, items: fi.rows })
  }
  const addresses = addrR.rows
  const shipping = addresses.find((a: any) => a.kind === "shipping") ?? null
  const billing = addresses.find((a: any) => a.kind === "billing") ?? null
  let fulfillmentStatus = "not_fulfilled"
  if (fulfillments.length > 0) {
    const live = fulfillments.filter((f: any) => !f.canceled_at)
    if (live.length === 0) {
      fulfillmentStatus = "canceled"
    } else if (live.every((f: any) => f.delivered_at)) {
      fulfillmentStatus = "delivered"
    } else if (live.some((f: any) => f.delivered_at)) {
      fulfillmentStatus = "partially_delivered"
    } else if (live.every((f: any) => f.shipped_at)) {
      fulfillmentStatus = "shipped"
    } else if (live.some((f: any) => f.shipped_at)) {
      fulfillmentStatus = "partially_shipped"
    } else {
      fulfillmentStatus = "fulfilled"
    }
  }
  return {
    ...base,
    display_id: base.display_id ?? null,
    archived_at: base.status === "archived" ? (base.updated_at ?? null) : null,
    metadata: base.metadata ?? {},
    customer: custR.rows[0] ?? null,
    sales_channel: scR.rows[0] ?? null,
    payment_status: mapPaymentStatus(base.payment_status, pcR.rows[0]),
    items,
    item_total: Number(base.subtotal ?? 0),
    item_subtotal: Number(base.subtotal ?? 0),
    shipping_subtotal: Number(base.shipping_total ?? 0),
    shipping_total: Number(base.shipping_total ?? 0),
    tax_total: Number(base.tax_total ?? 0),
    discount_total: Number(base.discount_total ?? 0),
    original_total: Number(base.subtotal ?? 0) + Number(base.shipping_total ?? 0) + Number(base.tax_total ?? 0),
    total: Number(base.total ?? 0),
    credit_line_total: Number(creditSumR.rows[0]?.total ?? 0),
    pending_difference: Number(base.total ?? 0) - Number(pcR.rows[0]?.captured_amount ?? 0),
    shipping_methods: smR.rows.map((m: any) => ({
      id: m.id,
      order_id: m.order_id,
      shipping_option_id: m.shipping_option_id ?? null,
      name: m.name,
      amount: Number(m.amount ?? 0),
      data: m.data ?? null,
      created_at: m.created_at,
      updated_at: m.updated_at,
    })),
    payments: paymentsR.rows,
    payment_collection: pcR.rows[0] ?? null,
    payment_collections: pcR.rows[0] ? [pcR.rows[0]] : [],
    fulfillments,
    fulfillment_status: fulfillmentStatus,
    shipping_address: shipping,
    billing_address: billing,
    credit_lines: creditsR.rows,
  }
}

async function orderPreview(orderId: string, res: any) {
  const order = await buildAdminOrder(orderId)
  if (!order) {
    res.status(404).json({ message: "Order not found" })
    return null
  }
  return order
}

// --- Orders: retrieve / update / preview / line-items / shipping-options ---

ordersCompatRouter.get("/admin/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const order = await buildAdminOrder(req.params.id)
    if (!order) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    res.json({ order })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.params.id === "export") {
      next("route")
      return
    }
    const { email, shipping_address, billing_address } = z
      .object({ email: z.string().email().optional(), shipping_address: addressSchema.optional(), billing_address: addressSchema.optional() })
      .parse(req.body ?? {})
    const exists = await pool.query(`SELECT id FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!exists.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    if (email !== undefined) {
      await pool.query(`UPDATE "order" SET email=$2, updated_at=NOW() WHERE id=$1`, [req.params.id, email])
    }
    for (const [kind, addr] of [["shipping", shipping_address], ["billing", billing_address]] as const) {
      if (!addr) {
        continue
      }
      await pool.query(
        `INSERT INTO order_address (order_id, kind, first_name, last_name, company, address_1, address_2, city, country_code, province, postal_code, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (order_id, kind) DO UPDATE
         SET first_name=$3, last_name=$4, company=$5, address_1=$6, address_2=$7, city=$8, country_code=$9, province=$10, postal_code=$11, phone=$12`,
        [req.params.id, kind, addr.first_name ?? null, addr.last_name ?? null, addr.company ?? null, addr.address_1 ?? null, addr.address_2 ?? null, addr.city ?? null, addr.country_code?.toLowerCase() ?? null, addr.province ?? null, addr.postal_code ?? null, addr.phone ?? null]
      )
    }
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.get("/admin/orders/:id/preview", requireAuth, async (req, res, next) => {
  try {
    const order = await orderPreview(req.params.id, res)
    if (!order) {
      return
    }
    res.json({ order })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.get("/admin/orders/:id/line-items", requireAuth, async (req, res, next) => {
  try {
    const order = await buildAdminOrder(req.params.id)
    if (!order) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    res.json({ order_items: order.items })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.get("/admin/orders/:id/shipping-options", requireAuth, async (req, res, next) => {
  try {
    const o = await pool.query(`SELECT id, currency_code FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    const { rows } = await pool.query(
      `SELECT * FROM shipping_option WHERE deleted_at IS NULL AND is_return=FALSE AND LOWER(currency_code)=LOWER($1) ORDER BY created_at DESC`,
      [o.rows[0].currency_code]
    )
    res.json({ shipping_options: rows })
  } catch (e) {
    next(e)
  }
})

// --- Orders: transfer / credit-lines / export / authorize payment session ---

ordersCompatRouter.post("/admin/orders/:id/transfer", requireAuth, async (req, res, next) => {
  try {
    const { customer_id, internal_note, description, update_order_email } = z
      .object({ customer_id: z.string(), internal_note: z.string().optional(), description: z.string().optional(), update_order_email: z.boolean().optional() })
      .parse(req.body ?? {})
    const o = await pool.query(`SELECT id, email FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    const c = await pool.query(`SELECT id, email FROM customer WHERE id=$1 AND deleted_at IS NULL`, [customer_id])
    if (!c.rows[0]) {
      res.status(404).json({ message: "Customer not found" })
      return
    }
    void update_order_email
    await pool.query(`UPDATE "order" SET customer_id=$2, email=$3, updated_at=NOW() WHERE id=$1`, [
      req.params.id,
      customer_id,
      c.rows[0].email ?? o.rows[0].email,
    ])
    await pool.query(
      `INSERT INTO order_change (order_id, change_type, description, status, version, requested_at) VALUES ($1,'transfer',$2,'requested',(SELECT version FROM "order" WHERE id=$1)+1,NOW())`,
      [req.params.id, JSON.stringify({ kind: "transfer", customer_id, internal_note: internal_note ?? null, description: description ?? null })]
    )
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:id/transfer/cancel", requireAuth, async (req, res, next) => {
  try {
    const o = await pool.query(`SELECT id FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    await pool.query(
      `UPDATE order_change SET status='canceled', canceled_at=NOW() WHERE id=(
         SELECT id FROM order_change WHERE order_id=$1 AND change_type='transfer' AND status IN ('pending','requested') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1
       )`,
      [req.params.id]
    )
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:id/transfer/guest", requireAuth, async (req, res, next) => {
  try {
    const { email } = z
      .object({ email: z.string().email(), internal_note: z.string().optional(), description: z.string().optional() })
      .parse(req.body ?? {})
    const o = await pool.query(`SELECT * FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    let customer = await pool.query(`SELECT id FROM customer WHERE email=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, [email])
    if (!customer.rows[0]) {
      customer = await pool.query(`INSERT INTO customer (email, has_account) VALUES ($1,FALSE) RETURNING id`, [email])
    }
    await pool.query(`UPDATE "order" SET customer_id=$2, email=$3, updated_at=NOW() WHERE id=$1`, [req.params.id, customer.rows[0].id, email])
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:orderId/credit-lines", requireAuth, async (req, res, next) => {
  try {
    const { amount, reference, reference_id } = z
      .object({ amount: z.number().int().positive(), reference: z.string(), reference_id: z.string() })
      .parse(req.body ?? {})
    const o = await pool.query(`SELECT * FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.orderId])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const cl = await client.query(
        `INSERT INTO credit_line (customer_id, currency_code, amount, remaining, reference) VALUES ($1,$2,$3,$3,$4) RETURNING *`,
        [o.rows[0].customer_id, o.rows[0].currency_code, amount, `${reference}:${reference_id}`]
      )
      await client.query(`INSERT INTO order_credit_line (order_id, credit_line_id, amount) VALUES ($1,$2,$3)`, [req.params.orderId, cl.rows[0].id, amount])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    res.json({ order: await buildAdminOrder(req.params.orderId) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/export", requireAuth, async (_req, res, next) => {
  try {
    const transactionId = "txn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    res.status(202).json({ transaction_id: transactionId })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:id/payment-sessions/authorize", requireAuth, async (req, res, next) => {
  try {
    const { payment_session_id } = z.object({ payment_session_id: z.string() }).parse(req.body ?? {})
    const o = await pool.query(`SELECT id, payment_collection_id FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    const s = await pool.query(`SELECT * FROM payment_session WHERE id=$1 AND deleted_at IS NULL`, [payment_session_id])
    if (!s.rows[0] || s.rows[0].payment_collection_id !== o.rows[0].payment_collection_id) {
      throw Object.assign(new Error("Payment session not found for this order"), { statusCode: 404 })
    }
    await paymentSessionService.authorizeSession(payment_session_id)
    res.json({ order: await buildAdminOrder(req.params.id), is_authorized: true })
  } catch (e) {
    next(e)
  }
})

// --- Orders: fulfillment cancel / shipment / delivered (order-scoped) ---

ordersCompatRouter.post("/admin/orders/:id/fulfillments/:fulfillmentId/cancel", requireAuth, async (req, res, next) => {
  try {
    const { no_notification } = z.object({ no_notification: z.boolean().optional() }).parse(req.body ?? {})
    void no_notification
    const f = await pool.query(`SELECT id FROM fulfillment WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL`, [req.params.fulfillmentId, req.params.id])
    if (!f.rows[0]) {
      res.status(404).json({ message: "Fulfillment not found for this order" })
      return
    }
    await fulfillmentService.cancel(req.params.fulfillmentId)
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:id/fulfillments/:fulfillmentId/shipments", requireAuth, async (req, res, next) => {
  try {
    const { items, labels, no_notification } = z
      .object({
        items: z.array(z.object({ id: z.string(), quantity: z.number().int().positive() })).optional(),
        labels: z.array(z.object({ tracking_number: z.string(), tracking_url: z.string(), label_url: z.string() })).optional(),
        no_notification: z.boolean().optional(),
      })
      .parse(req.body ?? {})
    void items
    void no_notification
    const f = await pool.query(`SELECT id FROM fulfillment WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL`, [req.params.fulfillmentId, req.params.id])
    if (!f.rows[0]) {
      res.status(404).json({ message: "Fulfillment not found for this order" })
      return
    }
    await pool.query(`UPDATE fulfillment SET shipped_at=COALESCE(shipped_at,NOW()), data=COALESCE(data,'{}'::jsonb) || $2::jsonb WHERE id=$1`, [
      req.params.fulfillmentId,
      JSON.stringify({ labels: labels ?? [] }),
    ])
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/orders/:id/fulfillments/:fulfillmentId/mark-as-delivered", requireAuth, async (req, res, next) => {
  try {
    const { no_notification } = z.object({ no_notification: z.boolean().optional() }).parse(req.body ?? {})
    void no_notification
    const r = await pool.query(
      `UPDATE fulfillment SET shipped_at=COALESCE(shipped_at,NOW()), delivered_at=NOW()
       WHERE id=$1 AND order_id=$2 AND canceled_at IS NULL AND delivered_at IS NULL AND deleted_at IS NULL`,
      [req.params.fulfillmentId, req.params.id]
    )
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Fulfillment cannot be delivered"), { statusCode: 400 })
    }
    res.json({ order: await buildAdminOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// --- Fulfillments (global): create + createShipment ---

ordersCompatRouter.post("/admin/fulfillments", requireAuth, async (req, res, next) => {
  try {
    const { order_id, location_id, provider_id, items, labels, delivery_address } = z
      .object({
        order_id: z.string(),
        location_id: z.string().optional(),
        provider_id: z.string().optional(),
        items: z.array(z.object({ id: z.string().optional(), line_item_id: z.string().optional(), quantity: z.number().int().positive(), title: z.string().optional(), sku: z.string().optional() })).optional(),
        labels: z.array(z.object({ tracking_number: z.string(), tracking_url: z.string(), label_url: z.string() })).optional(),
        delivery_address: addressSchema.optional(),
      })
      .parse(req.body ?? {})
    void location_id
    const lineItems = (items ?? [])
      .map((it) => ({ line_item_id: it.line_item_id ?? it.id, quantity: it.quantity }))
      .filter((it): it is { line_item_id: string; quantity: number } => !!it.line_item_id)
    let fulfillment
    if (lineItems.length > 0) {
      fulfillment = await fulfillmentService.createFulfillment(order_id, lineItems)
    } else {
      const { rows } = await pool.query(
        `INSERT INTO fulfillment (order_id, provider_id, data) VALUES ($1,$2,$3) RETURNING *`,
        [order_id, provider_id ?? "manual", JSON.stringify({ labels: labels ?? [], delivery_address: delivery_address ?? null })]
      )
      fulfillment = rows[0]
    }
    const fi = await pool.query(
      `SELECT fi.*, oli.title FROM fulfillment_item fi LEFT JOIN order_line_item oli ON oli.id=fi.line_item_id WHERE fi.fulfillment_id=$1`,
      [fulfillment.id]
    )
    res.status(201).json({ fulfillment: { ...fulfillment, items: fi.rows } })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/fulfillments/:id/shipment", requireAuth, async (req, res, next) => {
  try {
    const { labels } = z
      .object({ labels: z.array(z.object({ tracking_number: z.string(), tracking_url: z.string(), label_url: z.string() })).optional() })
      .parse(req.body ?? {})
    const r = await pool.query(
      `UPDATE fulfillment SET shipped_at=COALESCE(shipped_at,NOW()), data=COALESCE(data,'{}'::jsonb) || $2::jsonb WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
      [req.params.id, JSON.stringify({ labels: labels ?? [] })]
    )
    if (!r.rows[0]) {
      res.status(404).json({ message: "Fulfillment not found" })
      return
    }
    const fi = await pool.query(
      `SELECT fi.*, oli.title FROM fulfillment_item fi LEFT JOIN order_line_item oli ON oli.id=fi.line_item_id WHERE fi.fulfillment_id=$1`,
      [req.params.id]
    )
    res.json({ fulfillment: { ...r.rows[0], items: fi.rows } })
  } catch (e) {
    next(e)
  }
})

// --- Order changes: update ---

ordersCompatRouter.post("/admin/order-changes/:id", requireAuth, async (req, res, next) => {
  try {
    const { carry_over_promotions, internal_note } = z
      .object({ carry_over_promotions: z.boolean().optional(), internal_note: z.string().nullish() })
      .parse(req.body ?? {})
    void carry_over_promotions
    const existing = await pool.query(`SELECT id FROM order_change WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!existing.rows[0]) {
      res.status(404).json({ message: "Order change not found" })
      return
    }
    if (internal_note !== undefined) {
      await pool.query(`UPDATE order_change SET description=$2 WHERE id=$1`, [req.params.id, internal_note])
    }
    res.json({ order_change: await changeWithActions(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// --- Order edits: full lifecycle (modeled as order_change rows, change_type='edit') ---

ordersCompatRouter.post("/admin/order-edits", requireAuth, async (req, res, next) => {
  try {
    const { order_id, description, internal_note } = z
      .object({ order_id: z.string(), description: z.string().optional(), internal_note: z.string().optional() })
      .parse(req.body ?? {})
    const o = await pool.query(`SELECT id FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [order_id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    const change = await orderChangeService.request(order_id, "edit", description ?? internal_note, [])
    res.status(201).json({ order_change: await changeWithActions(change.id) })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.delete("/admin/order-edits/:id", requireAuth, async (req, res, next) => {
  try {
    const edit = await activeEdit(req.params.id)
    if (!edit) {
      res.status(404).json({ message: "Order edit not found" })
      return
    }
    await orderChangeService.cancel(edit.id)
    res.json({ id: req.params.id, object: "order-edit", deleted: true })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/order-edits/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    const edit = await activeEdit(req.params.id)
    if (!edit) {
      res.status(404).json({ message: "Order edit not found" })
      return
    }
    await orderChangeService.confirm(edit.id)
    const preview = await orderPreview(req.params.id, res)
    if (!preview) {
      return
    }
    res.json({ order_preview: preview })
  } catch (e) {
    next(e)
  }
})

ordersCompatRouter.post("/admin/order-edits/:id/request", requireAuth, async (req, res, next) => {
  try {
    const { no_notification } = z.object({ no_notification: z.boolean().optional() }).parse(req.body ?? {})
    void no_notification
    const o = await pool.query(`SELECT id FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!o.rows[0]) {
      res.status(404).json({ message: "Order not found" })
      return
    }
    let edit = await activeEdit(req.params.id)
    if (!edit) {
      edit = await orderChangeService.request(req.params.id, "edit", undefined, [])
    } else {
      await pool.query(`UPDATE order_change SET status='requested' WHERE id=$1`, [edit.id])
    }
