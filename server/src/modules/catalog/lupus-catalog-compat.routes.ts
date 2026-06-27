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
    }
    const ov = await queryable.query(`SELECT id FROM product_option_value WHERE option_id = $1 AND value = $2 AND deleted_at IS NULL`, [optionId, value])
    let valueId = ov.rows[0]?.id as string | undefined
    if (!valueId) {
      const created = await queryable.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2) RETURNING id`, [optionId, value])
      valueId = created.rows[0].id
    }
    await queryable.query(`INSERT INTO product_variant_option_value (variant_id, option_value_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [variantId, valueId])
  }
}

async function applyVariantPrices(variantId: string, prices: { currency_code: string; amount: number }[]): Promise<void> {
  const psId = await pricingService.ensureVariantPriceSet(variantId)
  await pool.query(`UPDATE price SET deleted_at = NOW() WHERE price_set_id = $1 AND price_list_id IS NULL AND deleted_at IS NULL`, [psId])
  for (const p of prices) {
    await pool.query(
      `INSERT INTO price (price_set_id, currency_code, amount, price_list_id) VALUES ($1,$2,$3,NULL)
       ON CONFLICT (price_set_id, currency_code) WHERE price_list_id IS NULL AND deleted_at IS NULL
       DO UPDATE SET amount = $3, deleted_at = NULL`,
      [psId, p.currency_code.toLowerCase(), p.amount]
    )
  }
}

async function getVariantInProduct(productId: string, variantId: string): Promise<any | null> {
  const { rows } = await pool.query(`SELECT * FROM product_variant WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL`, [variantId, productId])
  if (!rows[0]) {
    return null
  }
  const enriched = await enrichVariants(rows)
  return enriched[0]
}

