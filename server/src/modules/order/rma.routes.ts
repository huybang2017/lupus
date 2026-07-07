import { Router } from "express"
import { z } from "zod"
import { requireAuth } from "../../middleware/require-auth"
import { RETURN_FILTERS, RETURN_SORT } from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { rmaService } from "./rma.service"

// RMA endpoints (Lupus admin/returns, admin/claims, admin/exchanges + store request parity).
export const rmaRouter = Router()

const lineSchema = z.object({ line_item_id: z.string(), quantity: z.number().int().positive(), reason_id: z.string().optional() })

rmaRouter.post("/admin/returns", requireAuth, async (req, res, next) => {
  try {
    const { order_id, items } = z.object({ order_id: z.string(), items: z.array(lineSchema) }).parse(req.body)
    res.status(201).json({ ret: await rmaService.createReturn(order_id, items, (req as any).auth?.email) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/store/returns", async (req, res, next) => {
  try {
    const { order_id, items } = z.object({ order_id: z.string(), items: z.array(lineSchema) }).parse(req.body)
    res.status(201).json({ ret: await rmaService.createReturn(order_id, items) })
  } catch (e) {
    next(e)
  }
})

// Filters/paging now run in SQL (was: load every row then slice in memory, so
// `count` was the unfiltered total). Envelope and row shape are unchanged.
rmaRouter.get("/admin/returns", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "return_request",
      alias: "r",
      select: "r.*",
      base: "r.deleted_at IS NULL",
      specs: RETURN_FILTERS,
      order: RETURN_SORT,
      defaultOrder: "r.created_at DESC",
      key: "returns",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/returns/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    res.json({ ret: await rmaService.confirmReturn(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/returns/:id/receive", requireAuth, async (req, res, next) => {
  try {
    const { items } = z.object({ items: z.array(z.object({ item_id: z.string(), received_quantity: z.number().int().nonnegative(), damaged_quantity: z.number().int().nonnegative().optional() })) }).parse(req.body)
    res.json(await rmaService.receiveReturn(req.params.id, items))
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/returns/:id/refund", requireAuth, async (req, res, next) => {
  try {
    const { amount } = z.object({ amount: z.number().int().positive().optional() }).parse(req.body)
    res.json(await rmaService.refundReturn(req.params.id, amount))
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/returns/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await rmaService.cancelReturn(req.params.id)
    res.json({ id: req.params.id, status: "canceled" })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/return-items/:id/dismiss", requireAuth, async (req, res, next) => {
  try {
    await rmaService.dismissReturnItem(req.params.id)
    res.json({ id: req.params.id, dismissed: true })
  } catch (e) {
    next(e)
  }
})

const outboundSchema = z.object({ variant_id: z.string(), title: z.string().optional(), quantity: z.number().int().positive(), unit_price: z.number().int().nonnegative().optional() })

rmaRouter.post("/admin/claims", requireAuth, async (req, res, next) => {
  try {
    const { order_id, type, inbound, outbound } = z.object({ order_id: z.string(), type: z.enum(["refund", "replace"]), inbound: z.array(lineSchema), outbound: z.array(outboundSchema).optional() }).parse(req.body)
    res.status(201).json({ claim: await rmaService.createClaim(order_id, type, inbound, outbound ?? [], (req as any).auth?.email) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/store/claims", async (req, res, next) => {
  try {
    const { order_id, type, inbound, outbound } = z.object({ order_id: z.string(), type: z.enum(["refund", "replace"]), inbound: z.array(lineSchema), outbound: z.array(outboundSchema).optional() }).parse(req.body)
    res.status(201).json({ claim: await rmaService.createClaim(order_id, type, inbound, outbound ?? []) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/claims/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    res.json({ claim: await rmaService.confirmClaim(req.params.id) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/claims/:id/receive", requireAuth, async (req, res, next) => {
  try {
    const { items } = z.object({ items: z.array(z.object({ item_id: z.string(), received_quantity: z.number().int().nonnegative() })) }).parse(req.body)
    await rmaService.receiveClaimInbound(req.params.id, items)
    res.json({ id: req.params.id, received: true })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/claims/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await rmaService.cancelClaim(req.params.id)
    res.json({ id: req.params.id, status: "canceled" })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/exchanges", requireAuth, async (req, res, next) => {
  try {
    const { order_id, inbound, outbound } = z.object({ order_id: z.string(), inbound: z.array(lineSchema), outbound: z.array(outboundSchema) }).parse(req.body)
    res.status(201).json({ exchange: await rmaService.createExchange(order_id, inbound, outbound, (req as any).auth?.email) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/store/exchanges", async (req, res, next) => {
  try {
    const { order_id, inbound, outbound } = z.object({ order_id: z.string(), inbound: z.array(lineSchema), outbound: z.array(outboundSchema) }).parse(req.body)
    res.status(201).json({ exchange: await rmaService.createExchange(order_id, inbound, outbound) })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/exchanges/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    await rmaService.confirmExchange(req.params.id)
    res.json({ id: req.params.id, status: "confirmed" })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/exchanges/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await rmaService.cancelExchange(req.params.id)
    res.json({ id: req.params.id, status: "canceled" })
  } catch (e) {
    next(e)
  }
})

rmaRouter.post("/admin/exchange-items/:id/dismiss", requireAuth, async (req, res, next) => {
  try {
    await rmaService.dismissExchangeItem(req.params.id)
    res.json({ id: req.params.id, dismissed: true })
  } catch (e) {
    next(e)
  }
})
