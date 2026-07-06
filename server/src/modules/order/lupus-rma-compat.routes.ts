import { Router } from "express"
import { z } from "zod"
import { requireAuth } from "../../middleware/require-auth"
import { CLAIM_FILTERS, CLAIM_SORT, EXCHANGE_FILTERS, EXCHANGE_SORT } from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { rmaService } from "./rma.service"

// Lupus-compat RMA endpoints (dashboard parity: claims/exchanges/returns full
// inbound/outbound/request lifecycles at Lupus paths).
// Every actionId is the underlying row id (claim_item / exchange_item /
// return_item / synthetic SHIPPING_ADD id); items carry an `actions` array so
// the dashboard can round-trip ids. Lists return { plural, count, offset,
// limit }; mutations return { claim | return | exchange } per the js-sdk
// response types (order_preview omitted: lupus has no order preview).
export const rmaCompatRouter = Router()

const itemsSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    quantity: z.number().int().positive(),
    reason_id: z.string().optional(),
    damaged_quantity: z.number().int().nonnegative().optional(),
  }).passthrough()),
})

const updateItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
}).passthrough().optional()

const shippingSchema = z.object({
  shipping_option_id: z.string().optional(),
  custom_amount: z.number().int().nonnegative().optional(),
}).passthrough().optional()

const updateShippingSchema = z.object({
  shipping_option_id: z.string().optional(),
  custom_amount: z.number().int().nonnegative().optional(),
}).passthrough().optional()

const anyBodySchema = z.object({}).passthrough().optional()

// ---------- claims ----------
rmaCompatRouter.get("/admin/claims", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "claim",
      alias: "c",
      select: "c.*",
      base: "c.deleted_at IS NULL",
      specs: CLAIM_FILTERS,
      order: CLAIM_SORT,
      defaultOrder: "c.created_at DESC",
      // the previous service page defaulted to 20 rows, keep that
      defaultLimit: 20,
      key: "claims",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.get("/admin/claims/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/claim-items", requireAuth, async (req, res, next) => {
  try {
    const { items } = itemsSchema.parse(req.body)
    for (const it of items) {
      await rmaService.addClaimItemRow(req.params.id, "inbound", { line_item_id: it.id, quantity: it.quantity, reason_id: it.reason_id, writeOff: true })
    }
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/claim-items/:actionId", requireAuth, async (req, res, next) => {
  try {
    const patch = updateItemSchema.parse(req.body) ?? {}
    await rmaService.updateClaimItemRow(req.params.id, req.params.actionId, patch)
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.claim.removeItem -> DELETE /admin/claims/:id/claim-items/:actionId.
// Lupus route (claims/[id]/claim-items/[action_id]/route.ts DELETE) returns
// { order_preview, claim }; lupus has no order preview, so { claim } only.
rmaCompatRouter.delete("/admin/claims/:id/claim-items/:actionId", requireAuth, async (req, res, next) => {
  try {
    await rmaService.removeClaimItemRow(req.params.id, req.params.actionId)
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/inbound/items", requireAuth, async (req, res, next) => {
  try {
    const { items } = itemsSchema.parse(req.body)
    for (const it of items) {
      await rmaService.addClaimItemRow(req.params.id, "inbound", { line_item_id: it.id, quantity: it.quantity, reason_id: it.reason_id })
    }
    res.json({ return: await rmaService.getClaimReturnView(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.delete("/admin/claims/:id/inbound/items/:actionId", requireAuth, async (req, res, next) => {
  try {
    await rmaService.removeClaimItemRow(req.params.id, req.params.actionId, "inbound")
    res.json({ return: await rmaService.getClaimReturnView(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/inbound/items/:actionId", requireAuth, async (req, res, next) => {
  try {
    const patch = updateItemSchema.parse(req.body) ?? {}
    await rmaService.updateClaimItemRow(req.params.id, req.params.actionId, patch, "inbound")
    res.json({ return: await rmaService.getClaimReturnView(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/inbound/shipping-method", requireAuth, async (req, res, next) => {
  try {
    const body = shippingSchema.parse(req.body) ?? {}
    await rmaService.addShipping("claim", req.params.id, "inbound", body)
    res.json({ return: await rmaService.getClaimReturnView(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.delete("/admin/claims/:id/inbound/shipping-method/:actionId", requireAuth, async (req, res, next) => {
  try {
    await rmaService.removeShipping("claim", req.params.id, "inbound", req.params.actionId)
    res.json({ return: await rmaService.getClaimReturnView(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/inbound/shipping-method/:actionId", requireAuth, async (req, res, next) => {
  try {
    const patch = updateShippingSchema.parse(req.body) ?? {}
    await rmaService.updateShipping("claim", req.params.id, "inbound", req.params.actionId, patch)
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/outbound/items", requireAuth, async (req, res, next) => {
  try {
    const { items } = itemsSchema.parse(req.body)
    for (const it of items) {
      await rmaService.addClaimItemRow(req.params.id, "outbound", { variant_id: it.id, quantity: it.quantity })
    }
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.delete("/admin/claims/:id/outbound/items/:actionId", requireAuth, async (req, res, next) => {
  try {
    await rmaService.removeClaimItemRow(req.params.id, req.params.actionId, "outbound")
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaCompatRouter.post("/admin/claims/:id/outbound/items/:actionId", requireAuth, async (req, res, next) => {
  try {
    const patch = updateItemSchema.parse(req.body) ?? {}
    await rmaService.updateClaimItemRow(req.params.id, req.params.actionId, patch, "outbound")
    res.json({ claim: await rmaService.getClaimDetail(req.params.id) })
  } catch (e) {
    next(e)
  }
})

