import { Router } from "express"
import { z } from "zod"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { authService } from "../auth/auth.service"
import { CUSTOMER_FILTERS, CUSTOMER_Q_COLUMNS, CUSTOMER_SORT } from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { customerService } from "./customer.service"

// Port of Lupus store customer endpoints (upstream/src/api/store/customers/*).
export const customerRouter = Router()

// ?has_orders cannot be a FilterSpec: it is an EXISTS over "order", not a
// column comparison. The value is only ever read through a fixed switch, so the
// fragment below contains no user input at all and can be handed to runList as
// an extra (paramless) base condition. Draft orders are excluded, matching
// Lupus's has_orders (only real orders count).
// ?groups=<id>&groups=<id>: customers in at least one of those groups (ids are inlined, so they are restricted to id characters)
function groupsCondition(groups: unknown): string {
  const ids = (Array.isArray(groups) ? groups : groups === undefined ? [] : [groups]).map((g) => String(g).trim()).filter((g) => /^[A-Za-z0-9_-]+$/.test(g))
  if (ids.length === 0) return ""
  return `EXISTS (SELECT 1 FROM customer_group_customer cgc WHERE cgc.customer_id = c.id AND cgc.customer_group_id IN (${ids.map((g) => `'${g}'`).join(",")}))`
}

function hasOrdersCondition(hasOrders: unknown): string {
  const raw = Array.isArray(hasOrders) ? hasOrders[0] : hasOrders
  const key = String(raw ?? "").trim().toLowerCase()
  const exists = `EXISTS (SELECT 1 FROM "order" o WHERE o.customer_id = c.id AND o.deleted_at IS NULL AND o.is_draft_order=FALSE)`
  if (key === "true" || key === "1" || key === "yes" || key === "on") {
    return exists
  }
  if (key === "false" || key === "0" || key === "no" || key === "off") {
    return `NOT ${exists}`
  }
  return ""
}

customerRouter.get("/store/customers/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const customer = await customerService.retrieveByEmail(req.auth!.email)
    if (!customer) {
      res.status(404).json({ message: "Customer not found" })
      return
    }
    res.json({ customer: (await customerService.retrieveDetailed(customer.id)) ?? customer })
  } catch (e) {
    next(e)
  }
})

customerRouter.post("/store/customers", async (req, res, next) => {
  try {
    const input = z
      .object({
        email: z.string().email(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        company_name: z.string().optional(),
        phone: z.string().optional(),
      })
      .parse(req.body)
    // Lupus: after emailpass registration the storefront calls this with the registration token to
    // fill in the profile of the customer that registration created.
    const header = req.headers.authorization
    if (header?.startsWith("Bearer ")) {
      let tokenEmail: string
      try {
        tokenEmail = authService.verifyToken(header.slice(7)).email
      } catch {
        res.status(401).json({ message: "Invalid or expired token" })
        return
      }
      const existing = await customerService.retrieveByEmail(tokenEmail)
      if (existing) {
        const updated = await customerService.update(existing.id, {
          first_name: input.first_name,
          last_name: input.last_name,
          company_name: input.company_name,
          phone: input.phone,
        })
        res.status(200).json({ customer: updated ?? existing })
        return
      }
      res.status(201).json({ customer: await customerService.create({ ...input, email: tokenEmail }) })
      return
    }
    res.status(201).json({ customer: await customerService.create(input) })
  } catch (e) {
    next(e)
  }
})

customerRouter.get("/admin/customers", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "customer",
      alias: "c",
      select: "c.*",
      base: ["c.deleted_at IS NULL", hasOrdersCondition(req.query.has_orders), groupsCondition(req.query.groups)],
      specs: CUSTOMER_FILTERS,
      q: { columns: CUSTOMER_Q_COLUMNS },
      order: CUSTOMER_SORT,
      defaultOrder: "c.created_at DESC",
      key: "customers",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})
