import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"

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

describe("draft shipping methods + draft metadata", () => {
  const email = `draftship-${T}@example.com`
  const promoCode = `DSHIP-${T}`.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20)
  let token = ""
  let optionId = ""
  let optionName = ""
  let draftId = ""
  let otherDraftId = ""

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "draftship-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }
    await pool.query(
      `INSERT INTO promotion (code, application_type, application_target, application_allocation, application_value) VALUES ($1,'percentage','order','across',10) ON CONFLICT (code) DO UPDATE SET status='active'`,
      [promoCode]
    )
    optionName = `Draft Std ${T}`
    const opt = await api("POST", "/admin/shipping-options", { name: optionName, amount: 250, currency_code: "usd", country_code: "us" }, token)
    assert.equal(opt.status, 201)
    optionId = opt.json.shipping_option.id
    const created = await api(
      "POST",
      "/admin/draft-orders",
      {
        email: `draftship-c-${T}@example.com`,
        currency_code: "usd",
        shipping_address: { first_name: "Ada", last_name: "Lovelace", address_1: "12 Main St", city: "Springfield", country_code: "us", postal_code: "12345" },
        items: [{ title: "Draft Widget", quantity: 2, unit_price: 1000 }],
      },
      token
    )
    assert.equal(created.status, 201)
    draftId = created.json.draft_order.id
    const other = await api(
      "POST",
      "/admin/draft-orders",
      { email: `draftship-o-${T}@example.com`, currency_code: "usd", items: [{ title: "Other Widget", quantity: 1, unit_price: 500 }] },
      token
    )
    assert.equal(other.status, 201)
    otherDraftId = other.json.draft_order.id
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("lists order shipping options and persists a shipping method on the draft", async () => {
    const opts = await api("GET", `/admin/draft-orders/${draftId}/shipping-options`, undefined, token)
    assert.equal(opts.status, 200)
    assert.ok(opts.json.shipping_options.some((o: any) => o.id === optionId))
    assert.equal(Number(opts.json.shipping_options.find((o: any) => o.id === optionId).amount), 250)
    const add = await api("POST", `/admin/draft-orders/${draftId}/shipping-methods`, { shipping_option_id: optionId, data: { note: "ground" } }, token)
    assert.equal(add.status, 200)
    const d = add.json.draft_order
    assert.equal(d.shipping_methods.length, 1)
    assert.deepEqual(Object.keys(d.shipping_methods[0]).sort(), ["amount", "created_at", "data", "id", "name", "order_id", "shipping_option_id"])
    assert.equal(d.shipping_methods[0].shipping_option_id, optionId)
    assert.equal(d.shipping_methods[0].order_id, draftId)
    assert.equal(d.shipping_methods[0].name, optionName)
    assert.equal(d.shipping_methods[0].amount, 250)
    assert.deepEqual(d.shipping_methods[0].data, { note: "ground" })
    assert.equal(add.json.shipping_method.id, d.shipping_methods[0].id)
    assert.equal(d.summary.subtotal, 2000)
    assert.equal(d.summary.shipping_total, 250)
    assert.equal(d.summary.total, 2250)
    const pc = await pool.query(`SELECT amount FROM payment_collection WHERE id=(SELECT payment_collection_id FROM "order" WHERE id=$1)`, [draftId])
    assert.equal(Number(pc.rows[0].amount), 2250)
    const del = await api("DELETE", `/admin/draft-orders/${draftId}/shipping-methods/${add.json.shipping_method.id}`, undefined, token)
    assert.equal(del.status, 200)
  })

  it("updates and deletes the shipping method and totals follow", async () => {
    const add = await api("POST", `/admin/draft-orders/${draftId}/shipping-methods`, { shipping_option_id: optionId }, token)
    assert.equal(add.status, 200)
    const smId = add.json.shipping_method.id
    const upd = await api("POST", `/admin/draft-orders/${draftId}/shipping-methods/${smId}`, { amount: 400 }, token)
    assert.equal(upd.status, 200)
    assert.equal(upd.json.shipping_method.id, smId)
    assert.equal(upd.json.shipping_method.amount, 400)
    assert.equal(upd.json.draft_order.summary.shipping_total, 400)
    assert.equal(upd.json.draft_order.summary.total, 2400)
    const pc = await pool.query(`SELECT amount FROM payment_collection WHERE id=(SELECT payment_collection_id FROM "order" WHERE id=$1)`, [draftId])
    assert.equal(Number(pc.rows[0].amount), 2400)
    const del = await api("DELETE", `/admin/draft-orders/${draftId}/shipping-methods/${smId}`, undefined, token)
    assert.equal(del.status, 200)
    assert.equal(del.json.object, "shipping-method")
    assert.equal(del.json.deleted, true)
    assert.equal(del.json.id, smId)
    assert.equal(del.json.draft_order.shipping_methods.length, 0)
    assert.equal(del.json.draft_order.summary.shipping_total, 0)
    assert.equal(del.json.draft_order.summary.total, 2000)
  })

  it("custom_amount overrides the option amount", async () => {
    const add = await api("POST", `/admin/draft-orders/${draftId}/shipping-methods`, { shipping_option_id: optionId, custom_amount: 75 }, token)
    assert.equal(add.status, 200)
    assert.equal(add.json.shipping_method.amount, 75)
    assert.equal(add.json.shipping_method.name, optionName)
    assert.equal(add.json.draft_order.summary.shipping_total, 75)
    assert.equal(add.json.draft_order.summary.total, 2075)
    const del = await api("DELETE", `/admin/draft-orders/${draftId}/shipping-methods/${add.json.shipping_method.id}`, undefined, token)
    assert.equal(del.status, 200)
    assert.equal(del.json.draft_order.summary.shipping_total, 0)
    assert.equal(del.json.draft_order.summary.total, 2000)
  })

  it("rejects an unknown shipping option and a method owned by another order", async () => {
    const missing = await api("POST", `/admin/draft-orders/${draftId}/shipping-methods`, { shipping_option_id: `so_missing_${T}` }, token)
    assert.equal(missing.status, 404)
    const add = await api("POST", `/admin/draft-orders/${draftId}/shipping-methods`, { shipping_option_id: optionId }, token)
    assert.equal(add.status, 200)
    const smId = add.json.shipping_method.id
    const foreignUpdate = await api("POST", `/admin/draft-orders/${otherDraftId}/shipping-methods/${smId}`, { amount: 10 }, token)
    assert.equal(foreignUpdate.status, 404)
    const foreignDelete = await api("DELETE", `/admin/draft-orders/${otherDraftId}/shipping-methods/${smId}`, undefined, token)
    assert.equal(foreignDelete.status, 404)
    assert.equal(foreignDelete.json.draft_order, undefined)
    const still = await api("GET", `/admin/draft-orders/${draftId}`, undefined, token)
    assert.equal(still.json.draft_order.shipping_methods.length, 1)
    assert.equal(still.json.draft_order.shipping_methods[0].amount, 250)
    const del = await api("DELETE", `/admin/draft-orders/${draftId}/shipping-methods/${smId}`, undefined, token)
    assert.equal(del.status, 200)
  })

  it("exposes the shipping methods on the admin order read after conversion", async () => {
    const created = await api("POST", "/admin/draft-orders", { email: `draftship-v-${T}@example.com`, currency_code: "usd", items: [{ title: "Convert Widget", quantity: 1, unit_price: 1500 }] }, token)
    assert.equal(created.status, 201)
    const id = created.json.draft_order.id
    const add = await api("POST", `/admin/draft-orders/${id}/shipping-methods`, { shipping_option_id: optionId }, token)
    assert.equal(add.status, 200)
    const conv = await api("POST", `/admin/draft-orders/${id}/convert-to-order`, {}, token)
    assert.equal(conv.status, 200)
    const orderId = conv.json.order.id
    const got = await api("GET", `/admin/orders/${orderId}`, undefined, token)
    assert.equal(got.status, 200)
    assert.equal(got.json.order.shipping_methods.length, 1)
    assert.equal(got.json.order.shipping_methods[0].amount, 250)
    assert.equal(got.json.order.shipping_total, 250)
    assert.equal(got.json.order.total, 1750)
  })

  it("404s shipping-options for a missing id and for an order that is not a draft", async () => {
    const missing = await api("GET", `/admin/draft-orders/draft_missing_${T}/shipping-options`, undefined, token)
    assert.equal(missing.status, 404)
    const created = await api("POST", "/admin/draft-orders", { email: `draftship-n-${T}@example.com`, currency_code: "usd" }, token)
    assert.equal(created.status, 201)
    const conv = await api("POST", `/admin/draft-orders/${created.json.draft_order.id}/convert-to-order`, {}, token)
    assert.equal(conv.status, 200)
    const notDraft = await api("GET", `/admin/draft-orders/${conv.json.order.id}/shipping-options`, undefined, token)
    assert.equal(notDraft.status, 404)
  })

  it("merges metadata, deletes keys set to null and keeps promo_codes", async () => {
    const created = await api("POST", "/admin/draft-orders", { email: `meta-${T}@example.com`, currency_code: "usd", items: [{ title: "Meta Widget", quantity: 1, unit_price: 2000 }] }, token)
    assert.equal(created.status, 201)
    const id = created.json.draft_order.id
    assert.deepEqual(created.json.draft_order.metadata, {})
    const first = await api("POST", `/admin/draft-orders/${id}`, { metadata: { a: "1", b: "2" } }, token)
    assert.equal(first.status, 200)
    assert.deepEqual(first.json.draft_order.metadata, { a: "1", b: "2" })
    const second = await api("POST", `/admin/draft-orders/${id}`, { metadata: { b: null, c: "3" } }, token)
    assert.equal(second.status, 200)
    assert.deepEqual(second.json.draft_order.metadata, { a: "1", c: "3" })
    const blank = await api("POST", `/admin/draft-orders/${id}`, { metadata: { "   ": "x" } }, token)
    assert.equal(blank.status, 400)
    assert.match(blank.json.message, /whitespace/)
    const empty = await api("POST", `/admin/draft-orders/${id}`, { metadata: {} }, token)
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.json.draft_order.metadata, { a: "1", c: "3" })
    const promo = await api("POST", `/admin/draft-orders/${id}`, { promo_codes: [promoCode] }, token)
    assert.equal(promo.status, 200)
    assert.ok((promo.json.draft_order.promo_codes ?? []).includes(promoCode))
    const afterPromo = await api("POST", `/admin/draft-orders/${id}`, { metadata: { a: "9" } }, token)
    assert.equal(afterPromo.status, 200)
    assert.ok((afterPromo.json.draft_order.promo_codes ?? []).includes(promoCode))
    assert.equal(afterPromo.json.draft_order.metadata.a, "9")
    assert.deepEqual(afterPromo.json.draft_order.metadata.promo_codes, [promoCode])
    const got = await api("GET", `/admin/draft-orders/${id}`, undefined, token)
    assert.equal(got.status, 200)
    assert.equal(got.json.draft_order.metadata.a, "9")
    assert.equal(got.json.draft_order.metadata.c, "3")
  })

  it("keeps the promo discount sign stable when a shipping method is added and removed", async () => {
    const created = await api(
      "POST",
      "/admin/draft-orders",
      { email: `shipdisc-${T}@example.com`, currency_code: "usd", items: [{ title: "Disc Widget", quantity: 1, unit_price: 2000 }] },
      token
    )
    assert.equal(created.status, 201)
    const id = created.json.draft_order.id
    const promo = await api("POST", `/admin/draft-orders/${id}`, { promo_codes: [promoCode] }, token)
    assert.equal(promo.status, 200)
    const before = promo.json.draft_order.summary
    assert.equal(before.subtotal, 2000)
    assert.equal(before.discount_total, -200)
    assert.equal(before.total, 1800)
    const add = await api("POST", `/admin/draft-orders/${id}/shipping-methods`, { shipping_option_id: optionId }, token)
    assert.equal(add.status, 200)
    const after = add.json.draft_order.summary
    assert.equal(after.discount_total, before.discount_total)
    assert.equal(after.discount_total, -200)
    assert.equal(after.shipping_total, 250)
    assert.equal(after.total, before.total + 250)
    assert.equal(after.total, 2050)
    assert.equal(Number(add.json.draft_order.total), 2050)
    const pc = await pool.query(`SELECT amount FROM payment_collection WHERE id=(SELECT payment_collection_id FROM "order" WHERE id=$1)`, [id])
    assert.equal(Number(pc.rows[0].amount), 2050)
    const lines = await pool.query(`SELECT quantity, unit_price, discount_total FROM order_line_item WHERE order_id=$1`, [id])
    const lineSubtotal = lines.rows.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0)
    const lineDiscount = lines.rows.reduce((s: number, l: any) => s + Number(l.discount_total ?? 0), 0)
    assert.equal(lineSubtotal, 2000)
    assert.equal(lineDiscount, 200)
    assert.equal(after.subtotal, lineSubtotal)
    assert.equal(after.total, lineSubtotal - lineDiscount + after.shipping_total)
    const del = await api("DELETE", `/admin/draft-orders/${id}/shipping-methods/${add.json.shipping_method.id}`, undefined, token)
    assert.equal(del.status, 200)
    const restored = del.json.draft_order.summary
    assert.equal(restored.subtotal, 2000)
    assert.equal(restored.discount_total, -200)
    assert.equal(restored.shipping_total, 0)
    assert.equal(restored.total, 1800)
    const got = await api("GET", `/admin/draft-orders/${id}`, undefined, token)
    assert.equal(got.status, 200)
    assert.equal(got.json.draft_order.summary.discount_total, -200)
    assert.equal(got.json.draft_order.summary.total, 1800)
  })

  it("creates a fully custom shipping method with no shipping option", async () => {
    const created = await api(
      "POST",
      "/admin/draft-orders",
      { email: `customship-${T}@example.com`, currency_code: "usd", items: [{ title: "Cust Widget", quantity: 1, unit_price: 1000 }] },
      token
    )
    assert.equal(created.status, 201)
    const id = created.json.draft_order.id
    const add = await api(
      "POST",
      `/admin/draft-orders/${id}/shipping-methods`,
      { shipping_option_id: "", name: "  Courier  ", custom_amount: 500, data: { note: "rush" } },
      token
    )
    assert.equal(add.status, 200)
    const sm = add.json.shipping_method
    assert.equal(sm.name, "Courier")
    assert.equal(sm.amount, 500)
    assert.equal(sm.shipping_option_id, null)
    assert.equal(sm.order_id, id)
    assert.deepEqual(sm.data, { note: "rush" })
    assert.equal(add.json.draft_order.shipping_methods.length, 1)
    assert.equal(add.json.draft_order.shipping_methods[0].id, sm.id)
    assert.equal(add.json.draft_order.summary.shipping_total, 500)
    assert.equal(add.json.draft_order.summary.total, 1500)
    const row = await pool.query(`SELECT shipping_option_id, name, amount FROM order_shipping_method WHERE id=$1`, [sm.id])
    assert.equal(row.rows[0].shipping_option_id, null)
    assert.equal(row.rows[0].name, "Courier")
    assert.equal(Number(row.rows[0].amount), 500)
    const del = await api("DELETE", `/admin/draft-orders/${id}/shipping-methods/${sm.id}`, undefined, token)
    assert.equal(del.status, 200)
    assert.equal(del.json.draft_order.summary.shipping_total, 0)
    assert.equal(del.json.draft_order.summary.total, 1000)
  })

  it("accepts amount as an alias, rejects a nameless custom method and an unknown option", async () => {
    const created = await api(
      "POST",
      "/admin/draft-orders",
      { email: `customship2-${T}@example.com`, currency_code: "usd", items: [{ title: "Cust Widget 2", quantity: 1, unit_price: 1000 }] },
      token
    )
    assert.equal(created.status, 201)
    const id = created.json.draft_order.id
    const noName = await api("POST", `/admin/draft-orders/${id}/shipping-methods`, { shipping_option_id: "", name: "   ", custom_amount: 100 }, token)
    assert.equal(noName.status, 400)
    assert.match(noName.json.message, /name/)
    const missingName = await api("POST", `/admin/draft-orders/${id}/shipping-methods`, { custom_amount: 100 }, token)
    assert.equal(missingName.status, 400)
    assert.match(missingName.json.message, /name/)
    const unknown = await api("POST", `/admin/draft-orders/${id}/shipping-methods`, { shipping_option_id: `so_missing_${T}`, name: "Whatever" }, token)
    assert.equal(unknown.status, 404)
    assert.equal(unknown.json.message, "Shipping option not found")
    const still = await api("GET", `/admin/draft-orders/${id}`, undefined, token)
    assert.equal(still.json.draft_order.shipping_methods.length, 0)
    const alias = await api("POST", `/admin/draft-orders/${id}/shipping-methods`, { name: "Alias", amount: 300 }, token)
    assert.equal(alias.status, 200)
    assert.equal(alias.json.shipping_method.amount, 300)
    assert.equal(alias.json.shipping_method.shipping_option_id, null)
    assert.equal(alias.json.draft_order.summary.total, 1300)
    const renamed = await api(
      "POST",
      `/admin/draft-orders/${id}/shipping-methods/${alias.json.shipping_method.id}`,
      { name: "Alias renamed", data: { x: "1" } },
      token
    )
    assert.equal(renamed.status, 200)
    assert.equal(renamed.json.shipping_method.id, alias.json.shipping_method.id)
    assert.equal(renamed.json.shipping_method.name, "Alias renamed")
    assert.equal(renamed.json.shipping_method.amount, 300)
    assert.deepEqual(renamed.json.shipping_method.data, { x: "1" })
    assert.equal(renamed.json.draft_order.summary.shipping_total, 300)
    assert.equal(renamed.json.draft_order.summary.total, 1300)
    const del = await api("DELETE", `/admin/draft-orders/${id}/shipping-methods/${alias.json.shipping_method.id}`, undefined, token)
    assert.equal(del.status, 200)
    assert.equal(del.json.draft_order.summary.total, 1000)
  })
})
