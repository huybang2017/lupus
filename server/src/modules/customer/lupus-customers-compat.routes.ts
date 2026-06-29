import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import {
  ADMIN_USER_FILTERS,
  ADMIN_USER_Q_COLUMNS,
  ADMIN_USER_SORT,
  CUSTOMER_GROUP_FILTERS,
  CUSTOMER_GROUP_Q_COLUMNS,
  CUSTOMER_GROUP_SORT,
  INVITE_FILTERS,
  INVITE_Q_COLUMNS,
  INVITE_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { requirePolicy } from "../platform/admin-platform.routes"
import { customerService } from "./customer.service"

// Lupus-compat customer/user endpoints (dashboard parity: customers CRUD + addresses,
// customer groups, users, invites, RBAC roles/policies).
// Refs (paths + bodies):
//   upstream/packages/core/js-sdk/src/admin/{customer,customer-group,user,invite,rbac-role,rbac-policy}.ts
// Shapes follow upstream/src/api/admin/<resource>/.../route.ts:
// lists -> { <plural>, count, offset, limit }, retrieve -> { <singular> },
// create -> 201, delete -> { id, object, deleted: true }.
// Reuses customer.service.ts and existing tables only (customer, customer_group,
// customer_group_customer, customer_address, admin_user, admin_user_auth,
// admin_user_role, invite, password_reset_token, provider_identity, notification,
// rbac_role, rbac_policy, rbac_role_policy, rbac_role_parent); no new migrations.
// Already-live elsewhere (NOT duplicated here): GET /admin/customers
// (customer.routes.ts), POST /admin/customer-groups + POST
// /admin/customer-groups/:id/customers (groups-giftcard-draft.routes.ts),
// GET /admin/users/me + POST /admin/invites/accept (lupus-auth.routes.ts),
// POST /admin/invites (admin-platform.routes.ts).
export const customersCompatRouter = Router()

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

function pageOf(query: { limit?: number; offset?: number }): { limit: number; offset: number } {
  return { limit: query.limit ?? 50, offset: query.offset ?? 0 }
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`${what} with id ${id} was not found`), { statusCode: 404 })
}

const addressBodySchema = z.object({
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

// ---------------------------------------------------------------------------
// customers: POST create, GET/POST/DELETE by id
// (list GET /admin/customers lives in customer.routes.ts)
// ---------------------------------------------------------------------------

customersCompatRouter.post("/admin/customers", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const input = z
      .object({
        email: z.string().email(),
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        company_name: z.string().nullish(),
        phone: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
        addresses: z.array(addressBodySchema).optional(),
      })
      .parse(req.body)
    const created = await customerService.create({
      email: input.email,
      first_name: input.first_name ?? undefined,
      last_name: input.last_name ?? undefined,
      company_name: input.company_name ?? undefined,
      phone: input.phone ?? undefined,
    })
    if (input.metadata) {
      await customerService.update(created.id, { metadata: input.metadata })
    }
    for (const addr of input.addresses ?? []) {
      await customerService.createAddress(created.id, { ...addr, metadata: addr.metadata ?? undefined })
    }
    res.status(201).json({ customer: await customerService.retrieveDetailed(created.id) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/customers/:id", requireAuth, async (req, res, next) => {
  try {
    const customer = await customerService.retrieveDetailed(req.params.id)
    if (!customer) {
      throw notFound("Customer", req.params.id)
    }
    res.json({ customer })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/customers/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const input = z
      .object({
        email: z.string().email().optional(),
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        company_name: z.string().nullish(),
        phone: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
      })
      .parse(req.body)
    const updated = await customerService.update(req.params.id, input)
    if (!updated) {
      throw notFound("Customer", req.params.id)
    }
    res.json({ customer: await customerService.retrieveDetailed(req.params.id) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/customers/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await customerService.softDelete(req.params.id)
    if (!gone) {
      throw notFound("Customer", req.params.id)
    }
    res.json({ id: req.params.id, object: "customer", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// customer addresses: list/create + retrieve/update/delete
// ---------------------------------------------------------------------------

customersCompatRouter.get("/admin/customers/:id/addresses", requireAuth, async (req, res, next) => {
  try {
    const customer = await customerService.retrieve(req.params.id)
    if (!customer) {
      throw notFound("Customer", req.params.id)
    }
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const all = await customerService.listAddresses(req.params.id)
    res.json({ addresses: all.slice(off, off + lim), count: all.length, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/customers/:id/addresses", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const input = addressBodySchema.parse(req.body)
    const address = await customerService.createAddress(req.params.id, { ...input, metadata: input.metadata ?? undefined })
    res.status(201).json({ address })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/customers/:id/addresses/:address_id", requireAuth, async (req, res, next) => {
  try {
    const address = await customerService.retrieveAddress(req.params.id, req.params.address_id)
    if (!address) {
      throw notFound("Customer address", req.params.address_id)
    }
    res.json({ address })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/customers/:id/addresses/:address_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const input = addressBodySchema.parse(req.body)
    const address = await customerService.updateAddress(req.params.id, req.params.address_id, {
      ...input,
      metadata: input.metadata ?? undefined,
    })
    if (!address) {
      throw notFound("Customer address", req.params.address_id)
    }
    res.json({ address })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/customers/:id/addresses/:address_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await customerService.deleteAddress(req.params.id, req.params.address_id)
    if (!gone) {
      throw notFound("Customer address", req.params.address_id)
    }
    res.json({ id: req.params.address_id, object: "customer_address", deleted: true })
  } catch (e) {
    next(e)
  }
})

// Port of linkCustomerGroupsToCustomerWorkflow
// (sdk.admin.customer.batchCustomerGroups -> { add, remove }).
customersCompatRouter.post("/admin/customers/:id/customer-groups", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { add, remove } = z
      .object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() })
      .parse(req.body)
    await customerService.batchCustomerGroups(req.params.id, add, remove)
    res.json({ customer: await customerService.retrieveDetailed(req.params.id) })
  } catch (e) {
    next(e)
  }
})
