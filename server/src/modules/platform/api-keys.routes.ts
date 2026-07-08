import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import type { FilterSpec } from "../infra/list-query"
import { buildListQuery, sendList } from "../infra/list-query"
import { requirePolicy } from "./admin-platform.routes"
import { apiKeyService as svc } from "./api-keys.service"

// Admin endpoints for Settings > Publishable API Keys and Secret API Keys.
export const apiKeysRouter = Router()

const FILTERS: FilterSpec[] = [
  { key: "id", column: "k.id", op: "in" },
  { key: "title", column: "k.title", op: "ilike" },
  { key: "type", column: "k.type", op: "eq", values: ["publishable", "secret"] },
  { key: "created_at", column: "k.created_at", op: "gte" },
  { key: "created_at", column: "k.created_at", op: "lte" },
  { key: "updated_at", column: "k.updated_at", op: "gte" },
  { key: "updated_at", column: "k.updated_at", op: "lte" },
  { key: "revoked_at", column: "k.revoked_at", op: "gte" },
  { key: "revoked_at", column: "k.revoked_at", op: "lte" },
]
const SORT = {
  title: "k.title",
  type: "k.type",
  created_at: "k.created_at",
  updated_at: "k.updated_at",
  revoked_at: "k.revoked_at",
  last_used_at: "k.last_used_at",
}

apiKeysRouter.get("/admin/api-keys", requireAuth, async (req, res, next) => {
  try {
    const lq = buildListQuery({
      base: "k.deleted_at IS NULL",
      query: req.query,
      specs: FILTERS,
      // a secret key's stored token is a hash, so only the title and a publishable token are searchable
      q: { columns: ["k.title", "CASE WHEN k.type = 'publishable' THEN k.token ELSE '' END"] },
      order: SORT,
      defaultOrder: "k.created_at DESC",
    })
    // revoked=true|false: a key counts as revoked once its revoke time has passed
    const raw = Array.isArray(req.query.revoked) ? req.query.revoked[0] : req.query.revoked
    const revoked = raw === "true" ? "k.revoked_at <= NOW()" : raw === "false" ? "(k.revoked_at IS NULL OR k.revoked_at > NOW())" : ""
    const conditions = [lq.where.replace(/^WHERE\s+/i, ""), revoked].filter((c) => c.length > 0)
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM api_key k ${where}`, lq.params)
    const { rows } = await pool.query(`SELECT k.* FROM api_key k ${where} ${order} LIMIT $${lq.params.length + 1} OFFSET $${lq.params.length + 2}`, [
      ...lq.params,
      lq.limit,
      lq.offset,
    ])
    sendList(res, { api_keys: await svc.hydrate(rows), count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

apiKeysRouter.get("/admin/api-keys/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ api_key: await svc.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

apiKeysRouter.post("/admin/api-keys", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ title: z.string().min(1), type: z.enum(["publishable", "secret"]) }).parse(req.body ?? {})
    res.status(201).json({ api_key: await svc.create(input, req.auth?.email ?? null) })
  } catch (e) {
    next(e)
  }
})

apiKeysRouter.post("/admin/api-keys/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ title: z.string().optional() }).parse(req.body ?? {})
    res.json({ api_key: await svc.update(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

apiKeysRouter.post("/admin/api-keys/:id/revoke", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ revoke_in: z.number().int().nonnegative().optional() }).parse(req.body ?? {})
    res.json({ api_key: await svc.revoke(req.params.id, input, req.auth?.email ?? null) })
  } catch (e) {
    next(e)
  }
})

apiKeysRouter.delete("/admin/api-keys/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await svc.remove(req.params.id)
    res.json({ id: req.params.id, object: "api_key", deleted: true })
  } catch (e) {
    next(e)
  }
})

apiKeysRouter.post("/admin/api-keys/:id/sales-channels", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    // { sales_channel_ids } is the older add-only spelling
    const input = z
      .object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional(), sales_channel_ids: z.array(z.string()).optional() })
      .parse(req.body ?? {})
    const add = [...(input.add ?? []), ...(input.sales_channel_ids ?? [])]
    res.json({ api_key: await svc.updateSalesChannels(req.params.id, { add, remove: input.remove }) })
  } catch (e) {
    next(e)
  }
})
