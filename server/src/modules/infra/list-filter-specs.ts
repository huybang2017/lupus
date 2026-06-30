import type { FilterSpec } from "./list-query"

// Shared admin list filter specs, sort allow-lists and free-text column lists.
//
// These live here (not in the route modules) on purpose: every list endpoint
// imports the same registry, and nothing is re-exported from a route file,
// because route -> registry -> route would be a circular import.
//
// Everything here is declarative data: column names and operators are literal
// in this file, user values are always bound as params by the list-query helper.
// Two filters cannot be expressed as a FilterSpec and are therefore handled by
// a hand-written EXISTS in their route (documented at the export):
//   - customer `has_orders`  -> EXISTS on "order"
//   - region  `country_code` -> EXISTS on region_country
//   - order   `fulfillment_status` -> EXISTS on fulfillment (derived; "order"
//     has no fulfillment_status column in this schema)

// ---------- status whitelists (mirroring the CHECK constraints in the schema) ----------

/** "order".status CHECK list. */
export const ORDER_STATUSES = ["pending", "completed", "archived", "canceled", "requires_action"]

/** payment_collection.status CHECK list (also the admin `payment_status`). */
export const PAYMENT_STATUSES = [
  "not_paid",
  "awaiting",
  "authorized",
  "partially_authorized",
  "captured",
  "partially_captured",
  "refunded",
  "canceled",
  "requires_more",
]

/** return_request.status CHECK list. */
export const RETURN_STATUSES = ["requested", "confirmed", "partially_received", "received", "canceled", "dismissed"]

/** claim.status / exchange.status CHECK list. */
export const CLAIM_STATUSES = ["requested", "confirmed", "received", "canceled", "dismissed"]

/**
 * A draft order is presented with `status: "open"` (Lupus's draft lifecycle)
 * but is stored as an "order" row whose status is constrained by the "order"
 * CHECK list, so a draft is persisted as "pending". `?status=open` (what the
 * dashboard sends) therefore has to be mapped onto the stored value; every other
 * accepted value is passed through untouched.
 */
function draftStatus(raw: string): string {
  const v = raw.trim().toLowerCase()
  return v === "open" ? "pending" : v
}

// ---------- draft orders ----------

/** GET /admin/draft-orders ("order" o WHERE is_draft_order). */
export const DRAFT_ORDER_FILTERS: FilterSpec[] = [
  { key: "id", column: "o.id", op: "in" },
  { key: "status", column: "o.status", op: "eq", values: ["open", ...ORDER_STATUSES], coerce: draftStatus },
  { key: "customer_id", column: "o.customer_id", op: "eq" },
  { key: "sales_channel_id", column: "o.sales_channel_id", op: "eq" },
  { key: "region_id", column: "o.region_id", op: "eq" },
  { key: "email", column: "o.email", op: "ilike" },
  { key: "created_at", column: "o.created_at", op: "gte" },
  { key: "created_at", column: "o.created_at", op: "lte" },
  { key: "total", column: "o.total", op: "num_gte" },
  { key: "total", column: "o.total", op: "num_lte" },
]

/** Free-text columns for `?q=` on draft orders. display_id may be NULL. */
export const DRAFT_ORDER_Q_COLUMNS = ["o.email", "o.id", "o.display_id::text", "COALESCE(o.display_id::text, '')"]

export const DRAFT_ORDER_SORT: Record<string, string> = {
  created_at: "o.created_at",
  email: "o.email",
  total: "o.total",
  display_id: "o.display_id",
}

// ---------- orders ----------

/**
 * GET /admin/orders ("order" o LEFT JOIN payment_collection pc).
 * `payment_status` filters on the joined pc.status; `fulfillment_status` is
 * NOT here - the column does not exist, so the route adds a derived EXISTS.
 */
export const ORDER_FILTERS: FilterSpec[] = [
  { key: "id", column: "o.id", op: "in" },
  { key: "status", column: "o.status", op: "eq", values: ORDER_STATUSES },
  { key: "payment_status", column: "pc.status", op: "eq", values: PAYMENT_STATUSES },
  { key: "customer_id", column: "o.customer_id", op: "eq" },
  { key: "sales_channel_id", column: "o.sales_channel_id", op: "eq" },
  { key: "region_id", column: "o.region_id", op: "eq" },
  { key: "email", column: "o.email", op: "ilike" },
  { key: "created_at", column: "o.created_at", op: "gte" },
  { key: "created_at", column: "o.created_at", op: "lte" },
  { key: "total", column: "o.total", op: "num_gte" },
  { key: "total", column: "o.total", op: "num_lte" },
]

export const ORDER_Q_COLUMNS = ["o.email", "o.id", "COALESCE(o.display_id::text, '')"]

