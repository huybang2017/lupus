import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import {
  COLLECTION_FILTERS,
  COLLECTION_Q_COLUMNS,
  COLLECTION_SORT,
  PRODUCT_CATEGORY_FILTERS,
  PRODUCT_CATEGORY_Q_COLUMNS,
  PRODUCT_CATEGORY_SORT,
  PRODUCT_TAG_FILTERS,
  PRODUCT_TAG_Q_COLUMNS,
  PRODUCT_TAG_SORT,
  PRODUCT_TYPE_FILTERS,
  PRODUCT_TYPE_Q_COLUMNS,
  PRODUCT_TYPE_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { requestLocale, translateRows } from "../platform/translation-overlay"

// Port of remaining catalog/taxonomy, shipping-profile, translation, dashboard-settings,
// api-key<->channel link, customer-address, order-address flows.
// Refs: core-flows product-category/*, modules/fulfillment shipping-profile,
// modules/translation, modules/settings (user-preference/view-configuration).
export const missingPiecesRouter = Router()

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

// ---- product categories (create/update/delete + assign) ----
missingPiecesRouter.post("/admin/product-categories", requireAuth, async (req, res, next) => {
  try {
    const { name, handle, description, parent_category_id, rank, is_active, is_internal } = z.object({ name: z.string(), handle: z.string().optional(), description: z.string().optional(), parent_category_id: z.string().optional(), rank: z.number().int().optional(), is_active: z.boolean().optional(), is_internal: z.boolean().optional() }).parse(req.body)
    const { rows } = await pool.query(
      `INSERT INTO product_category (name, handle, description, parent_category_id, rank, is_active, is_internal) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, handle ?? slug(name), description ?? null, parent_category_id ?? null, rank ?? 0, is_active ?? true, is_internal ?? false]
    )
    res.status(201).json({ product_category: rows[0] })
  } catch (e) {
    next(e)
  }
})

// Lupus store categories: active, non-internal; filters id/handle/q/parent_category_id ("null" = roots);
// every row carries its direct children and its ancestor chain (parent_category, nested upward).
missingPiecesRouter.get("/store/product-categories", async (req, res, next) => {
  try {
    const many = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v]))
    const q = z
      .object({
        id: many.optional(),
        handle: many.optional(),
        q: z.string().optional(),
        parent_category_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query)
    const conds = ["c.deleted_at IS NULL", "c.is_active = TRUE", "c.is_internal = FALSE"]
    const params: unknown[] = []
    const add = (sql: string, value: unknown) => {
      params.push(value)
      conds.push(sql.split("?").join(`$${params.length}`))
    }
    if (q.id) add("c.id = ANY(?)", q.id)
    if (q.handle) add("c.handle = ANY(?)", q.handle)
    if (q.q) add("(c.name ILIKE ? OR c.handle ILIKE ?)", `%${q.q}%`)
    if (q.parent_category_id === "null") conds.push("c.parent_category_id IS NULL")
    else if (q.parent_category_id) add("c.parent_category_id = ?", q.parent_category_id)
    const where = conds.join(" AND ")
    const count = await pool.query(`SELECT COUNT(*)::int AS count FROM product_category c WHERE ${where}`, params)
    const { rows } = await pool.query(`SELECT c.* FROM product_category c WHERE ${where} ORDER BY c.rank ASC, c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.limit, q.offset])
    // one pass over the whole active tree gives children and ancestors without per-row queries
    const all = await pool.query(`SELECT id, name, handle, description, parent_category_id, rank, metadata FROM product_category WHERE deleted_at IS NULL AND is_active = TRUE AND is_internal = FALSE ORDER BY rank ASC, created_at DESC`)
    const byId = new Map<string, any>(all.rows.map((r: any) => [r.id, r]))
    const childrenOf = new Map<string, any[]>()
    for (const r of all.rows) {
      if (r.parent_category_id) childrenOf.set(r.parent_category_id, [...(childrenOf.get(r.parent_category_id) ?? []), r])
    }
    const ancestors = (id: string | null): any => {
      const node = id ? byId.get(id) : null
      return node ? { ...node, parent_category: ancestors(node.parent_category_id) } : null
    }
    const locale = requestLocale(req)
    const translatedRows = await translateRows(rows, "product_category", ["name", "description"], locale)
    const product_categories = translatedRows.map((r: any) => ({ ...r, category_children: childrenOf.get(r.id) ?? [], parent_category: ancestors(r.parent_category_id) }))
    res.json({ product_categories, count: count.rows[0].count, offset: q.offset, limit: q.limit })
  } catch (e) {
    next(e)
  }
})

