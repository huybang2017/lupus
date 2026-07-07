import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import { fulfillmentService } from "../fulfillment/fulfillment.service"
import { orderChangeService } from "./order-change.service"
import { paymentSessionService } from "./payment-session.service"

// Port of Lupus admin fulfillment + order-change/return/exchange + payment session endpoints
// (core-flows order/workflows: create-fulfillment, create-shipment, cancel-fulfillment,
// mark-delivered, create/update/confirm/decline/cancel-order-change, create-payment-session).
export const postPurchaseRouter = Router()

postPurchaseRouter.post("/admin/fulfillment-sets", requireAuth, async (req, res, next) => {
  try {
    const { name, type, stock_location_id } = z.object({ name: z.string(), type: z.string().optional(), stock_location_id: z.string().optional() }).parse(req.body)
    res.status(201).json({ fulfillment_set: await fulfillmentService.createFulfillmentSet(name, type ?? "shipping", stock_location_id) })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.get("/admin/fulfillment-sets", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset } = z.object({ limit: z.coerce.number().optional(), offset: z.coerce.number().optional() }).parse(req.query)
    const take = Math.min(limit ?? 50, 100)
    const skip = offset ?? 0
    const [list, cnt] = await Promise.all([
      pool.query(`SELECT * FROM fulfillment_set WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [take, skip]),
      pool.query(`SELECT COUNT(*)::int AS count FROM fulfillment_set WHERE deleted_at IS NULL`),
    ])
    res.json({ fulfillment_sets: list.rows, count: cnt.rows[0].count, offset: skip, limit: take })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.get("/store/carts/:id/shipping-options", async (req, res, next) => {
  try {
    res.json({ shipping_options: await fulfillmentService.optionsForCart(req.params.id) })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/orders/:id/fulfillments", requireAuth, async (req, res, next) => {
  try {
    // Lupus sends items[].id (the line item id) plus location_id / no_notification; line_item_id is the older spelling.
    const { items, shipping_option_id } = z
      .object({
        items: z.array(z.object({ id: z.string().optional(), line_item_id: z.string().optional(), quantity: z.number().int().positive() }).refine((i) => !!(i.line_item_id ?? i.id), "item id is required")),
        shipping_option_id: z.string().optional(),
        location_id: z.string().optional(),
        no_notification: z.boolean().optional(),
      })
      .passthrough()
      .parse(req.body)
    const lines = items.map((i) => ({ line_item_id: (i.line_item_id ?? i.id) as string, quantity: i.quantity }))
    res.status(201).json({ fulfillment: await fulfillmentService.createFulfillment(req.params.id, lines, shipping_option_id) })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/fulfillments/:id/ship", requireAuth, async (req, res, next) => {
  try {
    await fulfillmentService.markShipped(req.params.id)
    res.json({ id: req.params.id, shipped: true })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/fulfillments/:id/deliver", requireAuth, async (req, res, next) => {
  try {
    await fulfillmentService.markDelivered(req.params.id)
    res.json({ id: req.params.id, delivered: true })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/fulfillments/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await fulfillmentService.cancel(req.params.id)
    res.json({ id: req.params.id, canceled: true })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.get("/admin/orders/:id/fulfillments", requireAuth, async (req, res, next) => {
  try {
    res.json({ fulfillments: await fulfillmentService.listForOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

const actionSchema = z.object({
  action: z.enum(["add_item", "remove_item", "update_qty"]),
  line_item_id: z.string().optional(),
  variant_id: z.string().optional(),
  title: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  unit_price: z.number().int().nonnegative().optional(),
})

postPurchaseRouter.post("/admin/orders/:id/changes", requireAuth, async (req, res, next) => {
  try {
    const { change_type, description, actions } = z
      .object({ change_type: z.enum(["edit", "return", "exchange", "claim"]), description: z.string().optional(), actions: z.array(actionSchema) })
      .parse(req.body)
    res.status(201).json({ change: await orderChangeService.request(req.params.id, change_type, description, actions) })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/order-changes/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    const { refund_amount } = z.object({ refund_amount: z.number().int().positive().optional() }).parse(req.body)
    await orderChangeService.confirm(req.params.id, refund_amount)
    res.json({ id: req.params.id, status: "confirmed" })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/order-changes/:id/decline", requireAuth, async (req, res, next) => {
  try {
    await orderChangeService.decline(req.params.id)
    res.json({ id: req.params.id, status: "declined" })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/order-changes/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await orderChangeService.cancel(req.params.id)
    res.json({ id: req.params.id, status: "canceled" })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.get("/admin/orders/:id/changes", requireAuth, async (req, res, next) => {
  try {
    res.json({ changes: await orderChangeService.listForOrder(req.params.id) })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/payment-collections/:id/sessions", requireAuth, async (req, res, next) => {
  try {
    const { provider_id } = z.object({ provider_id: z.string().optional() }).parse(req.body)
    res.status(201).json({ session: await paymentSessionService.createSession(req.params.id, provider_id ?? "manual") })
  } catch (e) {
    next(e)
  }
})

postPurchaseRouter.post("/admin/payment-sessions/:id/authorize", requireAuth, async (req, res, next) => {
  try {
    await paymentSessionService.authorizeSession(req.params.id)
    res.json({ id: req.params.id, status: "authorized" })
  } catch (e) {
    next(e)
  }
})
