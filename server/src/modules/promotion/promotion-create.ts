import { z } from "zod"
import { pool } from "../../db"
import { promotionService } from "./promotion.service"
import { DISGUISED, normalizeAttribute } from "./promotion-rules"

// POST /admin/promotions with Lupus's create payload (what the dashboard's create wizard
// sends): { code, type, status, is_automatic, is_tax_inclusive, limit, rules[],
// application_method{ type, target_type, allocation, value, currency_code, max_quantity,
// apply_to_quantity, buy_rules_min_quantity, target_rules[], buy_rules[] }, campaign_id | campaign }.

const ruleSchema = z.object({
  attribute: z.string().min(1),
  operator: z.enum(["in", "eq", "ne"]),
  values: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
})

const campaignSchema = z.object({
  name: z.string().min(1),
  campaign_identifier: z.string().nullish(),
  description: z.string().nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  budget: z
    .object({
      type: z.enum(["usage", "spend", "use_by_attribute"]).default("usage"),
      limit: z.number().int().nonnegative().nullish(),
      currency_code: z.string().length(3).nullish(),
      attribute: z.string().nullish(),
    })
    .default({ type: "usage" }),
})

export const createPromotionSchema = z
  .object({
    code: z.string().min(1),
    type: z.enum(["standard", "buyget"]).default("standard"),
    status: z.enum(["draft", "active"]).default("draft"),
    is_automatic: z.boolean().default(false),
    is_tax_inclusive: z.boolean().default(false),
    limit: z.number().int().min(1).nullish(),
    usage_limit: z.number().int().min(1).nullish(),
    campaign_id: z.string().nullish(),
    campaign: campaignSchema.nullish(),
    rules: z.array(ruleSchema).default([]),
    application_method: z.object({
      type: z.enum(["fixed", "percentage"]),
      target_type: z.enum(["order", "items", "shipping_methods"]),
      allocation: z.enum(["each", "across", "once"]).nullish(),
      value: z.number().min(0).nullish(),
      currency_code: z.string().length(3).nullish(),
      max_quantity: z.number().int().positive().nullish(),
      apply_to_quantity: z.number().int().positive().nullish(),
      buy_rules_min_quantity: z.number().int().positive().nullish(),
      target_rules: z.array(ruleSchema).default([]),
      buy_rules: z.array(ruleSchema).default([]),
    }),
  })
  .superRefine((p, ctx) => {
    const m = p.application_method
    const need = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message })
    if (m.value == null) need(["application_method", "value"], "Required field")
    if (m.type === "percentage" && m.value != null && m.value > 100) {
      need(["application_method", "value"], "A percentage cannot be more than 100")
    }
    if (m.type === "fixed" && !m.currency_code) {
      need(["application_method", "currency_code"], "A currency is required for a fixed amount")
    }
    if (p.type === "standard" && m.target_type === "items" && (m.allocation === "each" || m.allocation === "once")) {
      if (m.max_quantity == null) need(["application_method", "max_quantity"], "Required field")
    }
    if (m.allocation === "across" && m.max_quantity != null) {
      need(["application_method", "max_quantity"], "Maximum quantity is not allowed with the across allocation")
    }
    if (p.type === "buyget") {
      if (m.buy_rules_min_quantity == null) need(["application_method", "buy_rules_min_quantity"], "Required field")
      if (m.apply_to_quantity == null) need(["application_method", "apply_to_quantity"], "Required field")
      if (m.buy_rules.length === 0) need(["application_method", "buy_rules"], "A buy promotion needs at least one buy condition")
      if (m.target_rules.length === 0) need(["application_method", "target_rules"], "A buy promotion needs at least one target condition")
    }
  })

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>

const asArray = (v: string | string[]) => (Array.isArray(v) ? v : [v])

export async function createPromotionFromWizard(raw: unknown): Promise<any> {
  const input = createPromotionSchema.parse(raw)
  const m = input.application_method
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    let campaignId = input.campaign_id ?? null
    if (campaignId) {
      const c = await client.query(`SELECT id FROM campaign WHERE id=$1 AND deleted_at IS NULL`, [campaignId])
      if (!c.rows[0]) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 })
    } else if (input.campaign) {
      const c = input.campaign
      const spend = c.budget.type === "spend"
      const camp = await client.query(
        `INSERT INTO campaign (name, identifier, description, currency_code, starts_at, ends_at, budget_limit, usage_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          c.name,
          c.campaign_identifier || null,
          c.description || null,
          spend ? (c.budget.currency_code ?? m.currency_code ?? null)?.toLowerCase() ?? null : null,
          c.starts_at ?? null,
          c.ends_at ?? null,
          spend ? (c.budget.limit ?? null) : null,
          spend ? null : (c.budget.limit ?? null),
        ]
      )
      campaignId = camp.rows[0].id
    }

    const isBuyGet = input.type === "buyget"
    const { rows } = await client.query(
      `INSERT INTO promotion (code, status, is_automatic, is_tax_inclusive, campaign_id, application_type, application_target,
                              application_allocation, application_value, application_currency, application_max_quantity,
                              application_apply_to_quantity, buy_min_quantity, usage_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [
        input.code.toLowerCase(),
        input.status,
        input.is_automatic,
        input.is_tax_inclusive,
        campaignId,
        isBuyGet ? "buyget" : m.type,
        m.target_type,
        isBuyGet ? null : (m.allocation ?? (m.target_type === "items" ? "each" : "across")),
        m.value ?? null,
        m.currency_code?.toLowerCase() ?? null,
        m.max_quantity ?? null,
        isBuyGet ? (m.apply_to_quantity ?? null) : null,
        isBuyGet ? (m.buy_rules_min_quantity ?? null) : null,
        input.limit ?? input.usage_limit ?? null,
      ]
    )
    const id: string = rows[0].id

    const insertRules = async (table: string, rules: z.infer<typeof ruleSchema>[]) => {
      for (const r of rules) {
        // disguised rules live on the application method, never as rows
        if (Object.values(DISGUISED).includes(r.attribute as any)) continue
        await client.query(
          `INSERT INTO ${table} (promotion_id, attribute, operator, values) VALUES ($1,$2,$3,$4)`,
          [id, normalizeAttribute(r.attribute), r.operator, JSON.stringify(asArray(r.values))]
        )
      }
    }
    await insertRules("promotion_rule", input.rules)
    await insertRules("promotion_target_rule", m.target_rules)
    await insertRules("promotion_buy_rule", m.buy_rules)

    await client.query("COMMIT")
    return promotionService.retrievePromotion(id)
  } catch (e: any) {
    await client.query("ROLLBACK")
    if (e?.code === "23505") {
      const what = String(e.constraint ?? "").includes("identifier")
        ? `A campaign with identifier "${input.campaign?.campaign_identifier}" already exists`
        : `A promotion with code "${input.code}" already exists`
      throw Object.assign(new Error(what), { statusCode: 409 })
    }
    throw e
  } finally {
    client.release()
  }
}
