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
    const filtered = await call("GET", `/admin/fulfillment-providers?stock_location_id=${loc.id}`)
    assert.equal(filtered.json.count, 1)
    const none = await call("GET", `/admin/fulfillment-providers?stock_location_id=${(await makeLocation()).id}`)
    assert.equal(none.json.count, 0, "a location with no providers connected lists none")
    const options = await call("GET", "/admin/fulfillment-providers/manual/options")
    assert.ok(options.json.fulfillment_options.some((o: any) => o.is_return), "the provider offers a return option")
    assert.equal((await call("GET", "/admin/fulfillment-providers/zzz/options")).status, 404)
  })

  it("enables / disables shipping and pickup, manages service zones and their areas", async () => {
    const loc = await makeLocation()
    const mk = (type: string) => call("POST", `/admin/stock-locations/${loc.id}/fulfillment-sets`, { name: `${loc.name} ${type}`, type })
    const first = await mk("shipping")
    assert.equal(first.status, 201)
    assert.equal((await mk("shipping")).status, 400, "only one shipping set per location")
    assert.equal((await mk("pickup")).status, 201)
    assert.equal((await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-sets`, { name: "x", type: "air" })).status, 400)

    const set = first.json.stock_location.fulfillment_sets[0]
    const zoneName = label("zone")
    const created = await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones`, { name: zoneName, geo_zones: [{ type: "country", country_code: "dk" }, { type: "country", country_code: "se" }] })
    assert.equal(created.status, 201)
    const zone = created.json.service_zone
    assert.equal(zone.geo_zones.length, 2)
    assert.equal((await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones`, { name: zoneName.toUpperCase() })).status, 400, "zone names are unique in a set")
    assert.equal((await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones`, { name: label("z"), geo_zones: [{ type: "province", country_code: "us" }] })).status, 400)

    // replacing the areas: dk stays, se goes, no is added
    const replaced = await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones/${zone.id}`, { geo_zones: [{ type: "country", country_code: "dk" }, { type: "country", country_code: "no" }] })
    assert.equal(replaced.status, 200)
    const countries = replaced.json.fulfillment_set.service_zones[0].geo_zones.map((g: any) => g.country_code).sort()
    assert.deepEqual(countries, ["dk", "no"])
    const renamed = await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones/${zone.id}`, { name: "Nordics" })
    assert.equal(renamed.json.fulfillment_set.service_zones[0].name, "Nordics")

    // the provider has to be connected to the location before an option can use it
    assert.equal((await call("POST", "/admin/shipping-options", optionBody(zone.id))).status, 400)
    await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-providers`, { add: ["manual"] })
    const ok = await call("POST", "/admin/shipping-options", optionBody(zone.id))
    assert.equal(ok.status, 201)
    assert.equal((await call("POST", `/admin/stock-locations/${loc.id}/fulfillment-providers`, { remove: ["manual"] })).status, 400, "a provider in use cannot be disconnected")

    // disabling the set removes its zones and options
    assert.equal((await call("DELETE", `/admin/fulfillment-sets/${set.id}`)).status, 200)
    assert.equal((await call("GET", `/admin/shipping-options/${ok.json.shipping_option.id}`)).status, 404)
    const after = await call("GET", `/admin/stock-locations/${loc.id}`)
    assert.deepEqual(after.json.stock_location.fulfillment_sets.map((f: any) => f.type), ["pickup"])
  })

  it("creates shipping options the way Lupus's form does and validates them", async () => {
    const { zone } = await setup()
    const res = await call("POST", "/admin/shipping-options", optionBody(zone.id, {
      prices: [
        { currency_code: "usd", amount: 500 },
        { currency_code: "usd", amount: 0, rules: [{ attribute: "item_total", operator: "gte", value: 5000 }] },
      ],
    }))
    assert.equal(res.status, 201)
    const o = res.json.shipping_option
    assert.equal(o.service_zone_id, zone.id)
    assert.equal(o.type.code, "standard", "the type was created with the option")
    assert.equal(o.shipping_profile.id, profileId)
    assert.equal(o.prices.length, 2)
    assert.equal(o.is_return, false)
    assert.equal(o.enabled_in_store, true)
    assert.ok(o.rules.some((r: any) => r.attribute === "enabled_in_store" && r.value === "true"))

    const bad = (extra: any) => call("POST", "/admin/shipping-options", optionBody(zone.id, extra))
    assert.equal((await bad({ name: " " })).status, 400)
    assert.equal((await bad({ price_type: "calculated", prices: [] })).status, 400, "manual cannot calculate prices")
    assert.equal((await bad({ shipping_profile_id: "sp_missing" })).status, 404)
    assert.equal((await bad({ service_zone_id: "serz_missing" })).status, 404)
    assert.equal((await bad({ data: { id: "unknown-option" } })).status, 400)
    assert.equal((await bad({ prices: [{ amount: 5 }] })).status, 400, "a price needs a currency or region")
    assert.equal((await bad({ prices: [{ currency_code: "usd", amount: 1 }, { currency_code: "usd", amount: 2 }] })).status, 400, "duplicate price")
    assert.equal((await bad({ prices: [{ currency_code: "usd", amount: 1, rules: [{ attribute: "item_total", operator: "gte", value: 9 }, { attribute: "item_total", operator: "lte", value: 2 }] }] })).status, 400)
    assert.equal((await bad({ prices: [{ currency_code: "usd", amount: -5 }] })).status, 400)
  })

  it("edits a shipping option and its prices, and deleting a type detaches it", async () => {
    const { zone } = await setup()
    const made = await call("POST", "/admin/shipping-options", optionBody(zone.id))
    const id = made.json.shipping_option.id
    const typeId = made.json.shipping_option.type.id
    const upd = await call("POST", `/admin/shipping-options/${id}`, {
      name: "Renamed",
      prices: [{ currency_code: "eur", amount: 700 }, { currency_code: "usd", amount: 800 }],
      rules: [{ attribute: "enabled_in_store", operator: "eq", value: "false" }],
    })
    assert.equal(upd.status, 200)
    const o = upd.json.shipping_option
    assert.equal(o.name, "Renamed")
    assert.deepEqual(o.prices.map((p: any) => [p.currency_code, p.amount]).sort(), [["eur", 700], ["usd", 800]])
    assert.equal(o.enabled_in_store, false)
    assert.equal(o.is_return, false, "an untouched flag stays")

    const del = await call("DELETE", `/admin/shipping-option-types/${typeId}`)
    assert.equal(del.status, 200)
    assert.equal((await call("GET", `/admin/shipping-options/${id}`)).json.shipping_option.type, null)
  })

  it("only offers options that apply to the cart: zone, channel, pickup, enabled, price and conditions", async () => {
    const { zone } = await setup(["dk"])
    const mkOpt = async (extra: any) => (await call("POST", "/admin/shipping-options", optionBody(zone.id, extra))).json.shipping_option
    const std = await mkOpt({ name: label("std") })
    const free = await mkOpt({ name: label("free"), prices: [{ currency_code: "usd", amount: 0, rules: [{ attribute: "item_total", operator: "gte", value: 5000 }] }] })
    const hidden = await mkOpt({ name: label("hidden"), rules: [{ attribute: "enabled_in_store", operator: "eq", value: "false" }] })
    const ret = await mkOpt({ name: label("return"), rules: [{ attribute: "is_return", operator: "eq", value: "true" }] })
    const eur = await mkOpt({ name: label("eur"), prices: [{ currency_code: "eur", amount: 100 }] })

    // item total 1000: standard yes, the >=5000 free option not yet, hidden/return/eur never
    const small = await makeCart("dk")
    const smallNames = await names(small)
    assert.ok(smallNames.includes(std.name))
    assert.ok(!smallNames.includes(free.name), "conditional price needs a big enough cart")
    assert.ok(!smallNames.includes(hidden.name), "not enabled in store")
    assert.ok(!smallNames.includes(ret.name), "return options are never offered")
    assert.ok(!smallNames.includes(eur.name), "no price in the cart's currency")
    assert.equal((await fulfillmentService.optionsForCart(small)).find((o: any) => o.id === std.id).amount, 500)

    const big = await makeCart("dk", { qty: 5 })
    const bigOpts = await fulfillmentService.optionsForCart(big)
    assert.equal(bigOpts.find((o: any) => o.id === free.id)?.amount, 0, "free shipping above the threshold")

    assert.ok(!(await names(await makeCart("se"))).includes(std.name), "address outside the service zone")
    assert.ok(!(await names(await makeCart("dk", { channel: otherChannelId }))).includes(std.name), "location not connected to the cart's sales channel")

    // a zone in a pickup set never ships
    const pickupLoc = await makeLocation()
    await call("POST", `/admin/stock-locations/${pickupLoc.id}/fulfillment-providers`, { add: ["manual"] })
    await call("POST", `/admin/stock-locations/${pickupLoc.id}/sales-channels`, { add: [channelId] })
    const ps = (await call("POST", `/admin/stock-locations/${pickupLoc.id}/fulfillment-sets`, { name: label("pickup"), type: "pickup" })).json.stock_location.fulfillment_sets[0]
    const pz = (await call("POST", `/admin/fulfillment-sets/${ps.id}/service-zones`, { name: label("pz"), geo_zones: [{ type: "country", country_code: "dk" }] })).json.service_zone
    const pickup = (await call("POST", "/admin/shipping-options", optionBody(pz.id, { name: label("pickup-opt") }))).json.shipping_option
    assert.ok(!(await names(await makeCart("dk"))).includes(pickup.name), "pickup options are not shipping options")
  })

  it("prefers a region price over a currency price and honours province / postal areas", async () => {
    if (regionId) {
      const regionCurrency = (await pool.query(`SELECT currency_code FROM region WHERE id=$1`, [regionId])).rows[0].currency_code
      const { zone } = await setup(["dk"])
      const opt = (await call("POST", "/admin/shipping-options", optionBody(zone.id, {
        name: label("regional"),
        prices: [{ currency_code: regionCurrency, amount: 900 }, { region_id: regionId, amount: 400 }],
      }))).json.shipping_option
      const cart = await cartService.create({ currency_code: regionCurrency, region_id: regionId, sales_channel_id: channelId } as any)
      await cartService.setAddress(cart.id, "shipping", { country_code: "dk" } as any)
      const found = (await fulfillmentService.optionsForCart(cart.id)).find((o: any) => o.id === opt.id)
      assert.equal(found?.amount, 400, "the region's price wins")
    }

    const { zone: pz, set } = await setup(["dk"])
    await call("POST", `/admin/fulfillment-sets/${set.id}/service-zones/${pz.id}`, {
      geo_zones: [{ type: "province", country_code: "us", province_code: "us-ca" }, { type: "postal", country_code: "gb", postal_expression: ["SW1"] }],
    })
    const o2 = (await call("POST", "/admin/shipping-options", optionBody(pz.id, { name: label("areas") }))).json.shipping_option
    const cartIn = async (address: any) => {
      const c = await cartService.create({ currency_code: "usd", sales_channel_id: channelId } as any)
      await cartService.addItem(c.id, { variant_id: variantId, quantity: 1 })
      await cartService.setAddress(c.id, "shipping", address)
      return (await names(c.id)).includes(o2.name)
    }
    assert.equal(await cartIn({ country_code: "us", province: "CA" }), true)
    assert.equal(await cartIn({ country_code: "us", province: "NY" }), false)
    assert.equal(await cartIn({ country_code: "gb", postal_code: "SW1A 1AA" }), true)
    assert.equal(await cartIn({ country_code: "gb", postal_code: "EC1A 1BB" }), false)
  })

  it("manages shipping option types and shipping profiles", async () => {
    const t = await call("POST", "/admin/shipping-option-types", { label: label("Express"), code: "express", description: "Fast" })
    assert.equal(t.status, 201)
    const id = t.json.shipping_option_type.id
    assert.equal((await call("POST", "/admin/shipping-option-types", { label: "", code: "x" })).status, 400)
    assert.equal((await call("POST", "/admin/shipping-option-types", { label: "x", code: " " })).status, 400)
    const upd = await call("POST", `/admin/shipping-option-types/${id}`, { label: "Overnight", description: null })
    assert.equal(upd.json.shipping_option_type.label, "Overnight")
    assert.equal(upd.json.shipping_option_type.description, null)
    const list = await call("GET", "/admin/shipping-option-types?q=overnight")
    assert.ok(list.json.shipping_option_types.some((x: any) => x.id === id))
    assert.equal((await call("DELETE", `/admin/shipping-option-types/${id}`)).status, 200)
    assert.equal((await call("GET", `/admin/shipping-option-types/${id}`)).status, 404)

    const name = label("Heavy")
    const p = await call("POST", "/admin/shipping-profiles", { name, type: "heavy" })
    assert.equal(p.status, 201)
    assert.equal((await call("POST", "/admin/shipping-profiles", { name: name.toUpperCase(), type: "x" })).status, 400, "profile names are unique")
    assert.equal((await call("POST", "/admin/shipping-profiles", { name: "", type: "x" })).status, 400)
    const pid = p.json.shipping_profile.id
    const edited = await call("POST", `/admin/shipping-profiles/${pid}`, { type: "oversized", metadata: { a: "b" } })
    assert.equal(edited.json.shipping_profile.type, "oversized")
    assert.deepEqual(edited.json.shipping_profile.metadata, { a: "b" })
    assert.equal((await call("DELETE", `/admin/shipping-profiles/${pid}`)).status, 200)
    assert.equal((await call("GET", `/admin/shipping-profiles/${pid}`)).status, 404)
  })

  it("deleting a location removes its sets, zones and options", async () => {
    const { loc, zone } = await setup()
    const o = (await call("POST", "/admin/shipping-options", optionBody(zone.id))).json.shipping_option
    assert.equal((await call("DELETE", `/admin/stock-locations/${loc.id}`)).status, 200)
    assert.equal((await call("GET", `/admin/stock-locations/${loc.id}`)).status, 404)
    assert.equal((await call("GET", `/admin/shipping-options/${o.id}`)).status, 404)
    assert.equal((await call("DELETE", `/admin/stock-locations/${loc.id}`)).status, 404)
  })
})