// ---- GET /admin/products (admin.product.list) ----
catalogCompatRouter.get("/admin/products", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const lq = buildListQuery({
      base: "p.deleted_at IS NULL",
      query: req.query,
      specs: PRODUCT_FILTERS,
      q: { columns: PRODUCT_Q_COLUMNS },
      order: PRODUCT_SORT,
      defaultOrder: "p.created_at DESC",
    })
    // sales_channel_id is not a product column: resolve it through the
    // product_sales_channel pivot with a bound param.
    const channels = queryList(req.query.sales_channel_id)
    const extra =
      channels.length > 0
        ? {
            sql: `EXISTS (SELECT 1 FROM product_sales_channel psc WHERE psc.product_id = p.id AND psc.sales_channel_id = ANY($${lq.params.length + 1}))`,
            params: [channels],
          }
        : null
    // price_list_id: products that have at least one override in those price lists
    const lists = queryList(req.query.price_list_id)
    const extras = [extra].filter((x): x is { sql: string; params: any[] } => !!x)
    if (lists.length > 0) {
      const at = lq.params.length + extras.reduce((n, x) => n + x.params.length, 0) + 1
      extras.push({
        sql: `EXISTS (SELECT 1 FROM price pr JOIN product_variant pv ON pv.price_set_id = pr.price_set_id AND pv.deleted_at IS NULL WHERE pv.product_id = p.id AND pr.deleted_at IS NULL AND pr.price_list_id = ANY($${at}))`,
        params: [lists],
      })
    }
    // tag_id: products carrying at least one of those tags (the Product Tags detail page filters on it)
    const tagIds = queryList(req.query.tag_id)
    if (tagIds.length > 0) {
      const at = lq.params.length + extras.reduce((n, x) => n + x.params.length, 0) + 1
      extras.push({
        sql: `EXISTS (SELECT 1 FROM product_tags ptg WHERE ptg.product_id = p.id AND ptg.tag_id = ANY($${at}))`,
        params: [tagIds],
      })
    }
    // category_id: products filed under at least one of those categories
    const categoryIds = queryList(req.query.category_id)
    if (categoryIds.length > 0) {
      const at = lq.params.length + extras.reduce((n, x) => n + x.params.length, 0) + 1
      extras.push({
        sql: `EXISTS (SELECT 1 FROM product_category_product pcp WHERE pcp.product_id = p.id AND pcp.category_id = ANY($${at}))`,
        params: [categoryIds],
      })
    }
    const params = [...lq.params, ...extras.flatMap((x) => x.params)]
    const conditions = [lq.where.replace(/^WHERE\s+/i, ""), ...extras.map((x) => x.sql)].filter((c) => c.length > 0)
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const countRes = await pool.query(`SELECT COUNT(*)::int AS count ${PRODUCT_BASE_FROM} ${where}`, params)
    const dataRes = await pool.query(
      `SELECT ${PRODUCT_BASE_SELECT} ${PRODUCT_BASE_FROM} ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lq.limit, lq.offset]
    )
    sendList(res, {
      products: await enrichProducts(dataRes.rows),
      count: Number(countRes.rows[0].count),
      offset: lq.offset,
      limit: lq.limit,
    })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/products/:id (admin.product.retrieve) ----
catalogCompatRouter.get("/admin/products/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    z.object({ fields: z.string().optional(), expand: z.string().optional() }).parse(req.query)
    const product = await getEnrichedProduct(req.params.id)
    if (!product) {
      throw notFound("Product not found")
    }
    res.json({ product })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/products/:productId/variants/:id (admin.product.retrieveVariant) ----
catalogCompatRouter.get("/admin/products/:productId/variants/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const variant = await getVariantInProduct(req.params.productId, req.params.id)
    if (!variant) {
      throw notFound("Variant not found")
    }
    res.json({ variant })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:productId/variants/:id (admin.product.updateVariant -> { product }) ----
const compatVariantUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    sku: z.string().nullable().optional(),
    barcode: z.string().nullable().optional(),
    ean: z.string().nullable().optional(),
    upc: z.string().nullable().optional(),
    inventory_quantity: z.number().int().nonnegative().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    prices: z.array(z.object({ currency_code: z.string(), amount: z.number().int().nonnegative() })).optional(),
    options: z.record(z.string()).optional(),
  })
  .passthrough()

catalogCompatRouter.post("/admin/products/:productId/variants/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    // "batch" is a sibling route registered below, not a variant id.
    if (req.params.id === "batch") {
      next("route")
      return
    }
    const body = compatVariantUpdateSchema.parse(req.body)
    const existing = await getVariantInProduct(req.params.productId, req.params.id)
    if (!existing) {
      throw notFound("Variant not found")
    }
    const patch: Record<string, unknown> = {}
    for (const k of ["title", "sku", "barcode", "ean", "upc", "inventory_quantity", "metadata", "manage_inventory", "allow_backorder", "material", "origin_country", "hs_code", "mid_code", "weight", "length", "height", "width"]) {
      const v = (body as Record<string, unknown>)[k]
      if (v !== undefined) {
        patch[k] = v
      }
    }
    if (Object.keys(patch).length > 0) {
      await productService.updateVariant(req.params.id, patch as { title: string; sku: string | null })
    }
    if (body.prices !== undefined) {
      await applyVariantPrices(req.params.id, body.prices)
    }
    if (body.options !== undefined) {
      await assignVariantOptions(pool, req.params.productId, req.params.id, body.options)
    }
    const product = await getEnrichedProduct(req.params.productId)
    res.json({ product })
  } catch (e) {
    next(e)
  }
})

// ---- DELETE /admin/products/:productId/variants/:id (admin.product.deleteVariant) ----
catalogCompatRouter.delete("/admin/products/:productId/variants/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const variant = await getVariantInProduct(req.params.productId, req.params.id)
    if (!variant) {
      throw notFound("Variant not found")
    }
    await productService.deleteVariant(req.params.id)
    const parent = await getEnrichedProduct(req.params.productId)
    res.json({ id: req.params.id, object: "variant", deleted: true, parent })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:productId/variants/batch (admin.product.batchVariants) ----
const compatBatchVariantCreateSchema = z
  .object({
    title: z.string().min(1),
    sku: z.string().nullish(),
    barcode: z.string().nullish(),
    ean: z.string().nullish(),
    upc: z.string().nullish(),
    inventory_quantity: z.number().int().nonnegative().optional(),
    metadata: z.record(z.any()).nullish(),
    prices: z.array(z.object({ currency_code: z.string(), amount: z.number().int().nonnegative() })).optional(),
    options: z.record(z.string()).optional(),
  })
  .passthrough()

catalogCompatRouter.post("/admin/products/:productId/variants/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({
        create: z.array(compatBatchVariantCreateSchema).optional(),
        update: z.array(compatVariantUpdateSchema.extend({ id: z.string() })).optional(),
        delete: z.array(z.string()).optional(),
      })
      .parse(req.body)
    const product = await pool.query(`SELECT id FROM product WHERE id = $1 AND deleted_at IS NULL`, [req.params.productId])
    if (!product.rows[0]) {
      throw notFound("Product not found")
    }
    const created: any[] = []
    for (const c of body.create ?? []) {
      const row = await productService.createVariant(req.params.productId, {
        title: c.title,
        sku: c.sku ?? undefined,
        prices: c.prices ?? [],
        options: c.options ?? {},
      })
      if (c.prices === undefined && c.options === undefined) {
        created.push((await enrichVariants([row]))[0])
      } else {
        const full = await getVariantInProduct(req.params.productId, row.id)
        created.push(full)
      }
      if (c.barcode !== undefined || c.ean !== undefined || c.upc !== undefined || c.inventory_quantity !== undefined || c.metadata !== undefined) {
        const extra: Record<string, unknown> = {}
        if (c.barcode !== undefined) extra.barcode = c.barcode
        if (c.ean !== undefined) extra.ean = c.ean
        if (c.upc !== undefined) extra.upc = c.upc
        if (c.inventory_quantity !== undefined) extra.inventory_quantity = c.inventory_quantity
        if (c.metadata !== undefined) extra.metadata = c.metadata
        await pool.query(
          `UPDATE product_variant SET barcode = COALESCE($2, barcode), ean = COALESCE($3, ean), upc = COALESCE($4, upc),
           inventory_quantity = COALESCE($5, inventory_quantity), metadata = COALESCE($6, metadata), updated_at = NOW() WHERE id = $1`,
          [row.id, extra.barcode ?? null, extra.ean ?? null, extra.upc ?? null, extra.inventory_quantity ?? null, extra.metadata ? JSON.stringify(extra.metadata) : null]
        )
        created[created.length - 1] = await getVariantInProduct(req.params.productId, row.id)
      }
    }
    const updated: any[] = []
    for (const u of body.update ?? []) {
      const existing = await getVariantInProduct(req.params.productId, u.id)
      if (!existing) {
        throw notFound(`Variant not found: ${u.id}`)
      }
      const patch: Record<string, unknown> = {}
      for (const k of ["title", "sku", "barcode", "ean", "upc", "inventory_quantity", "metadata", "manage_inventory", "allow_backorder", "material", "origin_country", "hs_code", "mid_code", "weight", "length", "height", "width"]) {
        const v = (u as Record<string, unknown>)[k]
        if (v !== undefined) {
          patch[k] = v
        }
      }
      if (Object.keys(patch).length > 0) {
        const sets: string[] = []
        const params: any[] = []
        for (const [k, v] of Object.entries(patch)) {
          params.push(v)
          sets.push(`${k} = $${params.length}`)
        }
        params.push(u.id)
        await pool.query(`UPDATE product_variant SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params)
      }
      if (u.prices !== undefined) {
        await applyVariantPrices(u.id, u.prices)
      }
      if (u.options !== undefined) {
        await assignVariantOptions(pool, req.params.productId, u.id, u.options)
      }
      updated.push(await getVariantInProduct(req.params.productId, u.id))
    }
    const deletedIds: string[] = []
    for (const id of body.delete ?? []) {
      const existing = await getVariantInProduct(req.params.productId, id)
      if (!existing) {
        throw notFound(`Variant not found: ${id}`)
      }
      await productService.deleteVariant(id)
      deletedIds.push(id)
    }
    res.json({ created, updated, deleted: { ids: deletedIds, object: "variant", deleted: true } })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:productId/variants/inventory-items/batch ----
