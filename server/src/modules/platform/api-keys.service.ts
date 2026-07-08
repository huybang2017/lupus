import { createHash, randomBytes } from "crypto"
import { pool } from "../../db"

// Lupus "API Keys" (Settings): publishable keys scope the storefront to sales channels, secret keys
// authenticate server-to-server calls. A secret key is shown in full once, when it is created; after
// that only its redacted form (sk_...abcd) is ever returned and only a hash is stored.
// Refs: upstream/packages/modules/api-key (token generation, revoke), core-flows create/revoke-api-keys.

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
const redact = (token: string, prefix: string) => `${prefix}...${token.slice(-4)}`

export function isRevoked(row: { revoked_at?: string | Date | null }, now = Date.now()) {
  return !!row.revoked_at && new Date(row.revoked_at).getTime() <= now
}

export function apiKeyShape(row: any, sales_channels?: any[]) {
  const secret = row.type === "secret"
  const redacted = row.redacted ?? (secret ? redact(row.token, "sk_") : redact(row.token, "pk_"))
  return {
    id: row.id,
    token: secret ? redacted : row.token,
    redacted,
    title: row.title,
    type: row.type,
    last_used_at: row.last_used_at ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    revoked_by: row.revoked_by ?? null,
    revoked_at: row.revoked_at ?? null,
    updated_at: row.updated_at ?? row.created_at,
    deleted_at: row.deleted_at ?? null,
    ...(sales_channels ? { sales_channels } : {}),
  }
}

export class ApiKeyService {
  async channelsFor(keyIds: string[]) {
    if (keyIds.length === 0) return new Map<string, any[]>()
    const { rows } = await pool.query(
      `SELECT link.api_key_id, sc.* FROM api_key_sales_channel link
       JOIN sales_channel sc ON sc.id = link.sales_channel_id AND sc.deleted_at IS NULL
       WHERE link.api_key_id = ANY($1) ORDER BY sc.name`,
      [keyIds]
    )
    const out = new Map<string, any[]>()
    for (const { api_key_id, ...channel } of rows) out.set(api_key_id, [...(out.get(api_key_id) ?? []), channel])
    return out
  }

  async hydrate(rows: any[]) {
    const channels = await this.channelsFor(rows.map((r) => r.id))
    return rows.map((r) => apiKeyShape(r, r.type === "publishable" ? (channels.get(r.id) ?? []) : undefined))
  }

  async retrieve(id: string) {
    const { rows } = await pool.query(`SELECT * FROM api_key WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) fail(`Api key with id: ${id} was not found`, 404)
    return (await this.hydrate(rows))[0]
  }

  async create(input: { title: string; type: "publishable" | "secret" }, createdBy: string | null) {
    const title = input.title.trim()
    if (!title) fail("title is required")
    const secret = input.type === "secret"
    const raw = `${secret ? "sk" : "pk"}_${randomBytes(32).toString("hex")}`
    const { rows } = await pool.query(
      `INSERT INTO api_key (title, type, token, redacted, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [title, input.type, secret ? hashToken(raw) : raw, redact(raw, secret ? "sk_" : "pk_"), createdBy]
    )
    const shaped = apiKeyShape(rows[0], secret ? undefined : [])
    // the one and only time a secret key is returned in full
    return secret ? { ...shaped, token: raw } : shaped
  }

  async update(id: string, input: { title?: string }) {
    await this.retrieve(id)
    if (input.title !== undefined) {
      const title = input.title.trim()
      if (!title) fail("title cannot be empty")
      await pool.query(`UPDATE api_key SET title = $2, updated_at = NOW() WHERE id = $1`, [id, title])
    }
    return this.retrieve(id)
  }

  async revoke(id: string, input: { revoke_in?: number }, revokedBy: string | null) {
    const cur = await pool.query(`SELECT * FROM api_key WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!cur.rows[0]) fail(`Api key with id: ${id} was not found`, 404)
    if (isRevoked(cur.rows[0])) fail(`API key with id ${id} is already revoked`)
    await pool.query(`UPDATE api_key SET revoked_at = NOW() + ($2::int * INTERVAL '1 second'), revoked_by = $3, updated_at = NOW() WHERE id = $1`, [
      id,
      Math.max(0, Math.floor(input.revoke_in ?? 0)),
      revokedBy,
    ])
    return this.retrieve(id)
  }

  async remove(id: string) {
    const gone = await pool.query(`UPDATE api_key SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) fail(`Api key with id: ${id} was not found`, 404)
    await pool.query(`DELETE FROM api_key_sales_channel WHERE api_key_id = $1`, [id])
  }

  async updateSalesChannels(id: string, input: { add?: string[]; remove?: string[] }) {
    const key = await pool.query(`SELECT type FROM api_key WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!key.rows[0]) fail(`Api key with id: ${id} was not found`, 404)
    if (key.rows[0].type !== "publishable") fail("Sales channels can only be linked to publishable API keys")
    const add = [...new Set(input.add ?? [])]
    if (add.length > 0) {
      const found = await pool.query(`SELECT id FROM sales_channel WHERE id = ANY($1) AND deleted_at IS NULL`, [add])
      const missing = add.filter((c) => !found.rows.some((r: any) => r.id === c))
      if (missing.length > 0) fail(`Sales channel with id ${missing[0]} was not found`, 404)
    }
    for (const channel of add) {
      await pool.query(`INSERT INTO api_key_sales_channel (api_key_id, sales_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, channel])
    }
    if ((input.remove ?? []).length > 0) {
      await pool.query(`DELETE FROM api_key_sales_channel WHERE api_key_id = $1 AND sales_channel_id = ANY($2)`, [id, input.remove])
    }
    return this.retrieve(id)
  }

  /** The key behind an `x-publishable-api-key` header, or why it cannot be used. */
  async resolvePublishable(token: string) {
    const { rows } = await pool.query(`SELECT * FROM api_key WHERE token = $1 AND type = 'publishable' AND deleted_at IS NULL`, [token])
    const row = rows[0]
    if (!row) fail("A valid publishable key is required to proceed with the request", 400)
    if (isRevoked(row)) fail("The publishable key has been revoked", 400)
    const channels = await this.channelsFor([row.id])
    pool.query(`UPDATE api_key SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(() => undefined)
    return { id: row.id as string, sales_channel_ids: (channels.get(row.id) ?? []).map((c) => c.id as string) }
  }
}

export const apiKeyService = new ApiKeyService()