export const ORDER_SORT: Record<string, string> = {
  created_at: "o.created_at",
  email: "o.email",
  total: "o.total",
  display_id: "o.display_id",
}

// ---------- customers ----------

/**
 * GET /admin/customers (customer c). `has_orders` is NOT here: it needs an
 * EXISTS on "order", so the route appends that condition itself.
 */
export const CUSTOMER_FILTERS: FilterSpec[] = [
  { key: "id", column: "c.id", op: "in" },
  { key: "email", column: "c.email", op: "ilike" },
  { key: "first_name", column: "c.first_name", op: "ilike" },
  { key: "last_name", column: "c.last_name", op: "ilike" },
  { key: "company_name", column: "c.company_name", op: "ilike" },
  { key: "has_account", column: "c.has_account", op: "bool" },
  { key: "created_at", column: "c.created_at", op: "gte" },
  { key: "created_at", column: "c.created_at", op: "lte" },
]

export const CUSTOMER_Q_COLUMNS = ["c.email", "COALESCE(c.first_name,'')", "COALESCE(c.last_name,'')"]

export const CUSTOMER_SORT: Record<string, string> = {
  created_at: "c.created_at",
  email: "c.email",
  first_name: "c.first_name",
  last_name: "c.last_name",
}

// ---------- admin users ----------

export const ADMIN_USER_FILTERS: FilterSpec[] = [
  { key: "id", column: "u.id", op: "in" },
  { key: "created_at", column: "u.created_at", op: "gte" },
  { key: "created_at", column: "u.created_at", op: "lte" },
]

export const ADMIN_USER_Q_COLUMNS = ["u.email", "COALESCE(u.first_name,'')", "COALESCE(u.last_name,'')"]

export const ADMIN_USER_SORT: Record<string, string> = {
  created_at: "u.created_at",
  email: "u.email",
  first_name: "u.first_name",
  last_name: "u.last_name",
}

// ---------- customer groups ----------

export const CUSTOMER_GROUP_FILTERS: FilterSpec[] = [
  { key: "id", column: "g.id", op: "in" },
  { key: "name", column: "g.name", op: "ilike" },
  { key: "created_at", column: "g.created_at", op: "gte" },
  { key: "created_at", column: "g.created_at", op: "lte" },
]

export const CUSTOMER_GROUP_Q_COLUMNS = ["g.name"]

export const CUSTOMER_GROUP_SORT: Record<string, string> = {
  created_at: "g.created_at",
  name: "g.name",
}

// ---------- invites ----------

export const INVITE_FILTERS: FilterSpec[] = [
  { key: "id", column: "i.id", op: "in" },
  { key: "email", column: "i.email", op: "ilike" },
  { key: "accepted", column: "i.accepted", op: "bool" },
  { key: "created_at", column: "i.created_at", op: "gte" },
  { key: "created_at", column: "i.created_at", op: "lte" },
]

export const INVITE_Q_COLUMNS = ["i.email"]

export const INVITE_SORT: Record<string, string> = {
  created_at: "i.created_at",
  email: "i.email",
}

// ---------- sales channels ----------

export const SALES_CHANNEL_FILTERS: FilterSpec[] = [
  { key: "id", column: "s.id", op: "in" },
  { key: "name", column: "s.name", op: "ilike" },
  { key: "is_disabled", column: "s.is_disabled", op: "bool" },
  { key: "created_at", column: "s.created_at", op: "gte" },
  { key: "created_at", column: "s.created_at", op: "lte" },
]

export const SALES_CHANNEL_Q_COLUMNS = ["s.name", "COALESCE(s.description,'')"]

export const SALES_CHANNEL_SORT: Record<string, string> = {
  created_at: "s.created_at",
  name: "s.name",
}

// ---------- regions ----------

/**
 * GET /admin/regions (region r). `country_code` is NOT here: it is resolved
 * through the region_country join, so the route appends an EXISTS itself.
 */
export const REGION_FILTERS: FilterSpec[] = [
  { key: "id", column: "r.id", op: "in" },
  { key: "name", column: "r.name", op: "ilike" },
  { key: "currency_code", column: "r.currency_code", op: "eq", coerce: (v) => v.toLowerCase() },
  { key: "created_at", column: "r.created_at", op: "gte" },
  { key: "created_at", column: "r.created_at", op: "lte" },
]

export const REGION_Q_COLUMNS = ["r.name", "COALESCE(r.currency_code,'')"]

export const REGION_SORT: Record<string, string> = {
  created_at: "r.created_at",
  name: "r.name",
  currency_code: "r.currency_code",
}

// ---------- payment collections ----------

export const PAYMENT_COLLECTION_FILTERS: FilterSpec[] = [
  { key: "id", column: "p.id", op: "in" },
  { key: "status", column: "p.status", op: "eq", values: PAYMENT_STATUSES },
  { key: "currency_code", column: "p.currency_code", op: "eq", coerce: (v) => v.toLowerCase() },
  { key: "created_at", column: "p.created_at", op: "gte" },
  { key: "created_at", column: "p.created_at", op: "lte" },
]

