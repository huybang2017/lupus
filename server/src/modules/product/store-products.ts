import type { Request } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { authService } from "../auth/auth.service"
import { pricingService } from "../pricing/pricing.service"
import { requestLocale, translateRows } from "../platform/translation-overlay"
import { productService } from "./product.service"

// Lupus Store API product reads (upstream/src/api/store/products): filters, ordering, paging with
// count, and the storefront price context (`region_id` -> variants[].calculated_price).
// Amounts are minor units, like the rest of the lupus API.

type Row = Record<string, any>

const many = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v]))

const querySchema = z.object({
  q: z.string().optional(),
  id: many.optional(),
  handle: many.optional(),
  collection_id: many.optional(),
  category_id: many.optional(),
  type_id: many.optional(),
  tag_id: many.optional(),
  option_value_id: many.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.string().optional(),
  region_id: z.string().optional(),
  currency_code: z.string().length(3).optional(),
})

const ORDER_COLUMNS: Record<string, string> = { created_at: "p.created_at", updated_at: "p.updated_at", title: "p.title", handle: "p.handle" }

/** `-created_at` / `title` / `created_at:desc` style ordering; unknown columns fall back to newest first. */
function orderBy(order: string | undefined): string {
  if (!order) {
    return "p.created_at DESC"
  }
  const desc = order.startsWith("-") || order.endsWith(":desc")
  const key = order.replace(/^-/, "").replace(/:(asc|desc)$/, "")
  const col = ORDER_COLUMNS[key]
  return col ? `${col} ${desc ? "DESC" : "ASC"}, p.id` : "p.created_at DESC"
}

