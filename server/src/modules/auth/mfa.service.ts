import { createHmac, randomBytes, createHash } from "crypto"
import { pool } from "../../db"

// Port of Lupus auth-module MFA (packages/modules/auth providers + totp behavior)
// and verification request/confirm (upstream/src/api/auth/verification/*).
// TOTP follows RFC 6238 (SHA-1, 30s step, 6 digits, +/-1 window) implemented with
// node:crypto so no new dependencies are needed. Secrets are stored raw (same as
// Lupus's default totp provider persistence); recovery codes are stored hashed
// and are single-use.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let out = ""
  let bits = 0
  let value = 0
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31]
  }
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "")
  const bytes: number[] = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    const idx = BASE32.indexOf(char)
    if (idx < 0) {
      throw new Error("Invalid base32 secret")
    }
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", secret).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0")
}

export function totpNow(secretB32: string, atMs: number = Date.now()): string {
  const secret = base32Decode(secretB32)
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS)
  return hotp(secret, counter)
}

export function verifyTotp(secretB32: string, code: string, atMs: number = Date.now()): boolean {
  const clean = code.trim()
  if (!/^\d{6}$/.test(clean)) {
    return false
  }
  const secret = base32Decode(secretB32)
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS)
  for (const c of [counter - 1, counter, counter + 1]) {
    if (hotp(secret, c) === clean) {
      return true
    }
  }
  return false
}

