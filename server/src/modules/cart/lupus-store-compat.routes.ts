import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { authService } from "../auth/auth.service"
import { customerService } from "../customer/customer.service"
import { fulfillmentService } from "../fulfillment/fulfillment.service"
import { currencyService } from "../infra/currency-analytics.service"
import { orderService } from "../order/order.service"
import { paymentSessionService, SYSTEM_PROVIDER_ID } from "../order/payment-session.service"
import { promotionService } from "../promotion/promotion.service"
import { regionAdminService } from "../region/region-admin.service"
import { requestLocale, translateRows } from "../platform/translation-overlay"
import { taxService } from "../tax/tax.service"
import { cartService } from "./cart.service"

// Lupus-compat store API endpoints (storefront parity). Registered last in app.ts,
// so these only fill gaps — every METHOD+path here was grepped against the owned
// routers before adding (cart.routes.ts, customer.routes.ts, order.routes.ts,
// product.routes.ts, region.routes.ts, catalog-*.routes.ts, infra.routes.ts, ...).
//
// Reference mapping (js-sdk store/* + lupus server routes):
// - sdk.store.cart.update -> POST /store/carts/:id -> { cart }
// - sdk.store.cart.transferCartCustomer -> POST /store/carts/:id/customer -> { cart }
//   (lupus owns POST /store/carts/:id/transfer; Lupus path is :id/customer)
// - sdk.store.cart.refreshTaxes -> POST /store/carts/:id/taxes -> { cart }
// - sdk.store.cart.deletePromotions (remove-all) -> DELETE /store/carts/:id/promotions
//   -> { cart } (lupus owns DELETE .../promotions/:code for one code)
// - sdk.store.customer.register/login/me/updateMe -> POST /store/customers/me
//   (upsert by auth email + optional password via provider_identity -> { customer, token? }),
//   GET /store/customers/me is SKIPPED (owned by customer.routes.ts),
//   POST /store/customers/me doubles as the update route -> { customer }
// - sdk.store.customer.listAddress/createAddress/retrieveAddress/updateAddress/
//   deleteAddress -> /store/customers/me/addresses... (via customer.service.ts +
//   customer_address table; Lupus shapes: { addresses } / { address })
// - sdk.store.order.listOrders (own orders) -> GET /store/orders
//   -> { orders, count, offset, limit } (filtered by customer email/id)
// - sdk.store.order.requestTransfer/acceptTransfer/declineTransfer/cancelTransfer ->
//   POST /store/orders/:id/transfer/{request,accept,decline,cancel} -> { order }
//   Backing: order_change rows (change_type='transfer', description carries
//   { kind:'store-transfer', to_email, from_email }); the "order" table has NO
//   transfer columns and NO metadata column, so no metadata fallback was possible.
// - sdk.store.collection.list/retrieve -> GET /store/collections... -> { collections, ... }
// - sdk.store.productOption/listOptions, productTag/*, productType/*,
//   productVariant/list (retrieve -> { variant }) -> matching /store/* reads
// - sdk.store.productCategory.retrieve -> GET /store/product-categories/:id
//   (list GET /store/product-categories owned by missing-pieces.routes.ts)
// - sdk.store.returnReason.list/retrieve -> GET /store/return-reasons...
//   Backing: return_reason table; rows mapped to
//   { id, value (=label), label, description, ... }.
// - sdk.store.currency.retrieve -> GET /store/currencies/:code -> { currency }
//   (list GET /store/currencies owned by infra.routes.ts)
// - sdk.store.region.retrieve -> GET /store/regions/:id -> { region }
//   (list GET /store/regions owned by region.routes.ts)
// - sdk.store.paymentProvider.list -> GET /store/payment-providers (public)
// - sdk.store.paymentCollection.create -> POST /store/payment-collections { cart_id }
// - sdk.store.paymentCollection.createPaymentSession ->
//   POST /store/payment-collections/:id/payment-sessions { provider_id }
// - sdk.store.shippingOption.calculate -> POST /store/shipping-options/:id/calculate
//   { cart_id?, data? } -> { shipping_option } (flat amount echoed as calculated_amount)
// - POST /store/search { q, ... } -> { hits } over published products via ILIKE
//   (lupus owns GET /store/search/products; different METHOD+path, no clash)
//
// CART SHAPE: every cart response reuses cartService.retrieve (same enriched cart
// with items[] + totals as the existing store cart endpoints).
// AUTH: public store reads WITHOUT auth; /me + /orders use requireAuth.
export const storeCompatRouter = Router()

const pagingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

function pageOf(query: { limit?: number; offset?: number }): { limit: number; offset: number } {
  return { limit: Math.min(query.limit ?? 50, 100), offset: query.offset ?? 0 }
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 })
}

