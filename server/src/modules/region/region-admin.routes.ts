import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { REGION_FILTERS, REGION_Q_COLUMNS, REGION_SORT } from "../infra/list-filter-specs"
import { buildListQuery, sendList } from "../infra/list-query"
import { requirePolicy } from "../platform/admin-platform.routes"
import { regionAdminService as svc } from "./region-admin.service"

// Admin region endpoints (Settings > Regions).
export const regionAdminRouter = Router()

const body = z.object({
  name: z.string().optional(),
  currency_code: z.string().length(3).optional(),
  automatic_taxes: z.boolean().optional(),
  is_tax_inclusive: z.boolean().optional(),
  countries: z.array(z.string().length(2)).optional(),
  payment_providers: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

// ?country_code lives on the region_country join, so it is appended as an EXISTS with its own bind param.
function countryClause(query: Record<string, unknown>, index: number) {
  const raw = Array.isArray(query.country_code) ? query.country_code[0] : query.country_code
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!value) return null
  return { sql: `EXISTS (SELECT 1 FROM region_country rc WHERE rc.region_id = r.id AND rc.deleted_at IS NULL AND LOWER(rc.iso_2) = $${index})`, params: [value] }
}

regionAdminRouter.get("/admin/regions", requireAuth, async (req, res, next) => {
  try {
    const lq = buildListQuery({
      base: "r.deleted_at IS NULL",
      query: req.query,
      specs: REGION_FILTERS,
      q: { columns: REGION_Q_COLUMNS },
      order: REGION_SORT,
      defaultOrder: "r.created_at DESC",
    })
    const country = countryClause(req.query, lq.params.length + 1)
    const params = country ? [...lq.params, ...country.params] : lq.params
    const conditions = [lq.where.replace(/^WHERE\s+/i, ""), country?.sql ?? ""].filter((c) => c.length > 0)
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM region r ${where}`, params)
    const { rows } = await pool.query(`SELECT r.* FROM region r ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, lq.limit, lq.offset])
    sendList(res, { regions: await svc.hydrateMany(rows), count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

// Which region each country already belongs to (the country pickers lock those).
regionAdminRouter.get("/admin/regions/assigned-countries", requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT rc.iso_2, r.id AS region_id, r.name AS region_name FROM region_country rc
       JOIN region r ON r.id = rc.region_id AND r.deleted_at IS NULL WHERE rc.deleted_at IS NULL`
    )
    res.json({ countries: rows })
  } catch (e) {
    next(e)
  }
})

regionAdminRouter.get("/admin/regions/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ region: await svc.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

regionAdminRouter.post("/admin/regions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = body.extend({ name: z.string().min(1), currency_code: z.string().length(3) }).parse(req.body)
    res.status(201).json({ region: await svc.create(input as any) })
  } catch (e) {
    next(e)
  }
})

regionAdminRouter.post("/admin/regions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    res.json({ region: await svc.update(req.params.id, body.parse(req.body)) })
  } catch (e) {
    next(e)
  }
})

regionAdminRouter.delete("/admin/regions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await svc.remove(req.params.id)
    res.json({ id: req.params.id, object: "region", deleted: true })
  } catch (e) {
    next(e)
  }
})
