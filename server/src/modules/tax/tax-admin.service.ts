import { pool } from "../../db"
import { COUNTRY_CODES } from "../region/region-admin.service"

// Lupus "Tax Regions" (Settings): a tax region is a country (or one of its provinces), it names a tax
// provider and owns tax rates. Exactly one rate is the region's default; other rates are overrides that
// only apply to the products, product types or shipping options listed in their rules.
// Refs: upstream/packages/modules/tax (regions, rates, rate rules), core-flows create-tax-regions.

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}

export type RuleReference = "product" | "product_type" | "shipping_option"
const REFERENCE_TABLE: Record<RuleReference, { table: string; noun: string }> = {
  product: { table: "product", noun: "Product" },
  product_type: { table: "product_type", noun: "Product type" },
  shipping_option: { table: "shipping_option", noun: "Shipping option" },
}
const VALID_COUNTRY = new Set(COUNTRY_CODES)

export interface RuleInput {
  reference: RuleReference
  reference_id: string
}

export interface RateInput {
  name?: string
  code?: string
  rate?: number | null
  is_default?: boolean
  is_combinable?: boolean
  rules?: RuleInput[]
  metadata?: Record<string, unknown> | null
}

export interface RegionInput {
  country_code: string
  province_code?: string | null
  parent_id?: string | null
  provider_id?: string | null
  default_tax_rate?: { name: string; code: string; rate?: number | null; is_combinable?: boolean } | null
  metadata?: Record<string, unknown> | null
}

const rateShape = (row: any, rules: any[] = []) => ({
  id: row.id,
  tax_region_id: row.tax_region_id,
  name: row.name,
  code: row.code,
  rate: row.rate === null ? null : Number(row.rate),
  is_default: !!row.is_default,
  is_combinable: !!row.is_combinable,
  metadata: row.metadata ?? null,
  rules: rules.map(ruleShape),
  created_by: row.created_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at ?? row.created_at,
  deleted_at: row.deleted_at ?? null,
})

const ruleShape = (row: any) => ({
  id: row.id,
  tax_rate_id: row.tax_rate_id,
  reference: row.reference,
  reference_id: row.reference_id,
  metadata: row.metadata ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at ?? row.created_at,
})

const regionBase = (row: any) => ({
  id: row.id,
  country_code: row.country_code,
  province_code: row.province_code ?? null,
  parent_id: row.parent_id ?? null,
  provider_id: row.provider_id,
  metadata: row.metadata ?? null,
  created_by: row.created_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at ?? row.created_at,
  deleted_at: row.deleted_at ?? null,
})

export class TaxAdminService {
  // ---------- providers ----------

  async listProviders() {
    const { rows } = await pool.query(`SELECT * FROM tax_provider ORDER BY id`)
    return rows.map((r: any) => ({ id: r.id, is_enabled: !!r.is_enabled }))
  }

  // ---------- reads ----------

  async ratesOf(regionIds: string[]) {
    if (regionIds.length === 0) return new Map<string, any[]>()
    const rates = await pool.query(`SELECT * FROM tax_rate WHERE tax_region_id = ANY($1) AND deleted_at IS NULL ORDER BY is_default DESC, created_at`, [regionIds])
    const rules = await this.rulesOf(rates.rows.map((r: any) => r.id))
    const out = new Map<string, any[]>()
    for (const r of rates.rows) out.set(r.tax_region_id, [...(out.get(r.tax_region_id) ?? []), rateShape(r, rules.get(r.id) ?? [])])
    return out
  }

  async rulesOf(rateIds: string[]) {
    const out = new Map<string, any[]>()
    if (rateIds.length === 0) return out
    const { rows } = await pool.query(`SELECT * FROM tax_rate_rule WHERE tax_rate_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at`, [rateIds])
    for (const r of rows) out.set(r.tax_rate_id, [...(out.get(r.tax_rate_id) ?? []), r])
    return out
  }

