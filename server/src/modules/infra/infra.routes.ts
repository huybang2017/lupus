import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import { analyticsService, currencyService } from "./currency-analytics.service"
import { fileService } from "./file.service"
import { eventBus } from "./platform-infra.service"
import { searchService } from "./search.service"

// Port of file, search, event-bus, workflow-engine, currency, analytics endpoints.
export const infraRouter = Router()

infraRouter.post("/admin/files", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ filename: z.string(), content_base64: z.string(), mime_type: z.string().optional(), provider_id: z.string().optional() }).parse(req.body)
    res.status(201).json({ file: await fileService.upload(input) })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/admin/files", requireAuth, async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().optional() }).parse(req.query)
    res.json({ files: await fileService.list(limit) })
  } catch (e) {
    next(e)
  }
})

infraRouter.delete("/admin/files/:id", requireAuth, async (req, res, next) => {
  try {
    await fileService.remove(req.params.id)
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/store/search/products", async (req, res, next) => {
  try {
    const { q, limit } = z.object({ q: z.string().min(1), limit: z.coerce.number().optional() }).parse(req.query)
    res.json({ hits: await searchService.searchProducts(q, limit) })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/admin/events", requireAuth, async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().optional() }).parse(req.query)
    res.json({ events: await eventBus.list(limit) })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/admin/workflows/executions", requireAuth, async (req, res, next) => {
  try {
    const { workflow_id, limit } = z.object({ workflow_id: z.string().optional(), limit: z.coerce.number().optional() }).parse(req.query)
    const { rows } = await pool.query(
      `SELECT * FROM workflow_execution ${workflow_id ? "WHERE workflow_id=$1" : ""} ORDER BY created_at DESC LIMIT $${workflow_id ? 2 : 1}`,
      workflow_id ? [workflow_id, Math.min(limit ?? 50, 100)] : [Math.min(limit ?? 50, 100)]
    )
    res.json({ executions: rows })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/store/currencies", async (_req, res, next) => {
  try {
    res.json({ currencies: await currencyService.list() })
  } catch (e) {
    next(e)
  }
})

infraRouter.post("/admin/analytics/track", requireAuth, async (req, res, next) => {
  try {
    const { event, actor, properties } = z.object({ event: z.string(), actor: z.string().optional(), properties: z.record(z.any()).optional() }).parse(req.body)
    res.status(201).json({ event: await analyticsService.track(event, actor, properties ?? {}) })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/admin/analytics/revenue", requireAuth, async (req, res, next) => {
  try {
    const { currency, days } = z.object({ currency: z.string().length(3).optional(), days: z.coerce.number().optional() }).parse(req.query)
    res.json({ revenue: await analyticsService.revenueByDay(currency, days ?? 30) })
  } catch (e) {
    next(e)
  }
})

infraRouter.get("/admin/analytics/top-products", requireAuth, async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().optional() }).parse(req.query)
    res.json({ products: await analyticsService.topProducts(limit ?? 10) })
  } catch (e) {
    next(e)
  }
})
