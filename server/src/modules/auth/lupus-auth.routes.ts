import bcrypt from "bcryptjs"
import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { oauthGitHub, oauthGoogle } from "../providers/external-providers"
import { authService } from "./auth.service"
import { mfaService } from "./mfa.service"

// Lupus-compatible auth surface for the real dashboard (upstream/src/api/auth/*).
// The dashboard's js-sdk calls these exact paths: /auth/:actor/:provider (login),
// /auth/:actor/providers, /auth/token/refresh, /auth/session, /auth/mfa/*,
// /auth/verification/* and GET /admin/users/me. JWT mode ("jwt" auth type) is used:
// tokens ride as Bearer headers, no cookies. emailpass is the implemented provider;
// redirect-flow providers answer 400 with a clear message.

export const lupusAuthRouter = Router()

function unauthorized(message: string, statusCode: number = 401) {
  return Object.assign(new Error(message), { statusCode })
}

lupusAuthRouter.get("/auth/:actor_type/providers", async (req, res, next) => {
  try {
    const actor = req.params.actor_type
    if (actor !== "user" && actor !== "customer") {
      throw unauthorized(`Unknown actor type: ${actor}`, 404)
    }
    res.json({
      providers: [
        { id: "emailpass", identifier: "emailpass", display_name: "Email / Password", flow: "direct" },
      ],
    })
  } catch (e) {
    next(e)
  }
})

async function emailpassLogin(actorType: string, email: string, password: string) {
  const normalized = email.toLowerCase().trim()
  const { rows } = await pool.query(
    `SELECT * FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL`,
    [normalized]
  )
  const identity = rows[0]
  if (!identity?.password_hash || !(await bcrypt.compare(password, identity.password_hash))) {
    throw unauthorized("Invalid email or password")
  }
  const authIdentityId = identity.auth_identity_id as string
  const factors = await mfaService.enabledFactors(authIdentityId)
  if (factors.length > 0) {
    const challenge = await mfaService.createChallenge(authIdentityId, "emailpass")
    const token = authService.challengeToken(authIdentityId, "emailpass", normalized, challenge.id, actorType)
    return {
      token,
      mfa_required: true as const,
      mfa_challenge: { id: challenge.id, methods: challenge.methods },
    }
  }
  const { token } = await authService.createSessionToken(authIdentityId, "emailpass", normalized, actorType)
  return { token }
}

async function handleAuthActorProvider(req: any, res: any, next: any) {
  try {
    const { actor_type, auth_provider } = req.params
    if (auth_provider !== "emailpass") {
      throw unauthorized(`Auth provider '${auth_provider}' is not configured (redirect flow not supported)`, 400)
    }
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body ?? {})
    res.json(await emailpassLogin(actor_type, email, password))
  } catch (e) {
    next(e)
  }
}

// NOTE: the generic login routes for /auth/:actor_type/:auth_provider are registered
// at the END of this file, after all specific /auth/* routes. Express matches in
// registration order, so registering them here would shadow e.g. POST /auth/mfa/factors
// (:actor_type=mfa) or POST /auth/token/refresh (:actor_type=token).

