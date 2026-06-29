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

// ---------------------------------------------------------------------------
// customer groups: list/retrieve/update/delete
// (create POST /admin/customer-groups + POST /:id/customers live in
// groups-giftcard-draft.routes.ts)
// ---------------------------------------------------------------------------

async function groupWithCustomers(id: string): Promise<any> {
  const g = await pool.query(`SELECT * FROM customer_group WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!g.rows[0]) {
    throw notFound("Customer group", id)
  }
  const members = await pool.query(
    `SELECT c.* FROM customer c JOIN customer_group_customer p ON p.customer_id=c.id WHERE p.customer_group_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at`,
    [id]
  )
  return { ...g.rows[0], customers: members.rows }
}

customersCompatRouter.get("/admin/customer-groups", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "customer_group",
      alias: "g",
      select: `g.*, (SELECT COUNT(*)::int FROM customer_group_customer p JOIN customer c ON c.id = p.customer_id AND c.deleted_at IS NULL WHERE p.customer_group_id = g.id) AS customers_count`,
      base: "g.deleted_at IS NULL",
      specs: CUSTOMER_GROUP_FILTERS,
      q: { columns: CUSTOMER_GROUP_Q_COLUMNS },
      order: CUSTOMER_GROUP_SORT,
      defaultOrder: "g.created_at DESC",
      key: "customer_groups",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/customer-groups/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ customer_group: await groupWithCustomers(req.params.id) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/customer-groups/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { name, metadata } = z
      .object({ name: z.string().min(1).optional(), metadata: z.record(z.any()).nullable().optional() })
      .parse(req.body)
    const prev = await pool.query(`SELECT * FROM customer_group WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("Customer group", req.params.id)
    }
    const cur = prev.rows[0]
    await pool.query(`UPDATE customer_group SET name=$2, metadata=$3, updated_at=NOW() WHERE id=$1`, [
      req.params.id,
      name ?? cur.name,
      metadata !== undefined ? (metadata ? JSON.stringify(metadata) : null) : cur.metadata,
    ])
    res.json({ customer_group: await groupWithCustomers(req.params.id) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/customer-groups/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await pool.query(`UPDATE customer_group SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id])
    if (!gone.rows[0]) {
      throw notFound("Customer group", req.params.id)
    }
    res.json({ id: req.params.id, object: "customer_group", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// users: list/retrieve/update/delete + auth providers + reset-password token
// (GET /admin/users/me lives in lupus-auth.routes.ts)
// ---------------------------------------------------------------------------

customersCompatRouter.get("/admin/users", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "admin_user",
      alias: "u",
      select: "u.*",
      base: "u.deleted_at IS NULL",
      specs: ADMIN_USER_FILTERS,
      q: { columns: ADMIN_USER_Q_COLUMNS },
      order: ADMIN_USER_SORT,
      defaultOrder: "u.created_at DESC",
      key: "users",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/users/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("User", req.params.id)
    }
    res.json({ user: rows[0] })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/users/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    // everyone can edit their own profile; changing somebody else needs users:write
    const self = await pool.query(`SELECT id FROM admin_user WHERE email=$1 AND deleted_at IS NULL`, [req.auth?.email ?? null])
    if (self.rows[0]?.id !== req.params.id) await requirePolicy(req, "users:write")
    const { first_name, last_name, avatar_url, metadata } = z
      .object({
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        avatar_url: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
      })
      .parse(req.body)
    const prev = await pool.query(`SELECT * FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("User", req.params.id)
    }
    const cur = prev.rows[0]
    const { rows } = await pool.query(
      `UPDATE admin_user SET first_name=$2, last_name=$3, avatar_url=$4, metadata=$5, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [
        req.params.id,
        first_name !== undefined ? first_name : cur.first_name,
        last_name !== undefined ? last_name : cur.last_name,
        avatar_url !== undefined ? avatar_url : cur.avatar_url,
        metadata !== undefined ? (metadata ? JSON.stringify(metadata) : null) : cur.metadata,
      ]
    )
    res.json({ user: rows[0] })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/users/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await pool.query(`UPDATE admin_user SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id])
    if (!gone.rows[0]) {
      throw notFound("User", req.params.id)
    }
    res.json({ id: req.params.id, object: "user", deleted: true })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.user.listAuthProviders -> { providers } (emailpass identity providers).
customersCompatRouter.get("/admin/users/:id/auth-providers", requireAuth, async (req, res, next) => {
  try {
    const user = await pool.query(`SELECT * FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!user.rows[0]) {
      throw notFound("User", req.params.id)
    }
    const linked = await pool.query(`SELECT auth_identity_id FROM admin_user_auth WHERE admin_user_id=$1`, [req.params.id])
    let providers: string[] = []
    if (linked.rows.length > 0) {
      const ids = linked.rows.map((r: any) => r.auth_identity_id)
      const found = await pool.query(
        `SELECT DISTINCT provider FROM provider_identity WHERE auth_identity_id = ANY($1) AND deleted_at IS NULL`,
        [ids]
      )
      providers = found.rows.map((r: any) => r.provider)
    } else {
      const byEmail = await pool.query(
        `SELECT DISTINCT provider FROM provider_identity WHERE entity_id=$1 AND deleted_at IS NULL`,
        [(user.rows[0].email as string).toLowerCase()]
      )
      providers = byEmail.rows.map((r: any) => r.provider)
    }
    res.json({ providers: providers.length > 0 ? providers : ["emailpass"] })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.user.generateResetPasswordToken -> { token }. Reuses the
// password_reset_token table (single-use, invalidates prior tokens) and queues a
// notification, mirroring the /auth reset-password request flow.
customersCompatRouter.post("/admin/users/:id/reset-password", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const user = await pool.query(`SELECT * FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!user.rows[0]) {
      throw notFound("User", req.params.id)
    }
    const email = (user.rows[0].email as string).toLowerCase()
    const linked = await pool.query(`SELECT auth_identity_id FROM admin_user_auth WHERE admin_user_id=$1`, [req.params.id])
    let providerIdentityId: string | null = null
    if (linked.rows.length > 0) {
      const ids = linked.rows.map((r: any) => r.auth_identity_id)
      const pi = await pool.query(
        `SELECT id FROM provider_identity WHERE auth_identity_id = ANY($1) AND provider='emailpass' AND deleted_at IS NULL LIMIT 1`,
        [ids]
      )
      providerIdentityId = pi.rows[0]?.id ?? null
    }
    if (!providerIdentityId) {
      const pi = await pool.query(
        `SELECT id FROM provider_identity WHERE provider='emailpass' AND entity_id=$1 AND deleted_at IS NULL LIMIT 1`,
        [email]
      )
      providerIdentityId = pi.rows[0]?.id ?? null
    }
    if (!providerIdentityId) {
      throw Object.assign(new Error(`No emailpass identity for user with id ${req.params.id}`), { statusCode: 404 })
    }
    await pool.query(`UPDATE password_reset_token SET consumed=TRUE WHERE provider_identity_id=$1 AND consumed=FALSE`, [providerIdentityId])
    const created = await pool.query(`INSERT INTO password_reset_token (provider_identity_id) VALUES ($1) RETURNING token`, [providerIdentityId])
    const token = created.rows[0].token as string
    await pool
      .query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','password-reset',$2,'sent')`, [
        email,
        JSON.stringify({ token }),
      ])
      .catch(() => undefined)
    res.json({ token })
  } catch (e) {
    next(e)
  }
