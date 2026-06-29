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
})

// ---------------------------------------------------------------------------
// invites: list/retrieve/delete/resend
// (create POST /admin/invites lives in admin-platform.routes.ts,
// accept POST /admin/invites/accept lives in lupus-auth.routes.ts)
// ---------------------------------------------------------------------------

customersCompatRouter.get("/admin/invites", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "invite",
      alias: "i",
      select: "i.*",
      base: "i.deleted_at IS NULL",
      specs: INVITE_FILTERS,
      q: { columns: INVITE_Q_COLUMNS },
      order: INVITE_SORT,
      defaultOrder: "i.created_at DESC",
      key: "invites",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/invites/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM invite WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Invite", req.params.id)
    }
    res.json({ invite: rows[0] })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/invites/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await pool.query(`UPDATE invite SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id])
    if (!gone.rows[0]) {
      throw notFound("Invite", req.params.id)
    }
    res.json({ id: req.params.id, object: "invite", deleted: true })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.invite.resend -> refreshes token/expiry and queues a notification.
customersCompatRouter.post("/admin/invites/:id/resend", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const prev = await pool.query(`SELECT * FROM invite WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("Invite", req.params.id)
    }
    if (prev.rows[0].accepted) {
      throw Object.assign(new Error("Invite has already been accepted"), { statusCode: 400 })
    }
    const { rows } = await pool.query(
      `UPDATE invite SET token=encode(gen_random_bytes(24), 'hex'), expires_at=NOW() + INTERVAL '7 days', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    )
    await pool
      .query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','invite',$2,'sent')`, [
        rows[0].email,
        JSON.stringify({ token: rows[0].token }),
      ])
      .catch(() => undefined)
    res.json({ invite: rows[0] })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// RBAC: roles + policies over the existing rbac_* tables.
// Lupus policies are plain strings (e.g. "orders:read"); the Lupus shape
// (key/resource/operation) is derived by splitting on the first ":".
// ---------------------------------------------------------------------------

function policyShape(row: any): any {
  const name = row.name as string
  const sep = name.indexOf(":")
  return {
    id: row.id,
    key: name,
    resource: sep >= 0 ? name.slice(0, sep) : name,
    operation: sep >= 0 ? name.slice(sep + 1) : "*",
    name,
    description: null,
    metadata: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    deleted_at: row.deleted_at ?? null,
  }
}

async function roleParentId(roleId: string): Promise<string | null> {
  const r = await pool.query(`SELECT parent_id FROM rbac_role_parent WHERE role_id=$1 LIMIT 1`, [roleId])
  return r.rows[0]?.parent_id ?? null
}

