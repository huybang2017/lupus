import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import type { FilterSpec } from "../infra/list-query"
import { buildListQuery, queryList, sendList } from "../infra/list-query"
import { requirePolicy } from "../platform/admin-platform.routes"
import { taxAdminService as svc } from "./tax-admin.service"

// Admin endpoints for Settings > Tax Regions (regions, their rates and the rate override rules).
export const taxAdminRouter = Router()

const metadata = z.record(z.string(), z.unknown()).nullish()
const rule = z.object({ reference: z.enum(["product", "product_type", "shipping_option"]), reference_id: z.string().min(1) })
const rateBody = {
  name: z.string().optional(),
  code: z.string().optional(),
  rate: z.number().nullish(),
  is_default: z.boolean().optional(),
  is_combinable: z.boolean().optional(),
  rules: z.array(rule).optional(),
  metadata,
}

const REGION_FILTERS: FilterSpec[] = [
  { key: "id", column: "t.id", op: "in" },
  { key: "country_code", column: "t.country_code", op: "in", coerce: (v) => v.toLowerCase() },
  { key: "province_code", column: "t.province_code", op: "in", coerce: (v) => v.toLowerCase() },
  { key: "provider_id", column: "t.provider_id", op: "in" },
  { key: "created_at", column: "t.created_at", op: "gte" },
  { key: "created_at", column: "t.created_at", op: "lte" },
  { key: "updated_at", column: "t.updated_at", op: "gte" },
  { key: "updated_at", column: "t.updated_at", op: "lte" },
]
const REGION_SORT = { created_at: "t.created_at", updated_at: "t.updated_at", country_code: "t.country_code", province_code: "t.province_code" }

const RATE_FILTERS: FilterSpec[] = [
  { key: "id", column: "tr.id", op: "in" },
  { key: "tax_region_id", column: "tr.tax_region_id", op: "in" },
  { key: "code", column: "tr.code", op: "in" },
  { key: "name", column: "tr.name", op: "ilike" },
  { key: "is_default", column: "tr.is_default", op: "bool" },
  { key: "is_combinable", column: "tr.is_combinable", op: "bool" },
  { key: "created_at", column: "tr.created_at", op: "gte" },
  { key: "created_at", column: "tr.created_at", op: "lte" },
  { key: "updated_at", column: "tr.updated_at", op: "gte" },
  { key: "updated_at", column: "tr.updated_at", op: "lte" },
]
const RATE_SORT = { created_at: "tr.created_at", updated_at: "tr.updated_at", name: "tr.name", code: "tr.code", rate: "tr.rate" }

// ---------- providers ----------

taxAdminRouter.get("/admin/tax-providers", requireAuth, async (_req, res, next) => {
  try {
    const providers = await svc.listProviders()
    res.json({ tax_providers: providers, count: providers.length, offset: 0, limit: providers.length })
  } catch (e) {
    next(e)
  }
})

// ---------- regions ----------

taxAdminRouter.get("/admin/tax-regions", requireAuth, async (req, res, next) => {
  try {
    const lq = buildListQuery({
      base: "t.deleted_at IS NULL",
      query: req.query,
      specs: REGION_FILTERS,
      // a region has no name of its own: search by its country / province codes
      q: { columns: ["t.country_code", "t.province_code"] },
      order: REGION_SORT,
      defaultOrder: "t.created_at DESC",
      defaultLimit: 20,
    })
    // parent_id=null lists the countries only; parent_id=<id> lists the provinces of one country
    const parents = queryList(req.query.parent_id)
    const params = [...lq.params]
    const conditions = [lq.where.replace(/^WHERE\s+/i, "")]
    if (parents.length > 0) {
      const ids = parents.filter((p) => p !== "null")
      const parts: string[] = []
      if (parents.includes("null")) parts.push("t.parent_id IS NULL")
      if (ids.length > 0) {
        params.push(ids)
        parts.push(`t.parent_id = ANY($${params.length})`)
      }
      conditions.push(`(${parts.join(" OR ")})`)
    }
    const where = `WHERE ${conditions.filter((c) => c.length > 0).join(" AND ")}`
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM tax_region t ${where}`, params)
    const { rows } = await pool.query(`SELECT t.* FROM tax_region t ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, lq.limit, lq.offset])
    sendList(res, { tax_regions: await svc.hydrateRegions(rows), count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.get("/admin/tax-regions/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ tax_region: await svc.retrieveRegion(req.params.id) })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.post("/admin/tax-regions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z
      .object({
        country_code: z.string().length(2),
        province_code: z.string().nullish(),
        parent_id: z.string().nullish(),
        provider_id: z.string().nullish(),
        default_tax_rate: z.object({ name: z.string(), code: z.string(), rate: z.number().nullish(), is_combinable: z.boolean().optional() }).nullish(),
        metadata,
      })
      .parse(req.body ?? {})
    const region = await svc.createRegion(input, req.auth?.email ?? null)
    // `tax_region_id` is the older lupus spelling some callers still read
    res.status(201).json({ tax_region: region, tax_region_id: region.id })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.post("/admin/tax-regions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ provider_id: z.string().optional(), metadata }).passthrough().parse(req.body ?? {})
    res.json({ tax_region: await svc.updateRegion(req.params.id, { provider_id: input.provider_id, metadata: input.metadata }) })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.delete("/admin/tax-regions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await svc.removeRegion(req.params.id)
    res.json({ id: req.params.id, object: "tax_region", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------- rates ----------

taxAdminRouter.get("/admin/tax-rates", requireAuth, async (req, res, next) => {
  try {
    const lq = buildListQuery({
      base: "tr.deleted_at IS NULL",
      query: req.query,
      specs: RATE_FILTERS,
      q: { columns: ["tr.name", "tr.code"] },
      order: RATE_SORT,
      defaultOrder: "tr.created_at DESC",
      defaultLimit: 20,
    })
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM tax_rate tr ${lq.where}`, lq.params)
    const { rows } = await pool.query(`SELECT tr.* FROM tax_rate tr ${lq.where} ${order} LIMIT $${lq.params.length + 1} OFFSET $${lq.params.length + 2}`, [...lq.params, lq.limit, lq.offset])
    sendList(res, { tax_rates: await svc.hydrateRates(rows), count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.get("/admin/tax-rates/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ tax_rate: await svc.retrieveRate(req.params.id) })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.post("/admin/tax-rates", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ ...rateBody, tax_region_id: z.string(), name: z.string().min(1), code: z.string().min(1) }).parse(req.body ?? {})
    res.status(201).json({ tax_rate: await svc.createRate(input as any, req.auth?.email ?? null) })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.post("/admin/tax-rates/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object(rateBody).parse(req.body ?? {})
    res.json({ tax_rate: await svc.updateRate(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.delete("/admin/tax-rates/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await svc.removeRate(req.params.id)
    res.json({ id: req.params.id, object: "tax_rate", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------- rate rules ----------

taxAdminRouter.post("/admin/tax-rates/:id/rules", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = rule.parse(req.body ?? {})
    res.json({ tax_rate: await svc.addRule(req.params.id, input, req.auth?.email ?? null) })
  } catch (e) {
    next(e)
  }
})

taxAdminRouter.delete("/admin/tax-rates/:id/rules/:rule_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const parent = await svc.removeRule(req.params.id, req.params.rule_id)
    res.json({ id: req.params.rule_id, object: "tax_rate_rule", deleted: true, parent })
  } catch (e) {
    next(e)
  }
})