const compatInvLinkSchema = z.object({ variant_id: z.string(), inventory_item_id: z.string(), required_quantity: z.number().int().nonnegative() })

catalogCompatRouter.post("/admin/products/:productId/variants/inventory-items/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({
        create: z.array(compatInvLinkSchema).optional(),
        update: z.array(compatInvLinkSchema).optional(),
        delete: z.array(z.object({ variant_id: z.string(), inventory_item_id: z.string() })).optional(),
      })
      .parse(req.body)
    const ensureLinkable = async (variantId: string, itemId: string) => {
      const v = await pool.query(`SELECT id FROM product_variant WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL`, [variantId, req.params.productId])
      if (!v.rows[0]) {
        throw notFound(`Variant not found in product: ${variantId}`)
      }
      const item = await pool.query(`SELECT id FROM inventory_item WHERE id = $1 AND deleted_at IS NULL`, [itemId])
      if (!item.rows[0]) {
        throw notFound(`Inventory item not found: ${itemId}`)
      }
    }
    const created: any[] = []
    for (const c of body.create ?? []) {
      await ensureLinkable(c.variant_id, c.inventory_item_id)
      const { rows } = await pool.query(
        `INSERT INTO variant_inventory_item (variant_id, inventory_item_id, required_quantity) VALUES ($1,$2,$3)
         ON CONFLICT (variant_id, inventory_item_id) DO UPDATE SET required_quantity = $3 RETURNING variant_id, inventory_item_id, required_quantity`,
        [c.variant_id, c.inventory_item_id, c.required_quantity]
      )
      created.push(rows[0])
    }
    const updated: any[] = []
    for (const u of body.update ?? []) {
      await ensureLinkable(u.variant_id, u.inventory_item_id)
      const { rows } = await pool.query(
        `UPDATE variant_inventory_item SET required_quantity = $3 WHERE variant_id = $1 AND inventory_item_id = $2 RETURNING variant_id, inventory_item_id, required_quantity`,
        [u.variant_id, u.inventory_item_id, u.required_quantity]
      )
      if (!rows[0]) {
        throw notFound(`Variant inventory link not found: ${u.variant_id} / ${u.inventory_item_id}`)
      }
      updated.push(rows[0])
    }
    const deleted: any[] = []
    for (const d of body.delete ?? []) {
      await ensureLinkable(d.variant_id, d.inventory_item_id)
      const { rows } = await pool.query(
        `DELETE FROM variant_inventory_item WHERE variant_id = $1 AND inventory_item_id = $2 RETURNING variant_id, inventory_item_id, required_quantity`,
        [d.variant_id, d.inventory_item_id]
      )
      if (rows[0]) {
        deleted.push(rows[0])
      }
    }
    res.json({ created, updated, deleted })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:productId/options/batch (admin.product.linkOptions -> { product }) ----