  async hydrateRegions(rows: any[]) {
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const [rates, kids, parents] = await Promise.all([
      this.ratesOf(ids),
      pool.query(`SELECT * FROM tax_region WHERE parent_id = ANY($1) AND deleted_at IS NULL ORDER BY province_code`, [ids]),
      pool.query(`SELECT * FROM tax_region WHERE id = ANY($1) AND deleted_at IS NULL`, [rows.map((r) => r.parent_id).filter(Boolean)]),
    ])
    const childRates = await this.ratesOf(kids.rows.map((k: any) => k.id))
    const children = new Map<string, any[]>()
    for (const k of kids.rows) children.set(k.parent_id, [...(children.get(k.parent_id) ?? []), { ...regionBase(k), tax_rates: childRates.get(k.id) ?? [] }])
    const parentById = new Map(parents.rows.map((p: any) => [p.id, regionBase(p)]))
    return rows.map((r) => ({
      ...regionBase(r),
      tax_rates: rates.get(r.id) ?? [],
      children: children.get(r.id) ?? [],
      parent: r.parent_id ? (parentById.get(r.parent_id) ?? null) : null,
    }))
  }

  async retrieveRegion(id: string) {
    const { rows } = await pool.query(`SELECT * FROM tax_region WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) fail(`Tax region with id: ${id} was not found`, 404)
    return (await this.hydrateRegions(rows))[0]
  }

  async retrieveRate(id: string) {
    const { rows } = await pool.query(`SELECT * FROM tax_rate WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) fail(`Tax rate with id: ${id} was not found`, 404)
    return (await this.hydrateRates(rows))[0]
  }

  async hydrateRates(rows: any[]) {
    const rules = await this.rulesOf(rows.map((r) => r.id))
    const regionIds = [...new Set(rows.map((r) => r.tax_region_id))]
    const regions = regionIds.length ? await pool.query(`SELECT * FROM tax_region WHERE id = ANY($1)`, [regionIds]) : { rows: [] as any[] }
    const byId = new Map(regions.rows.map((r: any) => [r.id, regionBase(r)]))
    return rows.map((r) => ({ ...rateShape(r, rules.get(r.id) ?? []), tax_region: byId.get(r.tax_region_id) ?? null }))
  }

  // ---------- regions ----------

