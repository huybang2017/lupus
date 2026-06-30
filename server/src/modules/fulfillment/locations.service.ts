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
      throw e
    } finally {
      client.release()
    }
  }

  async retrieveFulfillmentSet(id: string) {
    const set = await pool.query(`SELECT * FROM fulfillment_set WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!set.rows[0]) notFound(`Fulfillment set with id ${id} was not found`)
    const zones = await pool.query(`SELECT id FROM service_zone WHERE fulfillment_set_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id])
    const service_zones = []
    for (const z of zones.rows) service_zones.push(await this.retrieveServiceZone(z.id))
    return { ...set.rows[0], service_zones }
  }

  // ------------------------------------------------------------------ service zones
  async retrieveServiceZone(id: string) {
    const zone = await pool.query(`SELECT * FROM service_zone WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!zone.rows[0]) notFound(`Service zone with id ${id} was not found`)
    const [geo, opts] = await Promise.all([
      pool.query(`SELECT * FROM geo_zone WHERE service_zone_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
      pool.query(`SELECT id FROM shipping_option WHERE service_zone_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
    ])
    const shipping_options = []
    for (const o of opts.rows) shipping_options.push(await this.retrieveShippingOption(o.id))
    return { ...zone.rows[0], geo_zones: geo.rows, shipping_options }
  }

  private async assertSetOpen(setId: string) {
    const set = await pool.query(`SELECT * FROM fulfillment_set WHERE id = $1 AND deleted_at IS NULL`, [setId])
    if (!set.rows[0]) notFound(`Fulfillment set with id ${setId} was not found`)
    return set.rows[0]
  }

  private checkGeoZones(zones: GeoZoneInput[]) {
    for (const g of zones) {
      if (!g.country_code || g.country_code.length !== 2) bad("Each area needs a two-letter country_code")
      if (g.type === "province" && !g.province_code) bad("A province area needs a province_code")
      if (g.type === "city" && !g.city) bad("A city area needs a city")
      if (g.type === "postal" && !(g.postal_expression ?? []).length) bad("A postal area needs a postal_expression")
    }
  }

  private async assertZoneNameFree(setId: string, name: string, exceptId?: string) {
    const dup = await pool.query(
      `SELECT 1 FROM service_zone WHERE fulfillment_set_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL AND ($3::text IS NULL OR id <> $3)`,
      [setId, name, exceptId ?? null]
    )
    if (dup.rows[0]) bad(`A service zone named "${name}" already exists in this fulfillment set`)
  }

  async createServiceZone(setId: string, input: { name: string; geo_zones?: GeoZoneInput[] }) {
    await this.assertSetOpen(setId)
    const name = input.name?.trim()
    if (!name) bad("name is required")
    this.checkGeoZones(input.geo_zones ?? [])
    await this.assertZoneNameFree(setId, name)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const z = await client.query(`INSERT INTO service_zone (fulfillment_set_id, name) VALUES ($1,$2) RETURNING id`, [setId, name])
      for (const g of input.geo_zones ?? []) await this.insertGeoZone(client, z.rows[0].id, g)
      await client.query("COMMIT")
      return z.rows[0].id as string
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  private async insertGeoZone(client: { query: (t: string, p?: any[]) => Promise<any> }, zoneId: string, g: GeoZoneInput) {
    await client.query(
      `INSERT INTO geo_zone (service_zone_id, type, country_code, province_code, city, postal_expression) VALUES ($1,$2,$3,$4,$5,$6)`,
      [zoneId, g.type, g.country_code.toLowerCase(), g.province_code?.toLowerCase() ?? null, g.city ?? null, g.postal_expression ? JSON.stringify(g.postal_expression) : null]
    )
  }

  /** Renaming and/or replacing the areas: `geo_zones`, when given, is the complete new list. */
  async updateServiceZone(setId: string, zoneId: string, input: { name?: string | null; geo_zones?: GeoZoneInput[] }) {
    await this.assertSetOpen(setId)
    const zone = await pool.query(`SELECT * FROM service_zone WHERE id = $1 AND fulfillment_set_id = $2 AND deleted_at IS NULL`, [zoneId, setId])
    if (!zone.rows[0]) notFound(`Service zone with id ${zoneId} was not found on fulfillment set ${setId}`)
    if (input.name != null) {
      const name = input.name.trim()
      if (!name) bad("name cannot be empty")
      await this.assertZoneNameFree(setId, name, zoneId)
      await pool.query(`UPDATE service_zone SET name = $2 WHERE id = $1`, [zoneId, name])
    }
    if (input.geo_zones) {
      this.checkGeoZones(input.geo_zones)
      const key = (g: any) => [g.type, String(g.country_code).toLowerCase(), String(g.province_code ?? "").toLowerCase(), String(g.city ?? "").toLowerCase(), JSON.stringify(g.postal_expression ?? null)].join("|")
      const existing = (await pool.query(`SELECT * FROM geo_zone WHERE service_zone_id = $1 AND deleted_at IS NULL`, [zoneId])).rows
      const wanted = new Map(input.geo_zones.map((g) => [key({ ...g, postal_expression: g.postal_expression ? g.postal_expression : null }), g]))
      const keep = new Set<string>()
      for (const e of existing) {
        const k = key({ ...e, postal_expression: e.postal_expression ? JSON.parse(e.postal_expression) : null })
        if (wanted.has(k) && !keep.has(k)) keep.add(k)
        else await pool.query(`UPDATE geo_zone SET deleted_at = NOW() WHERE id = $1`, [e.id])
      }
      for (const [k, g] of wanted) if (!keep.has(k)) await this.insertGeoZone(pool, zoneId, g)
    }
  }

  async deleteServiceZone(setId: string, zoneId: string) {
    await this.assertSetOpen(setId)
    const zone = await pool.query(`SELECT * FROM service_zone WHERE id = $1 AND fulfillment_set_id = $2 AND deleted_at IS NULL`, [zoneId, setId])
    if (!zone.rows[0]) notFound(`Service zone with id ${zoneId} was not found on fulfillment set ${setId}`)
    await pool.query(`UPDATE shipping_option SET deleted_at = NOW() WHERE service_zone_id = $1 AND deleted_at IS NULL`, [zoneId])
    await pool.query(`UPDATE geo_zone SET deleted_at = NOW() WHERE service_zone_id = $1 AND deleted_at IS NULL`, [zoneId])
    await pool.query(`UPDATE service_zone SET deleted_at = NOW() WHERE id = $1`, [zoneId])
  }

  // ------------------------------------------------------------------ shipping option types
  async createType(input: { label: string; code: string; description?: string | null }) {
    const label = input.label?.trim()
    const code = input.code?.trim()
    if (!label) bad("label is required")
    if (!code) bad("code is required")
    const { rows } = await pool.query(`INSERT INTO shipping_option_type (label, code, description) VALUES ($1,$2,$3) RETURNING *`, [label, code, input.description?.trim() || null])
    return rows[0]
  }

  async retrieveType(id: string) {
    const { rows } = await pool.query(`SELECT * FROM shipping_option_type WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) notFound(`Shipping option type with id ${id} was not found`)
    return rows[0]
  }

  async updateType(id: string, input: { label?: string; code?: string; description?: string | null }) {
    await this.retrieveType(id)
    const sets: string[] = []
    const params: any[] = []
    const set = (c: string, v: unknown) => {
      params.push(v)
      sets.push(`${c} = $${params.length}`)
    }
    if (input.label !== undefined) {
      if (!input.label.trim()) bad("label cannot be empty")
      set("label", input.label.trim())
    }
    if (input.code !== undefined) {
      if (!input.code.trim()) bad("code cannot be empty")
      set("code", input.code.trim())
    }
    if (input.description !== undefined) set("description", input.description?.trim() || null)
    if (sets.length === 0) return this.retrieveType(id)
    sets.push("updated_at = NOW()")
    params.push(id)
    await pool.query(`UPDATE shipping_option_type SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    return this.retrieveType(id)
  }

  async deleteType(id: string) {
    await this.retrieveType(id)
    await pool.query(`UPDATE shipping_option SET shipping_option_type_id = NULL WHERE shipping_option_type_id = $1`, [id])
    await pool.query(`UPDATE shipping_option_type SET deleted_at = NOW() WHERE id = $1`, [id])
  }

  // ------------------------------------------------------------------ shipping profiles
  async createProfile(input: { name: string; type: string; metadata?: Record<string, unknown> | null }) {
    const name = input.name?.trim()
    const type = input.type?.trim()
    if (!name) bad("name is required")
    if (!type) bad("type is required")
    const dup = await pool.query(`SELECT 1 FROM shipping_profile WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`, [name])
    if (dup.rows[0]) bad(`A shipping profile named "${name}" already exists`)
    const { rows } = await pool.query(`INSERT INTO shipping_profile (name, type, metadata) VALUES ($1,$2,$3) RETURNING *`, [name, type, input.metadata ?? null])
    return rows[0]
  }

  async updateProfile(id: string, input: { name?: string; type?: string; metadata?: Record<string, unknown> | null }) {
    const cur = await pool.query(`SELECT * FROM shipping_profile WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!cur.rows[0]) notFound(`Shipping profile with id ${id} was not found`)
    const sets: string[] = []
    const params: any[] = []
    const set = (c: string, v: unknown) => {
      params.push(v)
      sets.push(`${c} = $${params.length}`)
    }
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) bad("name cannot be empty")
      const dup = await pool.query(`SELECT 1 FROM shipping_profile WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL AND id <> $2`, [name, id])
      if (dup.rows[0]) bad(`A shipping profile named "${name}" already exists`)
      set("name", name)
    }
    if (input.type !== undefined) {
      if (!input.type.trim()) bad("type cannot be empty")
      set("type", input.type.trim())
    }
    if (input.metadata !== undefined) set("metadata", input.metadata)
    if (sets.length === 0) return cur.rows[0]
    sets.push("updated_at = NOW()")
    params.push(id)
    const { rows } = await pool.query(`UPDATE shipping_profile SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params)
    return rows[0]
  }

  async deleteProfile(id: string) {
    const cur = await pool.query(`SELECT 1 FROM shipping_profile WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!cur.rows[0]) notFound(`Shipping profile with id ${id} was not found`)
    await pool.query(`UPDATE shipping_profile SET deleted_at = NOW() WHERE id = $1`, [id])
  }

  // ------------------------------------------------------------------ shipping options
  async retrieveShippingOption(id: string) {
    const opt = await pool.query(`SELECT * FROM shipping_option WHERE id = $1 AND deleted_at IS NULL`, [id])
    const o = opt.rows[0]
    if (!o) notFound(`Shipping option with id ${id} was not found`)
    const [profile, type, prices, rules] = await Promise.all([
      o.shipping_profile_id ? pool.query(`SELECT * FROM shipping_profile WHERE id = $1`, [o.shipping_profile_id]) : Promise.resolve({ rows: [] as any[] }),
      o.shipping_option_type_id ? pool.query(`SELECT * FROM shipping_option_type WHERE id = $1`, [o.shipping_option_type_id]) : Promise.resolve({ rows: [] as any[] }),
      pool.query(`SELECT * FROM shipping_option_price WHERE shipping_option_id = $1 AND deleted_at IS NULL ORDER BY created_at, id`, [id]),
      pool.query(`SELECT * FROM shipping_option_rule WHERE shipping_option_id = $1 ORDER BY created_at`, [id]),
    ])
    const set = o.service_zone_id
      ? (await pool.query(`SELECT fs.id, fs.type, fs.stock_location_id FROM service_zone sz JOIN fulfillment_set fs ON fs.id = sz.fulfillment_set_id WHERE sz.id = $1`, [o.service_zone_id])).rows[0]
      : null
    return {
      ...o,
      amount: Number(o.amount),
      shipping_profile: profile.rows[0] ?? null,
      type: type.rows[0] ?? null,
      fulfillment_set_type: set?.type ?? null,
      stock_location_id: set?.stock_location_id ?? null,
      prices: prices.rows.map((p: any) => ({ ...p, amount: Number(p.amount) })),
      // Lupus reports is_return / enabled_in_store as rules; both are real columns here
      rules: [
        { attribute: "is_return", operator: "eq", value: o.is_return ? "true" : "false" },
        { attribute: "enabled_in_store", operator: "eq", value: o.enabled_in_store ? "true" : "false" },
        ...rules.rows,
      ],
    }
  }

  private async normalizePrices(prices: PriceInput[]) {
    const seen = new Set<string>()
    const out: { currency_code: string | null; region_id: string | null; amount: number; rules: any[] }[] = []
    for (const p of prices) {
      const currency = p.currency_code?.toLowerCase() ?? null
      if (!!currency === !!p.region_id) bad("Each price needs either a currency_code or a region_id")
      if (!Number.isInteger(p.amount) || p.amount < 0) bad("A price amount must be a whole number of 0 or more")
      if (p.region_id) {
        const r = await pool.query(`SELECT id FROM region WHERE id = $1 AND deleted_at IS NULL`, [p.region_id])
        if (!r.rows[0]) bad(`Region ${p.region_id} was not found`, 404)
      }
      const rules = (p.rules ?? []).filter((r) => r.attribute === "item_total")
      let gte: number | null = null
      let lte: number | null = null
      for (const r of rules) {
        if (!["eq", "gt", "gte", "lt", "lte"].includes(r.operator)) bad(`Unsupported price rule operator ${r.operator}`)
        if (Number.isNaN(Number(r.value))) bad("A price rule value must be a number")
        if (r.operator === "gte") gte = Number(r.value)
        if (r.operator === "lte") lte = Number(r.value)
      }
      if (gte != null && lte != null && gte > lte) bad("The minimum cart item total cannot be greater than the maximum")
      const key = [currency ?? "", p.region_id ?? "", JSON.stringify(rules.map((r) => [r.operator, String(r.value)]).sort())].join("|")
      if (seen.has(key)) bad("Two prices cover the same currency/region and conditions")
      seen.add(key)
      out.push({ currency_code: currency, region_id: p.region_id ?? null, amount: p.amount, rules: rules.map((r) => ({ attribute: "item_total", operator: r.operator, value: String(r.value) })) })
    }
    return out
  }

  private async checkOptionRefs(input: { service_zone_id?: string | null; provider_id: string; price_type: string; shipping_profile_id?: string | null; type_id?: string | null; data?: any }) {
    let locationId: string | null = null
    if (input.service_zone_id) {
      const z = await pool.query(
        `SELECT fs.stock_location_id FROM service_zone sz JOIN fulfillment_set fs ON fs.id = sz.fulfillment_set_id AND fs.deleted_at IS NULL WHERE sz.id = $1 AND sz.deleted_at IS NULL`,
        [input.service_zone_id]
      )
      if (!z.rows[0]) notFound(`Service zone with id ${input.service_zone_id} was not found`)
      locationId = z.rows[0].stock_location_id
    }
    if (!PROVIDERS.some((p) => p.id === input.provider_id)) bad(`Fulfillment provider ${input.provider_id} was not found`, 404)
    if (locationId) {
      const linked = await pool.query(`SELECT 1 FROM stock_location_fulfillment_provider WHERE stock_location_id = $1 AND provider_id = $2`, [locationId, input.provider_id])
      if (!linked.rows[0]) bad(`Fulfillment provider ${input.provider_id} is not connected to this stock location`)
    }
    if (input.price_type === "calculated" && !CALCULATING_PROVIDERS.has(input.provider_id)) {
      bad(`The fulfillment provider ${input.provider_id} cannot calculate prices; use a fixed price`)
    }
    if (input.shipping_profile_id) {
      const p = await pool.query(`SELECT 1 FROM shipping_profile WHERE id = $1 AND deleted_at IS NULL`, [input.shipping_profile_id])
      if (!p.rows[0]) bad(`Shipping profile ${input.shipping_profile_id} was not found`, 404)
    }
    if (input.type_id) {
      const t = await pool.query(`SELECT 1 FROM shipping_option_type WHERE id = $1 AND deleted_at IS NULL`, [input.type_id])
      if (!t.rows[0]) bad(`Shipping option type ${input.type_id} was not found`, 404)
    }
    if (input.data?.id) {
      const known = (PROVIDER_OPTIONS[input.provider_id] ?? []).some((o) => o.id === input.data.id)
      if (!known) bad(`The fulfillment option ${input.data.id} is not offered by provider ${input.provider_id}`)
    }
  }

  private flags(rules: { attribute: string; operator?: string; value: string }[] | undefined) {
    let is_return: boolean | undefined
    let enabled_in_store: boolean | undefined
    const rest: { attribute: string; operator: string; value: string }[] = []
    for (const r of rules ?? []) {
      if (r.attribute === "is_return") is_return = String(r.value) === "true"
      else if (r.attribute === "enabled_in_store") enabled_in_store = String(r.value) === "true"
      else rest.push({ attribute: r.attribute, operator: r.operator ?? "eq", value: String(r.value) })
    }
    return { is_return, enabled_in_store, rest }
  }

  private async resolveType(input: { type_id?: string | null; type?: { label: string; code: string; description?: string | null } | null }) {
    if (input.type_id) return input.type_id
    if (input.type) return (await this.createType(input.type)).id as string
    return null
  }

  async createShippingOption(input: ShippingOptionInput) {
    const name = input.name?.trim()
    if (!name) bad("name is required")
    const price_type = input.price_type ?? "flat"
    const provider_id = input.provider_id ?? "manual"
    await this.checkOptionRefs({ service_zone_id: input.service_zone_id, provider_id, price_type, shipping_profile_id: input.shipping_profile_id, type_id: input.type_id, data: input.data })
    const f = this.flags(input.rules)
    const priceInput: PriceInput[] =
      input.prices ?? (input.amount != null && input.currency_code ? [{ currency_code: input.currency_code, amount: input.amount }] : [])
    if (price_type === "calculated" && priceInput.length > 0) bad("A calculated shipping option cannot have prices")
    const prices = await this.normalizePrices(priceInput)
    const zone = input.service_zone_id
      ? (await pool.query(`SELECT sz.name, sz.fulfillment_set_id FROM service_zone sz WHERE sz.id = $1`, [input.service_zone_id])).rows[0]
      : null
    const typeId = await this.resolveType(input)
    const first = prices.find((p) => p.currency_code && p.rules.length === 0) ?? prices.find((p) => p.currency_code) ?? null
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO shipping_option (name, price_type, provider_id, service_zone_id, service_zone_name, fulfillment_set_id, shipping_profile_id, shipping_option_type_id,
                                      country_code, amount, currency_code, is_return, enabled_in_store, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [
          name,
          price_type,
          provider_id,
          input.service_zone_id ?? null,
          zone?.name ?? null,
          zone?.fulfillment_set_id ?? input.fulfillment_set_id ?? null,
          input.shipping_profile_id ?? null,
          typeId,
          input.country_code?.toLowerCase() ?? null,
          first?.amount ?? 0,
          first?.currency_code ?? "usd",
          f.is_return ?? input.is_return ?? false,
          f.enabled_in_store ?? true,
          input.data ?? null,
        ]
      )
      const id = rows[0].id as string
      for (const p of prices) {
        await client.query(`INSERT INTO shipping_option_price (shipping_option_id, currency_code, region_id, amount, rules) VALUES ($1,$2,$3,$4,$5)`, [id, p.currency_code, p.region_id, p.amount, JSON.stringify(p.rules)])
      }
      for (const r of f.rest) {
        await client.query(`INSERT INTO shipping_option_rule (shipping_option_id, attribute, operator, value) VALUES ($1,$2,$3,$4)`, [id, r.attribute, r.operator, r.value])
      }
      await client.query("COMMIT")
      return this.retrieveShippingOption(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async updateShippingOption(id: string, input: ShippingOptionInput) {
    const cur = (await pool.query(`SELECT * FROM shipping_option WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0]
    if (!cur) notFound(`Shipping option with id ${id} was not found`)
    const price_type = input.price_type ?? cur.price_type
    const provider_id = input.provider_id ?? cur.provider_id
    const shipping_profile_id = input.shipping_profile_id === undefined ? cur.shipping_profile_id : input.shipping_profile_id
    await this.checkOptionRefs({ service_zone_id: cur.service_zone_id, provider_id, price_type, shipping_profile_id, type_id: input.type_id, data: input.data })
    const f = this.flags(input.rules)
    let prices: Awaited<ReturnType<LocationsService["normalizePrices"]>> | null = null
    if (input.prices) {
      if (price_type === "calculated" && input.prices.length > 0) bad("A calculated shipping option cannot have prices")
      prices = await this.normalizePrices(input.prices)
    } else if (input.amount != null && input.currency_code) {
      prices = await this.normalizePrices([{ currency_code: input.currency_code, amount: input.amount }])
    }
    const sets: string[] = []
    const params: any[] = []
    const set = (c: string, v: unknown) => {
      params.push(v)
      sets.push(`${c} = $${params.length}`)
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) bad("name cannot be empty")
      set("name", input.name.trim())
    }
    set("price_type", price_type)
    set("provider_id", provider_id)
    set("shipping_profile_id", shipping_profile_id ?? null)
    if (input.type_id !== undefined || input.type) set("shipping_option_type_id", await this.resolveType(input))
    if (input.data !== undefined) set("data", input.data)
    if (f.is_return !== undefined) set("is_return", f.is_return)
    else if (input.is_return !== undefined) set("is_return", input.is_return)
    if (f.enabled_in_store !== undefined) set("enabled_in_store", f.enabled_in_store)
    if (input.country_code !== undefined) set("country_code", input.country_code?.toLowerCase() ?? null)
    if (input.fulfillment_set_id !== undefined) set("fulfillment_set_id", input.fulfillment_set_id)
    if (input.service_zone_name !== undefined) set("service_zone_name", input.service_zone_name)
    if (prices) {
      const first = prices.find((p) => p.currency_code && p.rules.length === 0) ?? prices.find((p) => p.currency_code)
      if (first) {
        set("amount", first.amount)
        set("currency_code", first.currency_code)
      }
    }
    sets.push("updated_at = NOW()")
    params.push(id)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`UPDATE shipping_option SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
      if (prices) {
        await client.query(`UPDATE shipping_option_price SET deleted_at = NOW() WHERE shipping_option_id = $1 AND deleted_at IS NULL`, [id])
        for (const p of prices) {
          await client.query(`INSERT INTO shipping_option_price (shipping_option_id, currency_code, region_id, amount, rules) VALUES ($1,$2,$3,$4,$5)`, [id, p.currency_code, p.region_id, p.amount, JSON.stringify(p.rules)])
        }
      }
      if (input.rules) {
        await client.query(`DELETE FROM shipping_option_rule WHERE shipping_option_id = $1`, [id])
        for (const r of f.rest) {
          await client.query(`INSERT INTO shipping_option_rule (shipping_option_id, attribute, operator, value) VALUES ($1,$2,$3,$4)`, [id, r.attribute, r.operator, r.value])
        }
      }
      await client.query("COMMIT")
      return this.retrieveShippingOption(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async deleteShippingOption(id: string) {
    const r = await pool.query(`UPDATE shipping_option SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (r.rowCount === 0) notFound(`Shipping option with id ${id} was not found`)
  }
}

export interface GeoZoneInput {
  type: "country" | "province" | "city" | "postal"
  country_code: string
  province_code?: string | null
  city?: string | null
  postal_expression?: string[] | null
}

export interface PriceInput {
  currency_code?: string | null
  region_id?: string | null
  amount: number
  rules?: { attribute: string; operator: string; value: string | number }[]
}

export interface ShippingOptionInput {
  name?: string
  price_type?: "flat" | "calculated"
  provider_id?: string
  service_zone_id?: string | null
  shipping_profile_id?: string | null
  type_id?: string | null
  type?: { label: string; code: string; description?: string | null } | null
  data?: Record<string, any> | null
  prices?: PriceInput[]
  rules?: { attribute: string; operator?: string; value: string }[]
  // legacy single-price form
  amount?: number
  currency_code?: string
  country_code?: string | null
  fulfillment_set_id?: string | null
  is_return?: boolean
  service_zone_name?: string | null
}

export const locationsService = new LocationsService()
