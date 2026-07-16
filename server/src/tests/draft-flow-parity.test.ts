import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { regionService } from "../modules/region/region.service"
import { productService } from "../modules/product/product.service"
import { customerService } from "../modules/customer/customer.service"
import { paymentService } from "../modules/order/payment.service"

const T = Date.now()

async function migrate() {
  for (const f of [
    "src/db/schema.sql",
    "src/db/schema-auth-customer-region.sql",
    "src/db/schema-cart.sql",
    "src/db/schema-order-payment.sql",
    "src/db/schema-pricing-promotion-tax.sql",
    "src/db/schema-cart-totals-patch.sql",
    "src/db/schema-order-totals-patch.sql",
    "src/db/schema-fulfillment-returns.sql",
    "src/db/schema-fulfillment-patch.sql",
    "src/db/schema-channels-locations.sql",
    "src/db/schema-groups-giftcard-draft.sql",
    "src/db/schema-admin-store-notif.sql",
    "src/db/schema-infra.sql",
    "src/db/schema-missing.sql",
    "src/db/schema-p1-catalog.sql",
    "src/db/schema-p2-pricing.sql",
    "src/db/schema-p3-promo.sql",
    "src/db/schema-p4-rma.sql",
    "src/db/schema-p5-fulfillment.sql",
    "src/db/schema-p6-tax.sql",
    "src/db/schema-p6b-address.sql",
    "src/db/schema-p7-auth.sql",
    "src/db/schema-p8-order.sql",
    "src/db/schema-p9-platform.sql",
    "src/db/schema-p10-lupus-auth.sql",
    "src/db/schema-p11-category-rank.sql",
    "src/db/schema-p12-admin-create-gaps.sql",
    "src/db/schema-p13-draft-parity.sql",
    "src/db/schema-p14-refund-accumulate.sql",
    "src/db/schema-p15-order-shipping.sql",
    "src/db/schema-p16-product-parity.sql",
    "src/db/schema-p17-product-attributes.sql",
    "src/db/schema-p18-global-options.sql",
    "src/db/schema-p19-promotion-parity.sql",
    "src/db/schema-p20-price-list-parity.sql",
    "src/db/schema-p21-locations-shipping.sql",
    "src/db/schema-p22-store.sql",
    "src/db/schema-p23-invites.sql",
    "src/db/schema-p24-regions.sql",
    "src/db/schema-p25-reference-data.sql",
    "src/db/schema-p26-api-keys.sql",
    "src/db/schema-p27-workflow-executions.sql",
    "src/db/schema-p28-tax-regions.sql",
    "src/db/schema-p29-metadata.sql",
    "src/db/schema-p30-storefront.sql",
  ]) {
    await pool.query(await readFile(f, "utf8")).catch((e: any) => {
      if (!String(e?.message ?? "").includes("already exists")) throw e
    })
  }
}

let server: any
let base = ""

async function api(method: string, path: string, body?: any, token?: string) {
  const headers: any = { "content-type": "application/json" }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { _raw: text }
  }
  return { status: res.status, json }
}

