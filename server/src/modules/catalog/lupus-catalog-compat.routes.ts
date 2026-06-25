import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth, AuthedRequest } from "../../middleware/require-auth"
import {
  PRODUCT_FILTERS,
  PRODUCT_OPTION_FILTERS,
  PRODUCT_OPTION_VALUE_FILTERS,
  PRODUCT_OPTION_VALUE_Q_COLUMNS,
  PRODUCT_OPTION_VALUE_SORT,
  PRODUCT_OPTION_Q_COLUMNS,
  PRODUCT_OPTION_SORT,
  PRODUCT_Q_COLUMNS,
  PRODUCT_SORT,
  PRODUCT_VARIANT_FILTERS,
  PRODUCT_VARIANT_Q_COLUMNS,
  PRODUCT_VARIANT_SORT,
} from "../infra/list-filter-specs"
import { buildListQuery, queryList, runList, sendList } from "../infra/list-query"
import { productService } from "../product/product.service"
import { pricingService } from "../pricing/pricing.service"

// Lupus-compat catalog endpoints (dashboard parity: admin products list/retrieve,
// product options/tags/types/categories/collections admin, variants batch, imports).
// Handlers live here so catalog parity work never touches other domains.
//
// Reference mapping (js-sdk admin/* + lupus server routes):
// - sdk.admin.product.list/retrieve -> GET /admin/products, GET /admin/products/:id
//   -> { products, count, offset, limit } / { product } (enriched: variants with
//   prices+options, options with values, images, collection/type, categories, tags)
// - sdk.admin.product.updateVariant/retrieveVariant/deleteVariant (nested
//   /admin/products/:productId/variants/:id) -> update returns { product },
//   retrieve returns { variant }, delete returns { id, object: "variant",
//   deleted: true, parent }
// - sdk.admin.product.batchVariants -> POST .../variants/batch
//   -> { created, updated, deleted: { ids, object, deleted } }
// - sdk.admin.product.batchVariantInventoryItems -> POST .../variants/inventory-items/batch
//   -> { created, updated, deleted } link rows against variant_inventory_item
// - sdk.admin.product.linkOptions -> POST .../options/batch -> { product }
// - sdk.admin.product.batchImageVariants / batchVariantImages -> { added, removed }
//   (validated stubs: no variant<->image pivot table exists in this backend)
// - sdk.admin.product.export -> 202 { transaction_id }
// - sdk.admin.product.createImport -> 202 { transaction_id, summary: { toCreate, toUpdate } }
// - sdk.admin.product.confirmImport -> 202 { transaction_id, summary }
// - sdk.admin.productCollection.retrieve/update/updateProducts
//   -> { collection } (products managed via product.collection_id)
// - sdk.admin.productCategory.retrieve/updateProducts -> { product_category }
//   (products managed via product_category_product pivot)
// - sdk.admin.productOption.list/create/retrieve/update + listValues/retrieveValue/
//   updateValue/deleteValue -> { product_options, count, offset, limit } /
//   { product_option } / { product_option_values, ... } / { product_option_value } /
//   { id, object: "product_option_value", deleted: true }
// - sdk.admin.productTag.create/retrieve/update -> { product_tag }
// - sdk.admin.productType.retrieve/update -> { product_type }
// - sdk.admin.productVariant.list -> GET /admin/product-variants
//   -> { variants, count, offset, limit }
export const catalogCompatRouter = Router()

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 })
}

const PRODUCT_BASE_SELECT = `p.*,
  CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'title', c.title, 'handle', c.handle) END AS collection,
  CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object('id', t.id, 'value', t.value) END AS type`
const PRODUCT_BASE_FROM = `FROM product p
  LEFT JOIN product_collection c ON c.id = p.collection_id AND c.deleted_at IS NULL
  LEFT JOIN product_type t ON t.id = p.type_id AND t.deleted_at IS NULL`

async function enrichVariants(variantRows: any[]): Promise<any[]> {
  if (variantRows.length === 0) {
    return []
  }
  const ids = variantRows.map((v) => v.id)
  const [priceRes, optRes, invRes, imgRes] = await Promise.all([
    pool.query(
      `SELECT v.id AS variant_id, p.currency_code, p.amount
       FROM product_variant v
       JOIN price p ON p.price_set_id = v.price_set_id AND p.price_list_id IS NULL AND p.deleted_at IS NULL
       WHERE v.id = ANY($1)`,
      [ids]
    ),
    pool.query(
      `SELECT pvov.variant_id, o.title AS option_title, ov.value
       FROM product_variant_option_value pvov
       JOIN product_option_value ov ON ov.id = pvov.option_value_id
       JOIN product_option o ON o.id = ov.option_id
       WHERE pvov.variant_id = ANY($1)`,
      [ids]
    ),
    pool.query(`SELECT variant_id, inventory_item_id, required_quantity FROM variant_inventory_item WHERE variant_id = ANY($1)`, [ids]),
    pool.query(
      `SELECT pvi.variant_id, pi.id, pi.url, pi.rank
       FROM product_variant_image pvi
       JOIN product_image pi ON pi.id = pvi.image_id AND pi.deleted_at IS NULL
       WHERE pvi.variant_id = ANY($1) ORDER BY pi.rank`,
      [ids]
    ),
  ])
  const pricesBy: Record<string, any[]> = {}
  for (const r of priceRes.rows) {
    pricesBy[r.variant_id] = pricesBy[r.variant_id] ?? []
    pricesBy[r.variant_id].push({ currency_code: r.currency_code, amount: Number(r.amount) })
  }
  const optionsBy: Record<string, Record<string, string>> = {}
  for (const r of optRes.rows) {
    optionsBy[r.variant_id] = optionsBy[r.variant_id] ?? {}
    optionsBy[r.variant_id][r.option_title] = r.value
  }
  const invBy: Record<string, any[]> = {}
  for (const r of invRes.rows) {
    invBy[r.variant_id] = invBy[r.variant_id] ?? []
    invBy[r.variant_id].push({ inventory_item_id: r.inventory_item_id, required_quantity: r.required_quantity })
  }
  const imgBy: Record<string, any[]> = {}
  for (const r of imgRes.rows) {
    imgBy[r.variant_id] = imgBy[r.variant_id] ?? []
    imgBy[r.variant_id].push({ id: r.id, url: r.url, rank: r.rank })
  }
  return variantRows.map((v) => ({
    ...v,
    prices: pricesBy[v.id] ?? [],
    options: optionsBy[v.id] ?? {},
    inventory_items: invBy[v.id] ?? [],
    images: imgBy[v.id] ?? [],
  }))
}