// The admin Categories > Organize page consumes this list as a single
// rank-ordered page, so the default page size is generous while limit/offset
// stay real (a caller asking for `limit` gets exactly that page).
missingPiecesRouter.get("/admin/product-categories", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "product_category",
      alias: "c",
      select: "c.*",
      base: "c.deleted_at IS NULL",
      specs: PRODUCT_CATEGORY_FILTERS,
      q: { columns: PRODUCT_CATEGORY_Q_COLUMNS },
      order: PRODUCT_CATEGORY_SORT,
      defaultOrder: "c.rank ASC, c.created_at DESC",
      defaultLimit: 200,
      maxLimit: 500,
      key: "product_categories",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.post("/admin/product-categories/:id", requireAuth, async (req, res, next) => {
  try {
    const patch = z.object({ name: z.string().optional(), handle: z.string().optional(), description: z.string().nullable().optional(), is_active: z.boolean().optional(), is_internal: z.boolean().optional(), parent_category_id: z.string().nullable().optional(), rank: z.number().int().optional() }).parse(req.body)
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      params.push(v)
      sets.push(`${k} = $${params.length}`)
    }
    params.push(req.params.id)
    const { rows } = await pool.query(`UPDATE product_category SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`, params)
    if (!rows[0]) throw Object.assign(new Error("Category not found"), { statusCode: 404 })
    res.json({ product_category: rows[0] })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.delete("/admin/product-categories/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE product_category SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.post("/admin/products/:id/categories", requireAuth, async (req, res, next) => {
  try {
    const { category_ids } = z.object({ category_ids: z.array(z.string()) }).parse(req.body)
    for (const cid of category_ids) {
      await pool.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, cid])
    }
    res.json({ added: category_ids.length })
  } catch (e) {
    next(e)
  }
})

