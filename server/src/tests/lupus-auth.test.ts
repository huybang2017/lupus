import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { authService } from "../modules/auth/auth.service"
import { mfaService, totpNow } from "../modules/auth/mfa.service"
import { buildApp } from "../app"

// Lupus-compat auth surface: providers, emailpass login/register, refresh, session,
// users/me, reset-password + update, MFA lifecycle, verification, invite accept.
// Exercises services directly + key HTTP paths via the Express app.
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

describe("lupus-compat auth", () => {
  const email = `admin-${T}@example.com`
  const password = "supersecret-1"
  let userToken = ""
  let adminUserId = ""

  before(async () => {
    await migrate()
    // isolate from automatic promotions created by other suites
    await pool.query("UPDATE promotion SET status='draft' WHERE is_automatic=TRUE").catch(() => undefined)
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("lists emailpass provider for user actor", async () => {
    const r = await api("GET", "/auth/user/providers")
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.json.providers))
    assert.ok(r.json.providers.some((p: any) => p.id === "emailpass"))
  })

  it("registers an admin user and reads users/me", async () => {
    const r = await api("POST", "/auth/user/emailpass/register", { email, password, first_name: "Root", last_name: "Admin" })
    assert.equal(r.status, 200)
    assert.ok(typeof r.json.token === "string")
    userToken = r.json.token
    const me = await api("GET", "/admin/users/me", undefined, userToken)
    assert.equal(me.status, 200)
    assert.equal(me.json.user.email, email)
    assert.equal(me.json.user.first_name, "Root")
    adminUserId = me.json.user.id
    assert.ok(adminUserId.startsWith("user_"))
  })

  it("logs in with emailpass and refreshes the token", async () => {
    const r = await api("POST", "/auth/user/emailpass", { email, password })
    assert.equal(r.status, 200)
    assert.ok(typeof r.json.token === "string")
    const refreshed = await api("POST", "/auth/token/refresh", undefined, r.json.token)
    assert.equal(refreshed.status, 200)
    assert.ok(typeof refreshed.json.token === "string")
    assert.notEqual(refreshed.json.token, r.json.token)
  })

  it("rejects bad passwords and unknown users/me", async () => {
    const bad = await api("POST", "/auth/user/emailpass", { email, password: "wrong-password-9" })
    assert.equal(bad.status, 401)
    const me = await api("GET", "/admin/users/me")
    assert.equal(me.status, 401)
  })

  it("reset-password request is 201 and update rotates the password", async () => {
    const req = await api("POST", "/auth/user/emailpass/reset-password", { identifier: email })
    assert.equal(req.status, 201)
    const row = await pool.query(`SELECT token FROM password_reset_token ORDER BY created_at DESC LIMIT 1`)
    assert.ok(row.rows[0]?.token)
    const upd = await api("POST", "/auth/user/emailpass/update", { password: "rotated-pass-2" }, row.rows[0].token)
    assert.equal(upd.status, 200)
    assert.equal(upd.json.success, true)
    const login = await api("POST", "/auth/user/emailpass", { email, password: "rotated-pass-2" })
    assert.equal(login.status, 200)
    userToken = login.json.token
  })

  it("MFA: start -> verify -> login challenges -> verify challenge", async () => {
    const started = await api("POST", "/auth/mfa/factors", { provider: "totp", label: "test-app" }, userToken)
    assert.equal(started.status, 200)
    assert.ok(started.json.mfa_factor?.id)
    assert.ok(started.json.secret)
    assert.ok(started.json.otpauth_url?.startsWith("otpauth://"))
    const factorId = started.json.mfa_factor.id

    const listed = await api("GET", "/auth/mfa/factors", undefined, userToken)
    assert.equal(listed.status, 200)
    assert.ok(listed.json.mfa_factors.some((f: any) => f.id === factorId))

    const code = totpNow(started.json.secret)
    const verified = await api("POST", `/auth/mfa/factors/${factorId}/verify`, { code }, userToken)
    assert.equal(verified.status, 200)
    assert.equal(verified.json.mfa_factor.status, "enabled")

    const codes = await api("POST", "/auth/mfa/recovery-codes", {}, userToken)
    assert.equal(codes.status, 200)
    assert.ok(Array.isArray(codes.json.recovery_codes) && codes.json.recovery_codes.length >= 1)

    // login now returns an MFA challenge instead of a session token
    const login = await api("POST", "/auth/user/emailpass", { email, password: "rotated-pass-2" })
    assert.equal(login.status, 200)
    assert.equal(login.json.mfa_required, true)
    assert.ok(login.json.mfa_challenge?.id)

    const badChallenge = await api("POST", `/auth/mfa/challenges/${login.json.mfa_challenge.id}/verify`, { method: "totp", code: "000000" }, login.json.token)
    assert.equal(badChallenge.status, 401)

    const goodCode = totpNow(started.json.secret)
    const done = await api("POST", `/auth/mfa/challenges/${login.json.mfa_challenge.id}/verify`, { method: "totp", code: goodCode }, login.json.token)
    assert.equal(done.status, 200)
    assert.ok(typeof done.json.token === "string")

    // recovery code path consumes a single-use code
    const login2 = await api("POST", "/auth/user/emailpass", { email, password: "rotated-pass-2" })
    const rc = await api(
      "POST",
      `/auth/mfa/challenges/${login2.json.mfa_challenge.id}/verify`,
      { method: "recovery_code", code: codes.json.recovery_codes[0] },
      login2.json.token
    )
    assert.equal(rc.status, 200)

    // turning the factor off needs a valid code, not just a session
    const refused = await api("DELETE", `/auth/mfa/factors/${factorId}`, undefined, userToken)
    assert.equal(refused.status, 401)
    assert.equal((await api("DELETE", `/auth/mfa/factors/${factorId}`, { code: "000000" }, userToken)).status, 401)
    const disabled = await api("DELETE", `/auth/mfa/factors/${factorId}`, { code: totpNow(started.json.secret) }, userToken)
    assert.equal(disabled.status, 200)
    assert.equal(disabled.json.mfa_factor.status, "disabled")
  })

  it("verification request/confirm roundtrip", async () => {
    const payload = authService.verifyToken(userToken)
    const { code } = await mfaService.requestVerification(payload.actor_id)
    await assert.rejects(mfaService.confirmVerification(payload.actor_id, "000000"))
    await mfaService.confirmVerification(payload.actor_id, code)
  })

  it("session establish/delete are harmless in jwt mode", async () => {
    const s = await api("POST", "/auth/session", undefined, userToken)
    assert.equal(s.status, 200)
    const d = await api("DELETE", "/auth/session")
    assert.equal(d.status, 200)
    assert.equal(d.json.success, true)
  })

  it("invite accept via Lupus path links admin user", async () => {
    const invEmail = `inv-${T}@example.com`
    const inv = await pool.query(`INSERT INTO invite (email) VALUES ($1) RETURNING token`, [invEmail])
    const token = inv.rows[0].token as string
    const r = await api("POST", `/admin/invites/accept?token=${token}`, { email: invEmail, password: "invite-pass-3" })
    assert.equal(r.status, 200)
    assert.equal(r.json.user.email, invEmail)
    const login = await api("POST", "/auth/user/emailpass", { email: invEmail, password: "invite-pass-3" })
    assert.equal(login.status, 200)
  })

  it("customer tokens cannot pass admin policy checks", async () => {
    const reg = await api("POST", "/auth/register", { email: `cust-${T}@example.com`, password: "customer-pass-4" })
    assert.equal(reg.status, 201)
    const denied = await api("POST", "/admin/customers", { email: `x-${T}@example.com` }, reg.json.token)
    assert.equal(denied.status, 403)
  })
})