export const PAYMENT_COLLECTION_Q_COLUMNS = ["p.id", "COALESCE(p.currency_code,'')"]

export const PAYMENT_COLLECTION_SORT: Record<string, string> = {
  created_at: "p.created_at",
  status: "p.status",
  amount: "p.amount",
}

// ---------- RMA: returns / claims / exchanges ----------

export const RETURN_FILTERS: FilterSpec[] = [
  { key: "id", column: "r.id", op: "in" },
  { key: "order_id", column: "r.order_id", op: "eq" },
  { key: "status", column: "r.status", op: "eq", values: RETURN_STATUSES },
  { key: "created_at", column: "r.created_at", op: "gte" },
  { key: "created_at", column: "r.created_at", op: "lte" },
]

export const RETURN_SORT: Record<string, string> = { created_at: "r.created_at", status: "r.status" }

export const CLAIM_FILTERS: FilterSpec[] = [
  { key: "id", column: "c.id", op: "in" },
  { key: "order_id", column: "c.order_id", op: "eq" },
  { key: "type", column: "c.type", op: "eq", values: ["refund", "replace"] },
  { key: "status", column: "c.status", op: "eq", values: CLAIM_STATUSES },
  { key: "created_at", column: "c.created_at", op: "gte" },
  { key: "created_at", column: "c.created_at", op: "lte" },
]

export const CLAIM_SORT: Record<string, string> = { created_at: "c.created_at", status: "c.status", type: "c.type" }

export const EXCHANGE_FILTERS: FilterSpec[] = [
  { key: "id", column: "e.id", op: "in" },
  { key: "order_id", column: "e.order_id", op: "eq" },
  { key: "status", column: "e.status", op: "eq", values: CLAIM_STATUSES },
  { key: "created_at", column: "e.created_at", op: "gte" },
  { key: "created_at", column: "e.created_at", op: "lte" },
]

export const EXCHANGE_SORT: Record<string, string> = { created_at: "e.created_at", status: "e.status" }

// ---------- catalog ----------

/** "product".status CHECK list. */
export const PRODUCT_STATUSES = ["draft", "proposed", "published", "rejected"]

/**
 * GET /admin/products (product p, LEFT JOIN product_collection c + product_type t).
 * `sales_channel_id` is NOT here: it resolves through the product_sales_channel
 * pivot, so the route appends an EXISTS itself.
 */
export const PRODUCT_FILTERS: FilterSpec[] = [
  { key: "id", column: "p.id", op: "in" },
  { key: "status", column: "p.status", op: "eq", values: PRODUCT_STATUSES },
  { key: "handle", column: "p.handle", op: "eq" },
  { key: "collection_id", column: "p.collection_id", op: "eq" },
  { key: "type_id", column: "p.type_id", op: "eq" },
  { key: "title", column: "p.title", op: "ilike" },
  { key: "created_at", column: "p.created_at", op: "gte" },
  { key: "created_at", column: "p.created_at", op: "lte" },
  { key: "updated_at", column: "p.updated_at", op: "gte" },
  { key: "updated_at", column: "p.updated_at", op: "lte" },
]

export const PRODUCT_Q_COLUMNS = ["p.title", "p.handle", "COALESCE(p.description, '')"]

export const PRODUCT_SORT: Record<string, string> = {
  created_at: "p.created_at",
  title: "p.title",
  handle: "p.handle",
  status: "p.status",
  updated_at: "p.updated_at",
  collection: "c.title",
  id: "p.id",
}

/** GET /admin/product-variants (product_variant v). */
export const PRODUCT_VARIANT_FILTERS: FilterSpec[] = [
  { key: "id", column: "v.id", op: "in" },
  { key: "product_id", column: "v.product_id", op: "in" },
  { key: "sku", column: "v.sku", op: "eq" },
  { key: "created_at", column: "v.created_at", op: "gte" },
  { key: "created_at", column: "v.created_at", op: "lte" },
]

export const PRODUCT_VARIANT_Q_COLUMNS = ["v.title", "COALESCE(v.sku, '')"]

export const PRODUCT_VARIANT_SORT: Record<string, string> = {
  created_at: "v.created_at",
  title: "v.title",
  sku: "v.sku",
}

/** GET /admin/product-options (product_option o). */
export const PRODUCT_OPTION_FILTERS: FilterSpec[] = [
  { key: "id", column: "o.id", op: "in" },
  { key: "product_id", column: "o.product_id", op: "eq" },
  { key: "title", column: "o.title", op: "eq" },
  { key: "is_exclusive", column: "o.is_exclusive", op: "bool" },
  { key: "created_at", column: "o.created_at", op: "gte" },
  { key: "created_at", column: "o.created_at", op: "lte" },
]