export function buildOtpauthUrl(issuer: string, label: string, secretB32: string): string {
  const iss = encodeURIComponent(issuer)
  const lab = encodeURIComponent(label)
  return `otpauth://totp/${iss}:${lab}?secret=${secretB32}&issuer=${iss}&digits=6&period=30`
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

export interface MfaFactor {
  id: string
  auth_identity_id: string
  provider: string
  label: string | null
  status: string
  created_at: string
  updated_at: string
}

function toPublicFactor(row: any): MfaFactor {
  return {
    id: row.id,
    auth_identity_id: row.auth_identity_id,
    provider: row.provider,
    label: row.label ?? null,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class MfaService {
  async listFactors(authIdentityId: string): Promise<MfaFactor[]> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_mfa_factor WHERE auth_identity_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
      [authIdentityId]
    )
    return rows.map(toPublicFactor)
  }

  async enabledFactors(authIdentityId: string): Promise<MfaFactor[]> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_mfa_factor WHERE auth_identity_id=$1 AND status='enabled' AND deleted_at IS NULL ORDER BY created_at`,
      [authIdentityId]
    )
    return rows.map(toPublicFactor)
  }

  async startFactor(authIdentityId: string, provider: string, label?: string | null, issuer?: string): Promise<{ mfa_factor: MfaFactor; secret: string; otpauth_url: string }> {
    if (provider !== "totp") {
      throw Object.assign(new Error(`Unsupported MFA provider: ${provider}`), { statusCode: 400 })
    }
    const secret = base32Encode(randomBytes(20))
    const { rows } = await pool.query(
      `INSERT INTO auth_mfa_factor (auth_identity_id, provider, label, secret, status) VALUES ($1,'totp',$2,$3,'pending') RETURNING *`,
      [authIdentityId, label ?? null, secret]
    )
    const factor = toPublicFactor(rows[0])
    const iss = issuer ?? "lupus-store"
    return { mfa_factor: factor, secret, otpauth_url: buildOtpauthUrl(iss, label ?? "admin", secret) }
  }

  async verifyFactor(authIdentityId: string, factorId: string, code: string): Promise<MfaFactor> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_mfa_factor WHERE id=$1 AND auth_identity_id=$2 AND deleted_at IS NULL`,
      [factorId, authIdentityId]
    )
    const factor = rows[0]
    if (!factor) {
      throw Object.assign(new Error("MFA factor not found"), { statusCode: 404 })
    }
    if (factor.status === "enabled") {
      return toPublicFactor(factor)
    }
    if (!verifyTotp(factor.secret, code)) {
      throw Object.assign(new Error("Invalid MFA code"), { statusCode: 401 })
    }
    const updated = await pool.query(
      `UPDATE auth_mfa_factor SET status='enabled', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [factorId]
    )
    return toPublicFactor(updated.rows[0])
  }

  async disableFactor(authIdentityId: string, factorId: string, code?: string): Promise<MfaFactor> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_mfa_factor WHERE id=$1 AND auth_identity_id=$2 AND deleted_at IS NULL`,
      [factorId, authIdentityId]
    )
    if (!rows[0]) {
      throw Object.assign(new Error("MFA factor not found"), { statusCode: 404 })
    }
    // turning a working second factor off needs proof of it (a current code or a recovery code)
    if (rows[0].status === "enabled") {
      let ok = !!code && verifyTotp(rows[0].secret, code)
      if (!ok && code) {
        ok = await this.consumeRecoveryCode(authIdentityId, code).then(() => true, () => false)
      }
      if (!ok) {
        throw Object.assign(new Error("Enter a valid authentication code to turn two-factor authentication off"), { statusCode: 401 })
      }
    }
    const updated = await pool.query(
      `UPDATE auth_mfa_factor SET status='disabled', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [factorId]
    )
    return toPublicFactor(updated.rows[0])
  }

  async createChallenge(authIdentityId: string, authProvider: string): Promise<{ id: string; methods: string[] }> {
    const factors = await this.enabledFactors(authIdentityId)
    const methods = factors.map((f) => f.provider)
    const { rows } = await pool.query(
      `INSERT INTO auth_mfa_challenge (auth_identity_id, auth_provider) VALUES ($1,$2) RETURNING id`,
      [authIdentityId, authProvider]
    )
    const hasRecovery = await pool.query(
      `SELECT 1 FROM auth_mfa_recovery_code WHERE auth_identity_id=$1 AND used_at IS NULL LIMIT 1`,
      [authIdentityId]
    )
    if (hasRecovery.rows.length > 0 && !methods.includes("recovery_code")) {
      methods.push("recovery_code")
    }
    return { id: rows[0].id, methods }
  }

  async verifyChallenge(authIdentityId: string, challengeId: string, method: string, code: string): Promise<void> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_mfa_challenge WHERE id=$1 AND auth_identity_id=$2`,
      [challengeId, authIdentityId]
    )
    const challenge = rows[0]
    if (!challenge || challenge.completed_at || new Date(challenge.expires_at) < new Date()) {
      throw Object.assign(new Error("MFA challenge invalid or expired"), { statusCode: 401 })
    }
    if (method === "recovery_code") {
      await this.consumeRecoveryCode(authIdentityId, code)
    } else if (method === "totp") {
      const secrets = await pool.query(
        `SELECT secret FROM auth_mfa_factor WHERE auth_identity_id=$1 AND status='enabled' AND provider='totp' AND deleted_at IS NULL`,
        [authIdentityId]
      )
      const matched = secrets.rows.some((r: any) => verifyTotp(r.secret, code))
      if (!matched) {
        throw Object.assign(new Error("Invalid MFA code"), { statusCode: 401 })
      }
    } else {
      throw Object.assign(new Error(`Unsupported MFA method: ${method}`), { statusCode: 400 })
    }
    await pool.query(`UPDATE auth_mfa_challenge SET completed_at=NOW() WHERE id=$1`, [challengeId])
  }

  async generateRecoveryCodes(authIdentityId: string, count: number = 10): Promise<string[]> {
    const factors = await this.enabledFactors(authIdentityId)
    if (factors.length === 0) {
      throw Object.assign(new Error("Recovery codes require an enabled MFA factor"), { statusCode: 400 })
    }
    const n = Math.min(Math.max(count || 10, 1), 20)
    const codes: string[] = []
    for (let i = 0; i < n; i++) {
      const code = `${randomBytes(2).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`
      codes.push(code)
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`DELETE FROM auth_mfa_recovery_code WHERE auth_identity_id=$1 AND used_at IS NULL`, [authIdentityId])
      for (const code of codes) {
        await client.query(`INSERT INTO auth_mfa_recovery_code (auth_identity_id, code_hash) VALUES ($1,$2)`, [authIdentityId, hashCode(code)])
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    return codes
  }

  async consumeRecoveryCode(authIdentityId: string, code: string): Promise<void> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_mfa_recovery_code WHERE auth_identity_id=$1 AND used_at IS NULL`,
      [authIdentityId]
    )
    const match = rows.find((r: any) => r.code_hash === hashCode(code.trim()))
    if (!match) {
      throw Object.assign(new Error("Invalid recovery code"), { statusCode: 401 })
    }
    await pool.query(`UPDATE auth_mfa_recovery_code SET used_at=NOW() WHERE id=$1`, [match.id])
  }

  async requestVerification(authIdentityId: string): Promise<{ code: string }> {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    await pool.query(
      `INSERT INTO auth_verification (auth_identity_id, code_hash) VALUES ($1,$2)`,
      [authIdentityId, hashCode(code)]
    )
    return { code }
  }

  async confirmVerification(authIdentityId: string, code: string): Promise<void> {
    const { rows } = await pool.query(
      `SELECT * FROM auth_verification WHERE auth_identity_id=$1 AND consumed=FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 5`,
      [authIdentityId]
    )
    const match = rows.find((r: any) => r.code_hash === hashCode(code.trim()))
    if (!match) {
      throw Object.assign(new Error("Invalid or expired verification code"), { statusCode: 400 })
    }
    await pool.query(`UPDATE auth_verification SET consumed=TRUE WHERE id=$1`, [match.id])
  }
}

export const mfaService = new MfaService()