/** The customer behind an optional `Authorization: Bearer` header, for customer-group pricing. */
export async function optionalCustomerId(req: Request): Promise<string | null> {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    return null
  }
  try {
    const { email } = authService.verifyToken(header.slice(7))
    const { rows } = await pool.query(`SELECT id FROM customer WHERE email=$1 AND deleted_at IS NULL LIMIT 1`, [String(email).toLowerCase().trim()])
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

async function contextCurrency(regionId?: string, currency?: string): Promise<string | null> {
  if (regionId) {
    const { rows } = await pool.query(`SELECT currency_code FROM region WHERE id=$1 AND deleted_at IS NULL`, [regionId])
    if (!rows[0]) {
      throw Object.assign(new Error("Region not found"), { statusCode: 404 })
    }
    return String(rows[0].currency_code).toLowerCase()
  }
  return currency ? currency.toLowerCase() : null
}

/** Lupus `calculated_price` object for one variant, or null when the variant has no price in the currency. */
async function calculatedPrice(variantId: string, currency: string, customerId: string | null): Promise<Row | null> {
  let calculated: number
  try {
    calculated = await pricingService.resolveUnitPrice(variantId, currency, 1, customerId)
  } catch {
    return null
  }
  const base = await pool.query(
    `SELECT MIN(p.amount)::bigint AS amount FROM price p JOIN product_variant v ON v.price_set_id = p.price_set_id
     WHERE v.id=$1 AND p.currency_code=$2 AND p.price_list_id IS NULL AND p.deleted_at IS NULL AND p.min_quantity IS NULL`,
    [variantId, currency]
  )
  const original = base.rows[0]?.amount != null ? Number(base.rows[0].amount) : calculated
  const onSale = calculated < original
  return {
    calculated_amount: calculated,
    original_amount: original,
    currency_code: currency,
    is_calculated_price_price_list: onSale,
    is_original_price_price_list: false,
    calculated_price: { price_list_type: onSale ? "sale" : null },
    original_price: { price_list_type: null },
  }
}

/** Collection, categories, tags, type and (with a price context) variant calculated prices. */
async function decorate(products: Row[], currency: string | null, customerId: string | null, locale: string | null): Promise<Row[]> {
  if (products.length === 0) {
    return products
  }
  const ids = products.map((p) => p.id)
  const collectionIds = [...new Set(products.map((p) => p.collection_id).filter(Boolean))]
  const typeIds = [...new Set(products.map((p) => p.type_id).filter(Boolean))]
  const [collections, categories, tags, types] = await Promise.all([
    collectionIds.length
      ? pool.query(`SELECT id, title, handle FROM product_collection WHERE id = ANY($1) AND deleted_at IS NULL`, [collectionIds])
      : Promise.resolve({ rows: [] as Row[] }),
    pool.query(
      `SELECT pcp.product_id, c.id, c.name, c.handle FROM product_category_product pcp JOIN product_category c ON c.id = pcp.category_id
       WHERE pcp.product_id = ANY($1) AND c.deleted_at IS NULL AND c.is_active = TRUE AND c.is_internal = FALSE ORDER BY c.rank, c.created_at`,
      [ids]
    ),
    pool.query(`SELECT pt.product_id, t.id, t.value FROM product_tags pt JOIN product_tag t ON t.id = pt.tag_id WHERE pt.product_id = ANY($1) AND t.deleted_at IS NULL`, [ids]),
    typeIds.length ? pool.query(`SELECT id, value FROM product_type WHERE id = ANY($1) AND deleted_at IS NULL`, [typeIds]) : Promise.resolve({ rows: [] as Row[] }),
  ])
  const collectionById = new Map<string, Row>(collections.rows.map((c: Row) => [c.id, c]))
  const typeById = new Map<string, Row>(types.rows.map((t: Row) => [t.id, t]))
  const group = (rows: Row[]) => {
    const out = new Map<string, Row[]>()
    for (const r of rows) {
      const { product_id, ...rest } = r
      out.set(product_id, [...(out.get(product_id) ?? []), rest])
    }
    return out
  }
  const categoriesBy = group(categories.rows)
  const tagsBy = group(tags.rows)

  const priced = new Map<string, Row | null>()
  if (currency) {
    const variantIds = products.flatMap((p) => (p.variants ?? []).map((v: Row) => v.id))
    await Promise.all(variantIds.map(async (id: string) => priced.set(id, await calculatedPrice(id, currency, customerId))))
  }

  const shaped = products.map((p) => ({
    ...p,
    collection: p.collection_id ? (collectionById.get(p.collection_id) ?? null) : null,
    type: p.type_id ? (typeById.get(p.type_id) ?? null) : null,
    categories: categoriesBy.get(p.id) ?? [],
    tags: tagsBy.get(p.id) ?? [],
    variants: (p.variants ?? []).map((v: Row) => (currency ? { ...v, calculated_price: priced.get(v.id) ?? undefined } : v)),
  }))
  if (!locale) {
    return shaped
  }
  // translated content for the request locale: product and variant text, collection and category names
  const translated = await translateRows(shaped, "product", ["title", "subtitle", "description", "material"], locale)
  const variants = await translateRows(translated.flatMap((p) => p.variants ?? []), "product_variant", ["title", "material"], locale)
  const variantById = new Map<string, Row>(variants.map((v) => [v.id, v]))
  const collections2 = await translateRows(translated.map((p) => p.collection).filter((c): c is Row => !!c), "product_collection", ["title"], locale)
  const categories2 = await translateRows(translated.flatMap((p) => p.categories ?? []), "product_category", ["name", "description"], locale)
  const collById = new Map<string, Row>(collections2.map((c) => [c.id, c]))
  const catById = new Map<string, Row>(categories2.map((c) => [c.id, c]))
  return translated.map((p) => ({
    ...p,
    variants: (p.variants ?? []).map((v: Row) => variantById.get(v.id) ?? v),
    collection: p.collection ? (collById.get(p.collection.id) ?? p.collection) : null,
    categories: (p.categories ?? []).map((c: Row) => catById.get(c.id) ?? c),
  }))
}

export async function listStoreProducts(req: Request, salesChannelIds?: string[]): Promise<{ products: Row[]; count: number; offset: number; limit: number }> {
  const q = querySchema.parse(req.query)
  const conds = ["p.deleted_at IS NULL", "p.status = 'published'"]
  const params: unknown[] = []
  const add = (sql: string, value: unknown) => {
    params.push(value)
    conds.push(sql.split("?").join(`$${params.length}`))
  }
  if (q.q) {
    add("(p.title ILIKE ? OR p.description ILIKE ?)", `%${q.q}%`)
  }
  if (q.id) {
    add("p.id = ANY(?)", q.id)
  }
  if (q.handle) {
    add("p.handle = ANY(?)", q.handle)
  }
  if (q.collection_id) {
    add("p.collection_id = ANY(?)", q.collection_id)
  }
  if (q.type_id) {
    add("p.type_id = ANY(?)", q.type_id)
  }
  if (q.category_id) {
    add("p.id IN (SELECT product_id FROM product_category_product WHERE category_id = ANY(?))", q.category_id)
  }
  if (q.tag_id) {
    add("p.id IN (SELECT product_id FROM product_tags WHERE tag_id = ANY(?))", q.tag_id)
  }
  if (q.option_value_id) {
    add(
      "p.id IN (SELECT v.product_id FROM product_variant v JOIN product_variant_option_value pvov ON pvov.variant_id = v.id WHERE v.deleted_at IS NULL AND pvov.option_value_id = ANY(?))",
      q.option_value_id
    )
  }
  if (salesChannelIds?.length) {
    add("p.id IN (SELECT product_id FROM product_sales_channel WHERE sales_channel_id = ANY(?))", salesChannelIds)
  }
  const where = conds.join(" AND ")
  const count = await pool.query(`SELECT COUNT(*)::int AS count FROM product p WHERE ${where}`, params)
  const { rows } = await pool.query(`SELECT p.* FROM product p WHERE ${where} ORDER BY ${orderBy(q.order)} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.limit, q.offset])
  const enriched = await productService.enrichForStore(rows)
  const currency = await contextCurrency(q.region_id, q.currency_code)
  const products = await decorate(enriched, currency, currency ? await optionalCustomerId(req) : null, requestLocale(req))
  return { products, count: count.rows[0].count, offset: q.offset, limit: q.limit }
}

export async function retrieveStoreProduct(req: Request, id: string, salesChannelIds?: string[]): Promise<Row | null> {
  const product = await productService.retrievePublic(id, salesChannelIds)
  if (!product) {
    return null
  }
  const q = z.object({ region_id: z.string().optional(), currency_code: z.string().length(3).optional() }).parse(req.query)
  const currency = await contextCurrency(q.region_id, q.currency_code)
  const [decorated] = await decorate([product], currency, currency ? await optionalCustomerId(req) : null, requestLocale(req))
  return decorated
}
