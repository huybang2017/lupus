import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import { pricingService } from "./pricing.service"
import { promotionService } from "../promotion/promotion.service"
import { ruleAttributesFor } from "../promotion/promotion-rules"
import { queryRuleValues } from "../promotion/promotion-values"

// Lupus-compat pricing/promotion endpoints (dashboard parity: price lists,
// price preferences, promotions retrieve, campaigns).
// Refs (js-sdk exact paths/bodies + response shapes):
// - upstream/packages/core/js-sdk/src/admin/price-list.ts (retrieve/update/prices/
//   batchPrices/linkProducts) + upstream/src/api/admin/price-lists/.../route.ts
// - upstream/packages/core/js-sdk/src/admin/price-preference.ts (list/create/retrieve/
//   update/delete) + upstream/src/api/admin/price-preferences/.../route.ts
// - upstream/packages/core/js-sdk/src/admin/promotion.ts (retrieve/listRules/addRules/
//   updateRules/removeRules/listRuleAttributes/listRuleValues)
//   + upstream/src/api/admin/promotions/.../route.ts
// - upstream/packages/core/js-sdk/src/admin/campaign.ts (retrieve/update/batchPromotions)
//   + upstream/src/api/admin/campaigns/.../route.ts
// Only paths MISSING from lupus live here: create/list/delete for price lists,
// promotions and campaigns already exist in catalog-admin.routes.ts.
export const pricingCompatRouter = Router()

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// ---- price lists ----

pricingCompatRouter.get("/admin/price-lists/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ price_list: await pricingService.retrievePriceList(req.params.id) })
  } catch (e) {
    next(e)
  }
})

const priceListUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  status: z.enum(["active", "draft"]).optional(),
  type: z.enum(["sale", "override"]).optional(),
  customer_group_ids: z.array(z.string()).optional(),
  rules: z.record(z.string(), z.unknown()).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

