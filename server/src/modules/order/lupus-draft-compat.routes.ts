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
    shipping_address: shipping,
    billing_address: billing,
    payment_collection: pcR.rows[0] ?? null,
    promo_codes: promoCodes,
    summary: {
      subtotal,
      discount_total: Number(base.discount_total ?? 0),
      shipping_total: Number(base.shipping_total ?? 0),
      tax_total: Number(base.tax_total ?? 0),
      total: Number(base.total ?? 0),
    },
  }
}

async function orderPromoDiscount(codes: string[], subtotal: number): Promise<number> {
  let delta = 0
  for (const raw of codes) {
    const code = String(raw).toUpperCase()
    const p = await pool.query(`SELECT * FROM promotion WHERE code=$1 AND deleted_at IS NULL`, [code])
    if (!p.rows[0]) {
      throw Object.assign(new Error(`Promotion ${code} not found`), { statusCode: 404 })
    }
    if (p.rows[0].status === "active") {
      delta += promoDiscount(p.rows[0], subtotal)
    }
  }
  return delta
}

async function readDraftPromoCodes(orderId: string): Promise<string[]> {
  try {
    const cur = await pool.query(`SELECT metadata FROM "order" WHERE id=$1`, [orderId])
    const meta = ((cur.rows[0]?.metadata ?? {}) as { promo_codes?: unknown })
    return Array.isArray(meta.promo_codes) ? (meta.promo_codes as unknown[]).map((c) => String(c)) : []
  } catch (e: any) {
    if (e?.code === "42703") {
      return []
    }
    throw e
  }
}

async function replaceDraftItemsAndPromos(
  orderId: string,
  currency: string,
  items: { variant_id?: string; title: string; quantity: number; unit_price?: number | null }[] | undefined,
  promoCodes: string[] | undefined
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    if (items !== undefined) {
      await client.query(`DELETE FROM order_line_item WHERE order_id=$1`, [orderId])
      for (const i of items) {
        let price: number
        if (i.variant_id) {
          price = await resolveUnitPrice(i.variant_id, currency, i.unit_price)
        } else {
          price = Number(i.unit_price ?? 0)
        }
        await client.query(
          `INSERT INTO order_line_item (order_id, variant_id, product_id, title, quantity, unit_price, discount_total) VALUES ($1,$2,$3,$4,$5,$6,0)`,
          [orderId, i.variant_id ?? null, null, i.title, i.quantity, price]
        )
      }
    }
    const lines = await client.query(`SELECT id, quantity, unit_price, discount_total FROM order_line_item WHERE order_id=$1`, [orderId])
    const subtotal = lines.rows.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0)
    const codes = promoCodes !== undefined ? promoCodes.map((c) => String(c).toUpperCase()) : await readDraftPromoCodes(orderId)
    const discount = await orderPromoDiscount(codes, subtotal)
    if (promoCodes !== undefined) {
      try {
        const cur = await client.query(`SELECT metadata FROM "order" WHERE id=$1`, [orderId])
        const meta = ((cur.rows[0]?.metadata ?? {}) as Record<string, unknown>)
        await client.query(`UPDATE "order" SET metadata=$2 WHERE id=$1`, [orderId, JSON.stringify({ ...meta, promo_codes: codes })])
      } catch (e: any) {
        if (e?.code !== "42703") {
          throw e
        }
      }
    }
    if (discount !== 0 && lines.rows.length > 0) {
      const perItemDiscount = Math.round(-discount / lines.rows.length)
      for (const line of lines.rows) {
        await client.query(`UPDATE order_line_item SET discount_total=$1 WHERE id=$2`, [perItemDiscount, line.id])
      }
    }
    const kept = await client.query(`SELECT shipping_total FROM "order" WHERE id=$1`, [orderId])
    await writeOrderTotals(client, orderId, { shippingTotal: Number(kept.rows[0]?.shipping_total ?? 0) })
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

