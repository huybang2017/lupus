import { publishableChannels } from "../platform/publishable-key"
import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { optionalCustomerId } from "../product/store-products"
import { cartService } from "./cart.service"

// Port of Lupus store cart endpoints (upstream/src/api/store/carts/*):
// create-cart, retrieve, add-to-cart (with inventory+price-list), update-line-item,
// delete line item, shipping methods, promotions (update-cart-promotions),
// tax lines refresh on address change, transfer-cart-customer.
export const cartRouter = Router()

cartRouter.post("/store/carts", async (req, res, next) => {
  try {
    const input = z
      .object({
        region_id: z.string().optional(),
        customer_id: z.string().optional(),
        sales_channel_id: z.string().optional(),
        email: z.string().email().optional(),
        currency_code: z.string().length(3).optional(),
      })
      .parse(req.body ?? {})
    // a publishable key without an explicit channel puts the cart in the key's first sales channel
    const channel = input.sales_channel_id ?? publishableChannels(req)?.[0]
    // Lupus: the cart currency is the region's currency unless one is passed explicitly
    let currency = input.currency_code
    if (!currency && input.region_id) {
      const region = await pool.query(`SELECT currency_code FROM region WHERE id=$1 AND deleted_at IS NULL`, [input.region_id])
      if (!region.rows[0]) {
        throw Object.assign(new Error("Region not found"), { statusCode: 404 })
      }
      currency = region.rows[0].currency_code
    }
    // Lupus attaches the signed-in customer to a new cart (and fills in their email)
    const tokenCustomer = await optionalCustomerId(req)
    const customerId = tokenCustomer ?? input.customer_id
    let email = input.email
    if (tokenCustomer && !email) {
      const me = await pool.query(`SELECT email FROM customer WHERE id=$1`, [tokenCustomer])
      email = me.rows[0]?.email ?? undefined
    }
    const cart = await cartService.create({ ...input, customer_id: customerId, email, sales_channel_id: channel, currency_code: currency ?? "vnd" })
    res.cookie("cart_id", cart.id, { httpOnly: true, sameSite: "lax", path: "/" })
    res.status(201).json({ cart })
  } catch (e) {
    next(e)
  }
})

cartRouter.get("/store/carts", async (req, res, next) => {
  try {
    const cookie = req.headers.cookie ?? ""
    const match = cookie.match(/(?:^|;\s*)cart_id=([^;]+)/)
    const cartId = match ? match[1] : null
    const cart = await cartService.retrieveActive(cartId)
    if (!cart) {
      res.status(200).json({ cart: null })
      return
    }
    res.json({ cart })
  } catch (e) {
    next(e)
  }
})

cartRouter.get("/store/carts/:id", async (req, res, next) => {
  try {
    const cart = await cartService.retrieve(req.params.id)
    if (!cart) {
      res.status(404).json({ message: "Cart not found" })
      return
    }
    res.json({ cart })
  } catch (e) {
    next(e)
  }
})

cartRouter.post("/store/carts/:id/line-items", async (req, res, next) => {
  try {
    const input = z.object({ variant_id: z.string(), quantity: z.number().int().positive() }).parse(req.body)
    res.status(201).json({ cart: await cartService.addItem(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

cartRouter.post("/store/carts/:id/line-items/:lineId", async (req, res, next) => {
  try {
    const { quantity } = z.object({ quantity: z.number().int() }).parse(req.body)
    res.json({ cart: await cartService.updateItem(req.params.id, req.params.lineId, quantity) })
  } catch (e) {
    next(e)
  }
})

cartRouter.delete("/store/carts/:id/line-items/:lineId", async (req, res, next) => {
  try {
    res.json({ cart: await cartService.removeItem(req.params.id, req.params.lineId) })
  } catch (e) {
    next(e)
  }
})

cartRouter.post("/store/carts/:id/shipping-methods", async (req, res, next) => {
  try {
    // Lupus body is { option_id, data }; shipping_option_id is accepted as an alias. The price is
    // always taken from the option offered to this cart, never from the request.
    const body = z
      .object({ option_id: z.string().optional(), shipping_option_id: z.string().optional(), data: z.record(z.any()).nullish() })
      .passthrough()
      .parse(req.body ?? {})
    const optionId = body.option_id ?? body.shipping_option_id
    if (!optionId) {
      throw Object.assign(new Error("option_id is required"), { statusCode: 400 })
    }
    res.status(201).json({ cart: await cartService.addShippingMethodByOption(req.params.id, optionId, body.data) })
  } catch (e) {
    next(e)
  }
})

cartRouter.post("/store/carts/:id/addresses/:kind", async (req, res, next) => {
  try {
    const kind = z.enum(["shipping", "billing"]).parse(req.params.kind)
    const address = z
      .object({
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        company: z.string().nullish(),
        address_1: z.string().nullish(),
        address_2: z.string().nullish(),
        city: z.string().nullish(),
        country_code: z.string().length(2).nullish(),
        province: z.string().nullish(),
        postal_code: z.string().nullish(),
        phone: z.string().nullish(),
      })
      .parse(req.body)
    res.json({ cart: await cartService.setAddress(req.params.id, kind, address) })
  } catch (e) {
    next(e)
  }
})

cartRouter.post("/store/carts/:id/promotions", async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body)
    const { promotionService } = await import("../promotion/promotion.service")
    await promotionService.applyCode(req.params.id, code)
    res.status(201).json({ cart: await cartService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

cartRouter.delete("/store/carts/:id/promotions/:code", async (req, res, next) => {
  try {
    const { promotionService } = await import("../promotion/promotion.service")
    await promotionService.removeCode(req.params.id, req.params.code)
    res.json({ cart: await cartService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

cartRouter.post("/store/carts/:id/transfer", async (req, res, next) => {
  try {
    const { customer_id } = z.object({ customer_id: z.string() }).parse(req.body)
    res.json({ cart: await cartService.transferCustomer(req.params.id, customer_id) })
  } catch (e) {
    next(e)
  }
})
