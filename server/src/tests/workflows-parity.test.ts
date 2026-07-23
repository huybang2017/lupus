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

describe("workflow executions parity", () => {
  const email = `workflows-${T}@example.com`
  let token = ""
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "workflows-pass-1" })
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

  it("lists executions in Lupus's shape with state, transaction id and steps", async () => {
    const wf = tag("create-thing")
    const run = await call("POST", `/admin/workflows-executions/${wf}/run`, { transaction_id: tag("trx"), input: { a: 1 } })
    assert.equal(run.status, 200)
    const trx = run.json.acknowledgement.transaction_id

    const list = await call("GET", `/admin/workflows-executions?workflow_id=${wf}`)
    assert.equal(list.json.count, 1)
    const ex = list.json.workflow_executions[0]
    assert.equal(ex.workflow_id, wf)
    assert.equal(ex.transaction_id, trx)
    assert.equal(ex.state, "done")
    assert.ok(ex.execution.steps._root)
    assert.deepEqual(ex.context.data.payload, { a: 1 })

    const byId = await call("GET", `/admin/workflows-executions/${ex.id}`)
    assert.equal(byId.json.workflow_execution.transaction_id, trx, "retrieve and list share one shape")
    const byTrx = await call("GET", `/admin/workflows-executions/${wf}/${trx}`)
    assert.equal(byTrx.json.workflow_execution.id, ex.id)
    assert.equal((await call("GET", `/admin/workflows-executions/wfe_missing`)).status, 404)
  })

  it("filters by transaction id, state, search text and date, and orders", async () => {
    const wf = tag("filtered")
    const t1 = tag("trx")
    const t2 = tag("trx")
    await call("POST", `/admin/workflows-executions/${wf}/run`, { transaction_id: t1 })
    await call("POST", `/admin/workflows-executions/${wf}/run`, { transaction_id: t2 })
    await pool.query(`UPDATE workflow_execution SET status = 'failed', error = 'boom' WHERE transaction_id = $1`, [t2])

    assert.deepEqual((await call("GET", `/admin/workflows-executions?transaction_id=${t1}`)).json.workflow_executions.map((e: any) => e.transaction_id), [t1])
    const failed = await call("GET", `/admin/workflows-executions?workflow_id=${wf}&state=failed`)
    assert.deepEqual(failed.json.workflow_executions.map((e: any) => e.transaction_id), [t2])
    assert.equal(failed.json.workflow_executions[0].state, "failed")
    assert.equal(failed.json.workflow_executions[0].context.errors.length, 1)
    const both = await call("GET", `/admin/workflows-executions?workflow_id=${wf}&state[]=done&state[]=failed&order=created_at`)
    assert.deepEqual(both.json.workflow_executions.map((e: any) => e.transaction_id), [t1, t2])
    assert.equal((await call("GET", `/admin/workflows-executions?q=${encodeURIComponent(wf.slice(0, 12))}`)).json.count >= 2, true)
    assert.equal((await call("GET", `/admin/workflows-executions?workflow_id=${wf}&created_at[$gte]=2999-01-01`)).json.count, 0)
  })
})
