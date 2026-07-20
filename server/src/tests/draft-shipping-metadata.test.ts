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
