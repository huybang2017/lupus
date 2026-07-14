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
        if (!hitOp(!!cart?.currency_code && vals.includes(cart.currency_code))) return false
      } else if (attribute === "min_subtotal") {
        const sub = await pool.query(`SELECT COALESCE(SUM(quantity * unit_price),0)::int AS s FROM cart_line_item WHERE cart_id=$1 AND deleted_at IS NULL`, [cartId])
        const s = Number(sub.rows[0].s)
        const v = Number(vals[0])
        if (r.operator === "gte" && !(s >= v)) return false
        if (r.operator === "lte" && !(s <= v)) return false
      } else if (attribute === "customer.groups.id") {
        // a guest cart can never satisfy a customer-group rule written with the legacy name
        if (!cart?.customer_id && r.attribute === "customer_group_id") return false
        let hit = false
        if (cart?.customer_id) {
          const g = await pool.query(`SELECT 1 FROM customer_group_customer WHERE customer_group_id = ANY($1) AND customer_id=$2`, [vals, cart.customer_id])
          hit = g.rows.length > 0
        }
        if (!hitOp(hit)) return false
      } else if (attribute === "region.id") {
        if (!hitOp(!!cart?.region_id && vals.includes(cart.region_id))) return false
      } else if (attribute === "sales_channel_id") {
        if (!hitOp(!!cart?.sales_channel_id && vals.includes(cart.sales_channel_id))) return false
      } else if (attribute === "shipping_address.country_code") {
        const a = await pool.query(`SELECT country_code FROM cart_address WHERE cart_id=$1 AND kind='shipping'`, [cartId])
        const cc = String(a.rows[0]?.country_code ?? "").toLowerCase()
        if (!hitOp(!!cc && vals.map((v) => v.toLowerCase()).includes(cc))) return false
      }
    }
    return true
  }

  /** Trim this promo's adjustments so campaign spend stays within budget_limit. */
  private async enforceBudgetCap(cartId: string, promo: any): Promise<void> {
    const camp = await pool.query(`SELECT budget_limit, budget_used FROM campaign WHERE id=$1`, [promo.campaign_id])
    const c = camp.rows[0]
    if (!c || c.budget_limit == null) return
    const remaining = c.budget_limit - c.budget_used
    if (remaining < 0) {
      await pool.query(`DELETE FROM line_item_adjustment WHERE cart_id=$1 AND promotion_id=$2`, [cartId, promo.id])
      return
    }
    const adj = await pool.query(`SELECT id, amount FROM line_item_adjustment WHERE cart_id=$1 AND promotion_id=$2 ORDER BY created_at`, [cartId, promo.id])
    let total = adj.rows.reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0)
    for (const r of adj.rows) {
      if (total <= remaining) break
      const over = total - remaining
      const cut = Math.min(over, Math.abs(Number(r.amount)))
      const next = Math.abs(Number(r.amount)) - cut
      total -= cut
      if (next <= 0) {
        await pool.query(`DELETE FROM line_item_adjustment WHERE id=$1`, [r.id])
      } else {
        await pool.query(`UPDATE line_item_adjustment SET amount=$2 WHERE id=$1`, [r.id, -next])
      }
    }
  }

  private lineValues(attribute: string, l: EligibleLine): (string | null | undefined)[] | null {
    switch (normalizeAttribute(attribute)) {
      case "items.product.id":
        return [l.product_id]
      case "items.product.categories.id":
        return l.category_ids ?? []
      case "items.product.collection_id":
        return [l.collection_id]
      case "items.product.type_id":
        return [l.type_id]
      case "items.product.tags.id":
        return l.tag_ids ?? []
      default:
        return null // unknown attribute: the rule does not constrain items
    }
  }

  /** Lines matching every rule of `table` (no rules = every line). */
  private async filterEligible(
    promotionId: string,
    lines: EligibleLine[],
    table: "promotion_target_rule" | "promotion_buy_rule"
  ): Promise<EligibleLine[]> {
    const rules = await pool.query(`SELECT * FROM ${table} WHERE promotion_id=$1`, [promotionId])
    if (rules.rows.length === 0) {
      return lines
    }
    return lines.filter((l) =>
      rules.rows.every((r) => {
        const vals: string[] = (Array.isArray(r.values) ? r.values : [r.values]).map(String)
        const have = this.lineValues(r.attribute, l)
        if (have === null) return true
        const hit = have.some((v) => v != null && vals.includes(String(v)))
        return r.operator === "ne" ? !hit : hit
      })
    )
  }

  /**
   * How many units of each line the promotion may discount.
   * 'each'  -> per line item, up to max_quantity
   * 'once'  -> cart-wide, up to max_quantity (priciest units first)
   * else    -> every unit
   */
  private unitsPerLine(promo: any, lines: EligibleLine[]): Map<string, number> {
    const out = new Map<string, number>()
    const max: number | null = promo.application_max_quantity ?? null
    if (promo.application_allocation === "each" && max != null) {
      for (const l of lines) out.set(l.line_id, Math.min(l.quantity, max))
    } else if (promo.application_allocation === "once" && max != null) {
      let left = max
      for (const l of [...lines].sort((a, b) => b.unit_price - a.unit_price)) {
        const take = Math.min(l.quantity, left)
        out.set(l.line_id, take)
        left -= take
      }
    } else {
      for (const l of lines) out.set(l.line_id, l.quantity)
    }
    return out
  }

  private async addAdjustment(cartId: string, lineId: string, promo: any, amount: number) {
    if (amount <= 0) return
    await pool.query(
      `INSERT INTO line_item_adjustment (cart_id, line_item_id, promotion_id, code, amount) VALUES ($1,$2,$3,$4,$5)`,
      [cartId, lineId, promo.id, promo.code, -amount]
    )
  }

  private async applyPercentage(cartId: string, promo: any, lines: EligibleLine[]) {
    const pct = Math.min(Math.max(Number(promo.application_value), 0), 100)
    const units = this.unitsPerLine(promo, lines)
    for (const l of lines) {
      // Lupus rounds per-line: round(unit*qty*pct/100)
      await this.addAdjustment(cartId, l.line_id, promo, Math.round(l.unit_price * (units.get(l.line_id) ?? 0) * (pct / 100)))
    }
  }

  private async applyFixed(cartId: string, promo: any, lines: EligibleLine[]) {
    const value = Math.round(Number(promo.application_value))
    if (promo.application_allocation === "each" || promo.application_allocation === "once") {
      const units = this.unitsPerLine(promo, lines)
      for (const l of lines) {
        const perUnit = Math.min(value, l.unit_price)
        await this.addAdjustment(cartId, l.line_id, promo, perUnit * (units.get(l.line_id) ?? 0))
      }
      return
    }
    // across: cap by eligible subtotal, distribute proportionally, remainder to first line
    const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
    if (subtotal <= 0) return
    const shares = lines.map((l) => Math.floor((l.unit_price * l.quantity * Math.min(value, subtotal)) / subtotal))
    const distributed = shares.reduce((s, x) => s + x, 0)
    let remainder = Math.min(value, subtotal) - distributed
    for (let i = 0; i < lines.length; i++) {
      let share = shares[i]
      if (remainder > 0) {
        share += 1
        remainder -= 1
      }
      await this.addAdjustment(cartId, lines[i].line_id, promo, share)
    }
  }

  private async applyBuyGet(cartId: string, promo: any, lines: EligibleLine[]) {
    const minQty: number = promo.buy_min_quantity ?? 2
    const buyRuleCount = (await pool.query(`SELECT COUNT(*)::int AS c FROM promotion_buy_rule WHERE promotion_id=$1`, [promo.id])).rows[0].c
    const targets = await this.filterEligible(promo.id, lines, "promotion_target_rule")
    if (targets.length === 0) {
      return
    }
    const legacy = buyRuleCount === 0 && promo.application_apply_to_quantity == null
    // rows created before the wizard port counted the target lines towards the buy quantity
    const buyLines = legacy ? targets : await this.filterEligible(promo.id, lines, "promotion_buy_rule")
    const buyQty = buyLines.reduce((s, l) => s + l.quantity, 0)
    if (buyQty < minQty) {
      return
    }
    const maxQty: number | null = promo.application_max_quantity
    const applyTo: number | null = promo.application_apply_to_quantity
    const sorted = [...targets].sort((a, b) => a.unit_price - b.unit_price)
    const totalTargetQty = targets.reduce((s, l) => s + l.quantity, 0)

    let freeUnits: number
    let pct = 100
    if (legacy) {
      // rows created before the wizard port: "buy N, cheapest unit(s) free"
      freeUnits = Math.min(buyQty - minQty + 1, maxQty ?? buyQty - minQty + 1)
    } else {
      pct = promo.application_value != null ? Math.min(Math.max(Number(promo.application_value), 0), 100) : 100
      freeUnits = (applyTo ?? 1) * Math.floor(buyQty / minQty)
      if (maxQty != null) freeUnits = Math.min(freeUnits, maxQty)
    }
    freeUnits = Math.min(freeUnits, totalTargetQty)
    for (const l of sorted) {
      if (freeUnits <= 0) break
      const take = Math.min(freeUnits, l.quantity)
      await this.addAdjustment(cartId, l.line_id, promo, Math.round(take * l.unit_price * (pct / 100)))
      freeUnits -= take
    }
  }

  private async applyShipping(cartId: string, promo: any) {
    const methods = await pool.query(`SELECT id, amount FROM cart_shipping_method WHERE cart_id=$1`, [cartId])
    for (const m of methods.rows) {
      const amount = Number(m.amount)
      const discount =
        promo.application_type === "percentage"
          ? Math.round(amount * (Math.min(Math.max(Number(promo.application_value), 0), 100) / 100))
          : Math.min(Math.round(Number(promo.application_value)), amount)
      if (discount > 0) {
        await pool.query(
          `INSERT INTO shipping_method_adjustment (cart_id, shipping_method_id, promotion_id, code, amount) VALUES ($1,$2,$3,$4,$5)`,
          [cartId, m.id, promo.id, promo.code, -discount]
        )
      }
    }
  }

  // ---- Lupus-compat admin reads (dashboard parity) ----
  // Refs: upstream/packages/core/js-sdk/src/admin/promotion.ts (retrieve/listRules/
  // addRules/updateRules/removeRules/listRuleAttributes/listRuleValues),
  // upstream/packages/core/js-sdk/src/admin/campaign.ts
  // (retrieve/update/batchPromotions) +
  // upstream/src/api/admin/promotions| campaigns/.../route.ts.
  // Rule types: "rules" -> promotion_rule, "target-rules" -> promotion_target_rule,
  // "buy-rules" -> promotion_buy_rule (+ the buy minimum quantity stored on the promotion).

  private ruleTable(ruleType: string): "promotion_rule" | "promotion_target_rule" | "promotion_buy_rule" {
    if (ruleType === "rules") return "promotion_rule"
    if (ruleType === "target-rules" || ruleType === "target_rules") return "promotion_target_rule"
    if (ruleType === "buy-rules" || ruleType === "buy_rules") return "promotion_buy_rule"
    throw bad(`Unknown rule type: ${ruleType}`)
  }

  private mapCampaign(row: any, promotions: any[] = []): any {
    if (!row) return null
    const spend = row.budget_limit != null
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      currency: row.currency_code,
      campaign_identifier: row.identifier ?? row.id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      budget: {
        id: row.id,
        type: spend ? "spend" : "usage",
        currency_code: row.currency_code,
        limit: spend ? row.budget_limit : (row.usage_limit ?? 0),
        used: spend ? (row.budget_used ?? 0) : (row.usage_count ?? 0),
      },
      promotions,
      created_at: row.created_at,
      updated_at: row.created_at,
      deleted_at: row.deleted_at,
    }
  }

  async retrievePromotion(id: string): Promise<any> {
    const { rows } = await pool.query(`SELECT * FROM promotion WHERE id = $1 AND deleted_at IS NULL`, [id])
    const promo = rows[0]
    if (!promo) {
      throw bad("Promotion not found", 404)
    }
    const rules = await pool.query(`SELECT * FROM promotion_rule WHERE promotion_id = $1 ORDER BY created_at`, [id])
    const targetRules = await pool.query(`SELECT * FROM promotion_target_rule WHERE promotion_id = $1 ORDER BY created_at`, [id])
    const storedBuyRules = await pool.query(`SELECT * FROM promotion_buy_rule WHERE promotion_id = $1 ORDER BY created_at`, [id])
    const buyRules = [
      ...storedBuyRules.rows,
      ...(promo.buy_min_quantity != null
        ? [{ id: promo.id, attribute: "buy_min_quantity", operator: "gte", values: [String(promo.buy_min_quantity)] }]
        : []),
    ]
    let campaign = null
    if (promo.campaign_id) {
      const c = await pool.query(`SELECT * FROM campaign WHERE id = $1 AND deleted_at IS NULL`, [promo.campaign_id])
      campaign = this.mapCampaign(c.rows[0])
    }
    const isBuyGet = promo.application_type === "buyget"
    return {
      ...promo,
      type: isBuyGet ? "buyget" : "standard",
      application_method: {
        id: promo.id,
        // a buy-get promotion discounts a percentage of the target units (100 = free)
        type: isBuyGet ? "percentage" : promo.application_type,
        target_type: promo.application_target,
        allocation: promo.application_allocation,
        value: isBuyGet ? (promo.application_value ?? 100) : promo.application_value,
        currency_code: promo.application_currency,
        max_quantity: promo.application_max_quantity,
        apply_to_quantity: promo.application_apply_to_quantity,
        buy_rules_min_quantity: promo.buy_min_quantity,
        target_rules: targetRules.rows,
        buy_rules: storedBuyRules.rows,
      },
      rules: rules.rows,
      target_rules: targetRules.rows,
      buy_rules: buyRules,
      campaign,
    }
  }

  async listPromotionRules(id: string, ruleType: string): Promise<any[]> {
    const promo = await pool.query(`SELECT id FROM promotion WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!promo.rows[0]) {
      throw bad("Promotion not found", 404)
    }
    const table = this.ruleTable(ruleType)
    if (table === "promotion_buy_rule") {
      return (await this.retrievePromotion(id)).buy_rules
    }
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE promotion_id = $1 ORDER BY created_at`, [id])
    return rows
  }

  async batchPromotionRules(
    id: string,
    ruleType: string,
    input: { create?: any[]; update?: any[]; delete?: string[]; rules?: any[]; rule_ids?: string[] }
  ): Promise<any> {
    const promo = await pool.query(`SELECT * FROM promotion WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!promo.rows[0]) {
      throw bad("Promotion not found", 404)
    }
    const table = this.ruleTable(ruleType)
    const create = input.create ?? input.rules ?? []
    const remove = input.delete ?? input.rule_ids ?? []
    const isMinQuantity = (attribute: unknown) => attribute === "buy_min_quantity" || attribute === DISGUISED.BUY_RULES_MIN_QUANTITY
    if (table === "promotion_buy_rule") {
      for (const c of create.filter((r) => isMinQuantity(r.attribute) || r.buy_min_quantity != null)) {
        const qty = c.buy_min_quantity ?? (c.values ? Number(c.values[0]) : undefined) ?? (c.value != null ? Number(c.value) : undefined)
        if (qty != null && Number.isFinite(qty)) {
          await pool.query(`UPDATE promotion SET buy_min_quantity = $2 WHERE id = $1`, [id, Math.max(1, Math.round(qty))])
        }
      }
      for (const u of (input.update ?? []).filter((r) => isMinQuantity(r.attribute) || r.id === id)) {
        const qty = u.buy_min_quantity ?? (u.values ? Number(u.values[0]) : undefined)
        if (qty != null && Number.isFinite(qty)) {
          await pool.query(`UPDATE promotion SET buy_min_quantity = $2 WHERE id = $1`, [id, Math.max(1, Math.round(qty))])
        }
      }
      if (remove.includes(id)) {
        await pool.query(`UPDATE promotion SET buy_min_quantity = NULL WHERE id = $1`, [id])
      }
      const realCreate = create.filter((r) => !isMinQuantity(r.attribute) && r.buy_min_quantity == null)
      const realUpdate = (input.update ?? []).filter((r) => !isMinQuantity(r.attribute) && r.id !== id)
      const realRemove = remove.filter((rid) => rid !== id)
      return this.batchRows(id, table, { create: realCreate, update: realUpdate, remove: realRemove })
    }
    return this.batchRows(id, table, { create, update: input.update ?? [], remove })
  }

  private async batchRows(
    id: string,
    table: "promotion_rule" | "promotion_target_rule" | "promotion_buy_rule",
    input: { create: any[]; update: any[]; remove: string[] }
  ): Promise<any> {
    for (const c of input.create) {
      const parsed = { attribute: c.attribute ?? "items.product.id", operator: c.operator ?? "in", values: c.values ?? c.value ?? [] }
      const vals = Array.isArray(parsed.values) ? parsed.values : [parsed.values]
      await pool.query(
        `INSERT INTO ${table} (promotion_id, attribute, operator, values) VALUES ($1,$2,$3,$4)`,
        [id, parsed.attribute, parsed.operator, JSON.stringify(vals)]
      )
    }
    for (const u of input.update) {
      if (!u.id) continue
      const sets: string[] = []
      const params: any[] = []
      if (u.attribute !== undefined) {
        params.push(u.attribute)
        sets.push(`attribute = $${params.length}`)
      }
      if (u.operator !== undefined) {
        params.push(u.operator)
        sets.push(`operator = $${params.length}`)
      }
      if (u.values !== undefined || u.value !== undefined) {
        const vals = u.values !== undefined ? (Array.isArray(u.values) ? u.values : [u.values]) : [u.value]
        params.push(JSON.stringify(vals))
        sets.push(`values = $${params.length}`)
      }
      if (sets.length === 0) continue
      params.push(u.id, id)
      await pool.query(
        `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND promotion_id = $${params.length}`,
        params
      )
    }
    for (const rid of input.remove) {
      await pool.query(`DELETE FROM ${table} WHERE id = $1 AND promotion_id = $2`, [rid, id])
    }
    return this.retrievePromotion(id)
