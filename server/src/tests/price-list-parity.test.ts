import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { productService } from "../modules/product/product.service"
import { pricingService } from "../modules/pricing/pricing.service"

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
const label = (s: string) => `PL ${s} ${T}-${seq++}`

describe("price list parity", () => {
  const email = `price-list-${T}@example.com`
  let token = ""
  let variantId = ""
  let variant2Id = ""
  let productId = ""
  let groupId = ""
  let customerId = ""

  const make = (extra: any = {}) =>
    api("POST", "/admin/price-lists", { title: label("list"), description: "d", type: "sale", status: "active", prices: [{ variant_id: variantId, currency_code: "usd", amount: 700 }], ...extra }, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "pricelist-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])

    const p = await productService.create({
      title: `PL product ${T}`,
      status: "published",
      variants: [
        { title: "A", prices: [{ currency_code: "usd", amount: 1000 }] },
        { title: "B", prices: [{ currency_code: "usd", amount: 2000 }] },
      ],
    })
    productId = p.id
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 ORDER BY title`, [p.id])
    variantId = v.rows[0].id
    variant2Id = v.rows[1].id
    groupId = (await pool.query(`INSERT INTO customer_group (name) VALUES ($1) RETURNING id`, [`PL group ${T}`])).rows[0].id
    customerId = (await pool.query(`INSERT INTO customer (email) VALUES ($1) RETURNING id`, [`pl-cust-${T}@example.com`])).rows[0].id
    await pool.query(`INSERT INTO customer_group_customer (customer_group_id, customer_id) VALUES ($1,$2)`, [groupId, customerId])
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("creates a list from Lupus's payload (rules + quantity rules) and returns the full shape", async () => {
    const res = await make({
      rules: { "customer.groups.id": [groupId] },
      prices: [
        { variant_id: variantId, currency_code: "usd", amount: 700 },
        { variant_id: variantId, currency_code: "usd", amount: 600, rules: { min_quantity: "5", max_quantity: "9" } },
      ],
    })
    assert.equal(res.status, 201)
    const pl = res.json.price_list
    assert.equal(res.json.price_list_id, pl.id)
    assert.equal(pl.type, "sale")
    assert.equal(pl.status, "active")
    assert.equal(pl.price_count, 2)
    assert.deepEqual(pl.rules, { "customer.groups.id": [groupId] })
    assert.equal(pl.customer_groups[0].id, groupId)
    const tier = pl.prices.find((p: any) => p.min_quantity === 5)
    assert.equal(tier.max_quantity, 9)
    assert.equal(tier.amount, 600)
  })

  it("rejects what Lupus rejects", async () => {
    assert.equal((await make({ title: "  " })).status, 400, "title is required")
    assert.equal((await make({ starts_at: "2030-02-01T00:00:00.000Z", ends_at: "2030-01-01T00:00:00.000Z" })).status, 400, "end before start")
    assert.equal((await make({ rules: { "customer.groups.id": ["cusgrp_missing"] } })).status, 400, "unknown group")
    assert.equal((await make({ prices: [{ variant_id: "variant_missing", currency_code: "usd", amount: 1 }] })).status, 404, "unknown variant")
    assert.equal(
      (await make({ prices: [{ variant_id: variantId, currency_code: "usd", amount: 1, rules: { min_quantity: 9, max_quantity: 2 } }] })).status,
      400,
      "min above max"
    )
    assert.equal(
      (await make({ prices: [{ variant_id: variantId, currency_code: "usd", amount: 1 }, { variant_id: variantId, currency_code: "USD", amount: 2 }] })).status,
      400,
      "same variant, currency and range twice"
    )
    assert.equal((await make({ type: "bogus" })).status, 400)
  })

  it("updates details and configuration with Lupus's body and keeps the window valid", async () => {
    const made = await make({ rules: { "customer.groups.id": [groupId] }, starts_at: "2030-01-01T00:00:00.000Z", ends_at: "2030-06-01T00:00:00.000Z" })
    const id = made.json.price_list.id
    const upd = (body: any) => api("POST", `/admin/price-lists/${id}`, body, token)

    const first = await upd({ title: "Renamed", description: "new", status: "draft", type: "override" })
    assert.equal(first.status, 200)
    assert.equal(first.json.price_list.title, "Renamed")
    assert.equal(first.json.price_list.type, "override")
    assert.equal(first.json.price_list.status, "draft")
    assert.deepEqual(first.json.price_list.rules, { "customer.groups.id": [groupId] }, "details edits leave the rules alone")

    assert.equal((await upd({ ends_at: "2029-01-01T00:00:00.000Z" })).status, 400, "new end date before the stored start")
    assert.equal((await upd({ starts_at: "2031-01-01T00:00:00.000Z" })).status, 400, "new start date after the stored end")
    const dates = await upd({ starts_at: null, ends_at: null, rules: {} })
    assert.equal(dates.status, 200)
    assert.equal(dates.json.price_list.starts_at, null)
    assert.equal(dates.json.price_list.ends_at, null)
    assert.deepEqual(dates.json.price_list.rules, {}, "an empty rules object clears the customer groups")
    assert.equal((await upd({ rules: { "customer.groups.id": ["cusgrp_missing"] } })).status, 400)

    const meta = await upd({ metadata: { season: "summer" } })
    assert.deepEqual(meta.json.price_list.metadata, { season: "summer" })
    assert.equal((await api("POST", "/admin/price-lists/pl_missing", { title: "x" }, token)).status, 404)
  })

  it("lists lists with the price override count, search, status filter and updated sort", async () => {
    const title = label("findme")
    const made = await make({ title, status: "draft", prices: [{ variant_id: variantId, currency_code: "usd", amount: 1 }, { variant_id: variant2Id, currency_code: "usd", amount: 2 }] })
    const id = made.json.price_list.id
    const found = await api("GET", `/admin/price-lists?q=${encodeURIComponent(title)}`, undefined, token)
    assert.equal(found.status, 200)
    assert.equal(found.json.count, 1)
    assert.equal(found.json.price_lists[0].price_count, 2)

    const drafts = await api("GET", `/admin/price-lists?status=draft&q=${encodeURIComponent(title)}`, undefined, token)
    assert.equal(drafts.json.count, 1)
    const actives = await api("GET", `/admin/price-lists?status=active&q=${encodeURIComponent(title)}`, undefined, token)
    assert.equal(actives.json.count, 0)

    await api("POST", `/admin/price-lists/${id}`, { description: "touched" }, token)
    const sorted = await api("GET", "/admin/price-lists?order=-updated_at&limit=1", undefined, token)
    assert.equal(sorted.json.price_lists[0].id, id)
  })

  it("lists the products that have overrides in a list (products section)", async () => {
    const made = await make({ prices: [{ variant_id: variant2Id, currency_code: "usd", amount: 5 }] })
    const id = made.json.price_list.id
    const inList = await api("GET", `/admin/products?price_list_id=${id}`, undefined, token)
    assert.equal(inList.status, 200)
    assert.equal(inList.json.count, 1)
    assert.equal(inList.json.products[0].id, productId)
    const other = await make({ prices: [] })
    const none = await api("GET", `/admin/products?price_list_id=${other.json.price_list.id}`, undefined, token)
    assert.equal(none.json.count, 0)
  })

  it("edits prices in batch and keeps quantity ranges valid", async () => {
    const made = await make({ prices: [{ variant_id: variantId, currency_code: "usd", amount: 100 }] })
    const id = made.json.price_list.id
    const priceId = made.json.price_list.prices[0].id
    const batch = (body: any) => api("POST", `/admin/price-lists/${id}/prices/batch`, body, token)

    const ok = await batch({
      update: [{ id: priceId, amount: 150 }],
      create: [{ variant_id: variant2Id, currency_code: "usd", amount: 90, min_quantity: 3, max_quantity: 6 }],
    })
    assert.equal(ok.status, 200)
    assert.equal(Number(ok.json.updated[0].amount), 150)
    assert.equal(ok.json.created.length, 1)
    assert.equal((await batch({ create: [{ variant_id: variantId, currency_code: "usd", amount: 1, min_quantity: 8, max_quantity: 2 }] })).status, 400)
    assert.equal((await batch({ update: [{ id: priceId, min_quantity: 9, max_quantity: 4 }] })).status, 400)
    assert.equal((await batch({ update: [{ id: priceId, min_quantity: 5 }] })).status, 200, "a lone min stays below no max")

    const del = await batch({ delete: [priceId] })
    assert.deepEqual(del.json.deleted, [priceId])
    assert.equal((await api("GET", `/admin/price-lists/${id}`, undefined, token)).json.price_list.price_count, 1)
  })

  it("applies an override to the customer's price and respects status, dates, groups and deletion", async () => {
    const product = await productService.create({ title: `PL resolve ${T}`, status: "published", variants: [{ title: "R", prices: [{ currency_code: "usd", amount: 1000 }] }] })
    const vid = (await pool.query(`SELECT id FROM product_variant WHERE product_id=$1`, [product.id])).rows[0].id
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, null), 1000)

    const draft = await make({ status: "draft", prices: [{ variant_id: vid, currency_code: "usd", amount: 400 }] })
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, null), 1000, "a draft list is not live")

    const expired = await make({ ends_at: "2000-01-01T00:00:00.000Z", prices: [{ variant_id: vid, currency_code: "usd", amount: 300 }] })
    const scheduled = await make({ starts_at: "2099-01-01T00:00:00.000Z", prices: [{ variant_id: vid, currency_code: "usd", amount: 200 }] })
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, null), 1000, "expired and scheduled lists are not live")

    const live = await make({ prices: [{ variant_id: vid, currency_code: "usd", amount: 800 }] })
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, null), 800)

    const grouped = await make({ rules: { "customer.groups.id": [groupId] }, type: "override", prices: [{ variant_id: vid, currency_code: "usd", amount: 500 }] })
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, null), 800, "guests do not get a group list")
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, customerId), 500, "a member does")

    // quantity tiers
    const tiered = await make({ prices: [{ variant_id: vid, currency_code: "usd", amount: 100, rules: { min_quantity: 10 } }] })
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, null), 800)
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 10, null), 100)

    // deleting a list takes its prices with it: they must not turn into base prices
    for (const l of [grouped, tiered, live]) {
      const del = await api("DELETE", `/admin/price-lists/${l.json.price_list.id}`, undefined, token)
      assert.equal(del.status, 200)
      assert.equal(del.json.deleted, true)
    }
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 10, null), 1000)
    assert.equal(await pricingService.resolveUnitPrice(vid, "usd", 1, customerId), 1000)
    assert.equal((await api("GET", `/admin/price-lists/${grouped.json.price_list.id}`, undefined, token)).status, 404)
    assert.equal((await api("DELETE", `/admin/price-lists/${grouped.json.price_list.id}`, undefined, token)).status, 404, "deleting twice is a 404")
    void draft
    void expired
    void scheduled
  })
})
