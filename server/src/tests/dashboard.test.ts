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

describe("dashboard", () => {
  const email = `dash-${T}@example.com`
  let token = ""
  const cur = `d${String(T).slice(-2)}`
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)
  const orderIds: string[] = []

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "dash-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
  })

  after(async () => {
    if (orderIds.length) await pool.query(`UPDATE "order" SET deleted_at = NOW() WHERE id = ANY($1)`, [orderIds])
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  async function order(total: number, ageDays: number, status = "pending") {
    const { rows } = await pool.query(
      `INSERT INTO "order" (email, currency_code, status, total, subtotal, created_at) VALUES ($1,$2,$3,$4,$4, NOW() - ($5 || ' days')::interval) RETURNING id`,
      [`dash-${T}-${seq++}@example.com`, cur, status, total, String(ageDays)]
    )
    orderIds.push(rows[0].id)
    return rows[0].id as string
  }

  it("sums the period, compares it with the one before and ignores canceled orders", async () => {
    await order(10000, 1)
    await order(5000, 3)
    await order(99999, 2, "canceled")
    await order(3000, 40) // the 30 days before this period (days 30-60)

    const d = await call("GET", `/admin/dashboard?days=30&currency=${cur}`)
    assert.equal(d.status, 200)
    assert.equal(d.json.currency, cur)
    assert.equal(d.json.kpis.revenue.value, 15000)
    assert.equal(d.json.kpis.orders.value, 2)
    assert.equal(d.json.kpis.aov.value, 7500)
    assert.equal(d.json.kpis.revenue.previous, 3000)
    assert.equal(d.json.kpis.revenue.change, 400)
    assert.equal(d.json.series.length, 30)
    assert.equal(d.json.series.reduce((n: number, s: any) => n + s.revenue, 0), 15000)
    assert.ok(d.json.currencies.includes(cur))
    assert.ok(d.json.recent_orders.length > 0)
    for (const key of ["awaiting_payment", "to_fulfill", "open_returns", "draft_orders", "low_stock", "draft_products"]) assert.equal(typeof d.json.attention[key], "number", key)

    assert.equal(d.json.weekdays.length, 7)
    assert.equal(d.json.weekdays.reduce((n: number, w: any) => n + w.orders, 0), 2)
    assert.equal(d.json.payment_breakdown.reduce((n: number, p: any) => n + p.count, 0), 2)
    assert.equal(d.json.fulfillment_breakdown.reduce((n: number, p: any) => n + p.count, 0), 2)
    assert.ok(d.json.carts.conversion_rate >= 0 && d.json.carts.conversion_rate <= 100)
    assert.ok(d.json.customers.repeat_rate >= 0)
    assert.equal(typeof d.json.discounts.total, "number")
    assert.ok(Array.isArray(d.json.low_stock_items) && Array.isArray(d.json.countries))

    // a shorter window leaves out what is older
    const week = await call("GET", `/admin/dashboard?days=7&currency=${cur}`)
    assert.equal(week.json.series.length, 7)
    assert.equal(week.json.kpis.revenue.value, 15000)
    const odd = await call("GET", `/admin/dashboard?days=5&currency=${cur}`)
    assert.equal(odd.json.days, 30, "an unsupported range falls back to 30 days")
  })
})
