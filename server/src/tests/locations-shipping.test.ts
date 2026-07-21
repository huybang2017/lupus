import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { productService } from "../modules/product/product.service"
import { cartService } from "../modules/cart/cart.service"
import { fulfillmentService } from "../modules/fulfillment/fulfillment.service"

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
const label = (s: string) => `LS ${s} ${T}-${seq++}`

describe("locations & shipping parity", () => {
  const email = `loc-ship-${T}@example.com`
  let token = ""
  let variantId = ""
  let channelId = ""
  let otherChannelId = ""
  let regionId = ""
  let profileId = ""

  const call = (method: string, path: string, body?: any) => api(method, path, body, token)
  const makeLocation = async (extra: any = {}) =>
    (await call("POST", "/admin/stock-locations", { name: label("loc"), address: { address_1: "1 Main St", city: "Copenhagen", country_code: "dk", postal_code: "1000" }, ...extra })).json.stock_location

  // location + shipping set + zone for the countries, provider connected, linked to `channelId`
  const setup = async (countries = ["dk"]) => {
    const loc = await makeLocation()
    await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-providers`, { add: ["manual"] })
    await call("POST", `/admin/stock-locations/${loc.id}/sales-channels`, { add: [channelId] })
    const withSet = await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-sets`, { name: label("set"), type: "shipping" })
    const set = withSet.json.stock_location.fulfillment_sets[0]
    const zone = await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones`, {
      name: label("zone"),
      geo_zones: countries.map((c) => ({ type: "country", country_code: c })),
    })
    return { loc, set, zone: zone.json.service_zone }
  }
  const optionBody = (zoneId: string, extra: any = {}) => ({
    name: label("opt"),
    price_type: "flat",
    service_zone_id: zoneId,
    shipping_profile_id: profileId,
    provider_id: "manual",
    type: { label: "Standard", code: "standard", description: "Standard delivery" },
    data: { id: "manual-fulfillment" },
    prices: [{ currency_code: "usd", amount: 500 }],
    rules: [
      { attribute: "is_return", operator: "eq", value: "false" },
      { attribute: "enabled_in_store", operator: "eq", value: "true" },
    ],
    ...extra,
  })
  const makeCart = async (country: string, opts: { channel?: string; region?: string; qty?: number; currency?: string } = {}) => {
    const cart = await cartService.create({ currency_code: opts.currency ?? "usd", region_id: opts.region ?? null, sales_channel_id: opts.channel ?? channelId } as any)
    await cartService.addItem(cart.id, { variant_id: variantId, quantity: opts.qty ?? 1 })
    await cartService.setAddress(cart.id, "shipping", { country_code: country } as any)
    return cart.id as string
  }
  const names = async (cartId: string) => (await fulfillmentService.optionsForCart(cartId)).map((o: any) => o.name)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "locship-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])

    const p = await productService.create({ title: `LS product ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 1000 }] }] })
    variantId = (await pool.query(`SELECT id FROM product_variant WHERE product_id=$1`, [p.id])).rows[0].id
    channelId = (await pool.query(`INSERT INTO sales_channel (name) VALUES ($1) RETURNING id`, [label("channel")])).rows[0].id
    otherChannelId = (await pool.query(`INSERT INTO sales_channel (name) VALUES ($1) RETURNING id`, [label("channel2")])).rows[0].id
    await pool.query(`INSERT INTO product_sales_channel (product_id, sales_channel_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING`, [p.id, channelId, otherChannelId])
    profileId = (await call("POST", "/admin/shipping-profiles", { name: label("profile"), type: "default" })).json.shipping_profile.id
    regionId = (await pool.query(`SELECT id FROM region WHERE deleted_at IS NULL LIMIT 1`)).rows[0]?.id ?? ""
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("creates a location with a full address, validates it and lists it with channels and sets", async () => {
    const name = label("full")
    const res = await call("POST", "/admin/stock-locations", {
      name,
      address: { address_1: "Nyhavn 1", address_2: "Floor 2", city: "Copenhagen", country_code: "DK", postal_code: "1051", province: "Hovedstaden", company: "Acme", phone: "+4512345678" },
    })
    assert.equal(res.status, 201)
    const loc = res.json.stock_location
    assert.deepEqual(loc.address, {
      address_1: "Nyhavn 1", address_2: "Floor 2", city: "Copenhagen", country_code: "dk", postal_code: "1051", province: "Hovedstaden", company: "Acme", phone: "+4512345678",
    })
    assert.equal((await call("POST", "/admin/stock-locations", { name: "  " })).status, 400, "name is required")
    assert.equal((await call("POST", "/admin/stock-locations", { name: label("x"), address: { city: "Aarhus" } })).status, 400, "an address needs address_1 and a country")
    assert.equal((await call("POST", "/admin/stock-locations", { name: label("legacy") })).status, 201, "a bare name still works")

    const upd = await call("POST", `/admin/stock-locations/${loc.id}`, { address: { city: "Aarhus", phone: null } })
    assert.equal(upd.json.stock_location.address.city, "Aarhus")
    assert.equal(upd.json.stock_location.address.address_1, "Nyhavn 1", "an address update merges")
    assert.equal(upd.json.stock_location.address.phone, null)

    await call("POST", `/admin/stock-locations/${loc.id}/sales-channels`, { add: [channelId] })
    await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-sets`, { name: `${name} shipping`, type: "shipping" })
    const list = await call("GET", `/admin/stock-locations?q=${encodeURIComponent(name)}`)
    assert.equal(list.json.count, 1)
    const row = list.json.stock_locations[0]
    assert.equal(row.address.address_1, "Nyhavn 1")
    assert.equal(row.sales_channels[0].id, channelId)
    assert.deepEqual(row.fulfillment_sets.map((f: any) => f.type), ["shipping"])
  })

  it("connects sales channels and fulfillment providers", async () => {
    const loc = await makeLocation()
    assert.equal((await call("POST", `/admin/stock-locations/${loc.id}/sales-channels`, { add: ["sc_missing"] })).status, 404)
    const added = await call("POST", `/admin/stock-locations/${loc.id}/sales-channels`, { add: [channelId, otherChannelId] })
    assert.equal(added.json.stock_location.sales_channels.length, 2)
    const removed = await call("POST", `/admin/stock-locations/${loc.id}/sales-channels`, { remove: [otherChannelId] })
    assert.deepEqual(removed.json.stock_location.sales_channels.map((c: any) => c.id), [channelId])

    assert.equal((await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-providers`, { add: ["nope"] })).status, 400)
    const linked = await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-providers`, { add: ["manual"] })
    assert.deepEqual(linked.json.stock_location.fulfillment_providers, [{ id: "manual", is_enabled: true }])
