import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import {
  DRAFT_ORDER_FILTERS,
  DRAFT_ORDER_Q_COLUMNS,
  DRAFT_ORDER_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { fulfillmentService } from "../fulfillment/fulfillment.service"
import { pricingService } from "../pricing/pricing.service"

// Lupus-compat draft-order endpoints (dashboard parity: draft orders CRUD,
// convert-to-order, edit lifecycle).
//
// Source refs (paths/verbs):
//   upstream/packages/core/js-sdk/src/admin/draft-order.ts (create/list/retrieve/update/
//     delete/convertToOrder + edit lifecycle: items, shipping-methods, promotions)
//   upstream/src/api/admin/draft-orders/**/route.ts (response shapes:
//     retrieve -> { draft_order }, lists -> { draft_orders, count, offset, limit },
//     create -> 201, delete -> { id, object, deleted: true }, convert -> { order })
//
// Simplifications vs Lupus:
// - Drafts are "order" rows with is_draft_order=TRUE (same storage as the lupus
//   draft-order create/confirm in groups-giftcard-draft.routes.ts). There is no
//   separate draft_order table. The detail shape is assembled from order +
//   order_line_item + order_address + order_shipping_method + customer + region.
// - POST /admin/draft-orders (create) below is a Lupus-shaped superset of the lupus
//   create (accepts region_id/customer_id/shipping_address/billing_address, derives
//   currency from the region). In the full app the lupus route is registered first
//   (see app.ts "only NEW paths, registered last"), so the lupus handler wins there
//   and this handler serves standalone-router consumers with identical 201 behavior.
// - convert-to-order flips is_draft_order to FALSE (same as lupus confirm) and
//   returns the assembled order; there is no cart/checkout round-trip.
// - Shipping methods are persisted straight onto the order in order_shipping_method
//   (schema-p15-order-shipping.sql) because the lupus dashboard creates/updates/
//   deletes them directly on the draft instead of staging an order edit;
//   writeOrderTotals is the single writer of subtotal/discount_total/shipping_total/
//   total (and payment_collection.amount) for every draft mutation.
// - Edit lifecycle is modeled as order_change rows (change_type='edit',
//   status pending/requested/confirmed/canceled) with order_change_action rows.
//   order_change_action has no shipping/promotion columns, so staged shipping methods
//   use action='add_shipping' (variant_id=shipping_option_id when chosen from an
//   option, title=name, unit_price=amount) and staged promotions use
//   action='add_promo'/'remove_promo' (title=code, variant_id=promotion_id when known).
//   That staged path is unchanged: confirming still folds staged shipping into
//   order.shipping_total and order-level fixed/percentage promos into
//   order.discount_total; unrecognized promo types are recorded (usage_count
//   bumped) without monetary effect. No notification worker exists, so edit/request
//   only flips the change status to requested.
// - Every edit mutation returns both { draft_order } and { order_preview } (same
//   preview object) to cover both Lupus shape variants.
export const draftCompatRouter = Router()

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

const draftItemSchema = z.object({
  variant_id: z.string().optional(),
  title: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative().nullish(),
}).refine((v) => v.variant_id || v.title, { message: "variant_id or title is required" })

async function resolveUnitPrice(variantId: string, currency: string, explicit?: number | null): Promise<number> {
  if (explicit != null) {
    return explicit
  }
  const v = await pool.query(`SELECT id FROM product_variant WHERE id=$1 AND deleted_at IS NULL`, [variantId])
  if (!v.rows[0]) {
    throw Object.assign(new Error(`Variant ${variantId} not found`), { statusCode: 404 })
  }
  return pricingService.resolveUnitPrice(variantId, currency)
}

async function variantTitle(variantId: string): Promise<{ title: string; productId: string | null }> {
  const v = await pool.query(
    `SELECT v.title, v.product_id, p.title AS product_title FROM product_variant v LEFT JOIN product p ON p.id=v.product_id WHERE v.id=$1`,
    [variantId]
  )
  if (!v.rows[0]) {
    return { title: "Draft item", productId: null }
  }
  return { title: v.rows[0].product_title ?? v.rows[0].title ?? "Draft item", productId: v.rows[0].product_id ?? null }
}

async function upsertAddress(orderId: string, kind: "shipping" | "billing", addr: z.infer<typeof addressSchema>) {
  await pool.query(
    `INSERT INTO order_address (order_id, kind, first_name, last_name, company, address_1, address_2, city, country_code, province, postal_code, phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (order_id, kind) DO UPDATE
     SET first_name=$3, last_name=$4, company=$5, address_1=$6, address_2=$7, city=$8, country_code=$9, province=$10, postal_code=$11, phone=$12`,
    [
      orderId,
      kind,
      addr.first_name ?? null,
      addr.last_name ?? null,
      addr.company ?? null,
      addr.address_1 ?? null,
      addr.address_2 ?? null,
      addr.city ?? null,
      addr.country_code?.toLowerCase() ?? null,
      addr.province ?? null,
      addr.postal_code ?? null,
      addr.phone ?? null,
    ]
  )
}

function mapShippingMethod(row: any) {
  return {
    id: row.id,
    order_id: row.order_id,
    shipping_option_id: row.shipping_option_id ?? null,
    name: row.name,
    amount: Number(row.amount ?? 0),
    data: row.data ?? null,
    created_at: row.created_at,
  }
}

async function writeOrderTotals(client: any, orderId: string, opts: { shippingTotal?: number } = {}) {
  const lines = await client.query(
    `SELECT COALESCE(SUM(quantity*unit_price),0) AS subtotal, COALESCE(SUM(discount_total),0) AS line_discount FROM order_line_item WHERE order_id=$1`,
    [orderId]
  )
  const subtotal = Number(lines.rows[0]?.subtotal ?? 0)
  const discountTotal = -Math.abs(Number(lines.rows[0]?.line_discount ?? 0))
  let shippingTotal = opts.shippingTotal
  if (shippingTotal == null) {
    const shipping = await client.query(`SELECT COALESCE(SUM(amount),0) AS shipping_total FROM order_shipping_method WHERE order_id=$1`, [orderId])
    shippingTotal = Number(shipping.rows[0]?.shipping_total ?? 0)
  }
  await client.query(
    `UPDATE "order" SET subtotal=$2, discount_total=$3, shipping_total=$4, total=GREATEST($2::bigint+$3::bigint+$4::bigint+tax_total, 0), updated_at=NOW() WHERE id=$1`,
    [orderId, subtotal, discountTotal, shippingTotal]
  )
  const o = await client.query(`SELECT total, payment_collection_id FROM "order" WHERE id=$1`, [orderId])
  if (o.rows[0]?.payment_collection_id) {
    await client.query(`UPDATE payment_collection SET amount=$2, updated_at=NOW() WHERE id=$1`, [
      o.rows[0].payment_collection_id,
      Number(o.rows[0].total ?? 0),
    ])
  }
  return { subtotal, discountTotal, shippingTotal }
}

async function recomputeDraftTotals(orderId: string) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await writeOrderTotals(client, orderId)
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

async function assembleOrder(orderId: string) {
  const o = await pool.query(
    `SELECT o.*, pc.status AS payment_status FROM "order" o LEFT JOIN payment_collection pc ON pc.id=o.payment_collection_id WHERE o.id=$1 AND o.deleted_at IS NULL`,
    [orderId]
  )
  if (!o.rows[0]) {
    return null
  }
  const base = o.rows[0]
  const [itemsR, addrR, custR, regionR, pcR, scR, smR] = await Promise.all([
    pool.query(
      `SELECT oli.*, v.sku AS variant_sku, v.title AS variant_title, p.title AS product_title
       FROM order_line_item oli LEFT JOIN product_variant v ON v.id=oli.variant_id LEFT JOIN product p ON p.id=oli.product_id
       WHERE oli.order_id=$1 ORDER BY oli.created_at`,
      [orderId]
    ),
    pool.query(`SELECT * FROM order_address WHERE order_id=$1`, [orderId]),
    base.customer_id ? pool.query(`SELECT * FROM customer WHERE id=$1 AND deleted_at IS NULL`, [base.customer_id]) : Promise.resolve({ rows: [] }),
    base.region_id ? pool.query(`SELECT * FROM region WHERE id=$1 AND deleted_at IS NULL`, [base.region_id]) : Promise.resolve({ rows: [] }),
    base.payment_collection_id
      ? pool.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL`, [base.payment_collection_id])
      : Promise.resolve({ rows: [] }),
    base.sales_channel_id
      ? pool.query(`SELECT id, name FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [base.sales_channel_id])
      : Promise.resolve({ rows: [] }),
    pool.query(`SELECT * FROM order_shipping_method WHERE order_id=$1 ORDER BY created_at`, [orderId]),
  ])
  const items = itemsR.rows.map((li: any) => {
    const subtotal = Number(li.quantity) * Number(li.unit_price)
    return { ...li, quantity: Number(li.quantity), unit_price: Number(li.unit_price), discount_total: Number(li.discount_total ?? 0), subtotal, total: subtotal - Number(li.discount_total ?? 0), variant_title: li.variant_title ?? null, variant_sku: li.variant_sku ?? null, product_title: li.product_title ?? null }
  })
  const shipping = addrR.rows.find((a: any) => a.kind === "shipping") ?? null
  const billing = addrR.rows.find((a: any) => a.kind === "billing") ?? null
  const shippingMethods = smR.rows.map(mapShippingMethod)
  const subtotal = Number(base.subtotal ?? 0)
  const meta = ((base.metadata ?? {}) as { promo_codes?: unknown })
  const promoCodes = Array.isArray(meta.promo_codes) ? (meta.promo_codes as unknown[]).map((c) => String(c)) : []
  return {
    ...base,
    payment_status: base.payment_status ?? "not_paid",
    metadata: (base.metadata ?? {}) as Record<string, unknown>,
    customer: custR.rows[0] ?? null,
    region: regionR.rows[0] ?? null,
    items,
    shipping_methods: shippingMethods,
