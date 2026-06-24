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
