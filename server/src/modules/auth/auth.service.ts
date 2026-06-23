import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { pool } from "../../db"
import { customerService } from "../customer/customer.service"

// Plain port of Lupus AuthModuleService emailpass flow
// (upstream/packages/modules/auth/src/services/auth-module.ts ~1260 lines + auth-provider.ts).
// Kept: auth_identity + provider_identity(entity_id=email, provider=emailpass),
// password verify with bcrypt, JWT issue with actor_id + provider.
// Dropped: MFA factors/recovery codes, email verification tokens, password-reset tokens,
// cache layer, pluggable providers. Re-add per need following the TODO tables below.

export interface AuthTokenPayload {
  actor_id: string
  provider: string
  email: string
  sid?: string
  actor_type?: string
  mfa_pending?: boolean
  challenge_id?: string
}

function signToken(payload: AuthTokenPayload): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET is not set")
  }
  return jwt.sign(payload, secret, { expiresIn: "7d" })
}

export class AuthService {
  async register(email: string, password: string, firstName?: string, lastName?: string) {
    const normalized = email.toLowerCase().trim()
    if (password.length < 8) {
      throw Object.assign(new Error("Password must be at least 8 characters"), { statusCode: 400 })
    }
    const existing = await pool.query(
      `SELECT id FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL`,
      [normalized]
    )
    if (existing.rows.length > 0) {
      throw Object.assign(new Error("Email already registered"), { statusCode: 409 })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ai = await client.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
      const authIdentityId = ai.rows[0].id
      await client.query(
        `INSERT INTO provider_identity (auth_identity_id, entity_id, provider, password_hash) VALUES ($1,$2,'emailpass',$3)`,
        [authIdentityId, normalized, passwordHash]
      )
      let customer = await customerService.retrieveByEmail(normalized)
      if (!customer) {
        const { rows } = await client.query(
          `INSERT INTO customer (email, first_name, last_name, has_account) VALUES ($1,$2,$3,TRUE) RETURNING *`,
          [normalized, firstName ?? null, lastName ?? null]
        )
        customer = rows[0]
      }
      await client.query("COMMIT")
      return { token: signToken({ actor_id: authIdentityId, provider: "emailpass", email: normalized }), customer }
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async login(email: string, password: string) {
    const normalized = email.toLowerCase().trim()
    const { rows } = await pool.query(
      `SELECT * FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL`,
      [normalized]
    )
    const identity = rows[0]
    if (!identity?.password_hash || !(await bcrypt.compare(password, identity.password_hash))) {
      throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 })
    }
    await pool.query(`INSERT INTO auth_session (auth_identity_id, provider) VALUES ($1,'emailpass')`, [identity.auth_identity_id])
    const sess = await pool.query(`SELECT id FROM auth_session WHERE auth_identity_id=$1 ORDER BY created_at DESC LIMIT 1`, [identity.auth_identity_id])
    return {
      token: signToken({ actor_id: identity.auth_identity_id, provider: "emailpass", email: normalized, sid: sess.rows[0]?.id }),
    }
  }

  /** Request a password-reset token (emailed via notification in the route layer). */
  async requestPasswordReset(email: string) {
    const normalized = email.toLowerCase().trim()
    const { rows } = await pool.query(
      `SELECT id FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL`,
      [normalized]
    )
    if (!rows[0]) {
      // do not reveal whether the email exists (Lupus-safe behavior)
      return { ok: true }
    }
    const t = await pool.query(`INSERT INTO password_reset_token (provider_identity_id) VALUES ($1) RETURNING token, expires_at`, [rows[0].id])
    return { ok: true, token: t.rows[0].token as string, expires_at: t.rows[0].expires_at }
  }

  /** Consume a reset token once and set a new password (revokes existing sessions). */
  async resetPassword(token: string, newPassword: string) {
    if (newPassword.length < 8) {
      throw Object.assign(new Error("Password must be at least 8 characters"), { statusCode: 400 })
    }
    const { rows } = await pool.query(`SELECT * FROM password_reset_token WHERE token=$1`, [token])
    const t = rows[0]
    if (!t || t.consumed || new Date(t.expires_at) < new Date()) {
      throw Object.assign(new Error("Reset token invalid or expired"), { statusCode: 400 })
    }
    const hash = await bcrypt.hash(newPassword, 10)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`UPDATE provider_identity SET password_hash=$2 WHERE id=$1`, [t.provider_identity_id, hash])
      await client.query(`UPDATE password_reset_token SET consumed=TRUE WHERE id=$1`, [t.id])
      await client.query(
        `UPDATE auth_session SET revoked=TRUE WHERE auth_identity_id=(SELECT auth_identity_id FROM provider_identity WHERE id=$1)`,
        [t.provider_identity_id]
      )
      await client.query("COMMIT")
      return { ok: true }
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async listSessions(actorId: string) {
    const { rows } = await pool.query(`SELECT id, provider, revoked, expires_at, created_at FROM auth_session WHERE auth_identity_id=$1 ORDER BY created_at DESC LIMIT 50`, [actorId])
    return rows
  }

  /** Issue a fresh session-bound JWT for a known auth identity (refresh / MFA-complete flows). */
  async createSessionToken(authIdentityId: string, provider: string, email: string, actorType?: string) {
    await pool.query(`INSERT INTO auth_session (auth_identity_id, provider) VALUES ($1,$2)`, [authIdentityId, provider])
    const sess = await pool.query(`SELECT id FROM auth_session WHERE auth_identity_id=$1 ORDER BY created_at DESC LIMIT 1`, [authIdentityId])
    const payload: AuthTokenPayload = { actor_id: authIdentityId, provider, email, sid: sess.rows[0]?.id }
    if (actorType) {
      payload.actor_type = actorType
    }
    return { token: signToken(payload) }
  }

  /** Issue a short-lived challenge token carrying no session (must complete MFA first). */
  challengeToken(authIdentityId: string, provider: string, email: string, challengeId: string, actorType: string) {
    return signToken({ actor_id: authIdentityId, provider, email, actor_type: actorType, mfa_pending: true, challenge_id: challengeId })
  }

  async revokeSession(actorId: string, sessionId: string) {
    await pool.query(`UPDATE auth_session SET revoked=TRUE WHERE id=$1 AND auth_identity_id=$2`, [sessionId, actorId])
  }

  verifyToken(token: string): AuthTokenPayload {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new Error("JWT_SECRET is not set")
    }
    return jwt.verify(token, secret) as AuthTokenPayload
  }
}

export const authService = new AuthService()
