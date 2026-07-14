import { pool } from "../../db"
import { z } from "zod"
import { DISGUISED, OPERATOR_LABELS, describeAttribute, normalizeAttribute, type RuleType } from "./promotion-rules"
import { labelRuleValues } from "./promotion-values"

// Port of Lupus promotion application (application-method type/allocation + rules).
//
// Application methods
//   percentage : value 0-100 off each eligible line
//   fixed      : value in minor units; allocation 'each' (per unit), 'across' (spread over the
//                eligible subtotal, remainder pennies to the first lines) or 'once' (per unit,
//                limited cart-wide)
//   buyget     : buy rules unlock the promotion; apply_to_quantity target units get value % off
// Quantity limits (max_quantity)
//   'each' enforces the limit per line item, 'once' enforces it across the whole cart.
// Rules
//   promotion.rules  -> who may use it (customer group, region, country, sales channel, currency)
//   target rules     -> which items are discounted (product, category, collection, type, tag)
//   buy rules        -> which items count towards the buy quantity
//   Operators: in / eq (any match) and ne ("Not In").
//   Rows written before the wizard port use short attribute names; normalizeAttribute maps them.
// Shipping promotions add negative shipping_method_adjustment rows (free shipping = 100 %).
export interface EligibleLine {
  line_id: string
  product_id: string | null
  quantity: number
  unit_price: number
  collection_id?: string | null
  type_id?: string | null
  category_ids?: string[]
  tag_ids?: string[]
}

interface CartContext {
  customer_id?: string | null
  currency_code?: string | null
  region_id?: string | null
  sales_channel_id?: string | null
}

const updatePromotionSchema = z.object({
  code: z.string().min(1).optional(),
  status: z.enum(["draft", "active", "inactive"]).optional(),
  is_automatic: z.boolean().optional(),
  is_tax_inclusive: z.boolean().optional(),
  limit: z.number().int().min(1).nullable().optional(),
  usage_limit: z.number().int().min(1).nullable().optional(),
  campaign_id: z.string().nullable().optional(),
  application_method: z
    .object({
      value: z.number().min(0).nullable().optional(),
      type: z.enum(["fixed", "percentage"]).optional(),
      allocation: z.enum(["each", "across", "once"]).optional(),
      max_quantity: z.number().int().positive().nullable().optional(),
      apply_to_quantity: z.number().int().positive().nullable().optional(),
      buy_rules_min_quantity: z.number().int().positive().nullable().optional(),
      currency_code: z.string().length(3).nullable().optional(),
    })
    .optional(),
})

const bad = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode })

