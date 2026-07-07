import bcrypt from "bcryptjs"
import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { authService } from "../auth/auth.service"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"

// Port of user/invite/RBAC, store/settings, api-key, notification endpoints.
// Admin users authenticate via the same emailpass auth_identity flow; admin_user_auth
// links actor_id -> admin_user. RBAC check walks role inheritance; policies are plain
// strings (e.g. 'orders:read'). Notifications use the log provider (persist + console).
export const adminPlatformRouter = Router()

function actorEmail(req: AuthedRequest): string {
  if (!req.auth) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 })
  }
  return req.auth.email
}

export async function requirePolicy(req: AuthedRequest, policy: string): Promise<void> {
  const email = actorEmail(req)
  const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1 AND deleted_at IS NULL`, [email])
  if (!u.rows[0]) {
    // Bootstrap only when the system has no admins at all; otherwise an unknown
    // identity (e.g. a customer token) must NOT pass admin policy checks.
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM admin_user WHERE deleted_at IS NULL`)
    if (Number(total.rows[0]?.c ?? 0) === 0) {
      return
    }
    throw Object.assign(new Error("Forbidden: not an admin user"), { statusCode: 403 })
  }
  const rows = await pool.query(
    `WITH RECURSIVE inherited(role_id) AS (
       SELECT role_id FROM admin_user_role WHERE admin_user_id=$1
       UNION
       SELECT rp.parent_id FROM rbac_role_parent rp JOIN inherited i ON i.role_id=rp.role_id
     )
     SELECT 1 FROM rbac_role_policy rpol JOIN rbac_policy pol ON pol.id=rpol.policy_id
     JOIN inherited i ON i.role_id=rpol.role_id WHERE pol.name=$2 LIMIT 1`,
    [u.rows[0].id, policy]
  )
  if (rows.rows.length === 0) {
    // Fallback: super-admin if user has any role named 'admin'
    const admin = await pool.query(
      `SELECT 1 FROM admin_user_role aur JOIN rbac_role r ON r.id=aur.role_id WHERE aur.admin_user_id=$1 AND r.name='admin' LIMIT 1`,
      [u.rows[0].id]
    )
    if (admin.rows.length === 0) {
      throw Object.assign(new Error(`Forbidden: missing policy ${policy}`), { statusCode: 403 })
    }
  }
}

adminPlatformRouter.post("/admin/users/register", async (req, res, next) => {
  try {
    const { email, password, first_name, last_name } = z.object({ email: z.string().email(), password: z.string().min(8), first_name: z.string().optional(), last_name: z.string().optional() }).parse(req.body)
    const normalized = email.toLowerCase().trim()
    const hash = await bcrypt.hash(password, 10)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ai = await client.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
      await client.query(`INSERT INTO provider_identity (auth_identity_id, entity_id, provider, password_hash) VALUES ($1,$2,'emailpass',$3)`, [
        ai.rows[0].id,
        normalized,
        hash,
      ])
      const u = await client.query(
        `INSERT INTO admin_user (email, first_name, last_name) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET first_name=$2, last_name=$3 RETURNING *`,
        [normalized, first_name ?? null, last_name ?? null]
      )
      await client.query(`INSERT INTO admin_user_auth (admin_user_id, auth_identity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, ai.rows[0].id])
      await client.query("COMMIT")
      const adminCount = await pool.query(`SELECT COUNT(*)::int AS c FROM admin_user WHERE deleted_at IS NULL`)
      if (Number(adminCount.rows[0]?.c ?? 0) === 1) {
        const role = await pool.query(
          `INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`
        )
        await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
      }
      const login = await authService.login(normalized, password)
      res.status(201).json({ user: u.rows[0], token: login.token })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

adminPlatformRouter.post("/admin/invites", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const mail = email.toLowerCase().trim()
    // Lupus refuses to invite someone who already has an account or a pending invite
    const exists = await pool.query(`SELECT 1 FROM admin_user WHERE LOWER(email) = $1 AND deleted_at IS NULL`, [mail])
    if (exists.rows[0]) throw Object.assign(new Error(`User with email: ${mail} already exists`), { statusCode: 400 })
    const pending = await pool.query(`SELECT 1 FROM invite WHERE LOWER(email) = $1 AND deleted_at IS NULL AND accepted = FALSE AND expires_at > NOW()`, [mail])
    if (pending.rows[0]) throw Object.assign(new Error(`Invite for ${mail} already exists`), { statusCode: 400 })
    const { rows } = await pool.query(`INSERT INTO invite (email) VALUES ($1) RETURNING *`, [mail])
    await pool
      .query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','invite',$2,'sent')`, [mail, JSON.stringify({ token: rows[0].token })])
      .catch(() => undefined)
    res.status(201).json({ invite: rows[0] })
  } catch (e) {
    next(e)
  }
})

