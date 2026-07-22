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
const mail = (s: string) => `${s}-${T}-${seq++}@example.com`

describe("users and invites parity", () => {
  const email = `users-admin-${T}@example.com`
  let token = ""
  const call = (method: string, path: string, body?: any) => api(method, path, body, token)

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "users-pass-1" })
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

  it("invites a user, refuses duplicates and existing users, and lists pending invites", async () => {
    const to = mail("invitee")
    const res = await call("POST", "/admin/invites", { email: to.toUpperCase() })
    assert.equal(res.status, 201)
    assert.equal(res.json.invite.email, to, "emails are normalised")
    assert.equal(res.json.invite.accepted, false)
    assert.ok(res.json.invite.token)

    const dup = await call("POST", "/admin/invites", { email: to })
    assert.equal(dup.status, 400)
    assert.match(dup.json.message, /already exists/)
    const existing = await call("POST", "/admin/invites", { email })
    assert.equal(existing.status, 400, "that person already has an account")
    assert.equal((await call("POST", "/admin/invites", { email: "not-an-email" })).status, 400)

    const list = await call("GET", `/admin/invites?q=${encodeURIComponent(to)}`)
    assert.equal(list.json.count, 1)
    assert.ok(list.json.invites[0].expires_at)
    assert.ok(list.json.invites[0].updated_at)
  })

  it("resends (new token), accepts and deletes invites", async () => {
    const to = mail("accept")
    const inv = (await call("POST", "/admin/invites", { email: to })).json.invite
    const look = await api("GET", `/admin/invites/lookup?token=${inv.token}`)
    assert.equal(look.json.invite.email, to, "the invite page learns the address from the token")
    assert.equal((await api("GET", "/admin/invites/lookup?token=nope")).status, 400)
    const resent = await call("POST", `/admin/invites/${inv.id}/resend`)
    assert.equal(resent.status, 200)
    assert.notEqual(resent.json.invite.token, inv.token, "resend rotates the token")
    assert.equal((await api("POST", `/admin/invites/accept?token=${inv.token}`, { email: to, password: "longenough1" })).status, 400, "the old token is dead")
    assert.equal((await api("POST", `/admin/invites/accept?token=${resent.json.invite.token}`, { email: mail("other"), password: "longenough1" })).status, 400, "wrong email")
    assert.equal((await api("POST", `/admin/invites/accept?token=${resent.json.invite.token}`, { email: to, password: "short" })).status, 400, "weak password")

    const accepted = await api("POST", `/admin/invites/accept?token=${resent.json.invite.token}`, { email: to, password: "longenough1", first_name: "Ada", last_name: "Lovelace" })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.json.user.first_name, "Ada")
    const login = await api("POST", "/auth/user/emailpass", { email: to, password: "longenough1" })
    assert.equal(login.status, 200, "the new user can sign in")
    const after = (await call("GET", `/admin/invites/${inv.id}`)).json.invite
    assert.equal(after.accepted, true)
    assert.equal((await call("POST", `/admin/invites/${inv.id}/resend`)).status, 400, "an accepted invite cannot be resent")
    assert.equal((await api("POST", `/admin/invites/accept?token=${resent.json.invite.token}`, { email: to, password: "longenough1" })).status, 400, "a token works once")

    const other = (await call("POST", "/admin/invites", { email: mail("revoke") })).json.invite
    assert.equal((await call("DELETE", `/admin/invites/${other.id}`)).status, 200)
    assert.equal((await call("GET", `/admin/invites/${other.id}`)).status, 404)
    assert.equal((await api("POST", `/admin/invites/accept?token=${other.token}`, { email: other.email, password: "longenough1" })).status, 400, "a deleted invite cannot be accepted")
  })

  it("edits and deletes users", async () => {
    const to = mail("editme")
    const inv = (await call("POST", "/admin/invites", { email: to })).json.invite
    const user = (await api("POST", `/admin/invites/accept?token=${inv.token}`, { email: to, password: "longenough1" })).json.user
    const upd = await call("POST", `/admin/users/${user.id}`, { first_name: "Grace", last_name: "Hopper" })
    assert.equal(upd.json.user.first_name, "Grace")
    const found = await call("GET", "/admin/users?q=Hopper")
    assert.ok(found.json.users.some((x: any) => x.id === user.id))
    const prov = await call("GET", `/admin/users/${user.id}/auth-providers`)
    assert.deepEqual(prov.json.providers, ["emailpass"])
    const reset = await call("POST", `/admin/users/${user.id}/reset-password`)
    assert.equal(reset.status, 200)
    assert.ok(reset.json.token)
    assert.equal((await call("DELETE", `/admin/users/${user.id}`)).status, 200)
    assert.equal((await call("GET", `/admin/users/${user.id}`)).status, 404)
    // the address can be invited again once the account is gone
    assert.equal((await call("POST", "/admin/invites", { email: to })).status, 201)
  })
})