export class PromotionService {
  async applyCode(cartId: string, code: string): Promise<void> {
    const normalized = code.toLowerCase().trim()
    const { rows } = await pool.query(
      `SELECT * FROM promotion WHERE LOWER(code)=$1 AND deleted_at IS NULL`,
      [normalized]
    )
    const promo = rows[0]
    if (!promo || promo.status !== "active") {
      throw bad("Invalid promotion code")
    }
    const now = new Date()
    if ((promo.starts_at && new Date(promo.starts_at) > now) || (promo.ends_at && new Date(promo.ends_at) < now)) {
      throw bad("Promotion is not active")
    }
    if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) {
      throw bad("Promotion usage limit reached")
    }
    await pool.query(
      `INSERT INTO cart_promotion (cart_id, promotion_id, code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [cartId, promo.id, promo.code]
    )
    await this.recompute(cartId)
  }

  async removeCode(cartId: string, code: string): Promise<void> {
    await pool.query(`DELETE FROM cart_promotion WHERE cart_id=$1 AND LOWER(code)=LOWER($2)`, [cartId, code])
    await this.recompute(cartId)
  }

  /** Recompute adjustments for all promos on cart — mirrors update-cart-promotions workflow.
   * Includes automatic promotions (is_automatic, no code needed), campaign budget
   * enforcement (usage + spend caps), and eligibility rules. */
  async recompute(cartId: string): Promise<void> {
    await pool.query(`DELETE FROM line_item_adjustment WHERE cart_id=$1`, [cartId])
    await pool.query(`DELETE FROM shipping_method_adjustment WHERE cart_id=$1`, [cartId])
    // auto-attach active automatic promotions whose window/campaign/rules pass
    const cartRes = await pool.query(
      `SELECT customer_id, currency_code, region_id, sales_channel_id FROM cart WHERE id = $1`,
      [cartId]
    )
    const cart: CartContext = cartRes.rows[0] ?? {}
    const autoPromos = await pool.query(
      `SELECT p.* FROM promotion p WHERE p.is_automatic = TRUE AND p.deleted_at IS NULL AND p.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM cart_promotion cp WHERE cp.cart_id = $1 AND cp.promotion_id = p.id)`,
      [cartId]
    )
    for (const ap of autoPromos.rows) {
      if (await this.checkEligible(cartId, ap, cart)) {
        await pool.query(`INSERT INTO cart_promotion (cart_id, promotion_id, code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [cartId, ap.id, ap.code])
      }
    }
    const promos = await pool.query(
      `SELECT p.* FROM promotion p JOIN cart_promotion cp ON cp.promotion_id=p.id
       WHERE cp.cart_id=$1 AND p.deleted_at IS NULL AND p.status='active'`,
      [cartId]
    )
    const lines = await this.loadLines(cartId)
    for (const promo of promos.rows) {
      if (!(await this.checkEligible(cartId, promo, cart))) {
        continue
      }
      if (promo.campaign_id) {
        const camp = await pool.query(`SELECT * FROM campaign WHERE id = $1 AND deleted_at IS NULL`, [promo.campaign_id])
        const c = camp.rows[0]
        if (!c) continue
        const now = new Date()
        if ((c.starts_at && new Date(c.starts_at) > now) || (c.ends_at && new Date(c.ends_at) < now)) continue
        if (c.usage_limit != null && c.usage_count >= c.usage_limit) continue
      }
      if (promo.application_target === "shipping_methods") {
        await this.applyShipping(cartId, promo)
        continue
      }
      if (promo.application_type === "buyget") {
        await this.applyBuyGet(cartId, promo, lines)
      } else {
        const eligible = await this.filterEligible(promo.id, lines, "promotion_target_rule")
        if (eligible.length === 0) {
          continue
        }
        if (promo.application_type === "percentage") {
          await this.applyPercentage(cartId, promo, eligible)
        } else {
          await this.applyFixed(cartId, promo, eligible)
        }
      }
      // campaign spend-cap: trim adjustments if they exceed remaining budget
      if (promo.campaign_id) {
        await this.enforceBudgetCap(cartId, promo)
      }
    }
  }

  private async loadLines(cartId: string): Promise<EligibleLine[]> {
    const { rows } = await pool.query(
      `SELECT li.id AS line_id, li.product_id, li.quantity, li.unit_price,
              p.collection_id, p.type_id,
              COALESCE((SELECT array_agg(pc.category_id) FROM product_category_product pc WHERE pc.product_id = li.product_id), '{}') AS category_ids,
              COALESCE((SELECT array_agg(pt.tag_id) FROM product_tags pt WHERE pt.product_id = li.product_id), '{}') AS tag_ids
       FROM cart_line_item li LEFT JOIN product p ON p.id = li.product_id
       WHERE li.cart_id=$1 AND li.deleted_at IS NULL ORDER BY li.created_at`,
      [cartId]
    )
    return rows.map((r: any) => ({
      ...r,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
    }))
  }

  /** Eligibility: window, usage, min subtotal, customer group, currency, custom rules. */
  private async checkEligible(cartId: string, promo: any, cart: CartContext): Promise<boolean> {
    const now = new Date()
    if ((promo.starts_at && new Date(promo.starts_at) > now) || (promo.ends_at && new Date(promo.ends_at) < now)) return false
    if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) return false
    if (promo.application_currency && cart?.currency_code && promo.application_currency !== cart.currency_code) return false
    if (promo.min_subtotal != null || promo.customer_group_id) {
      const sub = await pool.query(`SELECT COALESCE(SUM(quantity * unit_price),0)::int AS s FROM cart_line_item WHERE cart_id=$1 AND deleted_at IS NULL`, [cartId])
      if (promo.min_subtotal != null && Number(sub.rows[0].s) < promo.min_subtotal) return false
      if (promo.customer_group_id && cart?.customer_id) {
        const g = await pool.query(`SELECT 1 FROM customer_group_customer WHERE customer_group_id=$1 AND customer_id=$2`, [promo.customer_group_id, cart.customer_id])
        if (g.rows.length === 0) return false
      } else if (promo.customer_group_id && !cart?.customer_id) {
        return false
      }
    }
    const rules = await pool.query(`SELECT * FROM promotion_rule WHERE promotion_id=$1`, [promo.id])
    for (const r of rules.rows) {
      const vals: string[] = (Array.isArray(r.values) ? r.values : [r.values]).map(String)
      const hitOp = (hit: boolean) => (r.operator === "ne" ? !hit : hit)
      const attribute = normalizeAttribute(r.attribute)
      if (attribute === "currency_code") {