export async function buildDraftOrder(orderId: string) {
  const order = await assembleOrder(orderId)
  if (!order || !order.is_draft_order) {
    return null
  }
  return { ...order, status: "open" }
}

async function requireDraft(orderId: string, res: any) {
  const draft = await buildDraftOrder(orderId)
  if (!draft) {
    res.status(404).json({ message: "Draft order not found" })
    return null
  }
  return draft
}

async function activeDraftEdit(orderId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM order_change WHERE order_id=$1 AND change_type='edit' AND status IN ('pending','requested') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}

async function ensureDraftEdit(orderId: string) {
  const existing = await activeDraftEdit(orderId)
  if (existing) {
    return existing
  }
  const o = await pool.query(`SELECT version FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [orderId])
  if (!o.rows[0]) {
    throw Object.assign(new Error("Draft order not found"), { statusCode: 404 })
  }
  const { rows } = await pool.query(
    `INSERT INTO order_change (order_id, change_type, status, version, requested_at) VALUES ($1,'edit','pending',$2,NOW()) RETURNING *`,
    [orderId, Number(o.rows[0].version ?? 1) + 1]
  )
  return rows[0]
}

async function editActions(changeId: string) {
  const { rows } = await pool.query(`SELECT * FROM order_change_action WHERE order_change_id=$1 ORDER BY created_at`, [changeId])
  return rows
}

function promoDiscount(promo: any, subtotal: number): number {
  if (promo.application_target !== "order") {
    return 0
  }
  if (promo.application_type === "fixed") {
    return -Math.min(Number(promo.application_value ?? 0), subtotal)
  }
  if (promo.application_type === "percentage") {
    return -Math.round((subtotal * Number(promo.application_value ?? 0)) / 100)
  }
  return 0
}

async function buildDraftPreview(orderId: string) {
  const draft = await buildDraftOrder(orderId)
  if (!draft) {
    return null
  }
  const edit = await activeDraftEdit(orderId)
  if (!edit) {
    return draft
  }
  const actions = await editActions(edit.id)
  const items = draft.items.map((i: any) => ({ ...i }))
  const added: any[] = []
  let shippingDelta = 0
  let promoDelta = 0
  const subtotalOf = (list: any[]) => list.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0)
  for (const a of actions) {
    if (a.action === "add_item") {
      const t = a.variant_id ? await variantTitle(a.variant_id) : { title: a.title ?? "Draft item", productId: null }
      added.push({
        id: a.id,
        order_id: orderId,
        variant_id: a.variant_id,
        product_id: null,
        title: a.title ?? t.title,
        quantity: a.quantity ?? 1,
        unit_price: Number(a.unit_price ?? 0),
        subtotal: Number(a.quantity ?? 1) * Number(a.unit_price ?? 0),
        total: Number(a.quantity ?? 1) * Number(a.unit_price ?? 0),
        staged_action_id: a.id,
      })
    } else if (a.action === "remove_item" && a.line_item_id) {
      const idx = items.findIndex((i: any) => i.id === a.line_item_id)
      if (idx >= 0) {
        items.splice(idx, 1)
      }
    } else if (a.action === "update_qty" && a.line_item_id) {
      const line = items.find((i: any) => i.id === a.line_item_id)
      if (line) {
        if (a.quantity != null) {
          line.quantity = a.quantity
        }
        if (a.unit_price != null) {
          line.unit_price = Number(a.unit_price)
        }
        line.subtotal = Number(line.quantity) * Number(line.unit_price)
        line.total = line.subtotal - Number(line.discount_total ?? 0)
      }
    } else if (a.action === "add_shipping") {
      shippingDelta += Number(a.unit_price ?? 0)
    } else if (a.action === "remove_shipping") {
      shippingDelta -= Number(a.unit_price ?? 0)
    } else if (a.action === "add_promo" && a.title) {
      const p = await pool.query(`SELECT * FROM promotion WHERE code=$1 AND deleted_at IS NULL`, [String(a.title).toUpperCase()])
      if (p.rows[0] && p.rows[0].status === "active") {
        promoDelta += promoDiscount(p.rows[0], subtotalOf(items) + subtotalOf(added))
      }
    } else if (a.action === "remove_promo") {
      promoDelta = 0
    }
  }
  const allItems = [...items, ...added]
  const subtotal = subtotalOf(allItems)
  const shippingTotal = Math.max(Number(draft.shipping_total ?? 0) + shippingDelta, 0)
  return {
    ...draft,
    items: allItems,
    shipping_total: shippingTotal,
    summary: {
      ...draft.summary,
      subtotal,
      discount_total: Number(draft.discount_total ?? 0) + promoDelta,
      shipping_total: shippingTotal,
      total: subtotal + Number(draft.discount_total ?? 0) + promoDelta + shippingTotal + Number(draft.tax_total ?? 0),
    },
    staged_actions: actions,
  }
}

async function confirmDraftEdit(orderId: string) {
  const edit = await activeDraftEdit(orderId)
  if (!edit) {
    throw Object.assign(new Error("No active draft edit"), { statusCode: 404 })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const { rows: actions } = await client.query(`SELECT * FROM order_change_action WHERE order_change_id=$1 ORDER BY created_at`, [edit.id])
    let shippingDelta = 0
    let promoDelta = 0
    for (const a of actions) {
      if (a.action === "remove_item" && a.line_item_id) {
        await client.query(`DELETE FROM order_line_item WHERE id=$1 AND order_id=$2`, [a.line_item_id, orderId])
      } else if (a.action === "update_qty" && a.line_item_id) {
        if (a.quantity != null && Number(a.quantity) <= 0) {
          await client.query(`DELETE FROM order_line_item WHERE id=$1 AND order_id=$2`, [a.line_item_id, orderId])
        } else {
          await client.query(
            `UPDATE order_line_item SET quantity=COALESCE($3,quantity), unit_price=COALESCE($4,unit_price) WHERE id=$1 AND order_id=$2`,
            [a.line_item_id, orderId, a.quantity, a.unit_price]
          )
        }
      } else if (a.action === "add_item") {
        const t = a.variant_id ? await variantTitle(a.variant_id) : { title: a.title ?? "Draft item", productId: null }
        await client.query(
          `INSERT INTO order_line_item (order_id, variant_id, product_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4,$5,$6)`,
          [orderId, a.variant_id, t.productId, a.title ?? t.title, a.quantity ?? 1, a.unit_price ?? 0]
        )
      } else if (a.action === "add_shipping") {
        shippingDelta += Number(a.unit_price ?? 0)
      } else if (a.action === "remove_shipping") {
        shippingDelta -= Number(a.unit_price ?? 0)
      } else if (a.action === "add_promo" && a.title) {
        const p = await client.query(`SELECT * FROM promotion WHERE code=$1 AND deleted_at IS NULL`, [String(a.title).toUpperCase()])
        if (p.rows[0] && p.rows[0].status === "active") {
          const lines = await client.query(`SELECT quantity, unit_price FROM order_line_item WHERE order_id=$1`, [orderId])
          const subtotal = lines.rows.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0)
          promoDelta += promoDiscount(p.rows[0], subtotal)
          await client.query(`UPDATE promotion SET usage_count = usage_count + 1 WHERE id=$1`, [p.rows[0].id])
        }
      } else if (a.action === "remove_promo") {
        promoDelta = 0
      }
    }
    const lines = await client.query(`SELECT quantity, unit_price, discount_total FROM order_line_item WHERE order_id=$1`, [orderId])
    const subtotal = lines.rows.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0)
    const discount = -lines.rows.reduce((s: number, l: any) => s + Number(l.discount_total ?? 0), 0) + promoDelta
    await client.query(
      `UPDATE "order" SET subtotal=$2, discount_total=$3, shipping_total=GREATEST(shipping_total+$4,0),
        total=$2+$3+GREATEST(shipping_total+$4,0)+tax_total, version=$5, updated_at=NOW() WHERE id=$1`,
      [orderId, subtotal, discount, shippingDelta, edit.version]
    )
    const o = await client.query(`SELECT total, payment_collection_id FROM "order" WHERE id=$1`, [orderId])
    if (o.rows[0]?.payment_collection_id) {
      await client.query(`UPDATE payment_collection SET amount=$2, updated_at=NOW() WHERE id=$1`, [
        o.rows[0].payment_collection_id,
        Number(o.rows[0].total ?? 0),
      ])
    }
    await client.query(`UPDATE order_change SET status='confirmed', confirmed_at=NOW() WHERE id=$1`, [edit.id])
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

// --- Draft orders: list / create / retrieve / update / delete / convert ---

// List is filtered/paged/sorted through the shared helper (list-query.ts), so
// unknown query params are ignored instead of 400-ing and COUNT matches the page.
draftCompatRouter.get("/admin/draft-orders", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "\"order\"",
      alias: "o",
      select: "o.*",
      base: ["o.is_draft_order=TRUE", "o.deleted_at IS NULL"],
      specs: DRAFT_ORDER_FILTERS,
      q: { columns: DRAFT_ORDER_Q_COLUMNS },
      order: DRAFT_ORDER_SORT,
      defaultOrder: "o.created_at DESC",
      key: "draft_orders",
      enrich: (row: any) => buildDraftOrder(row.id),
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders", requireAuth, async (req, res, next) => {
  try {
    const { email, customer_id, region_id, currency_code, sales_channel_id, shipping_address, billing_address, items } = z
      .object({
        email: z.string().email().optional(),
        customer_id: z.string().optional(),
        region_id: z.string().optional(),
        currency_code: z.string().length(3).optional(),
        sales_channel_id: z.string().optional(),
        shipping_address: addressSchema.optional(),
        billing_address: addressSchema.optional(),
        items: z.array(draftItemSchema).optional().default([]),
      })
      .parse(req.body ?? {})
    let resolvedEmail = email ?? null
    if (!resolvedEmail && customer_id) {
      const c = await pool.query(`SELECT email FROM customer WHERE id=$1 AND deleted_at IS NULL`, [customer_id])
      if (!c.rows[0]) {
        throw Object.assign(new Error("Customer not found"), { statusCode: 404 })
      }
      resolvedEmail = c.rows[0].email
    }
    if (!resolvedEmail) {
      throw Object.assign(new Error("email or customer_id is required"), { statusCode: 400 })
    }
    let currency = currency_code?.toLowerCase() ?? null
    if (!currency && region_id) {
      const r = await pool.query(`SELECT currency_code FROM region WHERE id=$1 AND deleted_at IS NULL`, [region_id])
      if (!r.rows[0]) {
        throw Object.assign(new Error("Region not found"), { statusCode: 404 })
      }
      currency = String(r.rows[0].currency_code).toLowerCase()
    }
    if (!currency) {
      throw Object.assign(new Error("currency_code or region_id is required"), { statusCode: 400 })
    }
    const priced: { variant_id?: string; title: string; quantity: number; unit_price: number }[] = []
    for (const i of items) {
      if (i.variant_id) {
        const price = await resolveUnitPrice(i.variant_id, currency, i.unit_price)
        priced.push({ variant_id: i.variant_id, title: "", quantity: i.quantity, unit_price: price })
      } else {
        priced.push({ variant_id: undefined, title: i.title ?? "Custom Item", quantity: i.quantity, unit_price: Number(i.unit_price ?? 0) })
      }
    }
    const subtotal = priced.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const client = await pool.connect()
    let orderId: string
    try {
      await client.query("BEGIN")
      const pc = await client.query(`INSERT INTO payment_collection (currency_code, amount, status) VALUES ($1,$2,'not_paid') RETURNING id`, [
        currency,
        subtotal,
      ])
      const o = await client.query(
        `INSERT INTO "order" (email, customer_id, region_id, currency_code, subtotal, total, is_draft_order, status, sales_channel_id, payment_collection_id)
         VALUES ($1,$2,$3,$4,$5,$5,TRUE,'pending',$6,$7) RETURNING id`,
        [resolvedEmail, customer_id ?? null, region_id ?? null, currency, subtotal, sales_channel_id ?? null, pc.rows[0].id]
      )
      orderId = o.rows[0].id
      for (const i of priced) {
        if (i.variant_id) {
          const t = await variantTitle(i.variant_id)
          await client.query(
            `INSERT INTO order_line_item (order_id, variant_id, product_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4,$5,$6)`,
            [orderId, i.variant_id, t.productId, t.title, i.quantity, i.unit_price]
          )
        } else {
          await client.query(
            `INSERT INTO order_line_item (order_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
            [orderId, i.title, i.quantity, i.unit_price]
          )
        }
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    if (shipping_address) {
      await upsertAddress(orderId!, "shipping", shipping_address)
    }
    if (billing_address) {
      await upsertAddress(orderId!, "billing", billing_address)
    }
    res.status(201).json({ draft_order: await buildDraftOrder(orderId!) })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.get("/admin/draft-orders/:id", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    res.json({ draft_order: draft })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id", requireAuth, async (req, res, next) => {
  try {
    const { email, customer_id, region_id, sales_channel_id, shipping_address, billing_address, items, promo_codes, metadata } = z
      .object({
        email: z.string().email().optional(),
        customer_id: z.string().nullish(),
        region_id: z.string().nullish(),
        sales_channel_id: z.string().nullish(),
        shipping_address: addressSchema.optional(),
        billing_address: addressSchema.optional(),
        items: z.array(draftItemSchema).optional(),
        promo_codes: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      })
      .parse(req.body ?? {})
    const existing = await pool.query(`SELECT id, currency_code FROM "order" WHERE id=$1 AND is_draft_order=TRUE AND deleted_at IS NULL`, [req.params.id])
    if (!existing.rows[0]) {
      res.status(404).json({ message: "Draft order not found" })
      return
    }
    if (customer_id !== undefined) {
      if (customer_id) {
        const c = await pool.query(`SELECT id, email FROM customer WHERE id=$1 AND deleted_at IS NULL`, [customer_id])
        if (!c.rows[0]) {
          throw Object.assign(new Error("Customer not found"), { statusCode: 404 })
        }
        await pool.query(`UPDATE "order" SET customer_id=$2, email=COALESCE($3,email), updated_at=NOW() WHERE id=$1`, [
          req.params.id,
          customer_id,
          email ?? c.rows[0].email,
        ])
      } else {
        await pool.query(`UPDATE "order" SET customer_id=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id])
      }
    }
    if (email !== undefined && customer_id === undefined) {
      await pool.query(`UPDATE "order" SET email=$2, updated_at=NOW() WHERE id=$1`, [req.params.id, email])
    }
    if (region_id !== undefined) {
      if (region_id) {
        const r = await pool.query(`SELECT id FROM region WHERE id=$1 AND deleted_at IS NULL`, [region_id])
        if (!r.rows[0]) {
          throw Object.assign(new Error("Region not found"), { statusCode: 404 })
        }
      }
      await pool.query(`UPDATE "order" SET region_id=$2, updated_at=NOW() WHERE id=$1`, [req.params.id, region_id])
    }
    if (sales_channel_id !== undefined) {
      await pool.query(`UPDATE "order" SET sales_channel_id=$2, updated_at=NOW() WHERE id=$1`, [req.params.id, sales_channel_id])
    }
    if (shipping_address) {
      await upsertAddress(req.params.id, "shipping", shipping_address)
    }
    if (billing_address) {
      await upsertAddress(req.params.id, "billing", billing_address)
    }
    if (items !== undefined || promo_codes !== undefined) {
      const mappedItems = items?.map((i) => ({ ...i, title: i.title ?? "Custom Item" }))
      await replaceDraftItemsAndPromos(req.params.id, String(existing.rows[0].currency_code), mappedItems, promo_codes)
    }
    if (metadata !== undefined) {
      for (const key of Object.keys(metadata)) {
        if (!key.trim()) {
          throw Object.assign(new Error("metadata keys must not be empty or whitespace"), { statusCode: 400 })
        }
      }
      const cur = await pool.query(`SELECT metadata FROM "order" WHERE id=$1`, [req.params.id])
      const merged = { ...(((cur.rows[0]?.metadata ?? {}) as Record<string, unknown>)) }
      for (const [key, value] of Object.entries(metadata)) {
        if (value === null) {
          delete merged[key]
        } else {
          merged[key] = value
        }
      }
      await pool.query(`UPDATE "order" SET metadata=$2, updated_at=NOW() WHERE id=$1`, [req.params.id, JSON.stringify(merged)])
    }
    res.json({ draft_order: await buildDraftOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.delete("/admin/draft-orders/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await pool.query(`UPDATE "order" SET deleted_at=NOW() WHERE id=$1 AND is_draft_order=TRUE AND deleted_at IS NULL`, [req.params.id])
    if (r.rowCount === 0) {
      res.status(404).json({ message: "Draft order not found" })
      return
    }
    res.json({ id: req.params.id, object: "draft-order", deleted: true })
  } catch (e) {
    next(e)
  }
})

// --- Draft-order shipping methods (persisted immediately on the draft) ---

draftCompatRouter.get("/admin/draft-orders/:id/shipping-options", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    res.json({ shipping_options: await fulfillmentService.optionsForOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/shipping-methods", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { shipping_option_id, name, custom_amount, amount, data } = z
      .object({
        shipping_option_id: z.string().nullish(),
        name: z.string().nullish(),
        custom_amount: z.number().int().nonnegative().nullish(),
        amount: z.number().int().nonnegative().nullish(),
        data: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(req.body ?? {})
    const optionId = shipping_option_id?.trim() || null
    let methodName = name?.trim() || null
    let optionAmount: number | null = null
    if (optionId) {
      const opt = await pool.query(`SELECT id, name, amount FROM shipping_option WHERE id=$1 AND deleted_at IS NULL`, [optionId])
      if (!opt.rows[0]) {
        res.status(404).json({ message: "Shipping option not found" })
        return
      }
      methodName = String(opt.rows[0].name)
      optionAmount = Number(opt.rows[0].amount ?? 0)
    } else if (!methodName) {
      res.status(400).json({ message: "name is required when shipping_option_id is omitted" })
      return
    }
    const methodAmount = custom_amount ?? amount ?? optionAmount
    if (methodAmount == null) {
      res.status(400).json({ message: "custom_amount or amount is required for a custom shipping method" })
      return
    }
    const inserted = await pool.query(
      `INSERT INTO order_shipping_method (order_id, shipping_option_id, name, amount, data) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, optionId, methodName, methodAmount, data ? JSON.stringify(data) : null]
    )
    await recomputeDraftTotals(req.params.id)
    res.json({ draft_order: await buildDraftOrder(req.params.id), shipping_method: mapShippingMethod(inserted.rows[0]) })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/shipping-methods/:smId", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { amount, name, data } = z
      .object({
        amount: z.number().int().nonnegative().nullish(),
        name: z.string().nullish(),
        data: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(req.body ?? {})
    const updated = await pool.query(
      `UPDATE order_shipping_method SET amount=COALESCE($3, amount), name=COALESCE($4, name), data=COALESCE($5, data), updated_at=NOW() WHERE id=$1 AND order_id=$2 RETURNING *`,
      [req.params.smId, req.params.id, amount ?? null, name?.trim() || null, data ? JSON.stringify(data) : null]
    )
    if (updated.rowCount === 0) {
      res.status(404).json({ message: "Shipping method not found" })
      return
    }
    await recomputeDraftTotals(req.params.id)
    res.json({ draft_order: await buildDraftOrder(req.params.id), shipping_method: mapShippingMethod(updated.rows[0]) })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.delete("/admin/draft-orders/:id/shipping-methods/:smId", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const deleted = await pool.query(`DELETE FROM order_shipping_method WHERE id=$1 AND order_id=$2 RETURNING id`, [
      req.params.smId,
      req.params.id,
    ])
    if (deleted.rowCount === 0) {
      res.status(404).json({ message: "Shipping method not found" })
      return
    }
    await recomputeDraftTotals(req.params.id)
    res.json({
      draft_order: await buildDraftOrder(req.params.id),
      id: req.params.smId,
      object: "shipping-method",
      deleted: true,
    })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/convert-to-order", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    if (await activeDraftEdit(req.params.id)) {
      await confirmDraftEdit(req.params.id)
    }
    const r = await pool.query(`UPDATE "order" SET is_draft_order=FALSE, updated_at=NOW() WHERE id=$1 AND is_draft_order=TRUE AND deleted_at IS NULL`, [
      req.params.id,
    ])
    if (r.rowCount === 0) {
      res.status(404).json({ message: "Draft order not found" })
      return
    }
    res.json({ order: await assembleOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// --- Draft-order edit lifecycle (modeled as order_change rows, change_type='edit') ---

draftCompatRouter.post("/admin/draft-orders/:id/edit", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { description } = z.object({ description: z.string().optional() }).parse(req.body ?? {})
    const edit = await ensureDraftEdit(req.params.id)
    if (description !== undefined) {
      await pool.query(`UPDATE order_change SET description=$2 WHERE id=$1`, [edit.id, description])
    }
    const preview = await buildDraftPreview(req.params.id)
    res.json({ draft_order: preview, order_preview: preview })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/edit/request", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { no_notification } = z.object({ no_notification: z.boolean().optional() }).parse(req.body ?? {})
    void no_notification
    const edit = await ensureDraftEdit(req.params.id)
    await pool.query(`UPDATE order_change SET status='requested', requested_at=NOW() WHERE id=$1`, [edit.id])
    const preview = await buildDraftPreview(req.params.id)
    res.json({ draft_order: preview, order_preview: preview })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/edit/confirm", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    await confirmDraftEdit(req.params.id)
    const final = await buildDraftOrder(req.params.id)
    res.json({ draft_order: final, order_preview: final })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.delete("/admin/draft-orders/:id/edit", requireAuth, async (req, res, next) => {
  try {
    const edit = await activeDraftEdit(req.params.id)
    if (!edit) {
      res.status(404).json({ message: "Draft edit not found" })
      return
    }
    await pool.query(`UPDATE order_change SET status='canceled', canceled_at=NOW() WHERE id=$1`, [edit.id])
    res.json({ id: edit.id, object: "draft-order-edit", deleted: true })
  } catch (e) {
    next(e)
  }
})

// --- Edit: items ---

draftCompatRouter.post("/admin/draft-orders/:id/edit/items", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const parsed = z
      .object({ items: z.array(draftItemSchema).min(1).optional(), variant_id: z.string().optional(), quantity: z.number().int().positive().optional(), unit_price: z.number().int().nonnegative().nullish() })
      .parse(req.body ?? {})
    const items = parsed.items ?? (parsed.variant_id && parsed.quantity ? [{ variant_id: parsed.variant_id, title: "", quantity: parsed.quantity, unit_price: parsed.unit_price }] : [])
    const validItems = items.filter((i) => i.variant_id || i.title)
    if (validItems.length === 0) {
      throw Object.assign(new Error("items or variant_id+quantity is required"), { statusCode: 400 })
    }
    const edit = await ensureDraftEdit(req.params.id)
    for (const it of validItems) {
      const price = it.variant_id ? await resolveUnitPrice(it.variant_id, draft.currency_code, it.unit_price) : Number(it.unit_price ?? 0)
      const t = it.variant_id ? await variantTitle(it.variant_id) : { title: it.title, productId: null }
      await pool.query(
        `INSERT INTO order_change_action (order_change_id, action, variant_id, title, quantity, unit_price) VALUES ($1,'add_item',$2,$3,$4,$5)`,
        [edit.id, it.variant_id ?? null, t.title, it.quantity, price]
      )
    }
    const preview = await buildDraftPreview(req.params.id)
    res.json({ draft_order: preview, order_preview: preview })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/edit/items/:actionId", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { quantity, unit_price } = z
      .object({ quantity: z.number().int().positive().optional(), unit_price: z.number().int().nonnegative().nullish() })
      .parse(req.body ?? {})
    const edit = await activeDraftEdit(req.params.id)
    if (!edit) {
      res.status(404).json({ message: "Draft edit not found" })
      return
    }
    const existing = await pool.query(`SELECT * FROM order_change_action WHERE id=$1 AND order_change_id=$2`, [req.params.actionId, edit.id])
    if (!existing.rows[0]) {
      res.status(404).json({ message: "Edit action not found" })
      return
    }
    await pool.query(`UPDATE order_change_action SET quantity=COALESCE($3,quantity), unit_price=COALESCE($4,unit_price) WHERE id=$1 AND order_change_id=$2`, [
      req.params.actionId,
      edit.id,
      quantity ?? null,
      unit_price ?? null,
    ])
    const preview = await buildDraftPreview(req.params.id)
    res.json({ draft_order: preview, order_preview: preview })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.delete("/admin/draft-orders/:id/edit/items/:actionId", requireAuth, async (req, res, next) => {
  try {
    const edit = await activeDraftEdit(req.params.id)
    if (!edit) {
      res.status(404).json({ message: "Draft edit not found" })
      return
    }
    const r = await pool.query(`DELETE FROM order_change_action WHERE id=$1 AND order_change_id=$2`, [req.params.actionId, edit.id])
    if (r.rowCount === 0) {
      res.status(404).json({ message: "Edit action not found" })
      return
    }
    const preview = await buildDraftPreview(req.params.id)
    res.json({ draft_order: preview, order_preview: preview })
  } catch (e) {
    next(e)
  }
})

draftCompatRouter.post("/admin/draft-orders/:id/edit/items/item/:itemId", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { quantity, unit_price } = z
      .object({ quantity: z.number().int().nonnegative(), unit_price: z.number().int().nonnegative().nullish() })
      .parse(req.body ?? {})
    const line = await pool.query(`SELECT id FROM order_line_item WHERE id=$1 AND order_id=$2`, [req.params.itemId, req.params.id])
    if (!line.rows[0]) {
      res.status(404).json({ message: "Order line item not found" })
      return
    }
    const edit = await ensureDraftEdit(req.params.id)
    if (quantity === 0) {
      await pool.query(`INSERT INTO order_change_action (order_change_id, action, line_item_id) VALUES ($1,'remove_item',$2)`, [edit.id, req.params.itemId])
    } else {
      await pool.query(
        `INSERT INTO order_change_action (order_change_id, action, line_item_id, quantity, unit_price) VALUES ($1,'update_qty',$2,$3,$4)`,
        [edit.id, req.params.itemId, quantity, unit_price ?? null]
      )
    }
    const preview = await buildDraftPreview(req.params.id)
    res.json({ draft_order: preview, order_preview: preview })
  } catch (e) {
    next(e)
  }
})

// --- Edit: shipping methods ---

draftCompatRouter.post("/admin/draft-orders/:id/edit/shipping-methods", requireAuth, async (req, res, next) => {
  try {
    const draft = await requireDraft(req.params.id, res)
    if (!draft) {
      return
    }
    const { shipping_option_id, option_id, name, amount } = z
      .object({
        shipping_option_id: z.string().optional(),
        option_id: z.string().optional(),
        name: z.string().optional(),
        amount: z.number().int().nonnegative().optional(),
      })
      .parse(req.body ?? {})
    const optionId = shipping_option_id ?? option_id ?? null
    let methodName = name ?? null
    let methodAmount = amount ?? null