lupusAuthRouter.post("/auth/:actor_type/:auth_provider/register", async (req, res, next) => {
  try {
    const { actor_type } = req.params
    if (req.params.auth_provider !== "emailpass") {
      throw unauthorized(`Auth provider '${req.params.auth_provider}' is not configured`, 400)
    }
    const { email, password, first_name, last_name } = z
      .object({ email: z.string().email(), password: z.string().min(8), first_name: z.string().optional(), last_name: z.string().optional() })
      .parse(req.body)
    const normalized = email.toLowerCase().trim()
    const existing = await pool.query(
      `SELECT id FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL`,
      [normalized]
    )
    if (existing.rows.length > 0) {
      throw Object.assign(new Error("Email already registered"), { statusCode: 409 })
    }
    const hash = await bcrypt.hash(password, 10)
    const client = await pool.connect()
    let authIdentityId = ""
    try {
      await client.query("BEGIN")
      const ai = await client.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
      authIdentityId = ai.rows[0].id
      await client.query(`INSERT INTO provider_identity (auth_identity_id, entity_id, provider, password_hash) VALUES ($1,$2,'emailpass',$3)`, [authIdentityId, normalized, hash])
      if (actor_type === "user") {
        const u = await client.query(
          `INSERT INTO admin_user (email, first_name, last_name) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET first_name=$2, last_name=$3 RETURNING *`,
          [normalized, first_name ?? null, last_name ?? null]
        )
        await client.query(`INSERT INTO admin_user_auth (admin_user_id, auth_identity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, authIdentityId])
      } else {
        // a guest customer record (checkout without an account) is claimed by the new account; the
        // unique index is (email, has_account), so there is no plain ON CONFLICT (email) target
        const claimed = await client.query(
          `UPDATE customer SET has_account=TRUE, first_name=COALESCE(first_name,$2), last_name=COALESCE(last_name,$3), updated_at=NOW()
           WHERE id = (SELECT id FROM customer WHERE email=$1 AND deleted_at IS NULL AND has_account=FALSE ORDER BY created_at LIMIT 1)`,
          [normalized, first_name ?? null, last_name ?? null]
        )
        if ((claimed.rowCount ?? 0) === 0) {
          await client.query(
            `INSERT INTO customer (email, first_name, last_name, has_account) VALUES ($1,$2,$3,TRUE)
             ON CONFLICT (email, has_account) WHERE deleted_at IS NULL DO UPDATE SET first_name=COALESCE(customer.first_name,$2), last_name=COALESCE(customer.last_name,$3)`,
            [normalized, first_name ?? null, last_name ?? null]
          )
        }
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    // Bootstrap: the very first admin user becomes super-admin (role 'admin'),
    // otherwise a fresh install could never pass requirePolicy checks.
    const adminCount = await pool.query(`SELECT COUNT(*)::int AS c FROM admin_user WHERE deleted_at IS NULL`)
    if (Number(adminCount.rows[0]?.c ?? 0) === 1) {
      const role = await pool.query(
        `INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`
      )
      const adminUser = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [normalized])
      if (adminUser.rows[0]) {
        await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [adminUser.rows[0].id, role.rows[0].id])
      }
    }
    const { token } = await authService.createSessionToken(authIdentityId, "emailpass", normalized, actor_type)
    res.json({ token })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/:actor_type/:auth_provider/reset-password", async (req, res, next) => {
  try {
    const { identifier } = z.object({ identifier: z.string().email() }).parse(req.body)
    const out = await authService.requestPasswordReset(identifier)
    if ((out as any).token) {
      await pool.query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','password-reset',$2,'sent')`, [
        identifier.toLowerCase().trim(),
        JSON.stringify({ token: (out as any).token }),
      ]).catch(() => undefined)
    }
    res.sendStatus(201)
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/:actor_type/:auth_provider/update", async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      throw unauthorized("Missing bearer token")
    }
    const raw = header.slice(7)
    const { password } = z.object({ password: z.string().min(8) }).parse(req.body)
    let providerIdentityId: string | null = null
    try {
      const payload = authService.verifyToken(raw)
      const row = await pool.query(
        `SELECT id FROM provider_identity WHERE auth_identity_id=$1 AND provider='emailpass' AND deleted_at IS NULL LIMIT 1`,
        [payload.actor_id]
      )
      providerIdentityId = row.rows[0]?.id ?? null
    } catch {
      const row = await pool.query(`SELECT * FROM password_reset_token WHERE token=$1`, [raw])
      const t = row.rows[0]
      if (!t || t.consumed || new Date(t.expires_at) < new Date()) {
        throw unauthorized("Reset token invalid or expired", 400)
      }
      providerIdentityId = t.provider_identity_id
      await pool.query(`UPDATE password_reset_token SET consumed=TRUE WHERE id=$1`, [t.id])
    }
    if (!providerIdentityId) {
      throw unauthorized("No emailpass identity for this token", 400)
    }
    const hash = await bcrypt.hash(password, 10)
    await pool.query(`UPDATE provider_identity SET password_hash=$2 WHERE id=$1`, [providerIdentityId, hash])
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/token/refresh", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const payload = req.auth!
    if (payload.mfa_pending) {
      throw unauthorized("Complete the MFA challenge before refreshing the token")
    }
    const { token } = await authService.createSessionToken(payload.actor_id, payload.provider, payload.email, payload.actor_type)
    res.json({ token })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/session", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ user: req.auth })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.delete("/auth/session", async (_req, res, next) => {
  try {
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

// ---- MFA (upstream/src/api/auth/mfa/*) ----

lupusAuthRouter.get("/auth/mfa/factors", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ mfa_factors: await mfaService.listFactors(req.auth!.actor_id) })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/mfa/factors", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { provider, label, issuer } = z
      .object({ provider: z.string(), label: z.string().nullish(), issuer: z.string().optional(), metadata: z.record(z.any()).nullish() })
      .parse(req.body)
    res.json(await mfaService.startFactor(req.auth!.actor_id, provider, label, issuer))
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/mfa/factors/:id/verify", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body)
    const factor = await mfaService.verifyFactor(req.auth!.actor_id, req.params.id, code)
    res.json({ mfa_factor: factor })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.delete("/auth/mfa/factors/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = z.object({ code: z.string().optional() }).parse(req.body ?? {})
    const factor = await mfaService.disableFactor(req.auth!.actor_id, req.params.id, code)
    res.json({ mfa_factor: factor })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/mfa/recovery-codes", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { count } = z.object({ count: z.number().int().min(1).max(20).optional() }).parse(req.body ?? {})
    const codes = await mfaService.generateRecoveryCodes(req.auth!.actor_id, count ?? 10)
    res.json({ recovery_codes: codes })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/mfa/challenges/:id/verify", async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      throw unauthorized("Missing bearer token")
    }
    const payload = authService.verifyToken(header.slice(7))
    if (!payload.mfa_pending || !payload.challenge_id || payload.challenge_id !== req.params.id) {
      throw unauthorized("Token does not carry this MFA challenge")
    }
    const { method, code } = z.object({ method: z.string(), code: z.string() }).parse(req.body)
    await mfaService.verifyChallenge(payload.actor_id, req.params.id, method, code)
    const { token } = await authService.createSessionToken(payload.actor_id, payload.provider, payload.email, payload.actor_type)
    res.json({ token })
  } catch (e) {
    next(e)
  }
})