export const PRODUCT_OPTION_Q_COLUMNS = ["o.title"]

export const PRODUCT_OPTION_SORT: Record<string, string> = {
  created_at: "o.created_at",
  title: "o.title",
}

/** GET /admin/product-options/:optionId/values (product_option_value ov). */
export const PRODUCT_OPTION_VALUE_FILTERS: FilterSpec[] = [
  { key: "id", column: "ov.id", op: "in" },
  { key: "option_id", column: "ov.option_id", op: "eq" },
  { key: "value", column: "ov.value", op: "eq" },
  { key: "created_at", column: "ov.created_at", op: "gte" },
  { key: "created_at", column: "ov.created_at", op: "lte" },
]

export const PRODUCT_OPTION_VALUE_Q_COLUMNS = ["ov.value"]

export const PRODUCT_OPTION_VALUE_SORT: Record<string, string> = {
  created_at: "ov.created_at",
  value: "ov.value",
  rank: "ov.rank",
}

/** GET /admin/product-types (product_type t). */
export const PRODUCT_TYPE_FILTERS: FilterSpec[] = [
  { key: "id", column: "t.id", op: "in" },
  { key: "value", column: "t.value", op: "in" },
  { key: "created_at", column: "t.created_at", op: "gte" },
  { key: "created_at", column: "t.created_at", op: "lte" },
  { key: "updated_at", column: "t.updated_at", op: "gte" },
  { key: "updated_at", column: "t.updated_at", op: "lte" },
]

export const PRODUCT_TYPE_Q_COLUMNS = ["t.value"]

export const PRODUCT_TYPE_SORT: Record<string, string> = {
  created_at: "t.created_at",
  updated_at: "t.updated_at",
  value: "t.value",
}

/** GET /admin/product-tags (product_tag tg). */
export const PRODUCT_TAG_FILTERS: FilterSpec[] = [
  { key: "id", column: "tg.id", op: "in" },
  { key: "value", column: "tg.value", op: "in" },
  { key: "created_at", column: "tg.created_at", op: "gte" },
  { key: "created_at", column: "tg.created_at", op: "lte" },
  { key: "updated_at", column: "tg.updated_at", op: "gte" },
  { key: "updated_at", column: "tg.updated_at", op: "lte" },
]

export const PRODUCT_TAG_Q_COLUMNS = ["tg.value"]

export const PRODUCT_TAG_SORT: Record<string, string> = {
  created_at: "tg.created_at",
  updated_at: "tg.updated_at",
  value: "tg.value",
}

/** GET /admin/collections (product_collection col). */
export const COLLECTION_FILTERS: FilterSpec[] = [
  { key: "id", column: "col.id", op: "in" },
  { key: "title", column: "col.title", op: "eq" },
  { key: "handle", column: "col.handle", op: "eq" },
  { key: "created_at", column: "col.created_at", op: "gte" },
  { key: "created_at", column: "col.created_at", op: "lte" },
]

export const COLLECTION_Q_COLUMNS = ["col.title", "col.handle"]

export const COLLECTION_SORT: Record<string, string> = {
  created_at: "col.created_at",
  title: "col.title",
  handle: "col.handle",
}

/**
 * GET /admin/product-categories (product_category c). The taxonomy calls the
 * title column `name`, so the public `title` sort key maps onto `c.name`.
 * The admin Organize page depends on the `rank ASC, created_at DESC` default.
 */
export const PRODUCT_CATEGORY_FILTERS: FilterSpec[] = [
  { key: "id", column: "c.id", op: "in" },
  { key: "handle", column: "c.handle", op: "eq" },
  { key: "parent_id", column: "c.parent_category_id", op: "in" },
  { key: "created_at", column: "c.created_at", op: "gte" },
  { key: "created_at", column: "c.created_at", op: "lte" },
]

export const PRODUCT_CATEGORY_Q_COLUMNS = ["c.name", "c.handle", "COALESCE(c.description, '')"]

export const PRODUCT_CATEGORY_SORT: Record<string, string> = {
  rank: "c.rank",
  title: "c.name",
  name: "c.name",
  created_at: "c.created_at",
  handle: "c.handle",
}

// ---------- promotions / pricing ----------

/**
 * promotion.status / price_list.status whitelists. Lupus's PromotionStatus is
 * draft|active|inactive; this schema's CHECK constraint only admits
 * active|draft, so `inactive` is accepted (and simply matches nothing) instead
 * of being treated as an unknown value.
 */
export const PROMOTION_STATUSES = ["draft", "active", "inactive"]

/** promotion.application_type CHECK list - the dashboard calls it `type`. */
export const PROMOTION_TYPES = ["percentage", "fixed", "buyget"]

