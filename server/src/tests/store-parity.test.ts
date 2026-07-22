import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"

// Lupus price-list admin parity: the create payload (rules + per-price quantity rules),
// validation, update/configuration, list columns (price override count), the products
// section and how an override actually reaches a customer's price.
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
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { _raw: text }
  }
  return { status: res.status, json }
}

let seq = 0
const label = (s: string) => `ST ${s} ${T}-${seq++}`

describe("store parity", () => {
  const email = `store-${T}@example.com`
  let token = ""
  let storeId = ""
  let regionId = ""
  let channelId = ""
  let locationId = ""

  const call = (method: string, path: string, body?: any) => api(method, path, body, token)
  const update = (body: any) => call("POST", `/admin/stores/${storeId}`, body)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "store-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    // a store of its own so the dev store is left alone
    storeId = (await pool.query(`INSERT INTO store (name) VALUES ($1) RETURNING id`, [label("store")])).rows[0].id
    regionId = (await call("POST", "/admin/regions", { name: label("region"), currency_code: "jpy", countries: [] })).json.region.id
    channelId = (await pool.query(`INSERT INTO sales_channel (name) VALUES ($1) RETURNING id`, [label("channel")])).rows[0].id
    locationId = (await call("POST", "/admin/stock-locations", { name: label("loc") })).json.stock_location.id
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("a store starts with USD as its default currency and returns the currency details", async () => {
    const res = await call("GET", `/admin/stores/${storeId}`)
    assert.equal(res.status, 200)
    const cur = res.json.store.supported_currencies
    assert.equal(cur.length, 1)
    assert.equal(cur[0].currency_code, "usd")
    assert.equal(cur[0].is_default, true)
    assert.equal(cur[0].is_tax_inclusive, false)
    assert.equal(cur[0].currency.name, "US Dollar")
    assert.ok((await call("GET", "/admin/store")).json.store.supported_currencies.length >= 1)
    assert.equal((await call("GET", "/admin/stores/store_missing")).status, 404)
  })

  it("edits the store and keeps exactly one default currency", async () => {
    assert.equal((await update({ name: "  " })).status, 400)
    const renamed = await update({ name: "Renamed store" })
    assert.equal(renamed.json.store.name, "Renamed store")

    const added = await update({
      supported_currencies: [
        { currency_code: "usd", is_default: true },
        { currency_code: "eur", is_default: false },
      ],
    })
    assert.equal(added.status, 200)
    assert.deepEqual(added.json.store.supported_currencies.map((c: any) => c.currency_code), ["usd", "eur"])

    assert.equal((await update({ supported_currencies: [{ currency_code: "usd" }, { currency_code: "eur" }] })).status, 400, "needs a default")
    assert.equal((await update({ supported_currencies: [{ currency_code: "usd", is_default: true }, { currency_code: "eur", is_default: true }] })).status, 400, "only one default")
    assert.equal((await update({ supported_currencies: [{ currency_code: "usd", is_default: true }, { currency_code: "usd" }] })).status, 400, "no duplicates")
    assert.equal((await update({ supported_currencies: [{ currency_code: "zzz", is_default: true }] })).status, 400, "unknown currency")
    assert.equal((await update({ supported_currencies: [] })).status, 400)

    const switched = await update({ supported_currencies: [{ currency_code: "usd" }, { currency_code: "eur", is_default: true }] })
    const def = switched.json.store.supported_currencies.find((c: any) => c.is_default)
    assert.equal(def.currency_code, "eur", "the default moved")
    assert.equal(switched.json.store.supported_currencies[0].currency_code, "eur", "the default is listed first")
  })

  it("stores tax inclusive pricing per currency as a price preference", async () => {
    const on = await update({ supported_currencies: [{ currency_code: "usd", is_default: true, is_tax_inclusive: true }, { currency_code: "eur" }] })
    const byCode = (r: any, code: string) => r.json.store.supported_currencies.find((c: any) => c.currency_code === code)
    assert.equal(byCode(on, "usd").is_tax_inclusive, true)
    assert.equal(byCode(on, "eur").is_tax_inclusive, false)
    const prefs = await call("GET", "/admin/price-preferences?attribute=currency_code")
    assert.ok(prefs.json.price_preferences.some((p: any) => p.value === "usd" && p.is_tax_inclusive))
    const off = await update({ supported_currencies: [{ currency_code: "usd", is_default: true, is_tax_inclusive: false }, { currency_code: "eur" }] })
    assert.equal(byCode(off, "usd").is_tax_inclusive, false)
  })

  it("will not drop a currency a region still uses, and checks the defaults", async () => {
    const three = await update({ supported_currencies: [{ currency_code: "usd", is_default: true }, { currency_code: "eur" }, { currency_code: "jpy" }] })
    assert.equal(three.status, 200)
    const drop = await update({ supported_currencies: [{ currency_code: "usd", is_default: true }, { currency_code: "eur" }] })
    assert.equal(drop.status, 400, "a region uses JPY")
    assert.match(drop.json.message, /is used by the region/)

    const ok = await update({ default_region_id: regionId, default_sales_channel_id: channelId, default_location_id: locationId })
    assert.equal(ok.status, 200)
    assert.equal(ok.json.store.default_region_id, regionId)
    assert.equal(ok.json.store.default_sales_channel_id, channelId)
    assert.equal(ok.json.store.default_location_id, locationId)

    assert.equal((await update({ default_region_id: "reg_missing" })).status, 404)
    assert.equal((await update({ default_sales_channel_id: "sc_missing" })).status, 404)
    assert.equal((await update({ default_location_id: "sloc_missing" })).status, 404)
    await update({ supported_currencies: [{ currency_code: "usd", is_default: true }, { currency_code: "eur" }] }).then((r) => assert.equal(r.status, 400, "JPY is in use by the region"))
    const cleared = await update({ default_region_id: null, default_location_id: null })
    assert.equal(cleared.json.store.default_region_id, null)
    assert.equal(cleared.json.store.default_location_id, null)
  })

  it("lists many currencies to add from and keeps metadata", async () => {
    const list = await call("GET", "/admin/currencies?limit=100")
    assert.ok(list.json.count >= 30)
    const meta = await update({ metadata: { a: "b" } })
    assert.deepEqual(meta.json.store.metadata, { a: "b" })
  })
})
