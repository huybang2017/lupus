import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"

// P12/P16 admin gaps: inventory attributes, campaign identifier, price-list
// description/status + update endpoints, promotion campaign/status, store stats.
// Exercises the exact HTTP contracts the admin create wizards rely on.
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

describe("admin create gaps (wizards)", () => {
  const email = `gaps-${T}@example.com`
  let token = ""

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "gaps-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    // Grant admin role like `lupus user` would (first-admin bootstrap may
    // already be consumed on the shared test DB).
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("inventory create accepts full attributes + levels, update edits them", async () => {
    const loc = await api("POST", "/admin/stock-locations", { name: `Loc ${T}` }, token)
    assert.equal(loc.status, 201)
    const created = await api("POST", "/admin/inventory-items", {
      sku: `SKU-${T}`, title: `Widget ${T}`, description: "A widget",
      weight: 1.5, length: 10, height: 5, width: 4, mid_code: "MID1", material: "cotton",
      origin_country: "us", hs_code: "1234", requires_shipping: true,
      levels: [{ location_id: loc.json.stock_location.id, stocked_quantity: 7 }],
    }, token)
    assert.equal(created.status, 201)
    const item = created.json.inventory_item
    assert.equal(item.title, `Widget ${T}`)
    assert.equal(Number(item.weight), 1.5)
    assert.equal(item.material, "cotton")
    const upd = await api("POST", `/admin/inventory-items/${item.id}`, { title: `Widget2 ${T}`, requires_shipping: false }, token)
    assert.equal(upd.status, 200)
    assert.equal(upd.json.inventory_item.title, `Widget2 ${T}`)
    assert.equal(upd.json.inventory_item.requires_shipping, false)
  })

  it("category rank roundtrip (organize page contract)", async () => {
    const a = await api("POST", "/admin/product-categories", { name: `RankA ${T}` }, token)
    assert.equal(a.status, 201)
    const b = await api("POST", "/admin/product-categories", { name: `RankB ${T}` }, token)
    assert.equal(b.status, 201)
    const setRank = await api("POST", `/admin/product-categories/${b.json.product_category.id}`, { rank: 0 }, token)
    assert.equal(setRank.status, 200)
    await api("POST", `/admin/product-categories/${a.json.product_category.id}`, { rank: 5 }, token)
    const list = await api("GET", "/admin/product-categories", undefined, token)
    assert.ok(Array.isArray(list.json.product_categories))
    assert.equal(typeof list.json.count, "number")
    const ids = list.json.product_categories.map((c: any) => c.id)
    assert.ok(ids.indexOf(b.json.product_category.id) < ids.indexOf(a.json.product_category.id))
  })

  it("campaign create accepts identifier + budget, update edits name", async () => {
    const created = await api("POST", "/admin/campaigns", {
      name: `Camp ${T}`, identifier: `camp-${T}`, description: "d",
      budget_limit: 5000, currency_code: "usd",
    }, token)
    assert.equal(created.status, 201)
    assert.equal(created.json.campaign.identifier, `camp-${T}`)
    const upd = await api("POST", `/admin/campaigns/${created.json.campaign.id}`, { name: `Camp2 ${T}` }, token)
    assert.equal(upd.status, 200)
    assert.equal(upd.json.campaign.name, `Camp2 ${T}`)
  })

  it("price-list create accepts description/status, update edits status", async () => {
    const created = await api("POST", "/admin/price-lists", {
      title: `PL ${T}`, type: "sale", description: "season sale", status: "draft", prices: [],
    }, token)
    assert.equal(created.status, 201)
    const id = created.json.price_list_id
    assert.ok(id)
    const upd = await api("POST", `/admin/price-lists/${id}`, { status: "active" }, token)
    assert.equal(upd.status, 200)
    assert.equal(upd.json.price_list.status, "active")
    assert.equal(upd.json.price_list.description, "season sale")
  })

  it("promotion create accepts status + campaign link", async () => {
    const camp = await api("POST", "/admin/campaigns", { name: `Link ${T}` }, token)
    assert.equal(camp.status, 201)
    const created = await api("POST", "/admin/promotions", {
      code: `GAP-${T}`, status: "draft", campaign_id: camp.json.campaign.id,
      application_type: "percentage", application_target: "order", application_value: 10,
    }, token)
    assert.equal(created.status, 201)
    assert.equal(created.json.promotion.status, "draft")
    assert.equal(created.json.promotion.campaign_id, camp.json.campaign.id)
  })

  it("store stats returns dashboard totals", async () => {
    const r = await api("GET", "/admin/store/stats", undefined, token)
    assert.equal(r.status, 200)
    for (const k of ["total_orders", "total_products", "total_customers", "total_revenue"]) {
      assert.equal(typeof r.json[k], "number", k)
    }
  })

  it("sales channel create with disabled flag + products add/remove", async () => {
    const created = await api("POST", "/admin/sales-channels", { name: `SC ${T}`, description: "d", is_disabled: true }, token)
    assert.equal(created.status, 201)
    assert.equal(created.json.sales_channel.is_disabled, true)
    const scId = created.json.sales_channel.id
    const prod = await pool.query(`SELECT id FROM product WHERE deleted_at IS NULL LIMIT 1`)
    if (prod.rows[0]) {
      const pid = prod.rows[0].id
      const add = await api("POST", `/admin/sales-channels/${scId}/products`, { product_ids: [pid] }, token)
      assert.equal(add.status, 200)
      const got = await api("GET", `/admin/sales-channels/${scId}`, undefined, token)
      assert.ok(got.json.sales_channel.products.some((p: any) => p.id === pid))
      const rm = await api("POST", `/admin/sales-channels/${scId}/products/remove`, { product_ids: [pid] }, token)
      assert.equal(rm.status, 200)
      assert.ok(!rm.json.sales_channel.products.some((p: any) => p.id === pid))
    }
    const upd = await api("POST", `/admin/sales-channels/${scId}`, { is_disabled: false }, token)
    assert.equal(upd.json.sales_channel.is_disabled, false)
  })

  it("invite create + role with policies + user role assign/remove", async () => {
    const inv = await api("POST", "/admin/invites", { email: `new-${T}@example.com` }, token)
    assert.equal(inv.status, 201)
    assert.ok(inv.json.invite.token)
    const pol = await api("POST", "/admin/rbac/policies", { name: `pol-${T}`, description: "d" }, token)
    assert.equal(pol.status, 201)
    const role = await api("POST", "/admin/rbac/roles", { name: `role-${T}`, policies: [pol.json.policy.name] }, token)
    assert.equal(role.status, 201)
    const me = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    const assign = await api("POST", `/admin/users/${me.rows[0].id}/roles`, { roles: [role.json.role.id] }, token)
    assert.equal(assign.status, 200)
    assert.ok(assign.json.roles.some((r: any) => r.id === role.json.role.id))
    const unassign = await api("DELETE", `/admin/users/${me.rows[0].id}/roles/${role.json.role.id}`, undefined, token)
    assert.equal(unassign.status, 200)
  })

  it("payment collection create from order", async () => {
    const order = await pool.query(`SELECT id, total FROM "order" WHERE deleted_at IS NULL LIMIT 1`)
    if (!order.rows[0]) {
      assert.ok(true, "no orders to test with")
      return
    }
    const created = await api("POST", "/admin/payment-collections", { order_id: order.rows[0].id }, token)
    assert.ok(created.status === 200 || created.status === 201)
    assert.ok(created.json.payment_collection?.id)
  })

  it("product sales channels listing", async () => {    const prod = await pool.query(`SELECT id FROM product WHERE deleted_at IS NULL LIMIT 1`)
    if (!prod.rows[0]) {
      assert.ok(true, "no products to test with")
      return
    }
    const r = await api("GET", `/admin/products/${prod.rows[0].id}/sales-channels`, undefined, token)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.json.sales_channels))
    assert.equal(typeof r.json.count, "number")
  })

  it("taxonomy lists return envelopes with search", async () => {
    for (const [path, key] of [["/admin/collections", "collections"], ["/admin/product-tags", "product_tags"], ["/admin/product-types", "product_types"]] as const) {
      const r = await api("GET", `${path}?limit=5&offset=0`, undefined, token)
      assert.equal(r.status, 200)
      assert.ok(Array.isArray(r.json[key]), path)
      assert.equal(typeof r.json.count, "number", path)
      const q = await api("GET", `${path}?q=zzz-no-match-zzz`, undefined, token)
      assert.equal(q.status, 200)
      assert.deepEqual(q.json[key], [])
    }
  })
})
