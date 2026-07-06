import { pool } from "../../db"

// Lupus Store API order shape on top of the order row + legacy items (additive, nothing removed).

type Row = Record<string, any>

function addressShape(row: Row | undefined): Row | null {
  if (!row) {
    return null
  }
  return {
    id: row.id,
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    company: row.company ?? "",
    address_1: row.address_1 ?? "",
    address_2: row.address_2 ?? "",
    city: row.city ?? "",
    country_code: row.country_code ?? "",
    province: row.province ?? "",
    postal_code: row.postal_code ?? "",
    phone: row.phone ?? "",
  }
}

export async function shapeStoreOrder(order: Row, items: Row[]): Promise<Row> {
  const [addresses, methods, payments, fulfillments, info] = await Promise.all([
    pool.query(`SELECT * FROM order_address WHERE order_id=$1`, [order.id]),
    pool.query(`SELECT * FROM order_shipping_method WHERE order_id=$1 ORDER BY created_at`, [order.id]),
    order.payment_collection_id
      ? pool.query(`SELECT * FROM payment WHERE payment_collection_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [order.payment_collection_id])
      : Promise.resolve({ rows: [] as Row[] }),
    pool.query(`SELECT shipped_at, delivered_at FROM fulfillment WHERE order_id=$1 AND deleted_at IS NULL AND canceled_at IS NULL`, [order.id]),
    items.length
      ? pool.query(
          `SELECT oli.id AS line_id, p.thumbnail AS product_thumbnail, v.thumbnail AS variant_thumbnail, p.handle
           FROM order_line_item oli LEFT JOIN product_variant v ON v.id = oli.variant_id LEFT JOIN product p ON p.id = COALESCE(oli.product_id, v.product_id)
           WHERE oli.order_id=$1`,
          [order.id]
        )
      : Promise.resolve({ rows: [] as Row[] }),
  ])
  const infoByLine = new Map<string, Row>(info.rows.map((r: Row) => [r.line_id, r]))
  const shapedItems = items.map((i) => {
    const meta = infoByLine.get(i.id) ?? {}
    const unit = Number(i.unit_price)
    const subtotal = unit * Number(i.quantity)
    const discount = Math.abs(Number(i.discount_total ?? 0))
    return {
      ...i,
      product_title: i.title,
      product_handle: meta.handle ?? null,
      thumbnail: meta.variant_thumbnail ?? meta.product_thumbnail ?? null,
      compare_at_unit_price: null,
      subtotal,
      original_total: subtotal,
      total: Math.max(subtotal - discount, 0),
      tax_total: 0,
      variant: i.variant_id ? { id: i.variant_id, sku: i.variant_sku ?? null, title: i.variant_title ?? null } : null,
    }
  })
  const fulfilled = fulfillments.rows
  const fulfillmentStatus = fulfilled.length === 0 ? "not_fulfilled" : fulfilled.every((f: Row) => f.delivered_at) ? "delivered" : fulfilled.some((f: Row) => f.shipped_at) ? "shipped" : "fulfilled"
  const shapedMethods = methods.rows.map((m: Row) => ({
    id: m.id,
    order_id: m.order_id,
    name: m.name,
    amount: Number(m.amount),
    subtotal: Number(m.amount),
    total: Number(m.amount),
    shipping_option_id: m.shipping_option_id ?? null,
    data: m.data ?? {},
  }))
  return {
    ...order,
    items: shapedItems,
    shipping_address: addressShape(addresses.rows.find((a: Row) => a.kind === "shipping")),
    billing_address: addressShape(addresses.rows.find((a: Row) => a.kind === "billing")),
    shipping_methods: shapedMethods,
    payment_collections: order.payment_collection_id
      ? [{ id: order.payment_collection_id, status: order.payment_status ?? null, currency_code: order.currency_code, amount: Number(order.total), payments: payments.rows }]
      : [],
    fulfillment_status: fulfillmentStatus,
    item_subtotal: shapedItems.reduce((s, i) => s + i.subtotal, 0),
    item_total: shapedItems.reduce((s, i) => s + i.total, 0),
    // order.discount_total stays the legacy negative adjustment sum; discount_subtotal is its magnitude
    discount_subtotal: Math.abs(Number(order.discount_total ?? 0)),
    shipping_subtotal: shapedMethods.reduce((s, m) => s + m.amount, 0),
    gift_card_total: 0,
  }
}
