import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { requirePolicy } from "./admin-platform.routes"
import { storeService } from "./store.service"

// Admin store endpoints: the single store the dashboard manages plus the Lupus `/admin/stores` shapes.
export const storeAdminRouter = Router()

const body = z.object({
  name: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  supported_currencies: z
    .array(z.object({ currency_code: z.string().length(3), is_default: z.boolean().optional(), is_tax_inclusive: z.boolean().optional() }))
    .optional(),
  default_sales_channel_id: z.string().nullish(),
  default_region_id: z.string().nullish(),
  default_location_id: z.string().nullish(),
  locales: z.array(z.string().min(2)).optional(),
})

storeAdminRouter.get("/admin/store", requireAuth, async (_req, res, next) => {
  try {
    res.json({ store: await storeService.retrieve(await storeService.firstId()) })
  } catch (e) {
    next(e)
  }
})

storeAdminRouter.post("/admin/store", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    res.json({ store: await storeService.update(await storeService.firstId(), body.parse(req.body)) })
  } catch (e) {
    next(e)
  }
})

storeAdminRouter.get("/admin/stores", requireAuth, async (req, res, next) => {
  try {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).passthrough().parse(req.query)
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM store`)
    if (total.rows[0].c === 0) await storeService.firstId()
    const { rows } = await pool.query(`SELECT id FROM store ORDER BY created_at LIMIT $1 OFFSET $2`, [q.limit, q.offset])
    const stores = []
    for (const r of rows) stores.push(await storeService.retrieve(r.id))
    res.json({ stores, count: Math.max(total.rows[0].c, stores.length), offset: q.offset, limit: q.limit })
  } catch (e) {
    next(e)
  }
})

storeAdminRouter.get("/admin/stores/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ store: await storeService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

storeAdminRouter.post("/admin/stores/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    res.json({ store: await storeService.update(req.params.id, body.parse(req.body)) })
  } catch (e) {
    next(e)
  }
})