const compatLinkOptionAddSchema = z.union([
  z.string(),
  z.object({ id: z.string(), value_ids: z.array(z.string()).optional() }).passthrough(),
  z.object({ title: z.string().min(1), values: z.array(z.string()).optional() }).passthrough(),
])

catalogCompatRouter.post("/admin/products/:productId/options/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({
        add: z.array(compatLinkOptionAddSchema).optional(),
        remove: z.array(z.string()).optional(),
        update: z
          .array(
            z.object({
              product_option_id: z.string(),
              add: z.array(z.union([z.string(), z.object({ value: z.string() }).passthrough()])).optional(),
              remove: z.array(z.string()).optional(),
            })
          )
          .optional(),
      })
      .parse(req.body)
    const product = await pool.query(`SELECT id FROM product WHERE id = $1 AND deleted_at IS NULL`, [req.params.productId])
    if (!product.rows[0]) {
      throw notFound("Product not found")
    }
    for (const entry of body.add ?? []) {
      if (typeof entry === "string") {
        const o = await pool.query(`SELECT id FROM product_option WHERE id = $1 AND deleted_at IS NULL`, [entry])
        if (!o.rows[0]) {
          throw notFound(`Product option not found: ${entry}`)
        }
        await pool.query(`UPDATE product_option SET product_id = $2, deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [entry, req.params.productId])
      } else if ("id" in entry) {
        const o = await pool.query(`SELECT id FROM product_option WHERE id = $1 AND deleted_at IS NULL`, [(entry as { id: string }).id])
        if (!o.rows[0]) {
          throw notFound(`Product option not found: ${(entry as { id: string }).id}`)
        }
        await pool.query(`UPDATE product_option SET product_id = $2, deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [(entry as { id: string }).id, req.params.productId])
      } else {
        const created = await productService.createOption(req.params.productId, (entry as { title: string }).title, (entry as { values?: string[] }).values ?? [])
        void created
      }
    }
    for (const id of body.remove ?? []) {
      const o = await pool.query(`SELECT id FROM product_option WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL`, [id, req.params.productId])
      if (!o.rows[0]) {
        throw notFound(`Product option not found in product: ${id}`)
      }
      await productService.deleteOption(id)
    }
    for (const u of body.update ?? []) {
      const o = await pool.query(`SELECT id FROM product_option WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL`, [u.product_option_id, req.params.productId])
      if (!o.rows[0]) {
        throw notFound(`Product option not found in product: ${u.product_option_id}`)
      }
      for (const v of u.add ?? []) {
        const value = typeof v === "string" ? v : v.value
        await pool.query(
          `INSERT INTO product_option_value (option_id, value) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [u.product_option_id, value]
        )
        const dup = await pool.query(
          `SELECT id FROM product_option_value WHERE option_id = $1 AND value = $2 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
          [u.product_option_id, value]
        )
        if (dup.rows[1]) {
          for (const extra of dup.rows.slice(1)) {
            await pool.query(`UPDATE product_option_value SET deleted_at = NOW() WHERE id = $1`, [extra.id])
          }
        }
      }
      for (const valueId of u.remove ?? []) {
        const ov = await pool.query(`SELECT id FROM product_option_value WHERE id = $1 AND option_id = $2 AND deleted_at IS NULL`, [valueId, u.product_option_id])
        if (!ov.rows[0]) {
          throw notFound(`Product option value not found: ${valueId}`)
        }
        await pool.query(`DELETE FROM product_option_value WHERE id = $1`, [valueId])
      }
    }
    const enriched = await getEnrichedProduct(req.params.productId)
    res.json({ product: enriched })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:productId/images/:imageId/variants/batch ----
