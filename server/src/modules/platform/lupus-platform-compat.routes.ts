import { toWorkflowExecution } from "./workflow-executions"
import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { REGION_FILTERS, REGION_Q_COLUMNS, REGION_SORT, TAX_RATE_FILTERS, TAX_RATE_Q_COLUMNS, TAX_RATE_SORT, TAX_REGION_FILTERS, TAX_REGION_Q_COLUMNS, TAX_REGION_SORT } from "../infra/list-filter-specs"
import { buildListQuery, sendList } from "../infra/list-query"
import { fileService } from "../infra/file.service"
import { handleStripeWebhook } from "../providers/external-providers"
import { requirePolicy } from "./admin-platform.routes"

// Lupus-compat platform endpoints (dashboard parity: api keys, sales channels,
// currencies, regions admin, locales, layouts, notifications, plugins, search,
// stores, translations, views, workflow executions, return reasons, tax regions/rates).
// Refs (paths + bodies):
//   upstream/packages/core/js-sdk/src/admin/{api-key,currency,layouts,locale,
//     notification,plugin,property-label,region,sales-channel,search,store,
//     translation,views,workflow-execution,tax-region,tax-rate,return-reason}.ts
// Shapes follow upstream/src/api/admin/<resource>/.../route.ts:
// lists -> { <plural>, count, offset, limit }, retrieve -> { <singular> },
// create -> 201, delete -> { id, object, deleted: true }.
// Reuses existing tables only; no new migrations.
export const platformCompatRouter = Router()

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

function pageOf(query: { limit?: number; offset?: number }): { limit: number; offset: number } {
  return { limit: query.limit ?? 20, offset: query.offset ?? 0 }
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`${what} with id ${id} not found`), { statusCode: 404 })
}

// ---------------------------------------------------------------------------
// api keys: GET list, GET retrieve, POST update, POST revoke, DELETE
// (create POST /admin/api-keys lives in admin-platform.routes.ts)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// currencies: GET list, GET retrieve (table: currency)
// ---------------------------------------------------------------------------

platformCompatRouter.get("/admin/currencies", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM currency`)
    const { rows } = await pool.query(`SELECT * FROM currency ORDER BY code LIMIT $1 OFFSET $2`, [lim, off])
    res.json({ currencies: rows, count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.get("/admin/currencies/:code", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM currency WHERE code=$1`, [req.params.code.toLowerCase()])
    if (!rows[0]) {
      throw notFound("Currency", req.params.code)
    }
    res.json({ currency: rows[0] })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// layouts: zone configuration + configurations list (backed by user_preference;
// no layout_configuration table exists, so personal configs live under
// key layout:<zone> for the user email, system defaults under user_id system)
// ---------------------------------------------------------------------------

