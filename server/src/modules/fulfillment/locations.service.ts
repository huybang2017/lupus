import { pool } from "../../db"

// Lupus "Locations & Shipping": stock locations (with address, connected sales channels and
// fulfillment providers), fulfillment sets (shipping / pickup), service zones with their geo
// zones, shipping options with prices, shipping option types and shipping profiles.
// Refs: upstream/packages/modules/{stock-location,fulfillment}, core-flows (create-shipping-options,
// create-service-zones, update-service-zones, delete-fulfillment-sets) and the admin routes under
// upstream/src/api/admin/{stock-locations,fulfillment-sets,shipping-options,...}.

const bad = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}
const notFound = (message: string): never => bad(message, 404)

export const PROVIDERS = [{ id: "manual", is_enabled: true }]

/** Fulfillment options each provider can serve (`GET /admin/fulfillment-providers/:id/options`). */
const PROVIDER_OPTIONS: Record<string, { id: string; name: string; is_return?: boolean }[]> = {
  manual: [
    { id: "manual-fulfillment", name: "Manual Fulfillment" },
    { id: "manual-fulfillment-return", name: "Manual Fulfillment - Return", is_return: true },
  ],
}
/** A provider that can calculate its own prices; `manual` cannot. */
const CALCULATING_PROVIDERS = new Set<string>()

export interface AddressInput {
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  country_code?: string | null
  postal_code?: string | null
  province?: string | null
  company?: string | null
  phone?: string | null
}

const ADDRESS_FIELDS = ["address_1", "address_2", "city", "country_code", "postal_code", "province", "company", "phone"] as const

function addressOf(row: any) {
  return Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, row[k] ?? null]))
}

function normalizeAddress(a: AddressInput): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const k of ADDRESS_FIELDS) {
    const v = (a as any)[k]
    if (v === undefined) continue
    const t = typeof v === "string" ? v.trim() : v
    out[k] = t === "" || t === null ? null : k === "country_code" ? String(t).toLowerCase() : String(t)
  }
  return out
}

export class LocationsService {
  // ------------------------------------------------------------------ providers
  listProviders(): { id: string; is_enabled: boolean }[] {
    return PROVIDERS
  }

  providerOptions(providerId: string) {
    if (!PROVIDERS.some((p) => p.id === providerId)) notFound(`Fulfillment provider with id ${providerId} was not found`)
    return PROVIDER_OPTIONS[providerId] ?? []
  }

  async providersOf(locationId: string): Promise<{ id: string; is_enabled: boolean }[]> {
    const { rows } = await pool.query(`SELECT provider_id FROM stock_location_fulfillment_provider WHERE stock_location_id = $1 ORDER BY provider_id`, [locationId])
    return rows.map((r: any) => ({ id: r.provider_id, is_enabled: true }))
  }

  async listProvidersFor(locationId?: string) {
    if (!locationId) return PROVIDERS
    await this.assertLocation(locationId)
    return this.providersOf(locationId)
  }

