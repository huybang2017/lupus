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
