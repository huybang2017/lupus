import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { COUNTRY_CODES } from "../modules/region/region-admin.service"
import { taxService } from "../modules/tax/tax.service"

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

async function api(method: string, path: string, body?: any, token?: string, extra: Record<string, string> = {}) {
  const headers: any = { "content-type": "application/json", ...extra }
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
const tag = (s: string) => `${s}_${T}_${seq++}`

describe("tax regions parity", () => {
  const email = `taxes-${T}@example.com`
  let token = ""
  let free: string[] = []
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "taxes-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    free = (
      await pool.query(`SELECT c FROM unnest($1::text[]) c WHERE c NOT IN (SELECT country_code FROM tax_region WHERE deleted_at IS NULL) ORDER BY random() LIMIT 6`, [COUNTRY_CODES])
    ).rows.map((r: any) => r.c as string)
    assert.ok(free.length >= 6)
  })

  after(async () => {
    // a run leaves no tax regions behind (their countries stay free for the next run)
    await pool.query(`UPDATE tax_region SET deleted_at = NOW() WHERE country_code = ANY($1) AND deleted_at IS NULL`, [free])
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("creates a country region with a default rate and refuses duplicates and bad input", async () => {
    const made = await call("POST", "/admin/tax-regions", {
      country_code: free[0].toUpperCase(),
      provider_id: "system",
      default_tax_rate: { name: "Default", code: "default", rate: 10 },
    })
    assert.equal(made.status, 201)
    const region = made.json.tax_region
    assert.equal(region.country_code, free[0])
    assert.equal(region.parent_id, null)
    assert.equal(region.tax_rates.length, 1)
    assert.equal(region.tax_rates[0].is_default, true)
    assert.equal(region.tax_rates[0].rate, 10)
    assert.deepEqual(region.children, [])

    const dup = await call("POST", "/admin/tax-regions", { country_code: free[0], provider_id: "system" })
    assert.equal(dup.status, 409)
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: "zz", provider_id: "system" })).status, 400)
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: free[1], provider_id: "nope" })).status, 404)
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: free[1], provider_id: "system", default_tax_rate: { name: "x", code: "x", rate: 150 } })).status, 400)

    const upd = await call("POST", `/admin/tax-regions/${region.id}`, { metadata: { note: "eu" } })
    assert.deepEqual(upd.json.tax_region.metadata, { note: "eu" })
    assert.equal((await call("POST", `/admin/tax-regions/${region.id}`, { provider_id: "nope" })).status, 404)
    const provs = await call("GET", "/admin/tax-providers")
    assert.ok(provs.json.tax_providers.some((p: any) => p.id === "system"))
  })

  it("provinces live below their country and the list can tell them apart", async () => {
    const country = (await call("POST", "/admin/tax-regions", { country_code: free[1], provider_id: "system" })).json.tax_region
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: free[2], province_code: "x1", provider_id: "system" })).status, 400, "no country region to hang the province on")
    const province = await call("POST", "/admin/tax-regions", { country_code: free[1], province_code: `${free[1]}-aa`, parent_id: country.id })
    assert.equal(province.status, 201)
    assert.equal(province.json.tax_region.parent_id, country.id)
    assert.equal(province.json.tax_region.provider_id, "system", "inherits the parent's provider")
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: free[3], province_code: "bb", parent_id: country.id })).status, 400, "other country")
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: free[1], parent_id: country.id })).status, 400, "province code needed")
    assert.equal((await call("POST", "/admin/tax-regions", { country_code: free[1], province_code: `${free[1]}-aa`, parent_id: country.id })).status, 409)

    const got = (await call("GET", `/admin/tax-regions/${country.id}`)).json.tax_region
    assert.deepEqual(got.children.map((c: any) => c.id), [province.json.tax_region.id])
    assert.equal((await call("GET", `/admin/tax-regions/${province.json.tax_region.id}`)).json.tax_region.parent.id, country.id)

    const top = await call("GET", `/admin/tax-regions?parent_id=null&country_code=${free[1]}`)
    assert.deepEqual(top.json.tax_regions.map((r: any) => r.id), [country.id])
    const kids = await call("GET", `/admin/tax-regions?parent_id=${country.id}`)
    assert.deepEqual(kids.json.tax_regions.map((r: any) => r.id), [province.json.tax_region.id])

    assert.equal((await call("DELETE", `/admin/tax-regions/${country.id}`)).status, 200)
    assert.equal((await call("GET", `/admin/tax-regions/${province.json.tax_region.id}`)).status, 404, "provinces go with the country")
    assert.equal((await call("DELETE", `/admin/tax-regions/${country.id}`)).status, 404)
  })

  it("rates: one default, override rules and their validation", async () => {
    const region = (await call("POST", "/admin/tax-regions", { country_code: free[4], provider_id: "system", default_tax_rate: { name: "Std", code: "std", rate: 20 } })).json.tax_region
    const product = (await call("POST", "/admin/products", { title: tag("Taxed") })).json.product
    const type = (await call("POST", "/admin/product-types", { value: tag("taxtype") })).json.product_type

    const override = await call("POST", "/admin/tax-rates", {
      tax_region_id: region.id,
      name: "Reduced",
      code: "reduced",
      rate: 5,
      rules: [{ reference: "product", reference_id: product.id }],
    })
    assert.equal(override.status, 201)
    const rate = override.json.tax_rate
    assert.deepEqual(rate.rules.map((r: any) => [r.reference, r.reference_id]), [["product", product.id]])

    assert.equal((await call("POST", "/admin/tax-rates", { tax_region_id: region.id, name: "d", code: "d", rate: 1, is_default: true, rules: [{ reference: "product", reference_id: product.id }] })).status, 400, "a default rate has no rules")
    assert.equal((await call("POST", "/admin/tax-rates", { tax_region_id: region.id, name: "n", code: "n", rate: 1, rules: [{ reference: "product", reference_id: "prod_missing" }] })).status, 404)
    assert.equal((await call("POST", "/admin/tax-rates", { tax_region_id: "txreg_missing", name: "n", code: "n", rate: 1 })).status, 404)
    assert.equal((await call("POST", "/admin/tax-rates", { tax_region_id: region.id, name: " ", code: "n", rate: 1 })).status, 400)

    const added = await call("POST", `/admin/tax-rates/${rate.id}/rules`, { reference: "product_type", reference_id: type.id })
    assert.equal(added.json.tax_rate.rules.length, 2)
    assert.equal((await call("POST", `/admin/tax-rates/${rate.id}/rules`, { reference: "product_type", reference_id: type.id })).status, 409)
    const ruleId = added.json.tax_rate.rules.find((r: any) => r.reference === "product_type").id
    const removed = await call("DELETE", `/admin/tax-rates/${rate.id}/rules/${ruleId}`)
    assert.deepEqual([removed.json.id, removed.json.object, removed.json.deleted], [ruleId, "tax_rate_rule", true])
    assert.equal(removed.json.parent.rules.length, 1)

    const replaced = await call("POST", `/admin/tax-rates/${rate.id}`, { rules: [{ reference: "product_type", reference_id: type.id }], is_combinable: true })
    assert.deepEqual(replaced.json.tax_rate.rules.map((r: any) => r.reference), ["product_type"])
    assert.equal(replaced.json.tax_rate.is_combinable, true)

    // making another rate the default demotes the old default
    const second = (await call("POST", "/admin/tax-rates", { tax_region_id: region.id, name: "New default", code: "nd", rate: 7, is_default: true })).json.tax_rate
    const defaults = await call("GET", `/admin/tax-rates?tax_region_id=${region.id}&is_default=true`)
    assert.deepEqual(defaults.json.tax_rates.map((r: any) => r.id), [second.id])
    assert.equal((await call("GET", `/admin/tax-rates?tax_region_id=${region.id}&is_default=false&order=name`)).json.count, 2)
    assert.equal((await call("POST", `/admin/tax-rates/${rate.id}`, { rate: 101 })).status, 400)

    const list = await call("GET", `/admin/tax-regions/${region.id}`)
    assert.equal(list.json.tax_region.tax_rates.length, 3)
    assert.deepEqual((await call("DELETE", `/admin/tax-rates/${rate.id}`)).json, { id: rate.id, object: "tax_rate", deleted: true })
    assert.equal((await call("GET", `/admin/tax-rates/${rate.id}`)).status, 404)
  })

  it("an override replaces the default for what it names, a combinable one adds to it", async () => {
    const region = (await call("POST", "/admin/tax-regions", { country_code: free[5], provider_id: "system", default_tax_rate: { name: "Std", code: "std", rate: 10 } })).json.tax_region
    const product = (await call("POST", "/admin/products", { title: tag("P") })).json.product
    const other = (await call("POST", "/admin/products", { title: tag("O") })).json.product
    const type = (await call("POST", "/admin/product-types", { value: tag("tt") })).json.product_type
    await call("POST", "/admin/tax-rates", { tax_region_id: region.id, name: "Food", code: "food", rate: 4, rules: [{ reference: "product", reference_id: product.id }] })
    await call("POST", "/admin/tax-rates", { tax_region_id: region.id, name: "Levy", code: "levy", rate: 2, is_combinable: true, rules: [{ reference: "product_type", reference_id: type.id }] })

    const pool_ = await taxService.ratePool({ country: free[5] })
    const codes = (target: any) => taxService.pickRates(pool_, target).map((r) => `${r.code}:${r.rate}`).sort()
    assert.deepEqual(codes({ product_id: other.id }), ["std:10"], "nothing matches: the default")
    assert.deepEqual(codes({ product_id: product.id }), ["food:4"], "the override replaces the default")
    assert.deepEqual(codes({ product_id: other.id, product_type_id: type.id }), ["levy:2", "std:10"], "combinable stacks on the default")
    assert.deepEqual(codes({ product_id: product.id, product_type_id: type.id }), ["food:4", "levy:2"])
    // a shipping override only touches shipping methods
    const withShipping = [...pool_, { code: "ship", rate: 0, is_default: false, is_combinable: false, rules: [{ reference: "shipping_option", reference_id: "so_1" }] }]
    assert.deepEqual(taxService.pickRates(withShipping, { shipping_option_id: "so_1" }).map((r) => r.code), ["ship"])
    assert.deepEqual(taxService.pickRates(withShipping, { shipping_option_id: "so_2" }).map((r) => r.code), ["std"])
    assert.deepEqual(taxService.pickRates(withShipping, { product_id: other.id }).map((r) => r.code), ["std"])

    // a province with its own default wins at an address in that province
    const province = await call("POST", "/admin/tax-regions", { country_code: free[5], province_code: `${free[5]}-zz`, parent_id: region.id, default_tax_rate: { name: "Prov", code: "prov", rate: 3 } })
    assert.equal(province.status, 201)
    const inProvince = await taxService.ratePool({ country: free[5], province: "zz" })
    assert.deepEqual(taxService.pickRates(inProvince).map((r) => r.code), ["prov"])
    const elsewhere = await taxService.ratePool({ country: free[5], province: "qq" })
    assert.deepEqual(taxService.pickRates(elsewhere).map((r) => r.code), ["std"])
  })
})