// Persists into product_variant_image (added in schema-p16-product-parity.sql) —
// previously a validated stub that discarded the write.
catalogCompatRouter.post("/admin/products/:productId/images/:imageId/variants/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).parse(req.body)
    const img = await pool.query(`SELECT id FROM product_image WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL`, [req.params.imageId, req.params.productId])
    if (!img.rows[0]) {
      throw notFound("Product image not found")
    }
    const validVariantIds = async (ids: string[]): Promise<string[]> => {
      if (ids.length === 0) {
        return []
      }
      const { rows } = await pool.query(`SELECT id FROM product_variant WHERE id = ANY($1) AND product_id = $2 AND deleted_at IS NULL`, [ids, req.params.productId])
      return rows.map((r: any) => r.id)
    }
    const added = await validVariantIds(body.add ?? [])
    for (const variantId of added) {
      await pool.query(`INSERT INTO product_variant_image (variant_id, image_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [variantId, req.params.imageId])
    }
    const removed = await validVariantIds(body.remove ?? [])
    for (const variantId of removed) {
      await pool.query(`DELETE FROM product_variant_image WHERE variant_id = $1 AND image_id = $2`, [variantId, req.params.imageId])
    }
    res.json({ added, removed })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:productId/variants/:variantId/images/batch ----
catalogCompatRouter.post("/admin/products/:productId/variants/:variantId/images/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).parse(req.body)
    const variant = await getVariantInProduct(req.params.productId, req.params.variantId)
    if (!variant) {
      throw notFound("Variant not found")
    }
    const validImageIds = async (ids: string[]): Promise<string[]> => {
      if (ids.length === 0) {
        return []
      }
      const { rows } = await pool.query(`SELECT id FROM product_image WHERE id = ANY($1) AND product_id = $2 AND deleted_at IS NULL`, [ids, req.params.productId])
      return rows.map((r: any) => r.id)
    }
    const added = await validImageIds(body.add ?? [])
    for (const imageId of added) {
      await pool.query(`INSERT INTO product_variant_image (variant_id, image_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.variantId, imageId])
    }
    const removed = await validImageIds(body.remove ?? [])
    for (const imageId of removed) {
      await pool.query(`DELETE FROM product_variant_image WHERE variant_id = $1 AND image_id = $2`, [req.params.variantId, imageId])
    }
    res.json({ added, removed })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/export (admin.product.export -> 202 { transaction_id }) ----
catalogCompatRouter.post("/admin/products/export", requireAuth, async (_req: AuthedRequest, res, next) => {
  try {
    const transactionId = `txn_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(16)}`
    res.status(202).json({ transaction_id: transactionId })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/imports (admin.product.createImport) ----
function newImportTransaction() {
  return {
    transactionId: `txn_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(16)}`,
    summary: { toCreate: 0, toUpdate: 0 },
  }
}

catalogCompatRouter.post("/admin/products/imports", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    z
      .object({
        file_key: z.string().optional(),
        originalname: z.string().optional(),
        extension: z.string().optional(),
        size: z.number().optional(),
        mime_type: z.string().optional(),
      })
      .passthrough()
      .parse(req.body ?? {})
    const { transactionId, summary } = newImportTransaction()
    res.status(202).json({ transaction_id: transactionId, summary })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/imports/:transactionId/confirm ----
catalogCompatRouter.post("/admin/products/imports/:transactionId/confirm", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    z.object({}).passthrough().parse(req.body ?? {})
    const { summary } = newImportTransaction()
    res.status(202).json({ transaction_id: req.params.transactionId, summary })
  } catch (e) {
    next(e)
  }
})

// ---- Singular import aliases (js-sdk uses /admin/products/import and
// /admin/products/import/:transactionId/confirm in some flows). Thin aliases
// delegating to the same import-transaction helper above — no duplicated logic.
catalogCompatRouter.post("/admin/products/import", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    z
      .object({
        file_key: z.string().optional(),
        originalname: z.string().optional(),
        extension: z.string().optional(),
        size: z.number().optional(),
        mime_type: z.string().optional(),
      })
      .passthrough()
      .parse(req.body ?? {})
    const { transactionId, summary } = newImportTransaction()
    res.status(202).json({ transaction_id: transactionId, summary })
  } catch (e) {
    next(e)
  }
})

catalogCompatRouter.post("/admin/products/import/:transactionId/confirm", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    z.object({}).passthrough().parse(req.body ?? {})
    const { summary } = newImportTransaction()
    res.status(202).json({ transaction_id: req.params.transactionId, summary })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/collections/:id (admin.productCollection.retrieve) ----
catalogCompatRouter.get("/admin/collections/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_collection WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Collection not found")
    }
    const products = await pool.query(`SELECT id, title, handle, status FROM product WHERE collection_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [req.params.id])
    res.json({ collection: { ...rows[0], products: products.rows } })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/collections/:id (admin.productCollection.update) ----
catalogCompatRouter.post("/admin/collections/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const patch = z.object({ title: z.string().min(1).optional(), handle: z.string().optional(), metadata: z.record(z.string(), z.unknown()).nullish() }).passthrough().parse(req.body)
    const sets: string[] = []
    const params: any[] = []
    if (patch.metadata !== undefined) {
      params.push(patch.metadata ? JSON.stringify(patch.metadata) : null)
      sets.push(`metadata = $${params.length}`)
    }
    if (patch.title !== undefined) {
      params.push(patch.title)
      sets.push(`title = $${params.length}`)
    }
    if (patch.handle !== undefined) {
      params.push(patch.handle.trim().toLowerCase())
      sets.push(`handle = $${params.length}`)
    }
    if (sets.length > 0) {
      params.push(req.params.id)
      let rows: any[]
      try {
        rows = (
          await pool.query(
            `UPDATE product_collection SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
            params
          )
        ).rows
      } catch (err: any) {
        if (err?.code === "23505") throw Object.assign(new Error(`Collection with handle: ${patch.handle}, already exists.`), { statusCode: 409 })
        throw err
      }
      if (!rows[0]) {
        throw notFound("Collection not found")
      }
      const products = await pool.query(`SELECT id, title, handle, status FROM product WHERE collection_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [req.params.id])
      res.json({ collection: { ...rows[0], products: products.rows } })
      return
    }
    const { rows } = await pool.query(`SELECT * FROM product_collection WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Collection not found")
    }
    const products = await pool.query(`SELECT id, title, handle, status FROM product WHERE collection_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [req.params.id])
    res.json({ collection: { ...rows[0], products: products.rows } })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/collections/:id/products (admin.productCollection.updateProducts) ----
catalogCompatRouter.post("/admin/collections/:id/products", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).parse(req.body)
    const { rows } = await pool.query(`SELECT * FROM product_collection WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Collection not found")
    }
    for (const pid of body.add ?? []) {
      const p = await pool.query(`SELECT id FROM product WHERE id = $1 AND deleted_at IS NULL`, [pid])
      if (!p.rows[0]) {
        throw notFound(`Product not found: ${pid}`)
      }
      await pool.query(`UPDATE product SET collection_id = $2, updated_at = NOW() WHERE id = $1`, [pid, req.params.id])
    }
    for (const pid of body.remove ?? []) {
      await pool.query(`UPDATE product SET collection_id = NULL, updated_at = NOW() WHERE id = $1 AND collection_id = $2`, [pid, req.params.id])
    }
    const products = await pool.query(`SELECT id, title, handle, status FROM product WHERE collection_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [req.params.id])
    res.json({ collection: { ...rows[0], products: products.rows } })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/product-categories/:id (admin.productCategory.retrieve) ----
catalogCompatRouter.get("/admin/product-categories/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM product_category WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product category not found")
    }
    res.json({ product_category: { ...rows[0], products: await categoryProducts(req.params.id) } })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/product-categories/:id/products (admin.productCategory.updateProducts) ----
catalogCompatRouter.post("/admin/product-categories/:id/products", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).parse(req.body)
    const { rows } = await pool.query(`SELECT * FROM product_category WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product category not found")
    }
    for (const pid of body.add ?? []) {
      const p = await pool.query(`SELECT id FROM product WHERE id = $1 AND deleted_at IS NULL`, [pid])
      if (!p.rows[0]) {
        throw notFound(`Product not found: ${pid}`)
      }
      await pool.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pid, req.params.id])
    }
    for (const pid of body.remove ?? []) {
      await pool.query(`DELETE FROM product_category_product WHERE product_id = $1 AND category_id = $2`, [pid, req.params.id])
    }
    res.json({ product_category: { ...rows[0], products: await categoryProducts(req.params.id) } })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/product-options (admin.productOption.list) ----