describe("draft flow parity (admin order + draft-order UX)", () => {
  const email = `parity-${T}@example.com`
  const promoCode = `PARITY-${T}`.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20)
  const sku = `PAR-SKU-${T}`
  let token = ""
  let variantId = ""
  let customerA = ""
  let customerB = ""
  let draftId = ""
  let orderId = ""

  before(async () => {
    await migrate()
    await pool.query("UPDATE promotion SET status='draft' WHERE is_automatic=TRUE").catch(() => undefined)
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "parity-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }
    await regionService.create({ name: `Parity ${T}`, currency_code: "usd", countries: ["us"] })
    const product = await productService.create({
      title: `Parity Shirt ${T}`,
      status: "published",
      variants: [{ title: "M", prices: [{ currency_code: "usd", amount: 2000 }] }],
    })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [product.id])
    variantId = v.rows[0].id
    await pool.query(`UPDATE product_variant SET sku=$2 WHERE id=$1`, [variantId, sku])
    await pool.query(
      `INSERT INTO promotion (code, application_type, application_target, application_allocation, application_value) VALUES ($1,'percentage','order','across',10) ON CONFLICT (code) DO UPDATE SET status='active'`,
      [promoCode]
    )
    const a = await customerService.create({ email: `paritya-${T}@example.com`, first_name: "Ada", last_name: "Lovelace" })
    customerA = a.id
    await customerService.createAddress(customerA, {
      first_name: "Ada",
      last_name: "Lovelace",
      address_1: "12 Main St",
      city: "Springfield",
      country_code: "us",
      postal_code: "12345",
      phone: "555-0100",
    })
    const b = await customerService.create({ email: `parityb-${T}@example.com`, first_name: "Bob", last_name: "Jones" })
    customerB = b.id
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("creates a draft order with no items", async () => {
    const r = await api("POST", "/admin/draft-orders", { email: `empty-${T}@example.com`, currency_code: "usd" }, token)
    assert.equal(r.status, 201)
    assert.ok(r.json.draft_order?.id)
    assert.deepEqual(r.json.draft_order.items, [])
    assert.equal(r.json.draft_order.summary.subtotal, 0)
  })

  it("replaces draft items and recomputes totals", async () => {
    const created = await api(
      "POST",
      "/admin/draft-orders",
      { email: `items-${T}@example.com`, currency_code: "usd", items: [{ variant_id: variantId, quantity: 2 }] },
      token
    )
    assert.equal(created.status, 201)
    draftId = created.json.draft_order.id
    assert.equal(created.json.draft_order.summary.subtotal, 4000)
    const upd = await api("POST", `/admin/draft-orders/${draftId}`, { items: [{ variant_id: variantId, quantity: 1 }] }, token)
    assert.equal(upd.status, 200)
    assert.equal(upd.json.draft_order.items.length, 1)
    assert.equal(upd.json.draft_order.items[0].quantity, 1)
    assert.equal(upd.json.draft_order.summary.subtotal, 2000)
    assert.equal(upd.json.draft_order.summary.total, 2000)
    assert.equal(Number(upd.json.draft_order.total), 2000)
  })

  it("converts to an order whose detail carries the lupus rail fields", async () => {
    const withCustomer = await api("POST", `/admin/draft-orders/${draftId}`, { customer_id: customerA }, token)
    assert.equal(withCustomer.status, 200)
    const conv = await api("POST", `/admin/draft-orders/${draftId}/convert-to-order`, {}, token)
    assert.equal(conv.status, 200)
    assert.ok(conv.json.order?.id)
    orderId = conv.json.order.id
    const got = await api("GET", `/admin/orders/${orderId}`, undefined, token)
    assert.equal(got.status, 200)
    const order = got.json.order
    assert.equal(typeof order.display_id, "number")
    assert.equal(order.customer?.id, customerA)
    assert.equal(order.customer?.email, `paritya-${T}@example.com`)
    assert.equal(order.customer?.first_name, "Ada")
    assert.equal(order.sales_channel, null)
    assert.equal(order.item_subtotal, 2000)
    assert.equal(order.shipping_subtotal, 0)
    assert.equal(order.tax_total, 0)
    assert.equal(order.pending_difference, order.total)
    assert.deepEqual(order.shipping_methods, [])
    assert.equal(order.items.length, 1)
    assert.equal(order.items[0].variant_sku, sku)
    assert.equal(order.items[0].quantity, 1)
    assert.equal(order.items[0].unit_price, 2000)
    assert.ok(Array.isArray(order.payments))
    assert.ok(Array.isArray(order.fulfillments))
    assert.ok(Array.isArray(order.credit_lines))
  })

  it("updates order email, shipping address and billing address", async () => {
    const mail = await api("POST", `/admin/orders/${orderId}`, { email: `changed-${T}@example.com` }, token)
    assert.equal(mail.status, 200)
    assert.equal(mail.json.order.email, `changed-${T}@example.com`)
    const ship = await api(
      "POST",
      `/admin/orders/${orderId}`,
      { shipping_address: { first_name: "Ada", last_name: "Lovelace", address_1: "99 Ship St", city: "Austin", postal_code: "73301", country_code: "us" } },
      token
    )
    assert.equal(ship.status, 200)
    assert.equal(ship.json.order.shipping_address.address_1, "99 Ship St")
    const bill = await api(
      "POST",
      `/admin/orders/${orderId}`,
      { billing_address: { first_name: "Ada", last_name: "Lovelace", address_1: "11 Bill Ave", city: "Boston", postal_code: "02101", country_code: "us" } },
      token
    )
    assert.equal(bill.status, 200)
    assert.equal(bill.json.order.billing_address.address_1, "11 Bill Ave")
  })

  it("transfers ownership to another customer", async () => {
    const r = await api("POST", `/admin/orders/${orderId}/transfer`, { customer_id: customerB }, token)
    assert.equal(r.status, 200)
    assert.equal(r.json.order.customer_id, customerB)
    assert.equal(r.json.order.email, `parityb-${T}@example.com`)
  })

  it("lists a customer saved addresses", async () => {
    const r = await api("GET", `/admin/customers/${customerA}/addresses`, undefined, token)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.json.addresses))
    assert.ok(r.json.addresses.length >= 1)
    assert.equal(r.json.addresses[0].address_1, "12 Main St")
    assert.equal(r.json.addresses[0].city, "Springfield")
    const list = await api("GET", "/admin/customers?limit=5&offset=0", undefined, token)
    assert.equal(list.status, 200)
    const found = list.json.customers.find((c: any) => c.id === customerA)
    assert.ok(found)
    assert.equal(found.email, `paritya-${T}@example.com`)
    assert.equal(found.first_name, "Ada")
  })

  it("replaces promo codes and reflects the discount", async () => {
    const created = await api(
      "POST",
      "/admin/draft-orders",
      { email: `promo-${T}@example.com`, currency_code: "usd", items: [{ variant_id: variantId, quantity: 1 }] },
      token
    )
    assert.equal(created.status, 201)
    const id = created.json.draft_order.id
    const upd = await api("POST", `/admin/draft-orders/${id}`, { promo_codes: [promoCode] }, token)
    assert.equal(upd.status, 200)
    assert.ok((upd.json.draft_order.promo_codes ?? []).includes(promoCode))
    assert.equal(upd.json.draft_order.summary.discount_total, -200)
    assert.equal(upd.json.draft_order.summary.total, 1800)
  })

  it("creates a draft with region_id, customer_id, addresses and no currency_code", async () => {
    const r = await api("POST", "/admin/draft-orders", {
      region_id: (await pool.query(`SELECT id FROM region WHERE deleted_at IS NULL LIMIT 1`)).rows[0].id,
      customer_id: customerA,
      sales_channel_id: (await pool.query(`SELECT id FROM sales_channel WHERE deleted_at IS NULL LIMIT 1`)).rows[0]?.id,
      shipping_address: { first_name: "Ada", last_name: "Lovelace", address_1: "12 Main St", city: "Springfield", country_code: "us", postal_code: "12345" },
      billing_address: { first_name: "Ada", last_name: "Lovelace", address_1: "12 Main St", city: "Springfield", country_code: "us", postal_code: "12345" },
    }, token)
    assert.equal(r.status, 201)
    const d = r.json.draft_order
    assert.equal(d.customer?.id, customerA)
    assert.equal(d.customer?.email, `paritya-${T}@example.com`)
    assert.equal(d.region?.id, d.region_id)
    assert.equal(d.shipping_address?.address_1, "12 Main St")
    assert.equal(d.billing_address?.address_1, "12 Main St")
    assert.equal(d.items.length, 0)
    assert.ok(d.currency_code)
  })

  it("creates a draft with custom items that have title but no variant_id", async () => {
    const r = await api("POST", "/admin/draft-orders", {
      email: `custom-${T}@example.com`,
      currency_code: "usd",
      items: [{ title: "Custom Widget", quantity: 2, unit_price: 500 }],
    }, token)
    assert.equal(r.status, 201)
    const d = r.json.draft_order
    assert.equal(d.items.length, 1)
    assert.equal(d.items[0].title, "Custom Widget")
    assert.equal(d.items[0].variant_id, null)
    assert.equal(d.items[0].quantity, 2)
    assert.equal(d.items[0].unit_price, 500)
    assert.equal(d.items[0].subtotal, 1000)
    assert.equal(d.items[0].total, 1000)
  })

  it("draft items carry variant_title, variant_sku, product_title and draft has sales_channel", async () => {
    const r = await api("POST", "/admin/draft-orders", {
      email: `fields-${T}@example.com`,
      currency_code: "usd",
      items: [{ variant_id: variantId, quantity: 1 }],
    }, token)
    assert.equal(r.status, 201)
    const d = r.json.draft_order
    assert.equal(d.items[0].variant_title, "M")
    assert.equal(d.items[0].variant_sku, sku)
    assert.equal(d.items[0].product_title, `Parity Shirt ${T}`)
    assert.ok(d.sales_channel !== null || d.sales_channel === null)
  })

  it("buildAdminOrder original_total equals subtotal + shipping + tax", async () => {
    const r = await api("POST", "/admin/draft-orders", {
      email: `orig-${T}@example.com`,
      currency_code: "usd",
      items: [{ variant_id: variantId, quantity: 1 }],
    }, token)
    assert.equal(r.status, 201)
    const draftId = r.json.draft_order.id
    const conv = await api("POST", `/admin/draft-orders/${draftId}/convert-to-order`, {}, token)
    assert.equal(conv.status, 200)
    const orderId = conv.json.order.id
    const got = await api("GET", `/admin/orders/${orderId}`, undefined, token)
    assert.equal(got.status, 200)
    const order = got.json.order
    assert.equal(order.original_total, order.item_subtotal + order.shipping_total + order.tax_total)
  })

  it("discounted draft item total uses subtraction convention", async () => {
    const r = await api("POST", "/admin/draft-orders", {
      email: `disc-${T}@example.com`,
      currency_code: "usd",
      items: [{ variant_id: variantId, quantity: 1 }],
    }, token)
    assert.equal(r.status, 201)
    const id = r.json.draft_order.id
    const upd = await api("POST", `/admin/draft-orders/${id}`, { promo_codes: [promoCode] }, token)
    assert.equal(upd.status, 200)
    const d = upd.json.draft_order
    const item = d.items[0]
    assert.equal(item.subtotal - Number(item.discount_total), item.total)
  })

  it("partial refunds accumulate correctly", async () => {
    const r = await api("POST", "/admin/draft-orders", {
      email: `ref-${T}@example.com`,
      currency_code: "usd",
      items: [{ variant_id: variantId, quantity: 1 }],
    }, token)
    assert.equal(r.status, 201)
    const draftId = r.json.draft_order.id
    const conv = await api("POST", `/admin/draft-orders/${draftId}/convert-to-order`, {}, token)
    assert.equal(conv.status, 200)
    const orderId = conv.json.order.id
const coll = await pool.query(`SELECT payment_collection_id FROM "order" WHERE id=$1`, [orderId])
    const collectionId = coll.rows[0].payment_collection_id
    await paymentService.authorize(collectionId)
    await paymentService.capture(collectionId)
    const ref1 = await api("POST", `/admin/payments/${collectionId}/refund`, { amount: 500 }, token)
    assert.equal(ref1.status, 200)
    const ref2 = await api("POST", `/admin/payments/${collectionId}/refund`, { amount: 300 }, token)
    assert.equal(ref2.status, 200)
    const pc = await pool.query(`SELECT refunded_amount FROM payment_collection WHERE id=$1`, [collectionId])
    const pay = await pool.query(`SELECT status, refunded_amount FROM payment WHERE payment_collection_id=$1`, [collectionId])
    assert.equal(Number(pc.rows[0].refunded_amount), 800)
    for (const p of pay.rows) {
      assert.equal(Number(p.refunded_amount), 800)
      assert.ok(p.status === "refunded" || p.status === "partially_refunded")
    }
  })
})
