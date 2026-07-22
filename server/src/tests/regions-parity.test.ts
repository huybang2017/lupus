import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { COUNTRY_CODES } from "../modules/region/region-admin.service"

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
const label = (s: string) => `RG ${s} ${T}-${seq++}`

describe("regions parity", () => {
  const email = `regions-${T}@example.com`
  let token = ""
  let free: string[] = []
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "regions-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    // countries nobody uses yet: a country belongs to one region
    free = (
      await pool.query(`SELECT c FROM unnest($1::text[]) c WHERE c NOT IN (SELECT iso_2 FROM region_country WHERE deleted_at IS NULL) ORDER BY random() LIMIT 6`, [COUNTRY_CODES])
    ).rows.map((r: any) => r.c as string)
    assert.ok(free.length >= 6)
  })

  after(async () => {
    const mine = await pool.query(`SELECT id FROM region WHERE name LIKE $1 OR (name = 'Renamed' AND created_at >= to_timestamp($2 / 1000.0))`, [`RG %${T}-%`, T])
    const ids = mine.rows.map((r: any) => r.id)
    if (ids.length) {
      await pool.query(`UPDATE region_country SET deleted_at = NOW() WHERE region_id = ANY($1) AND deleted_at IS NULL`, [ids])
      await pool.query(`UPDATE region SET deleted_at = NOW() WHERE id = ANY($1) AND deleted_at IS NULL`, [ids])
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("creates a region with countries, payment providers and tax inclusive pricing", async () => {
    const res = await call("POST", "/admin/regions", {
      name: label("Nordic"),
      currency_code: "EUR",
      automatic_taxes: false,
      is_tax_inclusive: true,
      countries: [free[0], free[1]],
      payment_providers: ["manual"],
    })
    assert.equal(res.status, 201)
    const r = res.json.region
    assert.equal(r.currency_code, "eur")
    assert.equal(r.automatic_taxes, false)
    assert.equal(r.is_tax_inclusive, true)
    assert.deepEqual(r.countries.map((c: any) => c.iso_2).sort(), [free[0], free[1]].sort())
    assert.ok(r.countries[0].display_name.length > 2, "countries come with their names")
    assert.deepEqual(r.payment_providers, [{ id: "manual", is_enabled: true }])
    const prefs = await call("GET", "/admin/price-preferences?attribute=region_id")
    assert.ok(prefs.json.price_preferences.some((p: any) => p.value === r.id && p.is_tax_inclusive))

    const list = await call("GET", `/admin/regions?id=${r.id}`)
    assert.equal(list.json.regions[0].payment_providers.length, 1)
    assert.equal(list.json.regions[0].is_tax_inclusive, true)
  })

  it("rejects what Lupus rejects", async () => {
    const make = (extra: any) => call("POST", "/admin/regions", { name: label("bad"), currency_code: "usd", ...extra })
    assert.equal((await make({ name: " " })).status, 400, "name is required")
    assert.equal((await make({ currency_code: "zzz" })).status, 400, "unknown currency")
    assert.equal((await make({ countries: ["xx"] })).status, 400, "unknown country")
    assert.equal((await make({ payment_providers: ["nope"] })).status, 404, "unknown provider")
    const first = await make({ countries: [free[2]], payment_providers: ["manual"] })
    assert.equal(first.status, 201)
    const clash = await make({ countries: [free[2]] })
    assert.equal(clash.status, 400, "a country belongs to one region")
    assert.match(clash.json.message, /only belong to one region/)
  })

  it("edits a region: name, currency, flags, countries and providers", async () => {
    const made = await call("POST", "/admin/regions", { name: label("edit"), currency_code: "usd", countries: [free[3]], payment_providers: ["manual"] })
    const id = made.json.region.id
    const upd = (b: any) => call("POST", `/admin/regions/${id}`, b)

    const renamed = await upd({ name: "Renamed", currency_code: "gbp", automatic_taxes: false, is_tax_inclusive: true })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.json.region.name, "Renamed")
    assert.equal(renamed.json.region.currency_code, "gbp")
    assert.equal(renamed.json.region.is_tax_inclusive, true)
    assert.equal((await upd({ name: " " })).status, 400)
    assert.equal((await upd({ currency_code: "zzz" })).status, 400)

    const more = await upd({ countries: [free[3], free[4]] })
    assert.deepEqual(more.json.region.countries.map((c: any) => c.iso_2).sort(), [free[3], free[4]].sort())
    const fewer = await upd({ countries: [free[4]] })
    assert.deepEqual(fewer.json.region.countries.map((c: any) => c.iso_2), [free[4]])
    // free[3] is available again for someone else
    assert.equal((await call("POST", "/admin/regions", { name: label("reuse"), currency_code: "usd", countries: [free[3]] })).status, 201)
    // ...while free[4] is not
    assert.equal((await call("POST", "/admin/regions", { name: label("taken"), currency_code: "usd", countries: [free[4]] })).status, 400)
    // a region keeps its own countries when it is saved again
    assert.equal((await upd({ countries: [free[4]] })).status, 200)

    const off = await upd({ payment_providers: [], is_tax_inclusive: false })
    assert.deepEqual(off.json.region.payment_providers, [])
    assert.equal(off.json.region.is_tax_inclusive, false)
  })

  it("deleting a region frees its countries and clears the store default", async () => {
    const made = await call("POST", "/admin/regions", { name: label("gone"), currency_code: "usd", countries: [free[5]] })
    const id = made.json.region.id
    const storeId = (await pool.query(`INSERT INTO store (name) VALUES ($1) RETURNING id`, [label("store")])).rows[0].id
    await pool.query(`UPDATE store SET default_region_id=$2 WHERE id=$1`, [storeId, id])
    const del = await call("DELETE", `/admin/regions/${id}`)
    assert.equal(del.status, 200)
    assert.equal((await call("GET", `/admin/regions/${id}`)).status, 404)
    assert.equal((await call("DELETE", `/admin/regions/${id}`)).status, 404)
    assert.equal((await pool.query(`SELECT default_region_id FROM store WHERE id=$1`, [storeId])).rows[0].default_region_id, null)
    assert.equal((await call("POST", "/admin/regions", { name: label("again"), currency_code: "usd", countries: [free[5]] })).status, 201)
  })
})