// ---- collections / tags / types / images ----
missingPiecesRouter.post("/admin/collections", requireAuth, async (req, res, next) => {
  try {
    const { title, handle, metadata } = z
      .object({ title: z.string().trim().min(1), handle: z.string().optional(), metadata: z.record(z.string(), z.unknown()).nullish() })
      .parse(req.body)
    const finalHandle = (handle?.trim() || slug(title)).toLowerCase()
    const taken = await pool.query(`SELECT 1 FROM product_collection WHERE handle = $1 AND deleted_at IS NULL`, [finalHandle])
    if (taken.rows[0]) throw Object.assign(new Error(`Collection with handle: ${finalHandle}, already exists.`), { statusCode: 409 })
    // a soft-deleted collection keeps its handle reserved by the table's UNIQUE constraint: free it first
    await pool.query(`UPDATE product_collection SET handle = handle || '-deleted-' || id WHERE handle = $1 AND deleted_at IS NOT NULL`, [finalHandle])
    const { rows } = await pool.query(`INSERT INTO product_collection (title, handle, metadata) VALUES ($1,$2,$3) RETURNING *`, [title.trim(), finalHandle, metadata ?? null])
    res.status(201).json({ collection: rows[0] })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.post("/admin/products/:id/tags", requireAuth, async (req, res, next) => {
  try {
    const { values } = z.object({ values: z.array(z.string()) }).parse(req.body)
    for (const v of values) {
      const t = await pool.query(`INSERT INTO product_tag (value) VALUES ($1) ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value=$1 RETURNING id`, [v])
      await pool.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, t.rows[0].id])
    }
    res.json({ tagged: values.length })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.post("/admin/products/:id/images", requireAuth, async (req, res, next) => {
  try {
    const { urls } = z.object({ urls: z.array(z.string().url()) }).parse(req.body)
    const existingCount = await pool.query(`SELECT COUNT(*)::int AS c FROM product_image WHERE product_id=$1 AND deleted_at IS NULL`, [req.params.id])
    let rank = existingCount.rows[0].c
    for (const url of urls) {
      await pool.query(`INSERT INTO product_image (product_id, url, rank) VALUES ($1,$2,$3)`, [req.params.id, url, rank])
      rank += 1
    }
    const { rows } = await pool.query(`SELECT * FROM product_image WHERE product_id=$1 AND deleted_at IS NULL ORDER BY rank`, [req.params.id])
    res.status(201).json({ images: rows })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.delete("/admin/product-images/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE product_image SET deleted_at = NOW() WHERE id = $1`, [req.params.id])
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---- collections full admin ----
missingPiecesRouter.get("/admin/collections", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "product_collection",
      alias: "col",
      select: "col.*, (SELECT COUNT(*)::int FROM product p WHERE p.collection_id = col.id AND p.deleted_at IS NULL) AS products_count",
      base: "col.deleted_at IS NULL",
      specs: COLLECTION_FILTERS,
      q: { columns: COLLECTION_Q_COLUMNS },
      order: COLLECTION_SORT,
      defaultOrder: "col.created_at DESC",
      maxLimit: 200,
      key: "collections",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.delete("/admin/collections/:id", requireAuth, async (req, res, next) => {
  try {
    const gone = await pool.query(`UPDATE product_collection SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [req.params.id])
    if (!gone.rows[0]) throw Object.assign(new Error(`Collection with id: ${req.params.id} was not found`), { statusCode: 404 })
    // its products stay in the catalog, just without a collection
    await pool.query(`UPDATE product SET collection_id = NULL, updated_at = NOW() WHERE collection_id = $1`, [req.params.id])
    res.json({ id: req.params.id, object: "collection", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---- shipping profiles ----
// ---- translations (translatable title/description pattern) ----
missingPiecesRouter.post("/admin/translations", requireAuth, async (req, res, next) => {
  try {
    const { locale, entity, entity_id, field, text } = z.object({ locale: z.string().length(2), entity: z.string(), entity_id: z.string(), field: z.string(), text: z.string() }).parse(req.body)
    await pool.query(`INSERT INTO translation_locale (code) VALUES ($1) ON CONFLICT DO NOTHING`, [locale.toLowerCase()])
    const { rows } = await pool.query(
      `INSERT INTO translation (locale_code, entity, entity_id, field, text) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (locale_code, entity, entity_id, field) DO UPDATE SET text=$5 RETURNING *`,
      [locale.toLowerCase(), entity, entity_id, field, text]
    )
    res.status(201).json({ translation: rows[0] })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.get("/store/translations/:locale/:entity/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT field, text FROM translation WHERE locale_code=$1 AND entity=$2 AND entity_id=$3`, [
      req.params.locale.toLowerCase(),
      req.params.entity,
      req.params.id,
    ])
    res.json({ translations: rows })
  } catch (e) {
    next(e)
  }
})

// ---- dashboard settings (user preferences) ----
missingPiecesRouter.post("/admin/preferences", requireAuth, async (req: any, res, next) => {
  try {
    const { key, value } = z.object({ key: z.string(), value: z.record(z.any()) }).parse(req.body)
    await pool.query(`INSERT INTO user_preference (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (user_id, key) DO UPDATE SET value=$3`, [
      req.auth?.email ?? "anon",
      key,
      JSON.stringify(value),
    ])
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

missingPiecesRouter.get("/admin/preferences", requireAuth, async (req: any, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM user_preference WHERE user_id=$1`, [req.auth?.email ?? "anon"])
    res.json({ preferences: rows })
  } catch (e) {
    next(e)
  }
})

// ---- gift card applied to cart (gift-cardable totals) ----
missingPiecesRouter.post("/store/carts/:id/gift-cards", async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body)
    const g = await pool.query(`SELECT * FROM gift_card WHERE code=$1 AND deleted_at IS NULL`, [code.toUpperCase()])
    const card = g.rows[0]
    if (!card || card.is_disabled || (card.ends_at && new Date(card.ends_at) < new Date()) || card.balance <= 0) {
      throw Object.assign(new Error("Gift card invalid or empty"), { statusCode: 400 })
    }
    const cart = await pool.query(`SELECT currency_code FROM cart WHERE id=$1`, [req.params.id])
    if (!cart.rows[0] || cart.rows[0].currency_code !== card.currency_code) {
      throw Object.assign(new Error("Gift card currency mismatch"), { statusCode: 400 })
    }
    await pool.query(`INSERT INTO cart_gift_card (cart_id, gift_card_id, amount) VALUES ($1,$2,$3) ON CONFLICT (cart_id, gift_card_id) DO UPDATE SET amount=$3`, [
      req.params.id,
      card.id,
      Math.min(card.balance, 10 ** 12),
    ])
    res.status(201).json({ applied: code.toUpperCase() })
  } catch (e) {
    next(e)
  }
})