function layoutConfigResponse(zone: string, userId: string | null, isDefault: boolean, widgets: Record<string, any>): any {
  return {
    id: `lcfg_${zone}_${isDefault ? "default" : userId ?? "anon"}`,
    zone,
    user_id: userId,
    is_system_default: isDefault,
    configuration: { widgets },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

platformCompatRouter.get("/admin/layouts/configurations", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { limit, offset, zone } = paginationSchema.extend({ zone: z.union([z.string(), z.array(z.string())]).optional() }).parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const email = req.auth?.email ?? "anon"
    const { rows } = await pool.query(`SELECT user_id, key, value FROM user_preference WHERE key LIKE 'layout:%' AND (user_id=$1 OR user_id='system')`, [email])
    let layout_configurations = rows.map((r: any) => {
      const z2: string = String(r.key).slice("layout:".length)
      const isDefault = r.user_id === "system"
      const val = typeof r.value === "string" ? JSON.parse(r.value) : r.value ?? {}
      return layoutConfigResponse(z2, isDefault ? null : r.user_id, isDefault, val.widgets ?? val)
    })
    if (zone) {
      const zones = Array.isArray(zone) ? zone : [zone]
      layout_configurations = layout_configurations.filter((c: any) => zones.includes(c.zone))
    }
    const count = layout_configurations.length
    res.json({ layout_configurations: layout_configurations.slice(off, off + lim), count, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.get("/admin/layouts/:zone/configuration", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const email = req.auth?.email ?? "anon"
    const zone = req.params.zone
    const personal = await pool.query(`SELECT value FROM user_preference WHERE user_id=$1 AND key=$2`, [email, `layout:${zone}`])
    if (personal.rows[0]) {
      const val = typeof personal.rows[0].value === "string" ? JSON.parse(personal.rows[0].value) : personal.rows[0].value
      res.json({ layout_configuration: layoutConfigResponse(zone, email, false, val.widgets ?? val) })
      return
    }
    const fallback = await pool.query(`SELECT value FROM user_preference WHERE user_id='system' AND key=$1`, [`layout:${zone}`])
    if (fallback.rows[0]) {
      const val = typeof fallback.rows[0].value === "string" ? JSON.parse(fallback.rows[0].value) : fallback.rows[0].value
      res.json({ layout_configuration: layoutConfigResponse(zone, null, true, val.widgets ?? val) })
      return
    }
    res.json({ layout_configuration: null })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.post("/admin/layouts/:zone/configuration", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const { configuration, is_default } = z.object({ configuration: z.object({ widgets: z.record(z.any()) }), is_default: z.boolean().optional() }).parse(req.body)
    const zone = req.params.zone
    const owner = is_default ? "system" : req.auth?.email ?? "anon"
    await pool.query(
      `INSERT INTO user_preference (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (user_id, key) DO UPDATE SET value=$3, updated_at=NOW()`,
      [owner, `layout:${zone}`, JSON.stringify({ widgets: configuration.widgets })]
    )
    res.json({ layout_configuration: layoutConfigResponse(zone, is_default ? null : owner, is_default ?? false, configuration.widgets) })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.delete("/admin/layouts/:zone/configuration", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    await pool.query(`DELETE FROM user_preference WHERE user_id=$1 AND key=$2`, [req.auth?.email ?? "anon", `layout:${req.params.zone}`])
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// locales: GET list, GET retrieve (table: translation_locale)
// ---------------------------------------------------------------------------

platformCompatRouter.get("/admin/locales", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM translation_locale`)
    const { rows } = await pool.query(`SELECT code FROM translation_locale ORDER BY code LIMIT $1 OFFSET $2`, [lim, off])
    res.json({ locales: rows.map((r: any) => ({ code: r.code, name: r.code })), count: total.rows[0].c, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.get("/admin/locales/:code", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT code FROM translation_locale WHERE code=$1`, [req.params.code])
    if (!rows[0]) {
      throw notFound("Locale", req.params.code)
    }
    res.json({ locale: { code: rows[0].code, name: rows[0].code } })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// notifications: GET retrieve (list lives in admin-platform.routes.ts)
// ---------------------------------------------------------------------------

platformCompatRouter.get("/admin/notifications/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM notification WHERE id=$1`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Notification", req.params.id)
    }
    res.json({ notification: { ...rows[0], to: rows[0].to_address } })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// plugins: GET list (no plugin registry table exists -> static empty list)
// ---------------------------------------------------------------------------

platformCompatRouter.get("/admin/plugins", requireAuth, async (_req, res, next) => {
  try {
    res.json({ plugins: [] })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// property labels: GET retrieve, POST update, DELETE, POST batch
// (collection GET/POST live in admin-platform.routes.ts)
// ---------------------------------------------------------------------------

function propertyLabelShape(row: any): any {
  return { id: row.id, entity: row.entity, property: row.property, label: row.label, description: undefined, created_at: row.created_at, updated_at: row.created_at }
}

platformCompatRouter.get("/admin/property-labels/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM property_label WHERE id=$1`, [req.params.id])
    if (!rows[0]) {
      throw notFound("Property label", req.params.id)
    }
    res.json({ property_label: propertyLabelShape(rows[0]) })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.post("/admin/property-labels/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.params.id === "batch") {
      next("route")
      return
    }
    await requirePolicy(req, "settings:write")
    const { entity, property, label } = z.object({ entity: z.string().optional(), property: z.string().optional(), label: z.string().optional() }).parse(req.body)
    const prev = await pool.query(`SELECT * FROM property_label WHERE id=$1`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("Property label", req.params.id)
    }
    const cur = prev.rows[0]
    const { rows } = await pool.query(`UPDATE property_label SET entity=$2, property=$3, label=$4 WHERE id=$1 RETURNING *`, [
      req.params.id,
      entity ?? cur.entity,
      property ?? cur.property,
      label ?? cur.label,
    ])
    res.json({ property_label: propertyLabelShape(rows[0]) })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.delete("/admin/property-labels/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const deleted = await pool.query(`DELETE FROM property_label WHERE id=$1 RETURNING id`, [req.params.id])
    if (!deleted.rows[0]) {
      throw notFound("Property label", req.params.id)
    }
    res.json({ id: req.params.id, object: "property_label", deleted: true })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.post("/admin/property-labels/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const { create, update, delete: del } = z
      .object({
        create: z.array(z.object({ entity: z.string(), property: z.string(), label: z.string() })).optional(),
        update: z.array(z.object({ id: z.string(), entity: z.string().optional(), property: z.string().optional(), label: z.string().optional() })).optional(),
        delete: z.array(z.string()).optional(),
      })
      .parse(req.body)
    const created: any[] = []
    for (const c of create ?? []) {
      const { rows } = await pool.query(
        `INSERT INTO property_label (entity, property, label) VALUES ($1,$2,$3) ON CONFLICT (entity, property) DO UPDATE SET label=$3 RETURNING *`,
        [c.entity, c.property, c.label]
      )
      created.push(propertyLabelShape(rows[0]))
    }
    const updated: any[] = []
    for (const u of update ?? []) {
      const prev = await pool.query(`SELECT * FROM property_label WHERE id=$1`, [u.id])
      if (!prev.rows[0]) {
        continue
      }
      const cur = prev.rows[0]
      const { rows } = await pool.query(`UPDATE property_label SET entity=$2, property=$3, label=$4 WHERE id=$1 RETURNING *`, [
        u.id,
        u.entity ?? cur.entity,
        u.property ?? cur.property,
        u.label ?? cur.label,
      ])
      updated.push(propertyLabelShape(rows[0]))
    }
    const deleted: any[] = []
    for (const id of del ?? []) {
      const gone = await pool.query(`DELETE FROM property_label WHERE id=$1 RETURNING id`, [id])
      if (gone.rows[0]) {
        deleted.push({ id, object: "property_label", deleted: true })
      }
    }
    res.json({ created, updated, deleted })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// regions admin: GET list, GET retrieve, POST update, DELETE
// (create POST /admin/regions lives in region.routes.ts)
// ---------------------------------------------------------------------------

async function regionWithCountries(id: string): Promise<any> {
  const r = await pool.query(`SELECT * FROM region WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!r.rows[0]) {
    throw notFound("Region", id)
  }
  const c = await pool.query(`SELECT iso_2 FROM region_country WHERE region_id=$1 AND deleted_at IS NULL`, [id])
  return { ...r.rows[0], countries: c.rows }
}

// ?country_code lives on the region_country join, not on region, and it is a user
// value, so it cannot be a base condition. It is read here, coerced to lower
// case and appended as a bind param ($n after every filter param), and the two
// queries are then issued by hand - exactly what runList does internally.
function countryCodeClause(query: Record<string, unknown>, paramIndex: number): { sql: string; params: string[] } | null {
  const raw = Array.isArray(query.country_code) ? query.country_code[0] : query.country_code
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!value) {
    return null
  }
  return {
    sql: `EXISTS (SELECT 1 FROM region_country rc WHERE rc.region_id = r.id AND rc.deleted_at IS NULL AND LOWER(rc.iso_2) = $${paramIndex})`,
    params: [value],
  }
}

// ---------------------------------------------------------------------------
// sales channels: GET retrieve, POST update, DELETE
// (create/list/product-links live in channel-location.routes.ts)
// ---------------------------------------------------------------------------

async function salesChannelShape(id: string): Promise<any> {
  const { rows } = await pool.query(`SELECT * FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!rows[0]) {
    throw notFound("Sales channel", id)
  }
  const products = await pool.query(
    `SELECT p.id, p.title, p.handle, p.status FROM product_sales_channel psc
     JOIN product p ON p.id = psc.product_id AND p.deleted_at IS NULL
     WHERE psc.sales_channel_id = $1 ORDER BY p.created_at DESC LIMIT 200`,
    [id]
  )
  return { ...rows[0], products: products.rows }
}

platformCompatRouter.post("/admin/sales-channels/:id/products/remove", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { product_ids } = z.object({ product_ids: z.array(z.string()) }).parse(req.body)
    await pool.query(`DELETE FROM product_sales_channel WHERE sales_channel_id = $1 AND product_id = ANY($2)`, [req.params.id, product_ids])
    res.json({ sales_channel: await salesChannelShape(req.params.id) })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.get("/admin/sales-channels/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ sales_channel: await salesChannelShape(req.params.id) })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.post("/admin/sales-channels/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const { name, description, is_disabled, metadata } = z
      .object({ name: z.string().min(1).optional(), description: z.string().nullable().optional(), is_disabled: z.boolean().optional(), metadata: z.record(z.any()).nullable().optional() })
      .parse(req.body)
    const prev = await pool.query(`SELECT * FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!prev.rows[0]) {
      throw notFound("Sales channel", req.params.id)
    }
    const cur = prev.rows[0]
    if (name !== undefined && !name.trim()) {
      throw Object.assign(new Error("name cannot be empty"), { statusCode: 400 })
    }
    await pool.query(`UPDATE sales_channel SET name=$2, description=$3, is_disabled=$4, metadata=$5, updated_at=NOW() WHERE id=$1`, [
      req.params.id,
      name !== undefined ? name.trim() : cur.name,
      description !== undefined ? description : cur.description,
      is_disabled ?? cur.is_disabled,
      metadata !== undefined ? (metadata ? JSON.stringify(metadata) : null) : cur.metadata,
    ])
    res.json({ sales_channel: await salesChannelShape(req.params.id) })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.delete("/admin/sales-channels/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const exists = await pool.query(`SELECT 1 FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!exists.rows[0]) {
      throw notFound("Sales channel", req.params.id)
    }
    const isDefault = await pool.query(`SELECT 1 FROM store WHERE default_sales_channel_id=$1`, [req.params.id])
    if (isDefault.rows[0]) {
      throw Object.assign(new Error("Cannot delete the default sales channel"), { statusCode: 400 })
    }
    await pool.query(`UPDATE sales_channel SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id])
    // a deleted channel no longer publishes products, scopes API keys or serves a stock location
    await pool.query(`DELETE FROM product_sales_channel WHERE sales_channel_id=$1`, [req.params.id])
    await pool.query(`DELETE FROM api_key_sales_channel WHERE sales_channel_id=$1`, [req.params.id])
    await pool.query(`DELETE FROM sales_channel_stock_location WHERE sales_channel_id=$1`, [req.params.id])
    res.json({ id: req.params.id, object: "sales-channel", deleted: true })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// search: GET grouped search, search-indexes list/delete/reindex
// (no search module configured: indexes report enabled=false; reindex is a
// best-effort local GIN refresh for the product index)
// ---------------------------------------------------------------------------

platformCompatRouter.get("/admin/search", requireAuth, async (req, res, next) => {
  try {
    const { q, entity, limit, offset } = z
      .object({ q: z.string().optional(), entity: z.union([z.string(), z.array(z.string())]).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional() })
      .parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    let entities: string[]
    if (!entity) {
      entities = ["product", "order", "customer"]
    } else if (Array.isArray(entity)) {
      entities = entity.flatMap((e) => e.split(",")).map((e) => e.trim()).filter(Boolean)
    } else {
      entities = entity.split(",").map((e) => e.trim()).filter(Boolean)
    }
    const like = `%${(q ?? "").trim()}%`
    const results: any[] = []
    for (const ent of entities) {
      if (ent === "product") {
        const total = await pool.query(`SELECT COUNT(*)::int AS c FROM product WHERE deleted_at IS NULL AND ($1='%%' OR title ILIKE $1 OR COALESCE(description,'') ILIKE $1 OR handle ILIKE $1)`, [like])
        const { rows } = await pool.query(
          `SELECT * FROM product WHERE deleted_at IS NULL AND ($1='%%' OR title ILIKE $1 OR COALESCE(description,'') ILIKE $1 OR handle ILIKE $1) ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
          [like, lim, off]
        )
        results.push({ entity: ent, data: rows, count: total.rows[0].c, offset: off, limit: lim })
      } else if (ent === "customer") {
        const total = await pool.query(
          `SELECT COUNT(*)::int AS c FROM customer WHERE deleted_at IS NULL AND ($1='%%' OR COALESCE(email,'') ILIKE $1 OR COALESCE(first_name,'') ILIKE $1 OR COALESCE(last_name,'') ILIKE $1)`,
          [like]
        )
        const { rows } = await pool.query(
          `SELECT * FROM customer WHERE deleted_at IS NULL AND ($1='%%' OR COALESCE(email,'') ILIKE $1 OR COALESCE(first_name,'') ILIKE $1 OR COALESCE(last_name,'') ILIKE $1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [like, lim, off]
        )
        results.push({ entity: ent, data: rows, count: total.rows[0].c, offset: off, limit: lim })
      } else if (ent === "order") {
        const total = await pool.query(`SELECT COUNT(*)::int AS c FROM "order" WHERE CAST(id AS TEXT) ILIKE $1`, [like])
        const { rows } = await pool.query(`SELECT * FROM "order" WHERE CAST(id AS TEXT) ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [like, lim, off])
        results.push({ entity: ent, data: rows, count: total.rows[0].c, offset: off, limit: lim })
      } else {
        results.push({ entity: ent, data: [], count: 0, offset: off, limit: lim })
      }
    }
    res.json({ results })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.get("/admin/search-indexes", requireAuth, async (_req, res, next) => {
  try {
    res.json({ search_indexes: [], enabled: false })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.delete("/admin/search-indexes/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    res.json({ id: req.params.id, object: "search_index", deleted: true, deleted_versions: 0 })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.post("/admin/search-indexes/:id/reindex", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    if (req.params.id === "product") {
      await pool.query(`REINDEX INDEX IF EXISTS idx_product_search`).catch(() => undefined)
    }
    res.json({ job_id: `job_${Date.now()}`, indexes: [req.params.id] })
  } catch (e) {
    next(e)
  }
})

// ---------------------------------------------------------------------------
// stores: GET list, POST update by id
// (singular GET/POST /admin/store live in admin-platform.routes.ts)
// ---------------------------------------------------------------------------

async function storeWithLocales(id: string): Promise<any> {
  const s = await pool.query(`SELECT * FROM store WHERE id=$1`, [id])
  if (!s.rows[0]) {
    throw notFound("Store", id)
  }
  const locales = await pool.query(`SELECT locale_code FROM store_locale WHERE store_id=$1`, [id])
  return { ...s.rows[0], locales: locales.rows.map((r: any) => r.locale_code) }
}

// ---------------------------------------------------------------------------
// translations over the translation + translation_locale tables.
// Lupus AdminTranslation groups lupus rows by (locale_code, reference, reference_id).
// Settings persist in user_preference under user_id=system (no settings table exists).
// ---------------------------------------------------------------------------

const translatableFields: Record<string, string[]> = {
  product: ["title", "description", "subtitle"],
  product_variant: ["title"],
  product_category: ["name", "description"],
  product_collection: ["title"],
}

function translationId(localeCode: string, reference: string, referenceId: string): string {
  return `${localeCode}::${reference}::${referenceId}`
}

function parseTranslationId(id: string): { localeCode: string; reference: string; referenceId: string } | null {
  const parts = id.split("::")
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null
  }
  return { localeCode: parts[0], reference: parts[1], referenceId: parts[2] }
}

function groupTranslationRows(rows: any[]): any[] {
  const groups = new Map<string, any>()
  for (const row of rows) {
    const key = translationId(row.locale_code, row.entity, row.entity_id)
    let g = groups.get(key)
    if (!g) {
      g = { id: key, reference_id: row.entity_id, reference: row.entity, locale_code: row.locale_code, translations: {}, created_at: row.created_at, updated_at: row.created_at, deleted_at: null }
      groups.set(key, g)
    }
    g.translations[row.field] = row.text
    if (row.created_at < g.created_at) {
      g.created_at = row.created_at
    }
    if (row.created_at > g.updated_at) {
      g.updated_at = row.created_at
    }
  }
  return [...groups.values()]
}

platformCompatRouter.get("/admin/translations", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, q, reference, reference_id, locale_code } = paginationSchema
      .extend({
        q: z.string().optional(),
        reference: z.string().optional(),
        reference_id: z.union([z.string(), z.array(z.string())]).optional(),
        locale_code: z.union([z.string(), z.array(z.string())]).optional(),
      })
      .parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const conds: string[] = []
    const params: any[] = []
    if (reference) {
      params.push(reference)
      conds.push(`entity=$${params.length}`)
    }
    const refIds = reference_id ? (Array.isArray(reference_id) ? reference_id : [reference_id]) : []
    if (refIds.length > 0) {
      params.push(refIds)
      conds.push(`entity_id = ANY($${params.length})`)
    }
    const locales = locale_code ? (Array.isArray(locale_code) ? locale_code : [locale_code]) : []
    if (locales.length > 0) {
      params.push(locales)
      conds.push(`locale_code = ANY($${params.length})`)
    }
    if (q) {
      params.push(`%${q}%`)
      conds.push(`(entity_id ILIKE $${params.length} OR field ILIKE $${params.length} OR text ILIKE $${params.length})`)
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : ""
    const groups = await pool.query(
      `SELECT locale_code, entity, entity_id, MIN(created_at) AS created_at, MAX(created_at) AS updated_at FROM translation ${where} GROUP BY locale_code, entity, entity_id ORDER BY updated_at DESC`,
      params
    )
    const count = groups.rows.length
    const slice = groups.rows.slice(off, off + lim)
    const translations: any[] = []
    for (const g of slice) {
      const { rows } = await pool.query(`SELECT field, text FROM translation WHERE locale_code=$1 AND entity=$2 AND entity_id=$3`, [g.locale_code, g.entity, g.entity_id])
      const textMap: Record<string, string> = {}
      for (const r of rows) {
        textMap[r.field] = r.text
      }
      translations.push({ id: translationId(g.locale_code, g.entity, g.entity_id), reference_id: g.entity_id, reference: g.entity, locale_code: g.locale_code, translations: textMap, created_at: g.created_at, updated_at: g.updated_at, deleted_at: null })
    }
    res.json({ translations, count, offset: off, limit: lim })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.post("/admin/translations/batch", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await requirePolicy(req, "settings:write")
    const { create, update, delete: del } = z
      .object({
        create: z.array(z.object({ reference_id: z.string(), reference: z.string(), locale_code: z.string(), translations: z.record(z.string()) })).optional(),
        update: z.array(z.object({ id: z.string(), reference_id: z.string().optional(), reference: z.string().optional(), locale_code: z.string().optional(), translations: z.record(z.string()).optional() })).optional(),
        delete: z.array(z.string()).optional(),
      })
      .parse(req.body)
    const created: any[] = []
    for (const c of create ?? []) {
      await pool.query(`INSERT INTO translation_locale (code) VALUES ($1) ON CONFLICT DO NOTHING`, [c.locale_code])
      for (const [field, text] of Object.entries(c.translations)) {
        await pool.query(
          `INSERT INTO translation (locale_code, entity, entity_id, field, text) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (locale_code, entity, entity_id, field) DO UPDATE SET text=$5`,
          [c.locale_code, c.reference, c.reference_id, field, text]
        )
      }
      const { rows } = await pool.query(`SELECT * FROM translation WHERE locale_code=$1 AND entity=$2 AND entity_id=$3`, [c.locale_code, c.reference, c.reference_id])
      created.push(...groupTranslationRows(rows))
    }
    const updated: any[] = []
    for (const u of update ?? []) {
      const target = parseTranslationId(u.id)
      if (!target) {
        continue
      }
      const localeCode = u.locale_code ?? target.localeCode
      const reference = u.reference ?? target.reference
      const referenceId = u.reference_id ?? target.referenceId
      await pool.query(`INSERT INTO translation_locale (code) VALUES ($1) ON CONFLICT DO NOTHING`, [localeCode])
      for (const [field, text] of Object.entries(u.translations ?? {})) {
        await pool.query(
          `INSERT INTO translation (locale_code, entity, entity_id, field, text) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (locale_code, entity, entity_id, field) DO UPDATE SET text=$5`,
          [localeCode, reference, referenceId, field, text]
        )
      }
      if (localeCode !== target.localeCode || reference !== target.reference || referenceId !== target.referenceId) {
        await pool.query(`DELETE FROM translation WHERE locale_code=$1 AND entity=$2 AND entity_id=$3`, [target.localeCode, target.reference, target.referenceId])
      }
      const { rows } = await pool.query(`SELECT * FROM translation WHERE locale_code=$1 AND entity=$2 AND entity_id=$3`, [localeCode, reference, referenceId])
      if (rows.length > 0) {
        updated.push(...groupTranslationRows(rows))
      }
    }
    const ids: string[] = []
    for (const id of del ?? []) {
      const target = parseTranslationId(id)
      if (!target) {
        continue
      }
      await pool.query(`DELETE FROM translation WHERE locale_code=$1 AND entity=$2 AND entity_id=$3`, [target.localeCode, target.reference, target.referenceId])
      ids.push(id)
    }
    res.json({ created, updated, deleted: { ids, object: "translation", deleted: true } })
  } catch (e) {
    next(e)
  }
})

platformCompatRouter.get("/admin/translations/entities", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, type } = paginationSchema.extend({ type: z.string().optional() }).parse(req.query)
    const { limit: lim, offset: off } = pageOf({ limit, offset })
    const entityType = type ?? "product"
    const fields = translatableFields[entityType]
    if (!fields) {
      res.json({ data: [], count: 0, offset: off, limit: lim })
      return
    }
    let table = ""
    let cols = ""
    if (entityType === "product") {
      table = "product"
      cols = "id, title, description, subtitle"
    } else if (entityType === "product_variant") {
      table = "product_variant"
      cols = "id, title"
    } else if (entityType === "product_category") {
      table = "product_category"
      cols = "id, name, description"
    } else {