async function roleShape(id: string, withPolicies = false): Promise<any> {
  const r = await pool.query(`SELECT * FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!r.rows[0]) {
    throw notFound("Role", id)
  }
  const row = r.rows[0]
  const shape: any = {
    id: row.id,
    name: row.name,
    description: null,
    parent_id: await roleParentId(id),
    metadata: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    deleted_at: row.deleted_at ?? null,
  }
  if (withPolicies) {
    const p = await pool.query(
      `SELECT pol.* FROM rbac_policy pol JOIN rbac_role_policy link ON link.policy_id=pol.id WHERE link.role_id=$1 AND pol.deleted_at IS NULL ORDER BY pol.name`,
      [id]
    )
    shape.policies = p.rows.map(policyShape)
  }
  return shape
}

async function permissionsForUser(userId: string): Promise<string[]> {
  const r = await pool.query(
    `WITH RECURSIVE inherited(role_id) AS (
       SELECT role_id FROM admin_user_role WHERE admin_user_id=$1
       UNION
       SELECT rp.parent_id FROM rbac_role_parent rp JOIN inherited i ON i.role_id=rp.role_id
     )
     SELECT DISTINCT pol.name FROM rbac_role_policy rpol
     JOIN rbac_policy pol ON pol.id=rpol.policy_id AND pol.deleted_at IS NULL
     JOIN inherited i ON i.role_id=rpol.role_id
     JOIN rbac_role r ON r.id=rpol.role_id AND r.deleted_at IS NULL`,
    [userId]
  )
  return r.rows.map((row: any) => row.name as string)
}

async function currentAdminUserId(req: AuthedRequest): Promise<string | null> {
  if (!req.auth) {
    return null
  }
  const linked = await pool.query(
    `SELECT u.id FROM admin_user u JOIN admin_user_auth a ON a.admin_user_id=u.id WHERE a.auth_identity_id=$1 AND u.deleted_at IS NULL LIMIT 1`,
    [req.auth.actor_id]
  )
  if (linked.rows[0]) {
    return linked.rows[0].id as string
  }
  const byEmail = await pool.query(`SELECT id FROM admin_user WHERE email=$1 AND deleted_at IS NULL LIMIT 1`, [req.auth.email])
  return byEmail.rows[0]?.id ?? null
}

// sdk.admin.rbacRole.mePermissions -> { permissions }.
customersCompatRouter.get("/admin/rbac/me/permissions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = await currentAdminUserId(req)
    res.json({ permissions: userId ? await permissionsForUser(userId) : [] })
  } catch (e) {
    next(e)
  }
})

// --- policies (static /assignable registered before /:id) ---

customersCompatRouter.get("/admin/rbac/policies/assignable", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, q } = paginationSchema.extend({ q: z.string().optional() }).parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const conds = [`deleted_at IS NULL`]
    const params: any[] = []
    if (q) {
      params.push(`%${q}%`)
      conds.push(`name ILIKE $${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM rbac_policy ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM rbac_policy ${where} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, off]
    )
    res.json({ policies: rows.map(policyShape), count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/policies", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, q } = paginationSchema.extend({ q: z.string().optional() }).parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const conds = [`deleted_at IS NULL`]
    const params: any[] = []
    if (q) {
      params.push(`%${q}%`)
      conds.push(`name ILIKE $${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM rbac_policy ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM rbac_policy ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, off]
    )
    res.json({ policies: rows.map(policyShape), count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/rbac/policies", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { name, key, resource, operation } = z
      .object({
        name: z.string().min(1).optional(),
        key: z.string().min(1).optional(),
        resource: z.string().min(1).optional(),
        operation: z.string().min(1).optional(),
        description: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
      })
      .parse(req.body)
    const policyName = name ?? key ?? (resource && operation ? `${resource}:${operation}` : undefined)
    if (!policyName) {
      throw Object.assign(new Error("Policy name, key, or resource+operation is required"), { statusCode: 400 })
    }
    try {
      const { rows } = await pool.query(`INSERT INTO rbac_policy (name) VALUES ($1) RETURNING *`, [policyName])
      res.status(201).json({ policy: policyShape(rows[0]) })
    } catch (err: any) {
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Policy ${policyName} already exists`), { statusCode: 409 })
      }
      throw err
    }
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/policies/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM rbac_policy WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Policy", req.params.id)
    }
    res.json({ policy: policyShape(rows[0]) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/rbac/policies/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { name, key, resource, operation } = z
      .object({
        name: z.string().min(1).optional(),
        key: z.string().min(1).optional(),
        resource: z.string().min(1).optional(),
        operation: z.string().min(1).optional(),
        description: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
      })
      .parse(req.body)
    const prev = await pool.query(`SELECT * FROM rbac_policy WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("Policy", req.params.id)
    }
    const nextName = name ?? key ?? (resource && operation ? `${resource}:${operation}` : prev.rows[0].name)
    try {
      const { rows } = await pool.query(`UPDATE rbac_policy SET name=$2 WHERE id=$1 RETURNING *`, [req.params.id, nextName])
      res.json({ policy: policyShape(rows[0]) })
    } catch (err: any) {
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Policy ${nextName} already exists`), { statusCode: 409 })
      }
      throw err
    }
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/rbac/policies/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await pool.query(`UPDATE rbac_policy SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id])
    if (!gone.rows[0]) {
      throw notFound("Policy", req.params.id)
    }
    res.json({ id: req.params.id, object: "rbac_policy", deleted: true })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/policies/:id/roles", requireAuth, async (req, res, next) => {
  try {
    const policy = await pool.query(`SELECT id FROM rbac_policy WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!policy.rows[0]) {
      throw notFound("Policy", req.params.id)
    }
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const total = await pool.query(
      `SELECT COUNT(*)::int AS c FROM rbac_role r JOIN rbac_role_policy link ON link.role_id=r.id WHERE link.policy_id=$1 AND r.deleted_at IS NULL`,
      [req.params.id]
    )
    const { rows } = await pool.query(
      `SELECT r.* FROM rbac_role r JOIN rbac_role_policy link ON link.role_id=r.id WHERE link.policy_id=$1 AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, lim, off]
    )
    const roles: any[] = []
    for (const row of rows) {
      roles.push(await roleShape(row.id))
    }
    res.json({ roles, count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

// --- roles (static /assignable registered before /:id) ---

customersCompatRouter.get("/admin/rbac/roles/assignable", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, q } = paginationSchema.extend({ q: z.string().optional() }).parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const conds = [`deleted_at IS NULL`]
    const params: any[] = []
    if (q) {
      params.push(`%${q}%`)
      conds.push(`name ILIKE $${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM rbac_role ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM rbac_role ${where} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, off]
    )
    res.json({ roles: rows.map((r: any) => ({ id: r.id, name: r.name, description: null })), count: total.rows[0].c })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/roles", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, q } = paginationSchema.extend({ q: z.string().optional() }).parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const conds = [`deleted_at IS NULL`]
    const params: any[] = []
    if (q) {
      params.push(`%${q}%`)
      conds.push(`name ILIKE $${params.length}`)
    }
    const where = `WHERE ${conds.join(" AND ")}`
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM rbac_role ${where}`, params)
    const { rows } = await pool.query(
      `SELECT * FROM rbac_role ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, off]
    )
    const roles: any[] = []
    for (const row of rows) {
      roles.push(await roleShape(row.id))
    }
    res.json({ roles, count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/rbac/roles", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { name, parent_id, policy_ids, policies } = z
      .object({
        name: z.string().min(1),
        parent_id: z.string().nullish(),
        description: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
        policy_ids: z.array(z.string()).optional(),
        policies: z.array(z.string()).optional(),
      })
      .parse(req.body)
    if (parent_id) {
      const parent = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [parent_id])
      if (!parent.rows[0]) {
        throw notFound("Role", parent_id)
      }
    }
    const policyIds = [...(policy_ids ?? []), ...(policies ?? [])]
    const resolvedPolicyIds: string[] = []
    for (const pid of policyIds) {
      const byId = await pool.query(`SELECT id FROM rbac_policy WHERE id=$1 AND deleted_at IS NULL`, [pid])
      if (byId.rows[0]) {
        resolvedPolicyIds.push(byId.rows[0].id)
        continue
      }
      // Accept policy names too (same as POST /admin/roles): resolve or create.
      const byName = await pool.query(`SELECT id FROM rbac_policy WHERE name=$1 AND deleted_at IS NULL`, [pid])
      if (byName.rows[0]) {
        resolvedPolicyIds.push(byName.rows[0].id)
        continue
      }
      throw notFound("Policy", pid)
    }
    try {
      const { rows } = await pool.query(`INSERT INTO rbac_role (name) VALUES ($1) RETURNING *`, [name])
      const roleId = rows[0].id as string
      if (parent_id) {
        await pool.query(`INSERT INTO rbac_role_parent (role_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [roleId, parent_id])
      }
      for (const pid of [...new Set(resolvedPolicyIds)]) {
        await pool.query(`INSERT INTO rbac_role_policy (role_id, policy_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [roleId, pid])
      }
      res.status(201).json({ role: await roleShape(roleId, true) })
    } catch (err: any) {
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Role ${name} already exists`), { statusCode: 409 })
      }
      throw err
    }
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/roles/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ role: await roleShape(req.params.id, true) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.post("/admin/rbac/roles/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { name, parent_id } = z
      .object({
        name: z.string().min(1).optional(),
        parent_id: z.string().nullish(),
        description: z.string().nullish(),
        metadata: z.record(z.any()).nullish(),
      })
      .parse(req.body)
    const prev = await pool.query(`SELECT * FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("Role", req.params.id)
    }
    if (parent_id !== undefined) {
      if (parent_id) {
        const parent = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [parent_id])
        if (!parent.rows[0]) {
          throw notFound("Role", parent_id)
        }
      }
      await pool.query(`DELETE FROM rbac_role_parent WHERE role_id=$1`, [req.params.id])
      if (parent_id) {
        await pool.query(`INSERT INTO rbac_role_parent (role_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, parent_id])
      }
    }
    try {
      if (name !== undefined) {
        await pool.query(`UPDATE rbac_role SET name=$2 WHERE id=$1`, [req.params.id, name])
      }
    } catch (err: any) {
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Role ${name} already exists`), { statusCode: 409 })
      }
      throw err
    }
    res.json({ role: await roleShape(req.params.id, true) })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/rbac/roles/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const gone = await pool.query(`UPDATE rbac_role SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id])
    if (!gone.rows[0]) {
      throw notFound("Role", req.params.id)
    }
    res.json({ id: req.params.id, object: "rbac_role", deleted: true })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/roles/:roleId/policies", requireAuth, async (req, res, next) => {
  try {
    const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.roleId])
    if (!role.rows[0]) {
      throw notFound("Role", req.params.roleId)
    }
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const total = await pool.query(
      `SELECT COUNT(*)::int AS c FROM rbac_policy pol JOIN rbac_role_policy link ON link.policy_id=pol.id WHERE link.role_id=$1 AND pol.deleted_at IS NULL`,
      [req.params.roleId]
    )
    const { rows } = await pool.query(
      `SELECT pol.* FROM rbac_policy pol JOIN rbac_role_policy link ON link.policy_id=pol.id WHERE link.role_id=$1 AND pol.deleted_at IS NULL ORDER BY pol.name LIMIT $2 OFFSET $3`,
      [req.params.roleId, lim, off]
    )
    res.json({ policies: rows.map(policyShape), count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.rbacRole.addPolicies({ policies }) -> { policies, count, offset, limit }.
customersCompatRouter.post("/admin/rbac/roles/:roleId/policies", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const body = z
      .object({ policies: z.array(z.string()).optional(), policy_ids: z.array(z.string()).optional() })
      .parse(req.body)
    const ids = [...(body.policies ?? []), ...(body.policy_ids ?? [])]
    const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.roleId])
    if (!role.rows[0]) {
      throw notFound("Role", req.params.roleId)
    }
    for (const pid of ids) {
      const p = await pool.query(`SELECT id FROM rbac_policy WHERE id=$1 AND deleted_at IS NULL`, [pid])
      if (!p.rows[0]) {
        throw notFound("Policy", pid)
      }
      await pool.query(`INSERT INTO rbac_role_policy (role_id, policy_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.roleId, pid])
    }
    const { rows } = await pool.query(
      `SELECT pol.* FROM rbac_policy pol JOIN rbac_role_policy link ON link.policy_id=pol.id WHERE link.role_id=$1 AND pol.deleted_at IS NULL ORDER BY pol.name`,
      [req.params.roleId]
    )
    const policies = rows.map(policyShape)
    res.json({ policies, count: policies.length, offset: 0, limit: policies.length })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/rbac/roles/:roleId/policies/:policyId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.roleId])
    if (!role.rows[0]) {
      throw notFound("Role", req.params.roleId)
    }
    await pool.query(`DELETE FROM rbac_role_policy WHERE role_id=$1 AND policy_id=$2`, [req.params.roleId, req.params.policyId])
    res.json({ id: req.params.policyId, object: "rbac_policy", deleted: true })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.get("/admin/rbac/roles/:roleId/users", requireAuth, async (req, res, next) => {
  try {
    const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.roleId])
    if (!role.rows[0]) {
      throw notFound("Role", req.params.roleId)
    }
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const total = await pool.query(
      `SELECT COUNT(*)::int AS c FROM admin_user u JOIN admin_user_role link ON link.admin_user_id=u.id WHERE link.role_id=$1 AND u.deleted_at IS NULL`,
      [req.params.roleId]
    )
    const { rows } = await pool.query(
      `SELECT u.* FROM admin_user u JOIN admin_user_role link ON link.admin_user_id=u.id WHERE link.role_id=$1 AND u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.roleId, lim, off]
    )
    res.json({ users: rows, count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.rbacRole.addUsers({ users }) -> { users }.
customersCompatRouter.post("/admin/rbac/roles/:roleId/users", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const body = z
      .object({ users: z.array(z.string()).optional(), user_ids: z.array(z.string()).optional() })
      .parse(req.body)
    const ids = [...(body.users ?? []), ...(body.user_ids ?? [])]
    const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.roleId])
    if (!role.rows[0]) {
      throw notFound("Role", req.params.roleId)
    }
    for (const uid of ids) {
      const u = await pool.query(`SELECT id FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [uid])
      if (!u.rows[0]) {
        throw notFound("User", uid)
      }
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [uid, req.params.roleId])
    }
    const { rows } = await pool.query(
      `SELECT u.* FROM admin_user u JOIN admin_user_role link ON link.admin_user_id=u.id WHERE link.role_id=$1 AND u.deleted_at IS NULL ORDER BY u.created_at DESC`,
      [req.params.roleId]
    )
    res.json({ users: rows })
  } catch (e) {
    next(e)
  }
})

