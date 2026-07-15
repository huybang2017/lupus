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
