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
const tag = (s: string) => `${s}_${T}_${seq++}`

describe("reference data parity", () => {
  const email = `refdata-${T}@example.com`
  let token = ""
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "refdata-pass-1" })
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

  it("return reasons: unique value, parent, filters and delete", async () => {
    const value = tag("wrong_size")
    const made = await call("POST", "/admin/return-reasons", { value, label: "Wrong size", description: "Too small" })
    assert.equal(made.status, 201)
    const parent = made.json.return_reason
    assert.equal(parent.value, value)
    assert.equal(parent.parent_return_reason_id, null)

    assert.equal((await call("POST", "/admin/return-reasons", { value, label: "dup" })).status, 409, "value is unique")
    assert.equal((await call("POST", "/admin/return-reasons", { value: " ", label: "x" })).status, 400)
    assert.equal((await call("POST", "/admin/return-reasons", { value: tag("orphan"), label: "x", parent_return_reason_id: "rr_missing" })).status, 404)

    const child = (await call("POST", "/admin/return-reasons", { value: tag("too_tight"), label: "Too tight", parent_return_reason_id: parent.id })).json.return_reason
    const got = (await call("GET", `/admin/return-reasons/${parent.id}`)).json.return_reason
    assert.deepEqual(got.return_reason_children.map((c: any) => c.id), [child.id])
    assert.equal((await call("GET", `/admin/return-reasons/${child.id}`)).json.return_reason.parent_return_reason.id, parent.id)

    // a reason cannot sit below its own descendant
    assert.equal((await call("POST", `/admin/return-reasons/${parent.id}`, { parent_return_reason_id: child.id })).status, 400)
    assert.equal((await call("POST", `/admin/return-reasons/${parent.id}`, { parent_return_reason_id: parent.id })).status, 400)

    const upd = await call("POST", `/admin/return-reasons/${child.id}`, { label: "Much too tight", description: null })
    assert.equal(upd.json.return_reason.label, "Much too tight")
    assert.equal(upd.json.return_reason.description, null)
    assert.equal((await call("POST", `/admin/return-reasons/${child.id}`, { value }).then((r) => r.status)), 409)

    const list = await call("GET", `/admin/return-reasons?id=${parent.id}&id=${child.id}&order=value`)
    assert.equal(list.json.count, 2)
    assert.deepEqual(list.json.return_reasons.map((r: any) => r.value), [value, child.value].sort())
    assert.equal((await call("GET", `/admin/return-reasons?q=${encodeURIComponent("Much too")}`)).json.return_reasons.some((r: any) => r.id === child.id), true)
    assert.equal((await call("GET", `/admin/return-reasons?parent_return_reason_id=${parent.id}`)).json.count, 1)

    const del = await call("DELETE", `/admin/return-reasons/${parent.id}`)
    assert.deepEqual(del.json, { id: parent.id, object: "return_reason", deleted: true })
    assert.equal((await call("GET", `/admin/return-reasons/${parent.id}`)).status, 404)
    assert.equal((await call("GET", `/admin/return-reasons/${child.id}`)).json.return_reason.parent_return_reason_id, null, "children are detached")
    // the value is free again
    assert.equal((await call("POST", "/admin/return-reasons", { value, label: "again" })).status, 201)
    // the storefront list reads the same table
    const store = await api("GET", `/store/return-reasons?limit=100`)
    assert.ok(store.json.return_reasons.every((r: any) => typeof r.value === "string"))
  })

  it("refund reasons: stored in the database with a unique code", async () => {
    const code = tag("damaged")
    const made = await call("POST", "/admin/refund-reasons", { label: "Damaged", code, description: "Arrived broken" })
    assert.equal(made.status, 200)
    const r = made.json.refund_reason
    assert.equal(r.code, code)
    assert.ok(r.id.startsWith("refr_"))
    const stored = await pool.query(`SELECT code FROM refund_reason WHERE id=$1`, [r.id])
    assert.equal(stored.rows[0].code, code, "not process memory anymore")

    assert.equal((await call("POST", "/admin/refund-reasons", { label: "Other", code })).status, 409)
    assert.equal((await call("POST", "/admin/refund-reasons", { label: "", code: "x" })).status, 400)
    assert.equal((await call("POST", "/admin/refund-reasons", { label: "no code" })).status, 400)

    const upd = await call("POST", `/admin/refund-reasons/${r.id}`, { label: "Damaged in transit" })
    assert.equal(upd.json.refund_reason.label, "Damaged in transit")
    assert.equal(upd.json.refund_reason.code, code)
    assert.equal((await call("GET", `/admin/refund-reasons?q=${encodeURIComponent("in transit")}`)).json.refund_reasons.some((x: any) => x.id === r.id), true)
    assert.equal((await call("GET", `/admin/refund-reasons?code=${code}`)).json.count, 1)

    assert.deepEqual((await call("DELETE", `/admin/refund-reasons/${r.id}`)).json, { id: r.id, object: "refund_reason", deleted: true })
    assert.equal((await call("GET", `/admin/refund-reasons/${r.id}`)).status, 404)
    assert.equal((await call("POST", "/admin/refund-reasons", { label: "Damaged", code })).status, 200, "the code can be reused after a delete")
    assert.equal((await call("POST", "/admin/payments/pay_missing/refund", { refund_reason_id: "refr_nope" })).status, 404)
  })

  for (const kind of ["type", "tag"] as const) {
    it(`product ${kind}s: duplicates, reuse after delete, metadata and detach`, async () => {
      const path = `/admin/product-${kind}s`
      const key = `product_${kind}`
      const value = tag(kind)
      const made = await call("POST", path, { value, metadata: { color: "red" } })
      assert.equal(made.status, 201)
      const row = made.json[key]
      assert.deepEqual(row.metadata, { color: "red" })

      const dup = await call("POST", path, { value })
      assert.equal(dup.status, 409, "no silent upsert")
      assert.equal((await call("POST", path, { value: " " })).status, 400)

      const upd = await call("POST", `${path}/${row.id}`, { metadata: { color: "blue", size: "m" } })
      assert.deepEqual(upd.json[key].metadata, { color: "blue", size: "m" })
      assert.equal(upd.json[key].value, value)
      const other = (await call("POST", path, { value: tag(kind) })).json[key]
      assert.equal((await call("POST", `${path}/${other.id}`, { value })).status, 409)

      const list = await call("GET", `${path}?value=${value}&order=-updated_at`)
      assert.equal(list.json.count, 1)

      // a product that carries it is detached when the value is deleted
      const product = await call("POST", "/admin/products", { title: tag("P") })
      assert.equal(product.status, 201)
      const pid = product.json.product.id
      if (kind === "type") await pool.query(`UPDATE product SET type_id=$2 WHERE id=$1`, [pid, row.id])
      else await pool.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2)`, [pid, row.id])
      const filter = kind === "type" ? "type_id" : "tag_id"
      const carrying = await call("GET", `/admin/products?${filter}=${row.id}`)
      assert.deepEqual(carrying.json.products.map((p: any) => p.id), [pid])

      const del = await call("DELETE", `${path}/${row.id}`)
      assert.deepEqual(del.json, { id: row.id, object: key, deleted: true })
      assert.equal((await call("DELETE", `${path}/${row.id}`)).status, 404)
      assert.equal((await call("GET", `/admin/products?${filter}=${row.id}`)).json.count, 0)
      if (kind === "type") assert.equal((await pool.query(`SELECT type_id FROM product WHERE id=$1`, [pid])).rows[0].type_id, null)

      const again = await call("POST", path, { value })
      assert.equal(again.status, 201, "the value is free again")
      assert.equal((await call("GET", `${path}?value=${value}`)).json.count, 1)
    })
  }

  it("products can be filtered by several type ids at once", async () => {
    const a = (await call("POST", "/admin/product-types", { value: tag("ta") })).json.product_type
    const b = (await call("POST", "/admin/product-types", { value: tag("tb") })).json.product_type
    const p1 = (await call("POST", "/admin/products", { title: tag("A") })).json.product.id
    const p2 = (await call("POST", "/admin/products", { title: tag("B") })).json.product.id
    await pool.query(`UPDATE product SET type_id=$2 WHERE id=$1`, [p1, a.id])
    await pool.query(`UPDATE product SET type_id=$2 WHERE id=$1`, [p2, b.id])
    const both = await call("GET", `/admin/products?type_id[]=${a.id}&type_id[]=${b.id}`)
    assert.deepEqual(both.json.products.map((p: any) => p.id).sort(), [p1, p2].sort())
  })

  it("sales channels: add/remove products, default guard and link cleanup", async () => {
    const created = await call("POST", "/admin/sales-channels", { name: tag("Web"), description: "d", metadata: { a: 1 } })
    assert.equal(created.status, 201)
    const sc = created.json.sales_channel
    assert.deepEqual(sc.metadata, { a: 1 })
    assert.equal((await call("POST", "/admin/sales-channels", { name: "  " })).status, 400)

    const pid = (await call("POST", "/admin/products", { title: tag("SCP") })).json.product.id
    const add = await call("POST", `/admin/sales-channels/${sc.id}/products`, { add: [pid] })
    assert.equal(add.status, 200)
    assert.equal(add.json.sales_channel.id, sc.id)
    assert.equal((await call("GET", `/admin/products?sales_channel_id=${sc.id}`)).json.count, 1)
    assert.equal((await call("POST", `/admin/sales-channels/${sc.id}/products`, { add: ["prod_missing"] })).status, 404)
    assert.equal((await call("POST", `/admin/sales-channels/sc_missing/products`, { add: [pid] })).status, 404)
    await call("POST", `/admin/sales-channels/${sc.id}/products`, { remove: [pid] })
    assert.equal((await call("GET", `/admin/products?sales_channel_id=${sc.id}`)).json.count, 0)

    // the legacy body still works
    await call("POST", `/admin/sales-channels/${sc.id}/products`, { product_ids: [pid] })
    assert.equal((await call("GET", `/admin/products?sales_channel_id=${sc.id}`)).json.count, 1)

    // the store default cannot be deleted
    const storeId = (await pool.query(`INSERT INTO store (name, default_sales_channel_id) VALUES ($1,$2) RETURNING id`, [tag("store"), sc.id])).rows[0].id
    const refused = await call("DELETE", `/admin/sales-channels/${sc.id}`)
    assert.equal(refused.status, 400)
    assert.match(refused.json.message, /default sales channel/)
    await pool.query(`UPDATE store SET default_sales_channel_id=NULL WHERE id=$1`, [storeId])

    const key = (await call("POST", "/admin/api-keys", { title: tag("pk"), type: "publishable" })).json.api_key
    await call("POST", `/admin/api-keys/${key.id}/sales-channels`, { add: [sc.id] })
    const del = await call("DELETE", `/admin/sales-channels/${sc.id}`)
    assert.deepEqual(del.json, { id: sc.id, object: "sales-channel", deleted: true })
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS c FROM product_sales_channel WHERE sales_channel_id=$1`, [sc.id])).rows[0].c, 0)
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS c FROM api_key_sales_channel WHERE sales_channel_id=$1`, [sc.id])).rows[0].c, 0)
    assert.equal((await call("GET", `/admin/sales-channels/${sc.id}`)).status, 404)
  })

  it("api keys: sales channels use {add, remove} and only publishable keys take them", async () => {
    const channel = (await call("POST", "/admin/sales-channels", { name: tag("Keyed") })).json.sales_channel
    const pub = (await call("POST", "/admin/api-keys", { title: tag("pub"), type: "publishable" })).json.api_key
    const added = await call("POST", `/admin/api-keys/${pub.id}/sales-channels`, { add: [channel.id] })
    assert.equal(added.status, 200)
    assert.deepEqual(added.json.api_key.sales_channels.map((s: any) => s.id), [channel.id])
    const removed = await call("POST", `/admin/api-keys/${pub.id}/sales-channels`, { remove: [channel.id] })
    assert.deepEqual(removed.json.api_key.sales_channels, [])
    assert.equal((await call("POST", `/admin/api-keys/${pub.id}/sales-channels`, { add: ["sc_missing"] })).status, 404)

    const secret = (await call("POST", "/admin/api-keys", { title: tag("sec"), type: "secret" })).json.api_key
    assert.equal((await call("POST", `/admin/api-keys/${secret.id}/sales-channels`, { add: [channel.id] })).status, 400)
  })
})