pricingCompatRouter.post("/admin/price-lists/:id", requireAuth, async (req, res, next) => {
  try {
    const input = priceListUpdateSchema.parse(req.body)
    res.json({ price_list: await pricingService.updatePriceList(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.get("/admin/price-lists/:id/prices", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query)
    const { prices, count } = await pricingService.listPriceListPrices(req.params.id, limit, offset)
    res.json({ prices, count, offset, limit })
  } catch (e) {
    next(e)
  }
})

const batchPricesSchema = z.object({
  create: z
    .array(
      z
        .object({
          variant_id: z.string().min(1),
          currency_code: z.string().length(3),
          amount: z.number().int().nonnegative(),
          min_quantity: z.number().int().positive().nullish(),
          max_quantity: z.number().int().positive().nullish(),
        })
        .passthrough()
    )
    .optional(),
  update: z
    .array(
      z
        .object({
          id: z.string().min(1),
          variant_id: z.string().min(1).optional(),
          currency_code: z.string().length(3).optional(),
          amount: z.number().int().nonnegative().optional(),
          min_quantity: z.number().int().positive().nullish(),
          max_quantity: z.number().int().positive().nullish(),
        })
        .passthrough()
    )
    .optional(),
  delete: z.array(z.string()).optional(),
})

pricingCompatRouter.post("/admin/price-lists/:id/prices/batch", requireAuth, async (req, res, next) => {
  try {
    const input = batchPricesSchema.parse(req.body)
    res.json(await pricingService.batchPriceListPrices(req.params.id, input))
  } catch (e) {
    next(e)
  }
})

const linkProductsSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})

pricingCompatRouter.post("/admin/price-lists/:id/products", requireAuth, async (req, res, next) => {
  try {
    const input = linkProductsSchema.parse(req.body)
    res.json({ price_list: await pricingService.linkPriceListProducts(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

// ---- price preferences ----

pricingCompatRouter.get("/admin/price-preferences", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query)
    const { preferences, count } = await pricingService.listPricePreferences(limit, offset)
    res.json({ price_preferences: preferences, count, offset, limit })
  } catch (e) {
    next(e)
  }
})

const pricePreferenceCreateSchema = z.object({
  attribute: z.string().min(1),
  value: z.string().nullish(),
  is_tax_inclusive: z.boolean().optional(),
})

pricingCompatRouter.post("/admin/price-preferences", requireAuth, async (req, res, next) => {
  try {
    const input = pricePreferenceCreateSchema.parse(req.body)
    res.status(201).json({ price_preference: await pricingService.createPricePreference(input) })
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.get("/admin/price-preferences/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ price_preference: await pricingService.retrievePricePreference(req.params.id) })
  } catch (e) {
    next(e)
  }
})

const pricePreferenceUpdateSchema = z.object({
  attribute: z.string().min(1).nullish(),
  value: z.string().nullish(),
  is_tax_inclusive: z.boolean().optional(),
})

pricingCompatRouter.post("/admin/price-preferences/:id", requireAuth, async (req, res, next) => {
  try {
    const input = pricePreferenceUpdateSchema.parse(req.body)
    res.json({ price_preference: await pricingService.updatePricePreference(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.delete("/admin/price-preferences/:id", requireAuth, async (req, res, next) => {
  try {
    await pricingService.deletePricePreference(req.params.id)
    res.json({ id: req.params.id, object: "price_preference", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---- promotions ----
// Static rule-option paths first: otherwise "rule-attribute-options" would match :id.

// Rule attribute vocabulary lives in promotion-rules.ts (ported from Lupus's rule-attributes-map).
pricingCompatRouter.get("/admin/promotions/rule-attribute-options/:ruleType", requireAuth, async (req, res, next) => {
  try {
    const ruleType = z.enum(["rules", "target-rules", "buy-rules"]).parse(req.params.ruleType)
    const q = z
      .object({
        promotion_type: z.string().optional(),
        application_method_type: z.string().optional(),
        application_method_target_type: z.string().optional(),
      })
      .parse(req.query)
    res.json({
      attributes: ruleAttributesFor({
        promotionType: q.promotion_type,
        applicationMethodType: q.application_method_type,
        applicationMethodTargetType: q.application_method_target_type,
      })[ruleType],
    })
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.get("/admin/promotions/rule-value-options/:ruleType/:ruleValue", requireAuth, async (req, res, next) => {
  try {
    z.enum(["rules", "target-rules", "buy-rules"]).parse(req.params.ruleType)
    const q = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().int().optional(),
        offset: z.coerce.number().int().optional(),
        value: z.union([z.string(), z.array(z.string())]).optional(),
      })
      .parse(req.query)
    res.json(
      await queryRuleValues(req.params.ruleValue, {
        q: q.q,
        limit: q.limit,
        offset: q.offset,
        wanted: q.value === undefined ? null : Array.isArray(q.value) ? q.value : [q.value],
      })
    )
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.get("/admin/promotions/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ promotion: await promotionService.retrievePromotion(req.params.id) })
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.get("/admin/promotions/:id/:ruleType", requireAuth, async (req, res, next) => {
  try {
    const ruleType = z.enum(["rules", "target-rules", "buy-rules"]).parse(req.params.ruleType)
    res.json({ rules: await promotionService.listRulesDetailed(req.params.id, ruleType) })
  } catch (e) {
    next(e)
  }
})

const batchRulesSchema = z.object({
  create: z.array(z.object({ attribute: z.string().optional(), operator: z.string().optional() }).passthrough()).optional(),
  update: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
  delete: z.array(z.string()).optional(),
  rules: z.array(z.object({ attribute: z.string().optional(), operator: z.string().optional() }).passthrough()).optional(),
  rule_ids: z.array(z.string()).optional(),
})

pricingCompatRouter.post("/admin/promotions/:id/:ruleType/batch", requireAuth, async (req, res, next) => {
  try {
    const ruleType = z.enum(["rules", "target-rules", "buy-rules"]).parse(req.params.ruleType)
    const input = batchRulesSchema.parse(req.body)
    // One handler serves addRules ({create} / {rules}), updateRules ({update})
    // and removeRules ({delete} / {rule_ids}): they share one path in the js-sdk.
    res.json({ promotion: await promotionService.batchPromotionRules(req.params.id, ruleType, input) })
  } catch (e) {
    next(e)
  }
})

// ---- campaigns ----

pricingCompatRouter.get("/admin/campaigns/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ campaign: await promotionService.retrieveCampaign(req.params.id) })
  } catch (e) {
    next(e)
  }
})

const campaignUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  currency_code: z.string().length(3).nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  budget_limit: z.number().int().positive().nullish(),
  usage_limit: z.number().int().positive().nullish(),
})

pricingCompatRouter.post("/admin/campaigns/:id", requireAuth, async (req, res, next) => {
  try {
    const input = campaignUpdateSchema.parse(req.body)
    res.json({ campaign: await promotionService.updateCampaign(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})

pricingCompatRouter.post("/admin/campaigns/:id/promotions", requireAuth, async (req, res, next) => {
  try {
    const input = linkProductsSchema.parse(req.body)
    res.json({ campaign: await promotionService.batchCampaignPromotions(req.params.id, input) })
  } catch (e) {
    next(e)
  }
})
