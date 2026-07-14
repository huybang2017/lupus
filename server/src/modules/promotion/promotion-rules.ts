// Promotion rule vocabulary, ported from Lupus
// (upstream/src/api/admin/promotions/utils/rule-attributes-map.ts).
//
//  - "rules"        : who can use the promotion (customer group, region, country, channel, currency)
//  - "target-rules" : which items get discounted
//  - "buy-rules"    : what must be in the cart to unlock a buy-X-get-Y promotion
//
// Rule attributes use Lupus's dotted names (e.g. `items.product.id`). Rows written before
// the wizard was ported use short names (`product_id`, `customer_group_id`); normalizeAttribute()
// maps them so the engine understands both.

export type RuleType = "rules" | "target-rules" | "buy-rules"
export type PromotionKind = "standard" | "buyget"

export interface RuleOperator {
  id: string
  value: string
  label: string
}

export const OPERATORS: Record<"in" | "eq" | "ne", RuleOperator> = {
  in: { id: "in", value: "in", label: "In" },
  eq: { id: "eq", value: "eq", label: "Equals" },
  ne: { id: "ne", value: "ne", label: "Not In" },
}
const ALL_OPERATORS = [OPERATORS.in, OPERATORS.eq, OPERATORS.ne]

export interface RuleAttribute {
  id: string
  value: string
  label: string
  required: boolean
  field_type: "select" | "multiselect" | "number" | "text"
  operators: RuleOperator[]
  disguised?: boolean
  hydrate?: boolean
}

const multi = (id: string, value: string, label: string): RuleAttribute => ({
  id,
  value,
  label,
  required: false,
  field_type: "multiselect",
  operators: ALL_OPERATORS,
})

const CUSTOMER_RULES: RuleAttribute[] = [
  multi("customer_group", "customer.groups.id", "Customer Group"),
  multi("region", "region.id", "Region"),
  multi("country", "shipping_address.country_code", "Country"),
  multi("sales_channel", "sales_channel_id", "Sales Channel"),
]

const ITEM_RULES: RuleAttribute[] = [
  multi("product", "items.product.id", "Product"),
  multi("product_category", "items.product.categories.id", "Product Category"),
  multi("product_collection", "items.product.collection_id", "Product Collection"),
  multi("product_type", "items.product.type_id", "Product Type"),
  multi("product_tag", "items.product.tags.id", "Product Tag"),
]

export const DISGUISED = {
  APPLY_TO_QUANTITY: "apply_to_quantity",
  BUY_RULES_MIN_QUANTITY: "buy_rules_min_quantity",
  CURRENCY_CODE: "currency_code",
} as const

const currencyRule: RuleAttribute = {
  id: DISGUISED.CURRENCY_CODE,
  value: DISGUISED.CURRENCY_CODE,
  label: "Currency Code",
  field_type: "select",
  required: true,
  disguised: true,
  hydrate: true,
  operators: [OPERATORS.eq],
}

const buyRulesMinQuantity: RuleAttribute = {
  id: DISGUISED.BUY_RULES_MIN_QUANTITY,
  value: DISGUISED.BUY_RULES_MIN_QUANTITY,
  label: "Minimum quantity of items",
  field_type: "number",
  required: true,
  disguised: true,
  operators: [OPERATORS.eq],
}

const applyToQuantity: RuleAttribute = {
  id: DISGUISED.APPLY_TO_QUANTITY,
  value: DISGUISED.APPLY_TO_QUANTITY,
  label: "Quantity of items promotion will apply to",
  field_type: "number",
  required: true,
  disguised: true,
  operators: [OPERATORS.eq],
}

export function ruleAttributesFor(ctx: {
  promotionType?: string
  applicationMethodType?: string
  applicationMethodTargetType?: string
}): Record<RuleType, RuleAttribute[]> {
  const shipping = ctx.applicationMethodTargetType === "shipping_methods"
  // The lupus backend has no shipping-option types to match against, so shipping
  // promotions have no target conditions (they discount every shipping method).
  const itemRules = shipping ? [] : ITEM_RULES
  const map: Record<RuleType, RuleAttribute[]> = {
    rules: [...CUSTOMER_RULES],
    "target-rules": [...itemRules],
    "buy-rules": [...itemRules],
  }
  map.rules.push(ctx.applicationMethodType === "fixed" ? { ...currencyRule } : { ...currencyRule, required: false })
  if (ctx.promotionType === "buyget") {
    map["buy-rules"].push(buyRulesMinQuantity)
    map["target-rules"].push(applyToQuantity)
  }
  return map
}

const LEGACY_ATTRIBUTES: Record<string, string> = {
  product_id: "items.product.id",
  customer_group_id: "customer.groups.id",
  region_id: "region.id",
  country_code: "shipping_address.country_code",
}

export function normalizeAttribute(attribute: string): string {
  return LEGACY_ATTRIBUTES[attribute] ?? attribute
}

/** attribute id (customer_group, product, ...) -> the stored attribute value. */
export function attributeValueById(id: string): string | undefined {
  return [...CUSTOMER_RULES, ...ITEM_RULES].find((a) => a.id === id)?.value
}

const LEGACY_LABELS: Record<string, { label: string; field_type: RuleAttribute["field_type"] }> = {
  min_subtotal: { label: "Minimum subtotal", field_type: "number" },
  buy_min_quantity: { label: "Minimum quantity of items", field_type: "number" },
}

/** Label + field type of any stored attribute (Lupus names, legacy names, disguised rules). */
export function describeAttribute(attribute: string): { label: string; field_type: RuleAttribute["field_type"] } {
  const wanted = normalizeAttribute(attribute)
  const all = ruleAttributesFor({ promotionType: "buyget", applicationMethodType: "fixed", applicationMethodTargetType: "items" })
  const hit = [...all.rules, ...all["target-rules"], ...all["buy-rules"]].find((a) => a.value === wanted)
  if (hit) return { label: hit.label, field_type: hit.field_type }
  return LEGACY_LABELS[attribute] ?? { label: attribute, field_type: "multiselect" }
}

export const OPERATOR_LABELS: Record<string, string> = { in: "In", eq: "Equals", ne: "Not In", gte: "At least", lte: "At most" }
