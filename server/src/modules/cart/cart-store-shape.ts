import { pool } from "../../db"

// Adds the Lupus Store API cart shape on top of the base cart row so the Next.js
// storefront contract (cart.total, cart.region, cart.shipping_address, items[].thumbnail,
// payment_collection.payment_sessions, ...) is honoured. Everything the legacy cart already
// returned (cart.totals, items[].discount_total as a negative adjustment sum) is kept as-is.
// Amounts are minor units, like the rest of the lupus API.

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

function promotionShape(p: Row): Row {
  const percentage = p.application_type === "percentage"
  return {
    id: p.id,
    code: p.code,
    is_automatic: !!p.is_automatic,
    application_method: {
      type: percentage ? "percentage" : "fixed",
      target_type: p.application_target ?? "order",
      allocation: p.application_allocation ?? null,
      value: Number(p.application_value ?? 0),
      currency_code: p.application_currency ?? null,
    },
  }
}

export async function shapeStoreCart(cart: Row, items: Row[], totals: Row): Promise<Row> {
  const [addresses, methods, region, promos, pc, variantInfo, shipAdj] = await Promise.all([
    pool.query(`SELECT * FROM cart_address WHERE cart_id=$1`, [cart.id]),
    pool.query(`SELECT * FROM cart_shipping_method WHERE cart_id=$1 ORDER BY created_at`, [cart.id]),
    cart.region_id
      ? pool.query(
          `SELECT r.*, COALESCE((SELECT json_agg(json_build_object('iso_2', rc.iso_2, 'name', rc.iso_2, 'display_name', rc.iso_2) ORDER BY rc.iso_2) FROM region_country rc WHERE rc.region_id = r.id AND rc.deleted_at IS NULL), '[]') AS countries
           FROM region r WHERE r.id=$1`,
          [cart.region_id]
        )
      : Promise.resolve({ rows: [] as Row[] }),
    pool.query(
      `SELECT p.* FROM cart_promotion cp JOIN promotion p ON p.id = cp.promotion_id WHERE cp.cart_id=$1 ORDER BY cp.created_at`,
      [cart.id]
    ),
    pool.query(`SELECT * FROM payment_collection WHERE cart_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [cart.id]),
    items.length
      ? pool.query(
          `SELECT li.id AS line_id, p.thumbnail AS product_thumbnail, v.thumbnail AS variant_thumbnail, p.handle, p.subtitle, p.description, v.id AS vid, v.sku,
                  COALESCE((SELECT json_agg(json_build_object('option_id', ov.option_id, 'value', ov.value, 'option', json_build_object('id', o.id, 'title', o.title)))
                            FROM product_variant_option_value pvov JOIN product_option_value ov ON ov.id = pvov.option_value_id JOIN product_option o ON o.id = ov.option_id
                            WHERE pvov.variant_id = v.id), '[]') AS options
           FROM cart_line_item li LEFT JOIN product_variant v ON v.id = li.variant_id LEFT JOIN product p ON p.id = COALESCE(li.product_id, v.product_id)
           WHERE li.cart_id=$1 AND li.deleted_at IS NULL`,
          [cart.id]
        )
      : Promise.resolve({ rows: [] as Row[] }),
    pool.query(`SELECT shipping_method_id, COALESCE(SUM(amount),0)::int AS amount FROM shipping_method_adjustment WHERE cart_id=$1 GROUP BY shipping_method_id`, [cart.id]),
  ])

  const infoByLine = new Map<string, Row>(variantInfo.rows.map((r: Row) => [r.line_id, r]))
  const adjByMethod = new Map<string, number>(shipAdj.rows.map((r: Row) => [r.shipping_method_id, Number(r.amount)]))

  const shapedItems = items.map((i) => {
    const info = infoByLine.get(i.id) ?? {}
    const unit = Number(i.unit_price)
    const subtotal = unit * Number(i.quantity)
    const discount = Math.abs(Number(i.discount_total ?? 0))
    const rates: number[] = (i.tax_lines ?? []).map((t: Row) => Number(t.rate))
    const taxable = Math.max(subtotal - discount, 0)
    let tax = 0
    for (const rate of rates) {
      tax += i.is_tax_inclusive ? Math.round(taxable - taxable / (1 + rate / 100)) : Math.round(taxable * (rate / 100))
    }
    const originalTax = rates.reduce((s, rate) => s + (i.is_tax_inclusive ? Math.round(subtotal - subtotal / (1 + rate / 100)) : Math.round(subtotal * (rate / 100))), 0)
    const add = i.is_tax_inclusive ? 0 : 1
    return {
      ...i,
      unit_price: unit,
      product_title: i.title,
      product_handle: info.handle ?? null,
      product_subtitle: info.subtitle ?? null,
      product_description: info.description ?? null,
      thumbnail: info.variant_thumbnail ?? info.product_thumbnail ?? null,
      requires_shipping: true,
      compare_at_unit_price: null,
      original_unit_price: unit,
      subtotal,
      original_subtotal: subtotal,
      tax_total: tax,
      original_tax_total: originalTax,
      total: taxable + tax * add,
      original_total: subtotal + originalTax * add,
      variant: i.variant_id ? { id: i.variant_id, sku: info.sku ?? i.variant_sku ?? null, title: i.variant_title ?? null, options: info.options ?? [] } : null,
    }
  })

  const shapedMethods = methods.rows.map((m: Row) => {
    const adj = adjByMethod.get(m.id) ?? 0
    const amount = Number(m.amount)
    return {
      id: m.id,
      cart_id: m.cart_id,
      name: m.name,
      amount,
      subtotal: amount,
      total: Math.max(amount + adj, 0),
      shipping_option_id: m.shipping_option_id ?? null,
      data: m.data ?? {},
    }
  })

  const shipping = addresses.rows.find((a: Row) => a.kind === "shipping")
  const billing = addresses.rows.find((a: Row) => a.kind === "billing")
  const itemSubtotal = shapedItems.reduce((s, i) => s + i.subtotal, 0)
  const itemTotal = shapedItems.reduce((s, i) => s + i.total, 0)
  const originalItemTotal = shapedItems.reduce((s, i) => s + i.original_total, 0)
  const shippingSubtotal = shapedMethods.reduce((s, m) => s + m.amount, 0)
  const shippingTotal = shapedMethods.reduce((s, m) => s + m.total, 0)
  const discountTotal = Math.abs(Number(totals.discount_total ?? 0))

  let paymentCollection: Row | null = null
  if (pc.rows[0]) {
    const sessions = await pool.query(`SELECT * FROM payment_session WHERE payment_collection_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [pc.rows[0].id])
    paymentCollection = { ...pc.rows[0], payment_sessions: sessions.rows }
  }

  return {
    ...cart,
    items: shapedItems,
    totals,
    region: region.rows[0] ?? null,
    shipping_address: addressShape(shipping),
    billing_address: addressShape(billing),
    shipping_methods: shapedMethods,
    promotions: promos.rows.map(promotionShape),
    payment_collection: paymentCollection,
    item_subtotal: itemSubtotal,
    item_total: itemTotal,
    original_item_total: originalItemTotal,
    subtotal: itemSubtotal,
    original_subtotal: itemSubtotal,
    discount_total: discountTotal,
    discount_subtotal: discountTotal,
    discount_tax_total: 0,
    shipping_subtotal: shippingSubtotal,
    shipping_total: shippingTotal,
    original_shipping_total: shippingSubtotal,
    shipping_tax_total: Number(totals.tax_total ?? 0) - shapedItems.reduce((s, i) => s + i.tax_total, 0),
    tax_total: Number(totals.tax_total ?? 0),
    gift_card_total: Number(totals.gift_card_total ?? 0),
    credit_line_total: Number(totals.credit_total ?? 0),
    total: Number(totals.total ?? 0),
    original_total: originalItemTotal + shippingSubtotal,
  }
}
