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

describe("api keys parity", () => {
  const email = `apikeys-${T}@example.com`
  let token = ""
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "apikeys-pass-1" })
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

  it("a secret key is shown once and stored hashed; a publishable key stays readable", async () => {
    const pub = (await call("POST", "/admin/api-keys", { title: tag("pub"), type: "publishable" })).json.api_key
    assert.match(pub.token, /^pk_[0-9a-f]{64}$/)
    assert.equal(pub.redacted, `pk_...${pub.token.slice(-4)}`)
    assert.deepEqual(pub.sales_channels, [])
    assert.equal((await call("GET", `/admin/api-keys/${pub.id}`)).json.api_key.token, pub.token)

    const made = await call("POST", "/admin/api-keys", { title: tag("sec"), type: "secret" })
    assert.equal(made.status, 201)
    const secret = made.json.api_key
    assert.match(secret.token, /^sk_[0-9a-f]{64}$/, "full token only on creation")
    const got = (await call("GET", `/admin/api-keys/${secret.id}`)).json.api_key
    assert.equal(got.token, `sk_...${secret.token.slice(-4)}`)
    assert.equal(got.redacted, got.token)
    assert.equal("sales_channels" in got, false, "only publishable keys have channels")
    const listed = (await call("GET", `/admin/api-keys?id=${secret.id}`)).json.api_keys[0]
    assert.equal(listed.token, got.token)
    const stored = await pool.query(`SELECT token FROM api_key WHERE id=$1`, [secret.id])
    assert.notEqual(stored.rows[0].token, secret.token)
    assert.match(stored.rows[0].token, /^[0-9a-f]{64}$/)

    assert.equal((await call("POST", "/admin/api-keys", { title: " ", type: "secret" })).status, 400)
    assert.equal((await call("POST", "/admin/api-keys", { title: "x", type: "other" })).status, 400)
  })

  it("rename, revoke (now or later) and delete", async () => {
    const key = (await call("POST", "/admin/api-keys", { title: tag("life"), type: "publishable" })).json.api_key
    const renamed = await call("POST", `/admin/api-keys/${key.id}`, { title: "Renamed key" })
    assert.equal(renamed.json.api_key.title, "Renamed key")
    assert.equal((await call("POST", `/admin/api-keys/${key.id}`, { title: " " })).status, 400)
    assert.equal(renamed.json.api_key.token, key.token, "renaming keeps the token")

    // scheduled revoke: still active until the time comes
    const later = await call("POST", `/admin/api-keys/${key.id}/revoke`, { revoke_in: 3600 })
    assert.equal(later.status, 200)
    assert.ok(new Date(later.json.api_key.revoked_at).getTime() > Date.now())
    assert.equal(later.json.api_key.revoked_by, email)
    assert.equal((await call("GET", `/admin/api-keys?id=${key.id}&revoked=false`)).json.count, 1)
    assert.equal((await call("GET", `/admin/api-keys?id=${key.id}&revoked=true`)).json.count, 0)

    const now = await call("POST", `/admin/api-keys/${key.id}/revoke`, {})
    assert.equal(now.status, 200)
    assert.ok(new Date(now.json.api_key.revoked_at).getTime() <= Date.now() + 1000)
    assert.equal((await call("GET", `/admin/api-keys?id=${key.id}&revoked=true`)).json.count, 1)
    assert.equal((await call("POST", `/admin/api-keys/${key.id}/revoke`, {})).status, 400, "already revoked")

    assert.deepEqual((await call("DELETE", `/admin/api-keys/${key.id}`)).json, { id: key.id, object: "api_key", deleted: true })
    assert.equal((await call("GET", `/admin/api-keys/${key.id}`)).status, 404)
    assert.equal((await call("DELETE", `/admin/api-keys/${key.id}`)).status, 404)
  })

  it("lists by type, title and order", async () => {
    const title = tag("Findable")
    const a = (await call("POST", "/admin/api-keys", { title, type: "publishable" })).json.api_key
    const b = (await call("POST", "/admin/api-keys", { title: `${title} secret`, type: "secret" })).json.api_key
    const both = await call("GET", `/admin/api-keys?q=${encodeURIComponent(title)}&order=-created_at`)
    assert.deepEqual(both.json.api_keys.map((k: any) => k.id), [b.id, a.id])
    const onlySecret = await call("GET", `/admin/api-keys?q=${encodeURIComponent(title)}&type=secret`)
    assert.deepEqual(onlySecret.json.api_keys.map((k: any) => k.id), [b.id])
    assert.equal((await call("GET", `/admin/api-keys?title=${encodeURIComponent(title)}&created_at[$gte]=2999-01-01`)).json.count, 0)
    const byTitle = await call("GET", `/admin/api-keys?q=${a.token.slice(0, 20)}`)
    assert.ok(byTitle.json.api_keys.some((k: any) => k.id === a.id), "a publishable token can be searched")
  })

  it("a publishable key scopes the storefront to its sales channels", async () => {
    const channel = (await call("POST", "/admin/sales-channels", { name: tag("Scoped") })).json.sales_channel
    const inChannel = (await call("POST", "/admin/products", { title: tag("In"), status: "published" })).json.product
    const outside = (await call("POST", "/admin/products", { title: tag("Out"), status: "published" })).json.product
    await call("POST", `/admin/sales-channels/${channel.id}/products`, { add: [inChannel.id] })
    const key = (await call("POST", "/admin/api-keys", { title: tag("store"), type: "publishable" })).json.api_key
    await call("POST", `/admin/api-keys/${key.id}/sales-channels`, { add: [channel.id] })

    const scoped = await api("GET", "/store/products?limit=100", undefined, undefined, { "x-publishable-api-key": key.token })
    assert.equal(scoped.status, 200)
    const ids = scoped.json.products.map((p: any) => p.id)
    assert.ok(ids.includes(inChannel.id))
    assert.ok(!ids.includes(outside.id), "products outside the key's channels are hidden")
    assert.equal((await api("GET", `/store/products/${outside.id}`, undefined, undefined, { "x-publishable-api-key": key.token })).status, 404)
    assert.equal((await api("GET", `/store/products/${inChannel.id}`, undefined, undefined, { "x-publishable-api-key": key.token })).status, 200)
    // without a key the storefront is not scoped
    const open = await api("GET", "/store/products?limit=100")
    assert.ok(open.json.products.some((p: any) => p.id === outside.id))

    const cart = await api("POST", "/store/carts", {}, undefined, { "x-publishable-api-key": key.token })
    assert.equal(cart.json.cart.sales_channel_id, channel.id, "a new cart lands in the key's channel")

    const used = await pool.query(`SELECT last_used_at FROM api_key WHERE id=$1`, [key.id])
    assert.ok(used.rows[0].last_used_at, "last use is recorded")

    assert.equal((await api("GET", "/store/products", undefined, undefined, { "x-publishable-api-key": "pk_unknown" })).status, 400)
    await call("POST", `/admin/api-keys/${key.id}/revoke`, {})
    assert.equal((await api("GET", "/store/products", undefined, undefined, { "x-publishable-api-key": key.token })).status, 400, "revoked keys are refused")
  })
})