async function requireCartRow(id: string): Promise<any> {
  const { rows } = await pool.query(`SELECT * FROM cart WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!rows[0]) {
    throw notFound("Cart not found")
  }
  return rows[0]
}

// ---------------------------------------------------------------------------
// carts: update / attach customer / refresh taxes / remove-all promotions
// ---------------------------------------------------------------------------

storeCompatRouter.post("/store/carts/:id", async (req, res, next) => {
  try {
    const addressInput = z
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
      .passthrough()
    const body = z
      .object({
        email: z.string().email().nullish(),
        region_id: z.string().nullish(),
        sales_channel_id: z.string().nullish(),
        locale: z.string().nullish(),
        shipping_address: addressInput.nullish(),
        billing_address: addressInput.nullish(),
        promo_codes: z.array(z.string()).optional(),
        metadata: z.record(z.any()).nullish(),
      })
      .parse(req.body ?? {})
    const cart = await requireCartRow(req.params.id)
    if (cart.completed_at) {
      throw Object.assign(new Error("Cart is completed and cannot be updated"), { statusCode: 400 })
    }
    if (body.region_id) {
      // moves the cart to the region currency, reprices lines and drops shipping methods priced in the old one
      await cartService.setRegion(req.params.id, body.region_id)
    }
    for (const kind of ["shipping", "billing"] as const) {
      const addr = body[`${kind}_address` as const]
      if (addr) {
        await cartService.setAddress(req.params.id, kind, addr as Record<string, string | null | undefined>)
      }
    }
    if (body.promo_codes) {
      await pool.query(`DELETE FROM cart_promotion WHERE cart_id=$1`, [req.params.id])
      for (const code of body.promo_codes) {
        await promotionService.applyCode(req.params.id, code)
      }
      await promotionService.recompute(req.params.id)
    }
    if (body.sales_channel_id) {
      const sc = await pool.query(`SELECT id FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [body.sales_channel_id])
      if (!sc.rows[0]) {
        throw notFound("Sales channel not found")
      }
    }
    const sets: string[] = []
    const vals: unknown[] = []
    const push = (col: string, v: unknown) => {
      vals.push(v)
      sets.push(`${col}=$${vals.length}`)
    }
    if (body.email !== undefined) {
      push("email", body.email)
    }
    if (body.locale !== undefined) {
      push("locale", body.locale)
    }
    if (body.sales_channel_id !== undefined) {
      push("sales_channel_id", body.sales_channel_id)
    }
    if (body.metadata !== undefined) {
      push("metadata", body.metadata ? JSON.stringify(body.metadata) : null)
    }
    if (sets.length > 0) {
      vals.push(req.params.id)
      await pool.query(`UPDATE cart SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${vals.length}`, vals)
    }
    res.json({ cart: await cartService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.post("/store/carts/:id/customer", async (req, res, next) => {
  try {
    // Lupus transfers the cart to the authenticated customer (no body); customer_id stays accepted for the legacy call
    const body = z.object({ customer_id: z.string().optional() }).parse(req.body ?? {})
    await requireCartRow(req.params.id)
    let customer_id = body.customer_id
    if (!customer_id) {
      const header = req.headers.authorization
      if (!header?.startsWith("Bearer ")) {
        throw Object.assign(new Error("Missing bearer token"), { statusCode: 401 })
      }
      let email: string
      try {
        email = authService.verifyToken(header.slice(7)).email
      } catch {
        throw Object.assign(new Error("Invalid or expired token"), { statusCode: 401 })
      }
      const me = await customerService.retrieveByEmail(email)
      if (!me) {
        throw notFound("Customer not found")
      }
      customer_id = me.id
    }
    const customer = await customerService.retrieve(customer_id)
    if (!customer) {
      throw notFound("Customer not found")
    }
    res.json({ cart: await cartService.transferCustomer(req.params.id, customer_id) })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.post("/store/carts/:id/taxes", async (req, res, next) => {
  try {
    const body = z
      .object({
        country_code: z.string().length(2).nullish(),
        province: z.string().nullish(),
        postal_code: z.string().nullish(),
      })
      .parse(req.body ?? {})
    await requireCartRow(req.params.id)
    if (body.country_code !== undefined || body.province !== undefined || body.postal_code !== undefined) {
      const existing = await pool.query(`SELECT * FROM cart_address WHERE cart_id=$1 AND kind='shipping'`, [req.params.id])
      const cur = existing.rows[0] ?? {}
      await pool.query(
        `INSERT INTO cart_address (cart_id, kind, first_name, last_name, address_1, city, country_code, province, postal_code, phone)
         VALUES ($1,'shipping',$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (cart_id, kind) DO UPDATE SET country_code=$6, province=$7, postal_code=$8`,
        [
          req.params.id,
          cur.first_name ?? null,
          cur.last_name ?? null,
          cur.address_1 ?? null,
          cur.city ?? null,
          body.country_code !== undefined ? (body.country_code ? body.country_code.toLowerCase() : null) : (cur.country_code ?? null),
          body.province !== undefined ? (body.province ?? null) : (cur.province ?? null),
          body.postal_code !== undefined ? (body.postal_code ?? null) : (cur.postal_code ?? null),
          cur.phone ?? null,
        ]
      )
    }
    await taxService.refreshForCart(req.params.id)
    res.json({ cart: await cartService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.delete("/store/carts/:id/promotions", async (req, res, next) => {
  try {
    await requireCartRow(req.params.id)
    await pool.query(`DELETE FROM cart_promotion WHERE cart_id=$1`, [req.params.id])
    await promotionService.recompute(req.params.id)
    res.json({ cart: await cartService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// customers/me (requireAuth; actor = customer by auth email)
// NOTE: GET /store/customers/me is intentionally skipped — owned by customer.routes.ts.
// ---------------------------------------------------------------------------

const meProfileSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  company_name: z.string().nullish(),
  phone: z.string().nullish(),
  metadata: z.record(z.any()).nullish(),
  password: z.string().min(8).optional(),
})

async function meCustomer(req: AuthedRequest): Promise<any> {
  const customer = await customerService.retrieveByEmail(req.auth!.email)
  if (!customer) {
    throw notFound("Customer not found")
  }
  return customer
}

storeCompatRouter.post("/store/customers/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = meProfileSchema.parse(req.body ?? {})
    const email = req.auth!.email.toLowerCase().trim()
    let customer = await customerService.retrieveByEmail(email)
    let created = false
    if (!customer) {
      customer = await customerService.create({
        email,
        first_name: body.first_name ?? undefined,
        last_name: body.last_name ?? undefined,
        company_name: body.company_name ?? undefined,
        phone: body.phone ?? undefined,
      })
      created = true
    }
    let token: string | undefined
    if (body.password !== undefined) {
      const hash = await bcrypt.hash(body.password, 10)
      const existing = await pool.query(
        `SELECT * FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL`,
        [email]
      )
      let authIdentityId: string | null = existing.rows[0]?.auth_identity_id ?? null
      if (existing.rows[0]) {
        await pool.query(`UPDATE provider_identity SET password_hash=$2 WHERE id=$1`, [existing.rows[0].id, hash])
      } else {
        const client = await pool.connect()
        try {
          await client.query("BEGIN")
          const ai = await client.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
          authIdentityId = ai.rows[0].id as string
          await client.query(
            `INSERT INTO provider_identity (auth_identity_id, entity_id, provider, password_hash) VALUES ($1,$2,'emailpass',$3)`,
            [authIdentityId, email, hash]
          )
          await client.query("COMMIT")
        } catch (e) {
          await client.query("ROLLBACK")
          throw e
        } finally {
          client.release()
        }
      }
      if (authIdentityId) {
        const issued = await authService.createSessionToken(authIdentityId, "emailpass", email, "customer")
        token = issued.token
      }
    }
    const { password: _drop, ...profile } = body
    void _drop
    const profileKeys = ["email", "first_name", "last_name", "company_name", "phone", "metadata"] as const
    const hasProfileUpdate = profileKeys.some((k) => (profile as Record<string, unknown>)[k] !== undefined)
    if (hasProfileUpdate && !created) {
      const updated = await customerService.update(customer.id, {
        email: profile.email,
        first_name: profile.first_name ?? undefined,
        last_name: profile.last_name ?? undefined,
        company_name: profile.company_name ?? undefined,
        phone: profile.phone ?? undefined,
        metadata: (profile.metadata as Record<string, unknown> | null | undefined) ?? undefined,
      })
      if (updated) {
        customer = updated
      }
    } else if (hasProfileUpdate && created && (profile.metadata !== undefined || profile.email !== undefined)) {
      const updated = await customerService.update(customer.id, {
        email: profile.email,
        metadata: (profile.metadata as Record<string, unknown> | null | undefined) ?? undefined,
      })
      if (updated) {
        customer = updated
      }
    }
    if (created) {
      res.status(201).json(token ? { customer, token } : { customer })
      return
    }
    res.json(token ? { customer, token } : { customer })
  } catch (e) {
    next(e)
  }
})

const meAddressSchema = z.object({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  address_1: z.string().nullish(),
  address_2: z.string().nullish(),
  city: z.string().nullish(),
  country_code: z.string().nullish(),
  postal_code: z.string().nullish(),
  phone: z.string().nullish(),
  address_name: z.string().nullish(),
  company: z.string().nullish(),
  province: z.string().nullish(),
  is_default_shipping: z.boolean().optional(),
  is_default_billing: z.boolean().optional(),
  metadata: z.record(z.any()).nullish(),
})

storeCompatRouter.get("/store/customers/me/addresses", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const customer = await meCustomer(req)
    res.json({ addresses: await customerService.listAddresses(customer.id) })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.post("/store/customers/me/addresses", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const customer = await meCustomer(req)
    const input = meAddressSchema.parse(req.body ?? {})
    const address = await customerService.createAddress(customer.id, { ...input, metadata: input.metadata ?? undefined })
    res.status(201).json({ address })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/customers/me/addresses/:address_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const customer = await meCustomer(req)
    const address = await customerService.retrieveAddress(customer.id, req.params.address_id)
    if (!address) {
      throw notFound("Customer address not found")
    }
    res.json({ address })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.post("/store/customers/me/addresses/:address_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const customer = await meCustomer(req)
    const input = meAddressSchema.parse(req.body ?? {})
    const address = await customerService.updateAddress(customer.id, req.params.address_id, {
      ...input,
      metadata: input.metadata ?? undefined,
    })
    if (!address) {
      throw notFound("Customer address not found")
    }
    res.json({ address })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.delete("/store/customers/me/addresses/:address_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const customer = await meCustomer(req)
    const gone = await customerService.deleteAddress(customer.id, req.params.address_id)
    if (!gone) {
      throw notFound("Customer address not found")
    }
    res.json({ id: req.params.address_id, object: "customer_address", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// store orders: list own + transfer flow (requireAuth)
// NOTE: GET /store/orders/:id is intentionally skipped — owned by order.routes.ts.
// ---------------------------------------------------------------------------

function isOrderOwner(order: any, customer: any, email: string): boolean {
  if (customer && order.customer_id && order.customer_id === customer.id) {
    return true
  }
  return (order.email ?? "").toLowerCase() === email.toLowerCase()
}

async function requireOwnOrder(orderId: string, req: AuthedRequest): Promise<{ order: any; customer: any }> {
  const email = req.auth!.email.toLowerCase().trim()
  const customer = await customerService.retrieveByEmail(email)
  const { rows } = await pool.query(`SELECT * FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [orderId])
  if (!rows[0]) {
    throw notFound("Order not found")
  }
  if (!isOrderOwner(rows[0], customer, email)) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 })
  }
  return { order: rows[0], customer }
}

async function latestPendingTransfer(orderId: string): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT * FROM order_change WHERE order_id=$1 AND change_type='transfer' AND status IN ('pending','requested') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}

function transferPayload(change: any): Record<string, any> {
  try {
    return JSON.parse(change.description ?? "{}")
  } catch {
    return {}
  }
}

storeCompatRouter.get("/store/orders", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { limit, offset } = pageOf(pagingSchema.parse(req.query))
    const email = req.auth!.email.toLowerCase().trim()
    const customer = await customerService.retrieveByEmail(email)
    const params: unknown[] = [customer?.id ?? null, email]
    const where = `deleted_at IS NULL AND ($1::text IS NOT NULL AND customer_id=$1 OR LOWER(email)=$2)`
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM "order" WHERE ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM "order" WHERE ${where} ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    )
    const orders: unknown[] = []
    for (const row of rows) {
      const full = await orderService.retrieve(row.id)
      orders.push(full ?? row)
    }
    res.json({ orders, count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

// Lupus order transfer: a signed-in customer asks to take over an order (request); the order's current owner
// receives the token by email and approves (accept) or refuses (decline) it; the requester can cancel.
// The pending change is an order_change row whose description carries { kind, token, to_*, from_* }.
function transferToken(): string {
  return randomBytes(24).toString("hex")
}

async function requireTransferOrder(orderId: string): Promise<any> {
  const { rows } = await pool.query(`SELECT * FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [orderId])
  if (!rows[0]) {
    throw notFound("Order not found")
  }
  return rows[0]
}

// The party currently owning the order: its customer, or the email it was placed with (guest orders)
function ownsOrder(order: any, customer: any, email: string): boolean {
  return isOrderOwner(order, customer, email)
}

storeCompatRouter.post("/store/orders/:id/transfer/request", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const order = await requireTransferOrder(req.params.id)
    const email = req.auth!.email.toLowerCase().trim()
    const customer = await customerService.retrieveByEmail(email)
    if (!customer) {
      throw notFound("Customer not found")
    }
    if (order.customer_id === customer.id || (order.email ?? "").toLowerCase() === email) {
      throw Object.assign(new Error("This order is already yours"), { statusCode: 400 })
    }
    if (await latestPendingTransfer(req.params.id)) {
      throw Object.assign(new Error("This order already has a pending transfer request"), { statusCode: 400 })
    }
    const token = transferToken()
    await pool.query(
      `INSERT INTO order_change (order_id, change_type, description, status, requested_at) VALUES ($1,'transfer',$2,'requested',NOW())`,
      [
        req.params.id,
        JSON.stringify({ kind: "store-transfer", token, to_email: email, to_customer_id: customer.id, from_email: (order.email ?? "").toLowerCase(), from_customer_id: order.customer_id }),
      ]
    )
    if (order.email) {
      // the owner approves through the link in this email (/<country>/order/:id/transfer/:token)
      await pool
        .query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','order-transfer-requested',$2,'sent')`, [
          String(order.email).toLowerCase(),
          JSON.stringify({ order_id: order.id, token, requested_by: email }),
        ])
        .catch(() => undefined)
    }
    // only what the requester needs to see (Lupus answers with id + email); the email is masked because the
    // requester does not own the order
    const [local, domain] = String(order.email ?? "").split("@")
    const masked = order.email ? `${local.slice(0, 1)}***@${domain}` : null
    res.status(201).json({ order: { id: order.id, email: masked } })
  } catch (e) {
    next(e)
  }
})

async function pendingTransferFor(orderId: string, token: unknown): Promise<{ pending: any; payload: Record<string, any> }> {
  const pending = await latestPendingTransfer(orderId)
  if (!pending) {
    throw notFound("Pending order transfer not found")
  }
  const payload = transferPayload(pending)
  if (typeof token !== "string" || !token || payload.token !== token) {
    throw Object.assign(new Error("Invalid order transfer token"), { statusCode: 400 })
  }
  return { pending, payload }
}

storeCompatRouter.post("/store/orders/:id/transfer/accept", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body ?? {})
    const { pending, payload } = await pendingTransferFor(req.params.id, token)
    const order = await requireTransferOrder(req.params.id)
    const email = req.auth!.email.toLowerCase().trim()
    const customer = await customerService.retrieveByEmail(email)
    if (!ownsOrder(order, customer, email)) {
      throw Object.assign(new Error("Order transfer not found"), { statusCode: 404 })
    }
    const target = payload.to_customer_id ? await customerService.retrieve(payload.to_customer_id) : null
    if (!target) {
      throw notFound("Customer not found")
    }
    await pool.query(`UPDATE "order" SET customer_id=$2, email=$3, updated_at=NOW() WHERE id=$1`, [req.params.id, target.id, target.email])
    await pool.query(`UPDATE order_change SET status='confirmed', confirmed_at=NOW() WHERE id=$1`, [pending.id])
    res.json({ order: await orderService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.post("/store/orders/:id/transfer/decline", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body ?? {})
    const { pending } = await pendingTransferFor(req.params.id, token)
    const order = await requireTransferOrder(req.params.id)
    const email = req.auth!.email.toLowerCase().trim()
    const customer = await customerService.retrieveByEmail(email)
    if (!ownsOrder(order, customer, email)) {
      throw Object.assign(new Error("Order transfer not found"), { statusCode: 404 })
    }
    await pool.query(`UPDATE order_change SET status='declined', declined_at=NOW() WHERE id=$1`, [pending.id])
    res.json({ order: await orderService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// the requester withdraws the request
storeCompatRouter.post("/store/orders/:id/transfer/cancel", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const pending = await latestPendingTransfer(req.params.id)
    if (!pending) {
      throw notFound("Pending order transfer not found")
    }
    const payload = transferPayload(pending)
    if ((payload.to_email ?? "").toLowerCase() !== req.auth!.email.toLowerCase().trim()) {
      throw Object.assign(new Error("Order transfer not found"), { statusCode: 404 })
    }
    await pool.query(`UPDATE order_change SET status='canceled', canceled_at=NOW() WHERE id=$1`, [pending.id])
    res.json({ order: await orderService.retrieve(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// store catalog reads (public)
// ---------------------------------------------------------------------------

storeCompatRouter.get("/store/collections", async (req, res, next) => {
  try {
    const many = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v]))
    const parsed = pagingSchema.extend({ q: z.string().optional(), handle: many.optional(), id: many.optional() }).parse(req.query)
    const { limit, offset } = pageOf(parsed)
    const conds = [`deleted_at IS NULL`]
    const params: unknown[] = []
    if (parsed.q) {
      params.push(`%${parsed.q}%`)
      conds.push(`(title ILIKE $${params.length} OR handle ILIKE $${params.length})`)
    }
    if (parsed.handle) {
      params.push(parsed.handle)
      conds.push(`handle = ANY($${params.length})`)
    }
    if (parsed.id) {
      params.push(parsed.id)
      conds.push(`id = ANY($${params.length})`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM product_collection ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM product_collection ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    res.json({ collections: await translateRows(rows, "product_collection", ["title"], requestLocale(req)), count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/collections/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_collection WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Collection not found")
    }
    const products = await pool.query(
      `SELECT id, title, handle, status FROM product WHERE collection_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
      [req.params.id]
    )
    res.json({ collection: { ...rows[0], products: products.rows } })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-options", async (req, res, next) => {
  try {
    const parsed = pagingSchema.extend({ q: z.string().optional(), is_exclusive: z.enum(["true", "false"]).optional() }).parse(req.query)
    const { limit, offset } = pageOf(parsed)
    const conds = [`o.deleted_at IS NULL`]
    const params: unknown[] = []
    if (parsed.q) {
      params.push(`%${parsed.q}%`)
      conds.push(`o.title ILIKE $${params.length}`)
    }
    // Lupus: is_exclusive=false lists the shared (global) options, true the product-owned ones
    if (parsed.is_exclusive) {
      conds.push(parsed.is_exclusive === "true" ? `o.is_exclusive = TRUE` : `o.is_exclusive = FALSE`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM product_option o ${where}`, params)
    const { rows } = await pool.query(
      `SELECT o.*, COALESCE((SELECT json_agg(json_build_object('id', ov.id, 'value', ov.value) ORDER BY ov.rank, ov.created_at) FROM product_option_value ov WHERE ov.option_id=o.id AND ov.deleted_at IS NULL), '[]') AS values
       FROM product_option o ${where} ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    res.json({ product_options: rows, count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-options/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_option WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product option not found")
    }
    const values = await pool.query(`SELECT * FROM product_option_value WHERE option_id=$1 AND deleted_at IS NULL ORDER BY rank, created_at`, [req.params.id])
    res.json({ product_option: { ...rows[0], values: values.rows } })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-tags", async (req, res, next) => {
  try {
    const parsed = pagingSchema.extend({ q: z.string().optional(), value: z.string().optional() }).parse(req.query)
    const { limit, offset } = pageOf(parsed)
    const conds = [`deleted_at IS NULL`]
    const params: unknown[] = []
    if (parsed.q) {
      params.push(`%${parsed.q}%`)
      conds.push(`value ILIKE $${params.length}`)
    }
    if (parsed.value) {
      params.push(parsed.value)
      conds.push(`value=$${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM product_tag ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM product_tag ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    res.json({ product_tags: rows, count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-tags/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_tag WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product tag not found")
    }
    res.json({ product_tag: rows[0] })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-types", async (req, res, next) => {
  try {
    const parsed = pagingSchema.extend({ q: z.string().optional(), value: z.string().optional() }).parse(req.query)
    const { limit, offset } = pageOf(parsed)
    const conds = [`deleted_at IS NULL`]
    const params: unknown[] = []
    if (parsed.q) {
      params.push(`%${parsed.q}%`)
      conds.push(`value ILIKE $${params.length}`)
    }
    if (parsed.value) {
      params.push(parsed.value)
      conds.push(`value=$${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM product_type ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM product_type ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    res.json({ product_types: rows, count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-types/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_type WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product type not found")
    }
    res.json({ product_type: rows[0] })
  } catch (e) {
    next(e)
  }
})

async function enrichStoreVariants(variantRows: any[]): Promise<any[]> {
  if (variantRows.length === 0) {
    return []
  }
  const ids = variantRows.map((v) => v.id)
  const [priceRes, optRes] = await Promise.all([
    pool.query(
      `SELECT v.id AS variant_id, p.currency_code, p.amount
       FROM product_variant v
       JOIN price p ON p.price_set_id = v.price_set_id AND p.price_list_id IS NULL AND p.deleted_at IS NULL
       WHERE v.id = ANY($1)`,
      [ids]
    ),
    pool.query(
      `SELECT pvov.variant_id, o.title AS option_title, ov.value
       FROM product_variant_option_value pvov
       JOIN product_option_value ov ON ov.id=pvov.option_value_id
       JOIN product_option o ON o.id=ov.option_id
       WHERE pvov.variant_id = ANY($1)`,
      [ids]
    ),
  ])
  const pricesBy: Record<string, any[]> = {}
  for (const r of priceRes.rows) {
    pricesBy[r.variant_id] = pricesBy[r.variant_id] ?? []
    pricesBy[r.variant_id].push({ currency_code: r.currency_code, amount: Number(r.amount) })
  }
  const optionsBy: Record<string, Record<string, string>> = {}
  for (const r of optRes.rows) {
    optionsBy[r.variant_id] = optionsBy[r.variant_id] ?? {}
    optionsBy[r.variant_id][r.option_title] = r.value
  }
  return variantRows.map((v) => ({ ...v, prices: pricesBy[v.id] ?? [], options: optionsBy[v.id] ?? {} }))
}

storeCompatRouter.get("/store/product-variants", async (req, res, next) => {
  try {
    const parsed = pagingSchema
      .extend({ q: z.string().optional(), product_id: z.union([z.string(), z.array(z.string())]).optional(), sku: z.string().optional() })
      .parse(req.query)
    const { limit, offset } = pageOf(parsed)
    const conds = [`v.deleted_at IS NULL`]
    const params: unknown[] = []
    if (parsed.q) {
      params.push(`%${parsed.q}%`)
      conds.push(`(v.title ILIKE $${params.length} OR COALESCE(v.sku,'') ILIKE $${params.length})`)
    }
    if (parsed.product_id !== undefined) {
      const pids = Array.isArray(parsed.product_id) ? parsed.product_id : [parsed.product_id]
      params.push(pids)
      conds.push(`v.product_id = ANY($${params.length})`)
    }
    if (parsed.sku) {
      params.push(parsed.sku)
      conds.push(`v.sku=$${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM product_variant v ${where}`, params)
    const { rows } = await pool.query(
      `SELECT v.* FROM product_variant v ${where} ORDER BY v.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    res.json({ variants: await enrichStoreVariants(rows), count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-variants/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_variant WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product variant not found")
    }
    const enriched = await enrichStoreVariants(rows)
    res.json({ variant: enriched[0] })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/product-categories/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM product_category WHERE id=$1 AND deleted_at IS NULL AND is_active=TRUE AND is_internal=FALSE`,
      [req.params.id]
    )
    if (!rows[0]) {
      throw notFound("Product category not found")
    }
    const products = await pool.query(
      `SELECT p.id, p.title, p.handle, p.status FROM product_category_product pcp
       JOIN product p ON p.id=pcp.product_id AND p.deleted_at IS NULL
       WHERE pcp.category_id=$1`,
      [req.params.id]
    )
    res.json({ product_category: { ...rows[0], products: products.rows } })
  } catch (e) {
    next(e)
  }
})

function returnReasonShape(row: any): any {
  return { id: row.id, value: row.value, label: row.label, description: row.description ?? null, parent_return_reason_id: row.parent_return_reason_id ?? null, metadata: row.metadata ?? null, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null }
}

storeCompatRouter.get("/store/return-reasons", async (req, res, next) => {
  try {
    const { limit, offset } = pageOf(pagingSchema.parse(req.query))
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM return_reason WHERE deleted_at IS NULL`)
    const { rows } = await pool.query(`SELECT * FROM return_reason WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset])
    res.json({ return_reasons: rows.map(returnReasonShape), count: total.rows[0].count, offset, limit })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/return-reasons/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM return_reason WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Return reason not found")
    }
    res.json({ return_reason: returnReasonShape(rows[0]) })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/currencies/:code", async (req, res, next) => {
  try {
    await currencyService.ensureSeeded()
    const { rows } = await pool.query(`SELECT * FROM currency WHERE code=$1`, [req.params.code.toLowerCase()])
    if (!rows[0]) {
      throw notFound("Currency not found")
    }
    res.json({ currency: rows[0] })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/regions/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM region WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Region not found")
    }
    res.json({ region: (await regionAdminService.hydrateMany(rows))[0] })
  } catch (e) {
    next(e)
  }
})

// Providers enabled on the region (admin region payment providers); a region with none configured
// still offers the built-in system provider so checkout is never dead-ended.
storeCompatRouter.get("/store/payment-providers", async (req, res, next) => {
  try {
    const { limit, offset } = pageOf(pagingSchema.parse(req.query))
    const regionId = z.string().optional().parse(req.query.region_id)
    let ids: string[] = []
    if (regionId) {
      const rows = await pool.query(`SELECT provider_id FROM region_payment_provider WHERE region_id=$1 ORDER BY provider_id`, [regionId])
      ids = rows.rows.map((r: any) => r.provider_id)
    }
    if (ids.length === 0) {
      ids = [SYSTEM_PROVIDER_ID]
    }
    const all = ids.map((id) => ({ id, is_enabled: true }))
    res.json({ payment_providers: all.slice(offset, offset + limit), count: all.length, offset, limit })
  } catch (e) {
    next(e)
  }
})

function paymentCollectionShape(row: any, sessions: any[]): any {
  return { ...row, payment_sessions: sessions }
}

// Lupus: one payment collection per cart, reused while it is not completed
storeCompatRouter.post("/store/payment-collections", async (req, res, next) => {
  try {
    const { cart_id } = z.object({ cart_id: z.string() }).parse(req.body ?? {})
    const cart = await cartService.retrieve(cart_id)
    if (!cart) {
      throw notFound("Cart not found")
    }
    const existing = await pool.query(`SELECT * FROM payment_collection WHERE cart_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [cart_id])
    if (existing.rows[0]) {
      const refreshed = await pool.query(`UPDATE payment_collection SET amount=$2, currency_code=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [existing.rows[0].id, cart.totals.total, cart.currency_code])
      const sessions = await pool.query(`SELECT * FROM payment_session WHERE payment_collection_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [existing.rows[0].id])
      res.json({ payment_collection: paymentCollectionShape(refreshed.rows[0], sessions.rows) })
      return
    }
    const { rows } = await pool.query(
      `INSERT INTO payment_collection (currency_code, amount, status, cart_id) VALUES ($1,$2,'not_paid',$3) RETURNING *`,
      [cart.currency_code, cart.totals.total, cart_id]
    )
    res.status(201).json({ payment_collection: paymentCollectionShape(rows[0], []) })
  } catch (e) {
    next(e)
  }
})

// Lupus createPaymentSession: replaces the pending sessions of the collection with one for the chosen provider
storeCompatRouter.post("/store/payment-collections/:id/payment-sessions", async (req, res, next) => {
  try {
    const { provider_id } = z.object({ provider_id: z.string().optional(), data: z.record(z.any()).optional() }).passthrough().parse(req.body ?? {})
    const existing = await pool.query(`SELECT * FROM payment_collection WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!existing.rows[0]) {
      throw notFound("Payment collection not found")
    }
    await pool.query(`UPDATE payment_session SET deleted_at=NOW() WHERE payment_collection_id=$1 AND status='pending' AND deleted_at IS NULL`, [req.params.id])
    const session = await paymentSessionService.createSession(req.params.id, provider_id ?? SYSTEM_PROVIDER_ID)
    const sessions = await pool.query(`SELECT * FROM payment_session WHERE payment_collection_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [req.params.id])
    res.status(201).json({ payment_collection: paymentCollectionShape(existing.rows[0], sessions.rows), payment_session: session })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// shipping option calculate (public) + store search (public)
// ---------------------------------------------------------------------------

storeCompatRouter.post("/store/shipping-options/:id/calculate", async (req, res, next) => {
  try {
    const { cart_id, data } = z
      .object({ cart_id: z.string().optional(), data: z.record(z.any()).optional() })
      .parse(req.body ?? {})
    void data
    const { rows } = await pool.query(`SELECT * FROM shipping_option WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Shipping option not found")
    }
    if (cart_id !== undefined) {
      await requireCartRow(cart_id)
      const offered = (await fulfillmentService.optionsForCart(cart_id)).find((o: any) => o.id === req.params.id)
      if (offered) {
        res.json({ shipping_option: { ...offered, calculated_amount: Number(offered.amount) } })
        return
      }
    }
    res.json({ shipping_option: { ...rows[0], calculated_amount: Number(rows[0].amount) } })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.post("/store/search", async (req, res, next) => {
  try {
    const { q, limit, offset } = z
      .object({ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional() })
      .parse(req.body ?? {})
    const take = Math.min(limit ?? 20, 100)
    const skip = offset ?? 0
    const { rows } = await pool.query(
      `SELECT * FROM product WHERE deleted_at IS NULL AND status='published'
       AND (title ILIKE $1 OR COALESCE(description,'') ILIKE $1 OR handle ILIKE $1)
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [`%${q}%`, take, skip]
    )
    res.json({ hits: rows })
  } catch (e) {
    next(e)
  }
})

storeCompatRouter.get("/store/shipping-options", async (req, res, next) => {
  try {
    const { limit, offset, cart_id } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0), cart_id: z.string().optional() })
      .parse(req.query)
    if (cart_id) {
      // Lupus list-shipping-options-for-cart: only the options this cart can actually use, priced for it
      await requireCartRow(cart_id)
      const options = await fulfillmentService.optionsForCart(cart_id)
      res.json({ shipping_options: options, count: options.length, offset: 0, limit: options.length })
      return
    }
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM shipping_option WHERE deleted_at IS NULL`)
    const { rows } = await pool.query(`SELECT * FROM shipping_option WHERE deleted_at IS NULL ORDER BY created_at LIMIT $1 OFFSET $2`, [limit, offset])
    res.json({ shipping_options: rows, count: total.rows[0].c, offset, limit })
  } catch (e) {
    next(e)
  }
})
