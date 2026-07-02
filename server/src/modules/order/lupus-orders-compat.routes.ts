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