// ---- Email verification (upstream/src/api/auth/verification/*) ----

lupusAuthRouter.post("/auth/verification/request", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = await mfaService.requestVerification(req.auth!.actor_id)
    await pool.query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','verification',$2,'sent')`, [
      req.auth!.email,
      JSON.stringify({ code }),
    ]).catch(() => undefined)
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/auth/verification/confirm", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body)
    await mfaService.confirmVerification(req.auth!.actor_id, code)
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

// ---- Admin identity (dashboard ProtectedRoute -> GET /admin/users/me) ----

lupusAuthRouter.get("/admin/users/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const auth = req.auth!
    let user: any = null
    const linked = await pool.query(
      `SELECT u.* FROM admin_user u JOIN admin_user_auth a ON a.admin_user_id=u.id WHERE a.auth_identity_id=$1 AND u.deleted_at IS NULL LIMIT 1`,
      [auth.actor_id]
    )
    if (linked.rows[0]) {
      user = linked.rows[0]
    } else {
      const byEmail = await pool.query(`SELECT * FROM admin_user WHERE email=$1 AND deleted_at IS NULL LIMIT 1`, [auth.email])
      user = byEmail.rows[0] ?? null
    }
    if (!user) {
      throw Object.assign(new Error(`User with id: ${auth.actor_id} was not found`), { statusCode: 404 })
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        avatar_url: user.avatar_url ?? null,
        metadata: user.metadata ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        deleted_at: user.deleted_at ?? null,
      },
    })
  } catch (e) {
    next(e)
  }
})

// ---- Lupus-shaped invite accept (sdk.admin.invite.accept -> POST /admin/invites/accept?token=) ----

// The invite link page needs to know which address it is for before the account is created.
lupusAuthRouter.get("/admin/invites/lookup", async (req, res, next) => {
  try {
    const token = String(req.query.token ?? "")
    const inv = await pool.query(`SELECT email, accepted, expires_at FROM invite WHERE token=$1 AND deleted_at IS NULL`, [token])
    if (!inv.rows[0] || inv.rows[0].accepted || new Date(inv.rows[0].expires_at) < new Date()) {
      throw Object.assign(new Error("The invite is invalid or has expired."), { statusCode: 400 })
    }
    res.json({ invite: { email: inv.rows[0].email } })
  } catch (e) {
    next(e)
  }
})

