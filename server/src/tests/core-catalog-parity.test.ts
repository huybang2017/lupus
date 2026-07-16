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

describe("core catalog parity", () => {
  const email = `corecat-${T}@example.com`
  let token = ""
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "corecat-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("collections: unique handle, metadata, product count and delete", async () => {
    const handle = tag("summer")
    const made = await call("POST", "/admin/collections", { title: "Summer", handle, metadata: { season: "ss" } })
    assert.equal(made.status, 201)
    const col = made.json.collection
    assert.deepEqual(col.metadata, { season: "ss" })
    assert.equal((await call("POST", "/admin/collections", { title: "Again", handle })).status, 409)
    assert.equal((await call("POST", "/admin/collections", { title: " " })).status, 400)

    const upd = await call("POST", `/admin/collections/${col.id}`, { title: "Summer 2", metadata: { season: "aw" } })
    assert.equal(upd.json.collection.title, "Summer 2")
    assert.deepEqual(upd.json.collection.metadata, { season: "aw" })
    const other = (await call("POST", "/admin/collections", { title: "Other", handle: tag("other") })).json.collection
    assert.equal((await call("POST", `/admin/collections/${other.id}`, { handle })).status, 409)

    const pid = (await call("POST", "/admin/products", { title: tag("InCol") })).json.product.id
    await call("POST", `/admin/collections/${col.id}/products`, { add: [pid] })
    const list = await call("GET", `/admin/collections?id=${col.id}`)
    assert.equal(list.json.collections[0].products_count, 1)

    const del = await call("DELETE", `/admin/collections/${col.id}`)
    assert.deepEqual(del.json, { id: col.id, object: "collection", deleted: true })
    assert.equal((await call("DELETE", `/admin/collections/${col.id}`)).status, 404)
    assert.equal((await pool.query(`SELECT collection_id FROM product WHERE id=$1`, [pid])).rows[0].collection_id, null, "the product stays, without a collection")
    assert.equal((await call("POST", "/admin/collections", { title: "Reborn", handle })).status, 201, "the handle is free again")
  })

  it("metadata drawers: a { metadata } body updates any entity that has metadata", async () => {
    const customer = (await call("POST", "/admin/customers", { email: `meta-${T}@example.com` })).json.customer
    const group = (await call("POST", "/admin/customer-groups", { name: tag("VIP") })).json.customer_group
    const collection = (await call("POST", "/admin/collections", { title: "Meta", handle: tag("meta") })).json.collection
    const category = (await call("POST", "/admin/product-categories", { name: tag("Cat") })).json.product_category

    for (const [path, key, row] of [
      ["customers", "customer", customer],
      ["customer-groups", "customer_group", group],
      ["collections", "collection", collection],
      ["product-categories", "product_category", category],
    ] as const) {
      const res = await call("POST", `/admin/${path}/${row.id}`, { metadata: { note: path, n: "1" } })
      assert.equal(res.status, 200, path)
      assert.deepEqual(res.json[key].metadata, { note: path, n: "1" })
      const cleared = await call("POST", `/admin/${path}/${row.id}`, { metadata: {} })
      assert.deepEqual(cleared.json[key].metadata, {}, `${path} keeps what the drawer sends`)
      assert.equal((await call("POST", `/admin/${path}/missing_id`, { metadata: { a: "b" } })).status, 404, path)
    }
    // anything beyond metadata still goes to the entity's own handler
    const renamed = await call("POST", `/admin/customer-groups/${group.id}`, { name: "Renamed VIP", metadata: { kept: "yes" } })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.json.customer_group.name, "Renamed VIP")
  })
})