const PRODUCT_OPTION_SELECT = `o.*, COALESCE((SELECT json_agg(json_build_object('id', ov.id, 'value', ov.value) ORDER BY ov.rank, ov.created_at) FROM product_option_value ov WHERE ov.option_id = o.id AND ov.deleted_at IS NULL), '[]') AS values`

catalogCompatRouter.get("/admin/product-options", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "product_option",
      alias: "o",
      select: PRODUCT_OPTION_SELECT,
      base: "o.deleted_at IS NULL",
      specs: PRODUCT_OPTION_FILTERS,
      q: { columns: PRODUCT_OPTION_Q_COLUMNS },
      order: PRODUCT_OPTION_SORT,
      defaultOrder: "o.created_at DESC",
      key: "product_options",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/product-options (admin.productOption.create -> 201 { product_option }) ----
catalogCompatRouter.post("/admin/product-options", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().min(1),
        values: z.array(z.string()).optional().default([]),
        product_id: z.string().optional(),
      })
      .passthrough()
      .parse(req.body)
    // No product_id -> a global option (is_exclusive = false), as in Lupus's Options page.
    const option = body.product_id
      ? await productService.createOption(body.product_id, body.title, body.values)
      : await productService.createGlobalOption(body.title, body.values)
    res.status(201).json({ product_option: await getOptionWithValues(option.id) })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/product-options/:id (admin.productOption.retrieve) ----