  async createRegion(input: RegionInput, createdBy: string | null) {
    const country = input.country_code.trim().toLowerCase()
    if (!VALID_COUNTRY.has(country)) fail(`Invalid country code: ${input.country_code}`)
    const province = input.province_code?.trim().toLowerCase() || null

    let parent: any = null
    if (input.parent_id) {
      const p = await pool.query(`SELECT * FROM tax_region WHERE id = $1 AND deleted_at IS NULL`, [input.parent_id])
      parent = p.rows[0]
      if (!parent) fail(`Tax region with id: ${input.parent_id} was not found`, 404)
      if (parent.parent_id) fail("A province cannot have sub-regions of its own")
      if (parent.country_code !== country) fail("A province must be in the same country as its parent region")
      if (!province) fail("province_code is required for a region below a country")
    } else if (province) {
      const p = await pool.query(`SELECT * FROM tax_region WHERE country_code = $1 AND province_code IS NULL AND parent_id IS NULL AND deleted_at IS NULL`, [country])
      parent = p.rows[0]
      if (!parent) fail("Create the country tax region before adding a province to it")
    }

    const providerId = input.provider_id ?? parent?.provider_id ?? "system"
    await this.assertProvider(providerId)

    const dup = await pool.query(`SELECT 1 FROM tax_region WHERE country_code = $1 AND COALESCE(province_code,'') = $2 AND deleted_at IS NULL`, [country, province ?? ""])
    if (dup.rows[0]) fail(`Tax region with country_code: ${country}, province_code: ${province ?? "null"} already exists`, 409)

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO tax_region (country_code, province_code, parent_id, provider_id, metadata, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [country, province, parent?.id ?? null, providerId, input.metadata ?? null, createdBy]
      )
      const id = rows[0].id as string
      if (input.default_tax_rate) {
        const d = input.default_tax_rate
        this.checkRateValue(d.rate)
        if (!d.name?.trim() || !d.code?.trim()) fail("The default tax rate needs a name and a code")
        await client.query(
          `INSERT INTO tax_rate (tax_region_id, name, code, rate, is_default, is_combinable, created_by) VALUES ($1,$2,$3,$4,TRUE,$5,$6)`,
          [id, d.name.trim(), d.code.trim(), d.rate ?? 0, d.is_combinable ?? false, createdBy]
        )
      }
      await client.query("COMMIT")
      return this.retrieveRegion(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async updateRegion(id: string, input: { provider_id?: string; metadata?: Record<string, unknown> | null }) {
    await this.retrieveRegion(id)
    const sets: string[] = []
    const params: unknown[] = []
    if (input.provider_id !== undefined) {
      await this.assertProvider(input.provider_id)
      params.push(input.provider_id)
      sets.push(`provider_id = $${params.length}`)
    }
    if (input.metadata !== undefined) {
      params.push(input.metadata)
      sets.push(`metadata = $${params.length}`)
    }
    sets.push("updated_at = NOW()")
    params.push(id)
    await pool.query(`UPDATE tax_region SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    return this.retrieveRegion(id)
  }

  async removeRegion(id: string) {
    const gone = await pool.query(`UPDATE tax_region SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) fail(`Tax region with id: ${id} was not found`, 404)
    // its provinces go with it, together with every rate and rule below them
    await pool.query(`UPDATE tax_region SET deleted_at = NOW(), updated_at = NOW() WHERE parent_id = $1 AND deleted_at IS NULL`, [id])
    const scope = `(SELECT id FROM tax_region WHERE id = $1 OR parent_id = $1)`
    await pool.query(`UPDATE tax_rate_rule SET deleted_at = NOW() WHERE deleted_at IS NULL AND tax_rate_id IN (SELECT id FROM tax_rate WHERE tax_region_id IN ${scope})`, [id])
    await pool.query(`UPDATE tax_rate SET deleted_at = NOW(), updated_at = NOW() WHERE deleted_at IS NULL AND tax_region_id IN ${scope}`, [id])
  }

  private async assertProvider(id: string) {
    const p = await pool.query(`SELECT 1 FROM tax_provider WHERE id = $1 AND is_enabled = TRUE`, [id])
    if (!p.rows[0]) fail(`Tax provider with id: ${id} was not found`, 404)
  }

  // ---------- rates ----------

  private checkRateValue(rate?: number | null) {
    if (rate !== undefined && rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) fail("A tax rate must be a percentage between 0 and 100")
  }

  private async checkRules(rules: RuleInput[]) {
    const seen = new Set<string>()
    for (const rule of rules) {
      const cfg = REFERENCE_TABLE[rule.reference]
      if (!cfg) fail(`Unknown rule reference: ${rule.reference}`)
      const key = `${rule.reference}:${rule.reference_id}`
      if (seen.has(key)) fail(`Duplicate rule: ${rule.reference} ${rule.reference_id}`)
      seen.add(key)
      const found = await pool.query(`SELECT 1 FROM ${cfg.table} WHERE id = $1 AND deleted_at IS NULL`, [rule.reference_id])
      if (!found.rows[0]) fail(`${cfg.noun} with id: ${rule.reference_id} was not found`, 404)
    }
  }

  async createRate(input: RateInput & { tax_region_id: string; name: string; code: string }, createdBy: string | null) {
    const region = await pool.query(`SELECT id FROM tax_region WHERE id = $1 AND deleted_at IS NULL`, [input.tax_region_id])
    if (!region.rows[0]) fail(`Tax region with id: ${input.tax_region_id} was not found`, 404)
    const name = input.name.trim()
    const code = input.code.trim()
    if (!name) fail("name is required")
    if (!code) fail("code is required")
    this.checkRateValue(input.rate)
    const rules = input.rules ?? []
    if (input.is_default && rules.length > 0) fail("A default tax rate cannot have rules")
    await this.checkRules(rules)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      if (input.is_default) await client.query(`UPDATE tax_rate SET is_default = FALSE, updated_at = NOW() WHERE tax_region_id = $1 AND is_default = TRUE AND deleted_at IS NULL`, [input.tax_region_id])
      const { rows } = await client.query(
        `INSERT INTO tax_rate (tax_region_id, name, code, rate, is_default, is_combinable, metadata, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [input.tax_region_id, name, code, input.rate ?? 0, input.is_default ?? false, input.is_combinable ?? false, input.metadata ?? null, createdBy]
      )
      for (const rule of rules) await client.query(`INSERT INTO tax_rate_rule (tax_rate_id, reference, reference_id, created_by) VALUES ($1,$2,$3,$4)`, [rows[0].id, rule.reference, rule.reference_id, createdBy])
      await client.query("COMMIT")
      return this.retrieveRate(rows[0].id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async updateRate(id: string, input: RateInput) {
    const cur = await this.retrieveRate(id)
    const name = input.name !== undefined ? input.name.trim() : undefined
    const code = input.code !== undefined ? input.code.trim() : undefined
    if (name === "") fail("name cannot be empty")
    if (code === "") fail("code cannot be empty")
    this.checkRateValue(input.rate)
    const makeDefault = input.is_default === true
    const rules = input.rules
    if ((makeDefault || (input.is_default === undefined && cur.is_default)) && (rules ?? cur.rules).length > 0) fail("A default tax rate cannot have rules")
    if (rules) await this.checkRules(rules)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      if (makeDefault) await client.query(`UPDATE tax_rate SET is_default = FALSE, updated_at = NOW() WHERE tax_region_id = $1 AND id <> $2 AND is_default = TRUE AND deleted_at IS NULL`, [cur.tax_region_id, id])
      const sets: string[] = []
      const params: unknown[] = []
      const set = (column: string, value: unknown) => {
        params.push(value)
        sets.push(`${column} = $${params.length}`)
      }
      if (name !== undefined) set("name", name)
      if (code !== undefined) set("code", code)
      if (input.rate !== undefined) set("rate", input.rate)
      if (input.is_default !== undefined) set("is_default", input.is_default)
      if (input.is_combinable !== undefined) set("is_combinable", input.is_combinable)
      if (input.metadata !== undefined) set("metadata", input.metadata)
      sets.push("updated_at = NOW()")
      params.push(id)
      await client.query(`UPDATE tax_rate SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
      if (rules) {
        await client.query(`UPDATE tax_rate_rule SET deleted_at = NOW() WHERE tax_rate_id = $1 AND deleted_at IS NULL`, [id])
        for (const rule of rules) await client.query(`INSERT INTO tax_rate_rule (tax_rate_id, reference, reference_id) VALUES ($1,$2,$3)`, [id, rule.reference, rule.reference_id])
      }
      await client.query("COMMIT")
      return this.retrieveRate(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async removeRate(id: string) {
    const gone = await pool.query(`UPDATE tax_rate SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) fail(`Tax rate with id: ${id} was not found`, 404)
    await pool.query(`UPDATE tax_rate_rule SET deleted_at = NOW() WHERE tax_rate_id = $1 AND deleted_at IS NULL`, [id])
  }

  // ---------- rate rules ----------

  async addRule(rateId: string, rule: RuleInput, createdBy: string | null) {
    const rate = await this.retrieveRate(rateId)
    if (rate.is_default) fail("A default tax rate cannot have rules")
    await this.checkRules([rule])
    const dup = await pool.query(`SELECT 1 FROM tax_rate_rule WHERE tax_rate_id = $1 AND reference = $2 AND reference_id = $3 AND deleted_at IS NULL`, [rateId, rule.reference, rule.reference_id])
    if (dup.rows[0]) fail(`The tax rate already has a rule for ${rule.reference} ${rule.reference_id}`, 409)
    await pool.query(`INSERT INTO tax_rate_rule (tax_rate_id, reference, reference_id, created_by) VALUES ($1,$2,$3,$4)`, [rateId, rule.reference, rule.reference_id, createdBy])
    await pool.query(`UPDATE tax_rate SET updated_at = NOW() WHERE id = $1`, [rateId])
    return this.retrieveRate(rateId)
  }

  async removeRule(rateId: string, ruleId: string) {
    const gone = await pool.query(`UPDATE tax_rate_rule SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tax_rate_id = $2 AND deleted_at IS NULL RETURNING id`, [ruleId, rateId])
    if (!gone.rows[0]) fail(`Tax rate rule with id: ${ruleId} was not found`, 404)
    await pool.query(`UPDATE tax_rate SET updated_at = NOW() WHERE id = $1`, [rateId])
    return this.retrieveRate(rateId)
  }
}

export const taxAdminService = new TaxAdminService()