async function enrichProducts(base: any[]): Promise<any[]> {
  if (base.length === 0) {
    return []
  }
  const ids = base.map((p) => p.id)
  const [variantRes, optionRes, imageRes, catRes, tagRes, scRes] = await Promise.all([
    pool.query(
      `SELECT v.* FROM product_variant v WHERE v.product_id = ANY($1) AND v.deleted_at IS NULL ORDER BY v.created_at`,
      [ids]
    ),
    pool.query(
      `SELECT o.*, COALESCE((SELECT json_agg(json_build_object('id', ov.id, 'value', ov.value) ORDER BY ov.rank, ov.created_at) FROM product_option_value ov WHERE ov.option_id = o.id AND ov.deleted_at IS NULL), '[]') AS values
       FROM product_option o WHERE o.product_id = ANY($1) AND o.deleted_at IS NULL ORDER BY o.created_at`,
      [ids]
    ),
    pool.query(`SELECT * FROM product_image WHERE product_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at`, [ids]),
    pool.query(
      `SELECT pcp.product_id, c.* FROM product_category_product pcp
       JOIN product_category c ON c.id = pcp.category_id AND c.deleted_at IS NULL
       WHERE pcp.product_id = ANY($1)`,
      [ids]
    ),
    pool.query(
      `SELECT pt.product_id, t.* FROM product_tags pt
       JOIN product_tag t ON t.id = pt.tag_id AND t.deleted_at IS NULL
       WHERE pt.product_id = ANY($1)`,
      [ids]
    ),
    pool.query(
      `SELECT psc.product_id, sc.id, sc.name FROM product_sales_channel psc
       JOIN sales_channel sc ON sc.id = psc.sales_channel_id AND sc.deleted_at IS NULL
       WHERE psc.product_id = ANY($1) ORDER BY sc.name`,
      [ids]
    ),
  ])
  const variants = await enrichVariants(variantRes.rows)
  const stripProductId = (row: any) => {
    const { product_id: _drop, ...rest } = row
    return rest
  }
  return base.map((p) => ({
    ...p,
    variants: variants.filter((v) => v.product_id === p.id),
    options: optionRes.rows.filter((o: any) => o.product_id === p.id),
    images: imageRes.rows.filter((i: any) => i.product_id === p.id),
    categories: catRes.rows.filter((c: any) => c.product_id === p.id).map(stripProductId),
    tags: tagRes.rows.filter((t: any) => t.product_id === p.id).map(stripProductId),
    sales_channels: scRes.rows.filter((c: any) => c.product_id === p.id).map(stripProductId),
  }))
}

async function categoryProducts(categoryId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT ${PRODUCT_BASE_SELECT} ${PRODUCT_BASE_FROM}
     JOIN product_category_product pcp ON pcp.product_id = p.id AND pcp.category_id = $1
     WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`,
    [categoryId]
  )
  return enrichProducts(rows)
}

async function getEnrichedProduct(id: string): Promise<any | null> {
  const { rows } = await pool.query(`SELECT ${PRODUCT_BASE_SELECT} ${PRODUCT_BASE_FROM} WHERE p.id = $1 AND p.deleted_at IS NULL`, [id])
  if (!rows[0]) {
    return null
  }
  const enriched = await enrichProducts(rows)
  return enriched[0]
}

async function getOptionWithValues(optionId: string): Promise<any | null> {
  const o = await pool.query(`SELECT * FROM product_option WHERE id = $1 AND deleted_at IS NULL`, [optionId])
  if (!o.rows[0]) {
    return null
  }
  const v = await pool.query(`SELECT * FROM product_option_value WHERE option_id = $1 AND deleted_at IS NULL ORDER BY rank, created_at`, [optionId])
  return { ...o.rows[0], values: v.rows }
}

async function assignVariantOptions(
  queryable: { query: (text: string, params?: any[]) => Promise<any> },
  productId: string,
  variantId: string,
  options: Record<string, string>
): Promise<void> {
  for (const [title, value] of Object.entries(options)) {
    const o = await queryable.query(`SELECT id FROM product_option WHERE product_id = $1 AND title = $2 AND deleted_at IS NULL`, [productId, title])
    let optionId = o.rows[0]?.id as string | undefined
    if (!optionId) {
      const created = await queryable.query(`INSERT INTO product_option (product_id, title) VALUES ($1,$2) RETURNING id`, [productId, title])
      optionId = created.rows[0].id