adminPlatformRouter.post("/admin/invites/:token/accept", async (req, res, next) => {
  try {
    const { password, first_name, last_name } = z.object({ password: z.string().min(8), first_name: z.string().optional(), last_name: z.string().optional() }).parse(req.body)
    const inv = await pool.query(`SELECT * FROM invite WHERE token=$1 AND deleted_at IS NULL`, [req.params.token])
    if (!inv.rows[0] || inv.rows[0].accepted || new Date(inv.rows[0].expires_at) < new Date()) {
      throw Object.assign(new Error("Invite invalid or expired"), { statusCode: 400 })
    }
    const email = inv.rows[0].email as string
    const hash = await bcrypt.hash(password, 10)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ai = await client.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
      await client.query(`INSERT INTO provider_identity (auth_identity_id, entity_id, provider, password_hash) VALUES ($1,$2,'emailpass',$3)`, [ai.rows[0].id, email, hash])
      const u = await client.query(`INSERT INTO admin_user (email, first_name, last_name) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET first_name=$2 RETURNING *`, [email, first_name ?? null, last_name ?? null])
      await client.query(`INSERT INTO admin_user_auth (admin_user_id, auth_identity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, ai.rows[0].id])
      await client.query(`UPDATE invite SET accepted=TRUE, updated_at=NOW() WHERE id=$1`, [inv.rows[0].id])
      await client.query("COMMIT")
      res.json({ user: u.rows[0] })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

adminPlatformRouter.post("/admin/roles", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { name, policies, parent_ids } = z.object({ name: z.string(), policies: z.array(z.string()).optional(), parent_ids: z.array(z.string()).optional() }).parse(req.body)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const r = await client.query(`INSERT INTO rbac_role (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=$1 RETURNING *`, [name])
      for (const p of policies ?? []) {
        const pol = await client.query(`INSERT INTO rbac_policy (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=$1 RETURNING id`, [p])
        await client.query(`INSERT INTO rbac_role_policy (role_id, policy_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.rows[0].id, pol.rows[0].id])
      }
      for (const pid of parent_ids ?? []) {
        await client.query(`INSERT INTO rbac_role_parent (role_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.rows[0].id, pid])
      }
      await client.query("COMMIT")
      res.status(201).json({ role: r.rows[0] })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

adminPlatformRouter.post("/admin/users/:id/roles", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    // Lupus shape is { roles: [...] } (users/[id]/roles/route.ts POST -> { roles });
    // the legacy lupus { role_ids } input is still accepted.
    const { roles, role_ids } = z.object({ roles: z.array(z.string()).optional(), role_ids: z.array(z.string()).optional() }).parse(req.body ?? {})
    const ids = [...(roles ?? []), ...(role_ids ?? [])]
    if (ids.length === 0) {
      throw Object.assign(new Error("roles is required"), { statusCode: 400 })
    }
    const user = await pool.query(`SELECT id FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!user.rows[0]) {
      throw Object.assign(new Error(`User with id ${req.params.id} was not found`), { statusCode: 404 })
    }
    for (const rid of [...new Set(ids)]) {
      const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [rid])
      if (!role.rows[0]) {
        throw Object.assign(new Error(`Role with id ${rid} was not found`), { statusCode: 404 })
      }
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, rid])
    }
    const { rows } = await pool.query(
      `SELECT r.* FROM rbac_role r JOIN admin_user_role link ON link.role_id=r.id WHERE link.admin_user_id=$1 AND r.deleted_at IS NULL ORDER BY r.created_at`,
      [req.params.id]
    )
    res.json({ roles: rows })
  } catch (e) {