// sdk.admin.rbacRole.removeUsers({ users }) -> { ids, object: "role_user", deleted }.
customersCompatRouter.delete("/admin/rbac/roles/:roleId/users", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const body = z
      .object({ users: z.array(z.string()).optional(), user_ids: z.array(z.string()).optional() })
      .parse(req.body ?? {})
    const ids = [...(body.users ?? []), ...(body.user_ids ?? [])]
    const role = await pool.query(`SELECT id FROM rbac_role WHERE id=$1 AND deleted_at IS NULL`, [req.params.roleId])
    if (!role.rows[0]) {
      throw notFound("Role", req.params.roleId)
    }
    for (const uid of ids) {
      await pool.query(`DELETE FROM admin_user_role WHERE admin_user_id=$1 AND role_id=$2`, [uid, req.params.roleId])
    }
    res.json({ ids, object: "role_user", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// User <-> role assignment over admin_user_role (the rbac_role users surface
// above is role-centric; Lupus also exposes these user-centric routes).
// Refs:
//   js-sdk admin/user.ts listRoles/addRoles/removeRole/removeRoles ->
//     GET|POST|DELETE /admin/users/:id/roles, DELETE /admin/users/:id/roles/:role_id
//   upstream/src/api/admin/users/[id]/roles[/[role_id]]/route.ts:
//     GET -> { roles, count, offset, limit }, POST { roles: [...] } -> { roles },
//     DELETE { roles: [...] } -> { ids, object: "user_role", deleted: true },
//     DELETE :role_id -> { id, object: "user_role", deleted: true }.
// ---------------------------------------------------------------------------

async function requireAdminUser(id: string) {
  const u = await pool.query(`SELECT * FROM admin_user WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!u.rows[0]) {
    throw notFound("User", id)
  }
  return u.rows[0]
}

async function rolesForUser(userId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT r.* FROM rbac_role r JOIN admin_user_role link ON link.role_id=r.id WHERE link.admin_user_id=$1 AND r.deleted_at IS NULL ORDER BY r.created_at`,
    [userId]
  )
  const roles: any[] = []
  for (const row of rows) {
    roles.push(await roleShape(row.id, true))
  }
  return roles
}

customersCompatRouter.get("/admin/users/:id/roles", requireAuth, async (req, res, next) => {
  try {
    await requireAdminUser(req.params.id)
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const roles = await rolesForUser(req.params.id)
    res.json({ roles: roles.slice(off, off + lim), count: roles.length, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

// NOTE: POST /admin/users/:id/roles lives in admin-platform.routes.ts (registered
// earlier, so it wins): it accepts both Lupus { roles } and lupus { role_ids }
// and returns { roles }. Only the non-conflicting verbs are defined here.

customersCompatRouter.delete("/admin/users/:id/roles", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    const { roles } = z.object({ roles: z.array(z.string()).min(1) }).parse(req.body ?? {})
    await requireAdminUser(req.params.id)
    for (const roleId of [...new Set(roles)]) {
      await pool.query(`DELETE FROM admin_user_role WHERE admin_user_id=$1 AND role_id=$2`, [req.params.id, roleId])
    }
    res.json({ ids: roles, object: "user_role", deleted: true })
  } catch (e) {
    next(e)
  }
})

customersCompatRouter.delete("/admin/users/:id/roles/:role_id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "users:write")
    await requireAdminUser(req.params.id)
    await pool.query(`DELETE FROM admin_user_role WHERE admin_user_id=$1 AND role_id=$2`, [req.params.id, req.params.role_id])
    res.json({ id: req.params.role_id, object: "user_role", deleted: true })
  } catch (e) {
    next(e)
  }
})