  async updateProviders(locationId: string, input: { add?: string[]; remove?: string[] }) {
    await this.assertLocation(locationId)
    for (const id of input.add ?? []) {
      if (!PROVIDERS.some((p) => p.id === id)) bad(`Fulfillment provider ${id} was not found`)
      await pool.query(`INSERT INTO stock_location_fulfillment_provider (stock_location_id, provider_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [locationId, id])
    }
    for (const id of input.remove ?? []) {
      const inUse = await pool.query(
        `SELECT 1 FROM shipping_option so JOIN service_zone sz ON sz.id = so.service_zone_id AND sz.deleted_at IS NULL
         JOIN fulfillment_set fs ON fs.id = sz.fulfillment_set_id AND fs.deleted_at IS NULL
         WHERE so.deleted_at IS NULL AND so.provider_id = $2 AND fs.stock_location_id = $1 LIMIT 1`,
        [locationId, id]
      )
      if (inUse.rows[0]) bad(`Fulfillment provider ${id} is used by a shipping option of this location`)
      await pool.query(`DELETE FROM stock_location_fulfillment_provider WHERE stock_location_id = $1 AND provider_id = $2`, [locationId, id])
    }
    return this.retrieveLocation(locationId)
  }

  // ------------------------------------------------------------------ stock locations
  private async assertLocation(id: string) {
    const { rows } = await pool.query(`SELECT * FROM stock_location WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) notFound(`Stock location with id ${id} was not found`)
    return rows[0]
  }

  async createLocation(input: { name: string; address?: AddressInput | null; metadata?: Record<string, unknown> | null } & AddressInput) {
    const name = input.name.trim()
    if (!name) bad("name is required")
    const addr = normalizeAddress({ ...(input.address ?? {}), ...Object.fromEntries(ADDRESS_FIELDS.filter((k) => (input as any)[k] !== undefined).map((k) => [k, (input as any)[k]])) })
    if (input.address) {
      if (!addr.address_1) bad("address_1 is required when an address is given")
      if (!addr.country_code) bad("country_code is required when an address is given")
    }
    const { rows } = await pool.query(
      `INSERT INTO stock_location (name, address_1, address_2, city, country_code, postal_code, province, company, phone, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [name, addr.address_1 ?? null, addr.address_2 ?? null, addr.city ?? null, addr.country_code ?? null, addr.postal_code ?? null, addr.province ?? null, addr.company ?? null, addr.phone ?? null, input.metadata ?? null]
    )
    return this.retrieveLocation(rows[0].id)
  }

  async updateLocation(id: string, input: { name?: string; address?: AddressInput | null; metadata?: Record<string, unknown> | null } & AddressInput) {
    const cur = await this.assertLocation(id)
    const sets: string[] = []
    const params: any[] = []
    const set = (col: string, v: unknown) => {
      params.push(v)
      sets.push(`${col} = $${params.length}`)
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) bad("name cannot be empty")
      set("name", input.name.trim())
    }
    const merged = normalizeAddress({ ...(input.address ?? {}), ...Object.fromEntries(ADDRESS_FIELDS.filter((k) => (input as any)[k] !== undefined).map((k) => [k, (input as any)[k]])) })
    const next = { ...addressOf(cur), ...merged }
    if (Object.keys(merged).length > 0) {
      if (input.address && (!next.address_1 || !next.country_code)) bad("address_1 and country_code are required")
      for (const [k, v] of Object.entries(merged)) set(k, v)
    }
    if (input.metadata !== undefined) set("metadata", input.metadata)
    if (sets.length > 0) {
      sets.push("updated_at = NOW()")
      params.push(id)
      await pool.query(`UPDATE stock_location SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    }
    return this.retrieveLocation(id)
  }

  async deleteLocation(id: string) {
    await this.assertLocation(id)
    const sets = await pool.query(`SELECT id FROM fulfillment_set WHERE stock_location_id = $1 AND deleted_at IS NULL`, [id])
    for (const s of sets.rows) await this.deleteFulfillmentSet(s.id)
    await pool.query(`UPDATE stock_location SET deleted_at = NOW() WHERE id = $1`, [id])
  }

  async updateSalesChannels(id: string, input: { add?: string[]; remove?: string[] }) {
    await this.assertLocation(id)
    const add = [...new Set(input.add ?? [])]
    if (add.length > 0) {
      const { rows } = await pool.query(`SELECT id FROM sales_channel WHERE id = ANY($1) AND deleted_at IS NULL`, [add])
      const found = new Set(rows.map((r: any) => r.id))
      const missing = add.filter((x) => !found.has(x))
      if (missing.length > 0) bad(`Sales channel not found: ${missing.join(", ")}`, 404)
    }
    for (const sc of add) {
      await pool.query(`INSERT INTO sales_channel_stock_location (sales_channel_id, stock_location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [sc, id])
    }
    if ((input.remove ?? []).length > 0) {
      await pool.query(`DELETE FROM sales_channel_stock_location WHERE stock_location_id = $1 AND sales_channel_id = ANY($2)`, [id, input.remove])
    }
    return this.retrieveLocation(id)
  }

  /** List rows: address, connected sales channels and the fulfillment sets (id + type) — what the table needs. */
  async decorateList(rows: any[]) {
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const [ch, fs] = await Promise.all([
      pool.query(
        `SELECT l.stock_location_id, sc.id, sc.name FROM sales_channel_stock_location l
         JOIN sales_channel sc ON sc.id = l.sales_channel_id AND sc.deleted_at IS NULL
         WHERE l.stock_location_id = ANY($1) ORDER BY sc.name`,
        [ids]
      ),
      pool.query(`SELECT id, name, type, stock_location_id FROM fulfillment_set WHERE stock_location_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at`, [ids]),
    ])
    return rows.map((r) => ({
      ...r,
      address: addressOf(r),
      sales_channels: ch.rows.filter((c: any) => c.stock_location_id === r.id).map(({ stock_location_id: _s, ...c }: any) => c),
      fulfillment_sets: fs.rows.filter((f: any) => f.stock_location_id === r.id),
    }))
  }

  async retrieveLocation(id: string) {
    const row = await this.assertLocation(id)
    const [channels, sets, providers] = await Promise.all([
      pool.query(
        `SELECT sc.* FROM sales_channel sc JOIN sales_channel_stock_location l ON l.sales_channel_id = sc.id
         WHERE l.stock_location_id = $1 AND sc.deleted_at IS NULL ORDER BY sc.name`,
        [id]
      ),
      pool.query(`SELECT id FROM fulfillment_set WHERE stock_location_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
      this.providersOf(id),
    ])
    const fulfillment_sets = []
    for (const s of sets.rows) fulfillment_sets.push(await this.retrieveFulfillmentSet(s.id))
    return {
      ...row,
      address: addressOf(row),
      sales_channels: channels.rows,
      fulfillment_sets,
      fulfillment_providers: providers,
    }
  }

  // ------------------------------------------------------------------ fulfillment sets
  async createFulfillmentSet(locationId: string, input: { name: string; type?: string }) {
    await this.assertLocation(locationId)
    const type = input.type ?? "shipping"
    if (!["shipping", "pickup"].includes(type)) bad("type must be shipping or pickup")
    if (!input.name?.trim()) bad("name is required")
    const dup = await pool.query(`SELECT 1 FROM fulfillment_set WHERE stock_location_id = $1 AND type = $2 AND deleted_at IS NULL`, [locationId, type])
    if (dup.rows[0]) bad(`The stock location already has a ${type} fulfillment set`)
    const nameTaken = await pool.query(`SELECT 1 FROM fulfillment_set WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`, [input.name.trim()])
    if (nameTaken.rows[0]) bad(`A fulfillment set named "${input.name.trim()}" already exists`)
    const { rows } = await pool.query(`INSERT INTO fulfillment_set (name, type, stock_location_id) VALUES ($1,$2,$3) RETURNING id`, [input.name.trim(), type, locationId])
    return rows[0].id as string
  }

  async deleteFulfillmentSet(id: string) {
    const cur = await pool.query(`SELECT id FROM fulfillment_set WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!cur.rows[0]) notFound(`Fulfillment set with id ${id} was not found`)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `UPDATE shipping_option SET deleted_at = NOW() WHERE deleted_at IS NULL AND (fulfillment_set_id = $1 OR service_zone_id IN (SELECT id FROM service_zone WHERE fulfillment_set_id = $1))`,
        [id]
      )
      await client.query(`UPDATE geo_zone SET deleted_at = NOW() WHERE service_zone_id IN (SELECT id FROM service_zone WHERE fulfillment_set_id = $1) AND deleted_at IS NULL`, [id])
      await client.query(`UPDATE service_zone SET deleted_at = NOW() WHERE fulfillment_set_id = $1 AND deleted_at IS NULL`, [id])
      await client.query(`UPDATE fulfillment_set SET deleted_at = NOW() WHERE id = $1`, [id])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