lupusAuthRouter.post("/admin/invites/accept", async (req, res, next) => {
  try {
    const token = (req.query.token as string) ?? (req.body?.token as string)
    if (!token) {
      throw Object.assign(new Error("Invite token is required"), { statusCode: 400 })
    }
    const { email, password, first_name, last_name } = z
      .object({ email: z.string().email(), password: z.string().min(8), first_name: z.string().optional(), last_name: z.string().optional() })
      .parse(req.body)
    const inv = await pool.query(`SELECT * FROM invite WHERE token=$1 AND deleted_at IS NULL`, [token])
    if (!inv.rows[0] || inv.rows[0].accepted || new Date(inv.rows[0].expires_at) < new Date()) {
      throw Object.assign(new Error("Invite invalid or expired"), { statusCode: 400 })
    }
    if (inv.rows[0].email.toLowerCase() !== email.toLowerCase().trim()) {
      throw Object.assign(new Error("Email does not match the invite"), { statusCode: 400 })
    }
    const hash = await bcrypt.hash(password, 10)
    const client = await pool.connect()
    let user: any = null
    try {
      await client.query("BEGIN")
      const ai = await client.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
      await client.query(`INSERT INTO provider_identity (auth_identity_id, entity_id, provider, password_hash) VALUES ($1,$2,'emailpass',$3)`, [ai.rows[0].id, email.toLowerCase().trim(), hash])
      const u = await client.query(`INSERT INTO admin_user (email, first_name, last_name) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET first_name=$2 RETURNING *`, [email.toLowerCase().trim(), first_name ?? null, last_name ?? null])
      user = u.rows[0]
      await client.query(`INSERT INTO admin_user_auth (admin_user_id, auth_identity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, ai.rows[0].id])
      await client.query(`UPDATE invite SET accepted=TRUE, updated_at=NOW() WHERE id=$1`, [inv.rows[0].id])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    res.json({ user })
  } catch (e) {
    next(e)
  }
})

// ---- Third-party provider callbacks + provider-user provisioning ----
// NOTE: these MUST stay above the generic /auth/:actor_type/:auth_provider
// login routes below: POST /auth/:provider/user is also 3 segments and would
// otherwise be shadowed by the generic login handler (Express matches in
// registration order).

function oauthEnvConfigured(provider: string): boolean {
  if (provider === "github") {
    return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  }
  if (provider === "google") {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  }
  return false
}

// sdk.auth.callback(actor, provider, query) -> GET /auth/:actor/:provider/callback
// (Lupus also accepts POST). For github/google with env creds configured the
// request is delegated to the oauth logic in providers/external-providers.ts
// (code -> provider email -> provider_identity + JWT); otherwise 400
// { message: provider not configured }, same as the emailpass-only login above.
async function handleAuthCallback(req: any, res: any, next: any) {
  try {
    const { actor, provider } = req.params
    if (actor !== "user" && actor !== "customer") {
      throw unauthorized(`Unknown actor type: ${actor}`, 404)
    }
    if (!oauthEnvConfigured(provider)) {
      throw unauthorized(`Auth provider '${provider}' is not configured`, 400)
    }
    const merged = { ...((req.query ?? {}) as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) }
    const { code, redirect_uri } = z.object({ code: z.string(), redirect_uri: z.string().optional() }).parse(merged)
    if (provider === "github") {
      res.json(await oauthGitHub(code))
      return
    }
    res.json(await oauthGoogle(code, redirect_uri ?? `${req.protocol}://${req.get("host")}/auth/callback`))
  } catch (e) {
    next(e)
  }
}

lupusAuthRouter.get("/auth/:actor/:provider/callback", handleAuthCallback)
lupusAuthRouter.post("/auth/:actor/:provider/callback", handleAuthCallback)

// POST /auth/:provider/user (upstream/src/api/auth/[auth_provider]/user/route.ts):
// provision-by-verified-email for actor "user". Requires a Bearer actorless
// token (any valid JWT is accepted for simplicity — requireAuth passes sid-less
// tokens through); links an existing admin_user with the token email or creates
// one, links the auth identity, and returns { user }.
lupusAuthRouter.post("/auth/:provider/user", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { provider } = req.params
    if (provider !== "emailpass" && provider !== "github" && provider !== "google") {
      throw unauthorized(`Auth provider '${provider}' is not configured`, 400)
    }
    const { email, first_name, last_name } = z
      .object({ email: z.string().email().optional(), first_name: z.string().optional(), last_name: z.string().optional() })
      .parse(req.body ?? {})
    const normalized = (email ?? req.auth!.email).toLowerCase().trim()
    let user = (await pool.query(`SELECT * FROM admin_user WHERE email=$1 AND deleted_at IS NULL LIMIT 1`, [normalized])).rows[0] ?? null
    if (!user) {
      user = (
        await pool.query(`INSERT INTO admin_user (email, first_name, last_name) VALUES ($1,$2,$3) RETURNING *`, [
          normalized,
          first_name ?? null,
          last_name ?? null,
        ])
      ).rows[0]
    }
    await pool.query(`INSERT INTO admin_user_auth (admin_user_id, auth_identity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, req.auth!.actor_id])
    await pool.query(`INSERT INTO provider_identity (auth_identity_id, entity_id, provider) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [
      req.auth!.actor_id,
      normalized,
      provider,
    ]).catch(() => undefined)
    res.json({ user })
  } catch (e) {
    next(e)
  }
})

// Generic actor/provider login — LAST: Express matches in registration order and
// these 3-segment patterns would otherwise shadow /auth/mfa/*, /auth/token/*, etc.
lupusAuthRouter.post("/auth/:actor_type/:auth_provider", handleAuthActorProvider)
lupusAuthRouter.get("/auth/:actor_type/:auth_provider", handleAuthActorProvider)
