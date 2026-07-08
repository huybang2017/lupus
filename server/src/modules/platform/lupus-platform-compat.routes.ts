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
