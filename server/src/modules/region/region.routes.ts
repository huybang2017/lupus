import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { regionAdminService } from "./region-admin.service"

// Port of Lupus store region endpoints (upstream/src/api/store/regions).
export const regionRouter = Router()

// Lupus shape: { regions, count, offset, limit } with countries and payment providers hydrated.
// Without ?limit every region is returned (the storefront builds its country -> region map from it).
regionRouter.get("/store/regions", async (req, res, next) => {
  try {
    const { limit, offset, currency_code, name } = z
      .object({
        limit: z.coerce.number().int().min(1).max(1000).optional(),
        offset: z.coerce.number().int().min(0).default(0),
        currency_code: z.string().optional(),
        name: z.string().optional(),
      })
      .parse(req.query)
    const conds = ["deleted_at IS NULL"]
    const params: unknown[] = []
    if (currency_code) {
      params.push(currency_code.toLowerCase())
      conds.push(`currency_code = $${params.length}`)
    }
    if (name) {
      params.push(name)
      conds.push(`name = $${params.length}`)
    }
    const count = await pool.query(`SELECT COUNT(*)::int AS count FROM region WHERE ${conds.join(" AND ")}`, params)
    params.push(offset)
    let sql = `SELECT * FROM region WHERE ${conds.join(" AND ")} ORDER BY created_at DESC OFFSET $${params.length}`
    if (limit) {
      params.push(limit)
      sql += ` LIMIT $${params.length}`
    }
    const { rows } = await pool.query(sql, params)
    res.json({ regions: await regionAdminService.hydrateMany(rows), count: count.rows[0].count, offset, limit: limit ?? count.rows[0].count })
  } catch (e) {
    next(e)
  }
})
