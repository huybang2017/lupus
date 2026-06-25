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
  try {
    const patch = campaignSchema.partial().omit({ promotion_ids: true }).parse(lupusCampaignBody(req.body))
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      params.push(k === "currency_code" && typeof v === "string" ? v.toLowerCase() : v)
      sets.push(`${k} = $${params.length}`)
    }
    if (sets.length === 0) {
      const cur = await pool.query(`SELECT * FROM campaign WHERE id = $1`, [req.params.id])
      res.json({ campaign: cur.rows[0] ?? null })
      return
    }
    params.push(req.params.id)
    const { rows } = await pool.query(`UPDATE campaign SET ${sets.join(", ")} WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`, params)
    if (!rows[0]) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 })
    res.json({ campaign: rows[0] })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.post("/admin/promotions/:id/rules", requireAuth, async (req, res, next) => {
  try {
    const { attribute, operator, values } = z.object({
      attribute: z.enum(["customer_group_id", "min_subtotal", "currency_code"]),
      operator: z.enum(["eq", "ne", "gte", "lte", "in"]).default("eq"),
      values: z.array(z.union([z.string(), z.number()])),
    }).parse(req.body)
    const { rows } = await pool.query(
      `INSERT INTO promotion_rule (promotion_id, attribute, operator, values) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, attribute, operator, JSON.stringify(values)]
    )
    res.status(201).json({ rule: rows[0] })
  } catch (e) {
    next(e)
  }
})

const LEGACY_PROMO_KEYS = new Set(["application_type", "application_target", "application_allocation", "application_value", "application_currency", "application_max_quantity", "buy_min_quantity", "min_subtotal", "customer_group_id", "starts_at", "ends_at"])

catalogAdminRouter.post("/admin/promotions/:id", requireAuth, async (req, res, next) => {
  try {
    // dashboard edits (details drawer, campaign drawer, disguised rules) use Lupus's nested payload
    if (req.body && !Object.keys(req.body).some((k) => LEGACY_PROMO_KEYS.has(k))) {
      res.json({ promotion: await promotionService.updatePromotion(req.params.id, req.body) })
      return
    }
    const patch = promoBase.partial().omit({ target_rules: true }).extend({ is_automatic: z.boolean().optional(), status: z.enum(["active", "draft"]).optional(), min_subtotal: z.number().int().nonnegative().nullable().optional(), customer_group_id: z.string().nullable().optional(), campaign_id: z.string().nullable().optional() }).parse(req.body)
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      params.push(typeof v === "string" && (k === "code" || k === "application_currency") ? v.toLowerCase() : v)
      sets.push(`${k} = $${params.length}`)
    }
    if (sets.length === 0) {
      const cur = await pool.query(`SELECT * FROM promotion WHERE id = $1`, [req.params.id])
      res.json({ promotion: cur.rows[0] ?? null })
      return
    }
    params.push(req.params.id)
    const { rows } = await pool.query(`UPDATE promotion SET ${sets.join(", ")} WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`, params)
    if (!rows[0]) throw Object.assign(new Error("Promotion not found"), { statusCode: 404 })
    res.json({ promotion: rows[0] })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.delete("/admin/promotions/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE promotion SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})



catalogAdminRouter.post("/admin/tax-regions/:id/rules", requireAuth, async (req, res, next) => {
  try {
    const { reference, reference_id } = z.object({ reference: z.enum(["province", "postal"]), reference_id: z.string().min(1) }).parse(req.body)
    const { rows } = await pool.query(`INSERT INTO tax_region_rule (tax_region_id, reference, reference_id) VALUES ($1,$2,$3) RETURNING *`, [req.params.id, reference, reference_id.toLowerCase()])
    res.status(201).json({ rule: rows[0] })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.post("/admin/products/:id/tax-code", requireAuth, async (req, res, next) => {
  try {
    const { tax_code } = z.object({ tax_code: z.string().min(1).nullable() }).parse(req.body)
    await pool.query(`UPDATE product SET tax_code = $2 WHERE id = $1`, [req.params.id, tax_code])
    res.json({ id: req.params.id, tax_code })
  } catch (e) {
    next(e)
  }
})

const priceListPrice = z.object({
  variant_id: z.string().min(1),
  currency_code: z.string().length(3),
  amount: z.number().int().nonnegative(),
  min_quantity: z.number().int().positive().nullish(),
  max_quantity: z.number().int().positive().nullish(),
  // Lupus sends the quantity range under `rules`
  rules: z.object({ min_quantity: z.coerce.number().int().positive().optional(), max_quantity: z.coerce.number().int().positive().optional() }).passthrough().nullish(),
})

const priceListBody = z.object({
  title: z.string().trim().min(1),
  type: z.enum(["sale", "override"]).default("sale"),
  description: z.string().nullish(),
  status: z.enum(["active", "draft"]).optional(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  customer_group_ids: z.array(z.string()).optional(),
  rules: z.record(z.string(), z.unknown()).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  prices: z.array(priceListPrice).default([]),
})

catalogAdminRouter.post("/admin/price-lists", requireAuth, async (req, res, next) => {
  try {
    const body = priceListBody.parse(req.body)
    const prices = body.prices.map(({ rules, ...p }) => ({
      ...p,
      min_quantity: p.min_quantity ?? rules?.min_quantity ?? null,
      max_quantity: p.max_quantity ?? rules?.max_quantity ?? null,
    }))
    const price_list = await pricingService.createPriceList({ ...body, prices })
    res.status(201).json({ price_list, price_list_id: price_list.id })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.get("/admin/price-lists", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "price_list",
      alias: "pl",
      select: `pl.*, (SELECT COUNT(*)::int FROM price p WHERE p.price_list_id = pl.id AND p.deleted_at IS NULL) AS price_count`,
      base: "pl.deleted_at IS NULL",
      specs: PRICE_LIST_FILTERS,
      q: { columns: PRICE_LIST_Q_COLUMNS },
      order: PRICE_LIST_SORT,
      defaultOrder: "pl.created_at DESC",
      key: "price_lists",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.delete("/admin/price-lists/:id", requireAuth, async (req, res, next) => {
  try {
    await pricingService.deletePriceList(req.params.id)
    res.json({ id: req.params.id, object: "price_list", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---- variant base prices (set/replace per currency, stored in price/price_set) ----
catalogAdminRouter.post("/admin/variants/:id/prices", requireAuth, async (req, res, next) => {
  try {
    const { prices } = z.object({ prices: z.array(z.object({ currency_code: z.string().length(3), amount: z.number().int().nonnegative() })) }).parse(req.body)
    const psId = await pricingService.ensureVariantPriceSet(req.params.id)
    for (const p of prices) {
      await pool.query(
        `INSERT INTO price (price_set_id, currency_code, amount, price_list_id)
         VALUES ($1,$2,$3,NULL)
         ON CONFLICT (price_set_id, currency_code) WHERE price_list_id IS NULL AND deleted_at IS NULL
         DO UPDATE SET amount = $3`,
        [psId, p.currency_code.toLowerCase(), p.amount]
      )
    }
    const { rows } = await pool.query(
      `SELECT currency_code, amount FROM price WHERE price_set_id = $1 AND price_list_id IS NULL AND deleted_at IS NULL`,
      [psId]
    )
    res.json({ prices: rows })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.get("/admin/variants/:id/prices", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.currency_code, p.amount
       FROM product_variant v
       JOIN price p ON p.price_set_id = v.price_set_id AND p.price_list_id IS NULL AND p.deleted_at IS NULL
       WHERE v.id = $1`,
      [req.params.id]
    )
    res.json({ prices: rows })
  } catch (e) {
    next(e)
  }
})

catalogAdminRouter.post("/admin/inventory/:variantId", requireAuth, async (req, res, next) => {
  try {
    const { stocked_quantity } = z.object({ stocked_quantity: z.number().int().nonnegative() }).parse(req.body)
    await pool.query(
      `INSERT INTO inventory_level (variant_id, stocked_quantity) VALUES ($1,$2)
       ON CONFLICT (variant_id) DO UPDATE SET stocked_quantity=$2, updated_at=NOW()`,
      [req.params.variantId, stocked_quantity]
    )
    res.json({ variant_id: req.params.variantId, stocked_quantity })
  } catch (e) {
    next(e)
  }
})