catalogCompatRouter.get("/admin/product-options/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const option = await getOptionWithValues(req.params.id)
    if (!option) {
      throw notFound("Product option not found")
    }
    res.json({ product_option: option })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/product-options/:id (admin.productOption.update) ----
catalogCompatRouter.post("/admin/product-options/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ title: z.string().min(1).optional(), values: z.array(z.string()).optional() }).passthrough().parse(req.body)
    const { rows } = await pool.query(`SELECT * FROM product_option WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Product option not found")
    }
    if (body.title !== undefined) {
      await pool.query(`UPDATE product_option SET title = $2, updated_at = NOW() WHERE id = $1`, [req.params.id, body.title])
    }
    if (body.values !== undefined) {
      // `values` is the full, ordered list: its position is each value's rank.
      const wanted = [...new Set(body.values.map((v) => v.trim()).filter(Boolean))]
      const current = await pool.query(`SELECT id, value FROM product_option_value WHERE option_id = $1 AND deleted_at IS NULL`, [req.params.id])
      const wantedSet = new Set(wanted)
      for (const row of current.rows) {
        if (!wantedSet.has(row.value)) {
          await pool.query(`DELETE FROM product_option_value WHERE id = $1`, [row.id])
        }
      }
      const currentByValue = new Map<string, string>(current.rows.filter((r: any) => wantedSet.has(r.value)).map((r: any) => [r.value, r.id]))
      for (let i = 0; i < wanted.length; i++) {
        const existingId = currentByValue.get(wanted[i])
        if (existingId) {
          await pool.query(`UPDATE product_option_value SET rank = $2 WHERE id = $1`, [existingId, i])
        } else {
          await pool.query(`INSERT INTO product_option_value (option_id, value, rank) VALUES ($1,$2,$3)`, [req.params.id, wanted[i], i])
        }
      }
    }
    res.json({ product_option: await getOptionWithValues(req.params.id) })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/product-options/:optionId/values (admin.productOption.listValues) ----
catalogCompatRouter.get("/admin/product-options/:optionId/values", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const o = await pool.query(`SELECT id FROM product_option WHERE id = $1 AND deleted_at IS NULL`, [req.params.optionId])
    if (!o.rows[0]) {
      throw notFound("Product option not found")
    }
    const lq = buildListQuery({
      base: "ov.deleted_at IS NULL",
      query: req.query,
      specs: PRODUCT_OPTION_VALUE_FILTERS,
      q: { columns: PRODUCT_OPTION_VALUE_Q_COLUMNS },
      order: PRODUCT_OPTION_VALUE_SORT,
      defaultOrder: "ov.rank ASC, ov.created_at ASC",
    })
    // the parent option is pinned by the path, so it is appended as a bound param
    const params = [...lq.params, req.params.optionId]
    const conditions = [lq.where.replace(/^WHERE\s+/i, ""), `ov.option_id = $${params.length}`].filter((c) => c.length > 0)
    const where = `WHERE ${conditions.join(" AND ")}`
    const from = "FROM product_option_value ov"
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c ${from} ${where}`, params)
    const { rows } = await pool.query(
      `SELECT ov.* ${from} ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lq.limit, lq.offset]
    )
    sendList(res, { product_option_values: rows, count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

// ---- GET /admin/product-options/:optionId/values/:valueId ----
catalogCompatRouter.get("/admin/product-options/:optionId/values/:valueId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM product_option_value WHERE id = $1 AND option_id = $2 AND deleted_at IS NULL`,
      [req.params.valueId, req.params.optionId]
    )
    if (!rows[0]) {
      throw notFound("Product option value not found")
    }
    res.json({ product_option_value: rows[0] })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/product-options/:optionId/values/:valueId ----
catalogCompatRouter.post("/admin/product-options/:optionId/values/:valueId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ value: z.string().min(1).optional() }).passthrough().parse(req.body)
    const { rows } = await pool.query(
      `SELECT * FROM product_option_value WHERE id = $1 AND option_id = $2 AND deleted_at IS NULL`,
      [req.params.valueId, req.params.optionId]
    )
    if (!rows[0]) {
      throw notFound("Product option value not found")
    }
    if (body.value !== undefined) {
      await pool.query(`UPDATE product_option_value SET value = $3 WHERE id = $1 AND option_id = $2`, [req.params.valueId, req.params.optionId, body.value])
    }
    const updated = await pool.query(`SELECT * FROM product_option_value WHERE id = $1`, [req.params.valueId])
    res.json({ product_option_value: updated.rows[0] })
  } catch (e) {
    next(e)
  }
})
