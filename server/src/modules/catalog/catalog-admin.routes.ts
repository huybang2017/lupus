import { promotionService } from "../promotion/promotion.service"
import { createPromotionFromWizard } from "../promotion/promotion-create"
import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import {
  CAMPAIGN_FILTERS,
  CAMPAIGN_Q_COLUMNS,
  CAMPAIGN_SORT,
  PRICE_LIST_FILTERS,
  PRICE_LIST_Q_COLUMNS,
  PRICE_LIST_SORT,
  PROMOTION_FILTERS,
  PROMOTION_Q_COLUMNS,
  PROMOTION_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { pricingService } from "../pricing/pricing.service"

// Admin CRUD for promotions / tax regions+rares / price lists / inventory.
// Ports the corresponding Lupus admin endpoints (promotion, tax, price-list modules).
// All write paths validate windows/status exactly like the module services.
export const catalogAdminRouter = Router()

const promoBase = z.object({
  code: z.string().min(1),
  status: z.enum(["active", "draft"]).optional(),
  campaign_id: z.string().nullish(),
  application_type: z.enum(["percentage", "fixed", "buyget"]),
  application_target: z.enum(["order", "items", "shipping_methods"]).default("order"),
  application_allocation: z.enum(["each", "across"]).nullish(),
  application_value: z.number().nonnegative().nullish(),
  application_currency: z.string().length(3).nullish(),
  application_max_quantity: z.number().int().positive().nullish(),
  buy_min_quantity: z.number().int().positive().nullish(),
  usage_limit: z.number().int().positive().nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  target_rules: z
    .array(z.object({ attribute: z.string(), operator: z.enum(["in", "eq", "ne"]).default("in"), values: z.array(z.string()) }))
    .optional(),
})

const promoSchema = promoBase.superRefine((p, ctx) => {
  const need = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
  if (p.application_type === "percentage") {
    if (p.application_value == null) need("application_value", "A percentage value is required")
    else if (p.application_value > 100) need("application_value", "A percentage cannot be more than 100")
  }
  if (p.application_type === "fixed") {
    if (p.application_value == null) need("application_value", "An amount is required")
    if (!p.application_currency) need("application_currency", "A currency is required for a fixed amount")
  }
  if (p.application_type === "buyget" && p.buy_min_quantity == null) {
    need("buy_min_quantity", "A buy minimum quantity is required")
  }
  if (p.starts_at && p.ends_at && new Date(p.ends_at) <= new Date(p.starts_at)) {
    need("ends_at", "The end date must be after the start date")
  }
})

catalogAdminRouter.post("/admin/promotions", requireAuth, async (req, res, next) => {
  try {
    // the dashboard's create wizard sends Lupus's nested application_method payload
    if (req.body && typeof req.body.application_method === "object") {
      res.status(201).json({ promotion: await createPromotionFromWizard(req.body) })
      return
    }
    const input = promoSchema.parse(req.body)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO promotion (code, status, campaign_id, application_type, application_target, application_allocation, application_value, application_currency, application_max_quantity, buy_min_quantity, usage_limit, starts_at, ends_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [input.code.toLowerCase(), input.status ?? "active", input.campaign_id ?? null, input.application_type, input.application_target, input.application_allocation ?? null, input.application_value ?? null, input.application_currency?.toLowerCase() ?? null, input.application_max_quantity ?? null, input.buy_min_quantity ?? null, input.usage_limit ?? null, input.starts_at ?? null, input.ends_at ?? null]
      )
      for (const r of input.target_rules ?? []) {
        await client.query(`INSERT INTO promotion_target_rule (promotion_id, attribute, operator, values) VALUES ($1,$2,$3,$4)`, [
          rows[0].id,
          r.attribute,
          r.operator,
          JSON.stringify(r.values),
        ])
      }
      await client.query("COMMIT")
      res.status(201).json({ promotion: rows[0] })
    } catch (e: any) {
      await client.query("ROLLBACK")
      if (e?.code === "23505") {
        throw Object.assign(new Error(`A promotion with code "${input.code}" already exists`), { statusCode: 409 })
      }
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.get("/admin/promotions", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "promotion",
      alias: "p",
      select: "p.*",
      base: "p.deleted_at IS NULL",
      specs: PROMOTION_FILTERS,
      q: { columns: PROMOTION_Q_COLUMNS },
      order: PROMOTION_SORT,
      defaultOrder: "p.created_at DESC",
      key: "promotions",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

const campaignSchema = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1).nullish(),
  description: z.string().optional(),
  currency_code: z.string().length(3).nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  budget_limit: z.number().int().positive().nullish(),
  usage_limit: z.number().int().positive().nullish(),
  promotion_ids: z.array(z.string()).optional(),
})

// Lupus sends campaign_identifier, a nested budget { type: "usage" | "spend", limit, currency_code } and promotions: [{ id }];
// fold those onto the flat columns this table uses.
function lupusCampaignBody(body: any): any {
  if (!body || typeof body !== "object") return body
  const out: any = { ...body }
  if (out.campaign_identifier !== undefined && out.identifier === undefined) out.identifier = out.campaign_identifier
  delete out.campaign_identifier
  if (out.budget !== undefined) {
    const b = out.budget
    if (b === null) {
      out.budget_limit = null
      out.usage_limit = null
    } else if (b && typeof b === "object") {
      if (b.type === "spend") {
        if (b.limit !== undefined) out.budget_limit = b.limit
        if (b.currency_code) out.currency_code = b.currency_code
      } else if (b.type === "usage" && b.limit !== undefined) {
        out.usage_limit = b.limit
      }
    }
    delete out.budget
  }
  if (Array.isArray(out.promotions) && out.promotion_ids === undefined) {
    out.promotion_ids = out.promotions.map((p: any) => (typeof p === "string" ? p : p?.id)).filter(Boolean)
  }
  delete out.promotions
  delete out.metadata
  return out
}

catalogAdminRouter.post("/admin/campaigns", requireAuth, async (req, res, next) => {
  try {
    const input = campaignSchema.parse(lupusCampaignBody(req.body))
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO campaign (name, identifier, description, currency_code, starts_at, ends_at, budget_limit, usage_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [input.name, input.identifier ?? null, input.description ?? null, input.currency_code?.toLowerCase() ?? null, input.starts_at ?? null, input.ends_at ?? null, input.budget_limit ?? null, input.usage_limit ?? null]
      )
      for (const pid of input.promotion_ids ?? []) {
        await client.query(`UPDATE promotion SET campaign_id = $2 WHERE id = $1`, [pid, rows[0].id])
      }
      await client.query("COMMIT")
      res.status(201).json({ campaign: rows[0] })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.get("/admin/campaigns", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "campaign",
      alias: "c",
      select: "c.*",
      base: "c.deleted_at IS NULL",
      specs: CAMPAIGN_FILTERS,
      q: { columns: CAMPAIGN_Q_COLUMNS },
      order: CAMPAIGN_SORT,
      defaultOrder: "c.created_at DESC",
      key: "campaigns",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.delete("/admin/campaigns/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE campaign SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
    await pool.query(`UPDATE promotion SET campaign_id = NULL WHERE campaign_id = $1`, [req.params.id])
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.post("/admin/campaigns/:id", requireAuth, async (req, res, next) => {
