import { Router } from "express"
import { z } from "zod"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import type { FilterSpec } from "../infra/list-query"
import { runList, sendList } from "../infra/list-query"
import { requirePolicy } from "../platform/admin-platform.routes"
import { reasonsService as svc, refundReasonShape, returnReasonShape } from "./reasons.service"

// Admin endpoints for Settings > Return Reasons and Refund Reasons.
export const reasonsRouter = Router()

const metadata = z.record(z.string(), z.unknown()).nullish()

const RETURN_REASON_FILTERS: FilterSpec[] = [
  { key: "id", column: "r.id", op: "in" },
  { key: "value", column: "r.value", op: "in" },
  { key: "label", column: "r.label", op: "ilike" },
  { key: "parent_return_reason_id", column: "r.parent_return_reason_id", op: "in" },
  { key: "created_at", column: "r.created_at", op: "gte" },
  { key: "created_at", column: "r.created_at", op: "lte" },
  { key: "updated_at", column: "r.updated_at", op: "gte" },
  { key: "updated_at", column: "r.updated_at", op: "lte" },
]
const RETURN_REASON_SORT = { value: "r.value", label: "r.label", created_at: "r.created_at", updated_at: "r.updated_at" }

const REFUND_REASON_FILTERS: FilterSpec[] = [
  { key: "id", column: "r.id", op: "in" },
  { key: "code", column: "r.code", op: "in" },
  { key: "label", column: "r.label", op: "ilike" },
  { key: "created_at", column: "r.created_at", op: "gte" },
  { key: "created_at", column: "r.created_at", op: "lte" },
  { key: "updated_at", column: "r.updated_at", op: "gte" },
  { key: "updated_at", column: "r.updated_at", op: "lte" },
]
const REFUND_REASON_SORT = { label: "r.label", code: "r.code", created_at: "r.created_at", updated_at: "r.updated_at" }

// ---------- return reasons ----------

reasonsRouter.get("/admin/return-reasons", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "return_reason",
      alias: "r",
      select: "r.*",
      base: "r.deleted_at IS NULL",
      specs: RETURN_REASON_FILTERS,
      q: { columns: ["r.label", "r.value", "r.description"] },
      order: RETURN_REASON_SORT,
      defaultOrder: "r.created_at DESC",
      key: "return_reasons",
      enrich: returnReasonShape,
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

reasonsRouter.get("/admin/return-reasons/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ return_reason: await svc.retrieveReturnReason(req.params.id) })
  } catch (e) {
    next(e)
  }
})

reasonsRouter.post("/admin/return-reasons", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z
      .object({ value: z.string().min(1), label: z.string().min(1), description: z.string().nullish(), parent_return_reason_id: z.string().nullish(), metadata })
      .parse(req.body ?? {})
    res.status(201).json({ return_reason: await svc.createReturnReason(input) })
  } catch (e) {
    next(e)
  }
})

reasonsRouter.post("/admin/return-reasons/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z
      .object({ value: z.string().optional(), label: z.string().optional(), description: z.string().nullish(), parent_return_reason_id: z.string().nullish(), metadata })
      .parse(req.body ?? {})
    res.json({ return_reason: await svc.updateReturnReason(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

reasonsRouter.delete("/admin/return-reasons/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await svc.removeReturnReason(req.params.id)
    res.json({ id: req.params.id, object: "return_reason", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------- refund reasons ----------

reasonsRouter.get("/admin/refund-reasons", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "refund_reason",
      alias: "r",
      select: "r.*",
      base: "r.deleted_at IS NULL",
      specs: REFUND_REASON_FILTERS,
      q: { columns: ["r.label", "r.code", "r.description"] },
      order: REFUND_REASON_SORT,
      defaultOrder: "r.created_at DESC",
      key: "refund_reasons",
      enrich: refundReasonShape,
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

reasonsRouter.get("/admin/refund-reasons/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ refund_reason: await svc.retrieveRefundReason(req.params.id) })
  } catch (e) {
    next(e)
  }
})

reasonsRouter.post("/admin/refund-reasons", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ label: z.string().min(1), code: z.string().min(1), description: z.string().nullish(), metadata }).parse(req.body ?? {})
    // Lupus answers 200 here, not 201
    res.json({ refund_reason: await svc.createRefundReason(input) })
  } catch (e) {
    next(e)
  }
})

reasonsRouter.post("/admin/refund-reasons/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const input = z.object({ label: z.string().optional(), code: z.string().optional(), description: z.string().nullish(), metadata }).parse(req.body ?? {})
    res.json({ refund_reason: await svc.updateRefundReason(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

reasonsRouter.delete("/admin/refund-reasons/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await svc.removeRefundReason(req.params.id)
    res.json({ id: req.params.id, object: "refund_reason", deleted: true })
  } catch (e) {
    next(e)
  }
})
