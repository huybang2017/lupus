import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import {
  INVENTORY_ITEM_FILTERS,
  INVENTORY_ITEM_Q_COLUMNS,
  INVENTORY_ITEM_SORT,
  INVENTORY_LEVEL_FILTERS,
  INVENTORY_LEVEL_Q_COLUMNS,
  INVENTORY_LEVEL_SORT,
  RESERVATION_FILTERS,
  RESERVATION_SORT,
  SHIPPING_PROFILE_FILTERS,
  SHIPPING_PROFILE_Q_COLUMNS,
  SHIPPING_PROFILE_SORT,
} from "../infra/list-filter-specs"
import { buildListQuery, queryList, runList, sendList } from "../infra/list-query"
import { fulfillmentService } from "./fulfillment.service"
import { fileService } from "../infra/file.service"

// Lupus-compat fulfillment endpoints (dashboard parity: stock locations,
// fulfillment sets + service zones, shipping options/profiles, inventory items,
// reservations).
export const fulfillmentCompatRouter = Router()

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

function paging(query: unknown) {
  const parsed = z
    .object({
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    })
    .parse(query ?? {})
  return { limit: parsed.limit ?? 50, offset: parsed.offset ?? 0 }
}

function levelRefId(inventoryItemId: string, locationId: string) {
  return `${inventoryItemId}:${locationId}`
}

function parseLevelRef(ref: string, fallbackItemId?: string) {
  const sep = ref.indexOf(":")
  if (sep > 0) {
    return { inventory_item_id: ref.slice(0, sep), location_id: ref.slice(sep + 1) }
  }
  if (!fallbackItemId) {
    throw Object.assign(new Error(`Cannot resolve inventory level ref ${ref}`), { statusCode: 400 })
  }
  return { inventory_item_id: fallbackItemId, location_id: ref }
}

async function hydrateFulfillmentSet(id: string) {
  const set = await pool.query(`SELECT * FROM fulfillment_set WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!set.rows[0]) {
    throw notFound(`Fulfillment set with id ${id} was not found`)
  }
  const zones = await pool.query(`SELECT * FROM service_zone WHERE fulfillment_set_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [id])
  const out = []
  for (const zone of zones.rows) {
    const geo = await pool.query(`SELECT * FROM geo_zone WHERE service_zone_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [zone.id])
    out.push({ ...zone, geo_zones: geo.rows })
  }
  return { ...set.rows[0], service_zones: out }
}

async function hydrateServiceZone(id: string) {
  const zone = await pool.query(`SELECT * FROM service_zone WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!zone.rows[0]) {
    throw notFound(`Service zone with id ${id} was not found`)
  }
  const geo = await pool.query(`SELECT * FROM geo_zone WHERE service_zone_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [id])
  return { ...zone.rows[0], geo_zones: geo.rows }
}

async function hydrateStockLocation(id: string) {
  const loc = await pool.query(`SELECT * FROM stock_location WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!loc.rows[0]) {
    throw notFound(`Stock location with id ${id} was not found`)
  }
  const row = loc.rows[0]
  const channels = await pool.query(
    `SELECT sc.* FROM sales_channel sc JOIN sales_channel_stock_location link ON link.sales_channel_id=sc.id WHERE link.stock_location_id=$1 AND sc.deleted_at IS NULL ORDER BY sc.created_at`,
    [id]
  )
  const sets = await pool.query(`SELECT * FROM fulfillment_set WHERE stock_location_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [id])
  const hydratedSets = []
  for (const s of sets.rows) {
    hydratedSets.push(await hydrateFulfillmentSet(s.id))
  }
  const providerIds: string[] = Array.isArray(row.metadata?.fulfillment_provider_ids) ? row.metadata.fulfillment_provider_ids : []
  return {
    ...row,
    address: { address_1: row.address_1, city: row.city, country_code: row.country_code, postal_code: row.postal_code },
    sales_channels: channels.rows,
    fulfillment_sets: hydratedSets,
    fulfillment_providers: providerIds.map((pid) => ({ id: pid, is_enabled: true })),
  }
}

async function hydrateInventoryItem(id: string) {
  const item = await pool.query(`SELECT * FROM inventory_item WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!item.rows[0]) {
    throw notFound(`Inventory item with id ${id} was not found`)
  }
  const levels = await pool.query(
    `SELECT l.*, s.name AS location_name FROM inventory_level_location l LEFT JOIN stock_location s ON s.id=l.location_id WHERE l.inventory_item_id=$1 ORDER BY l.location_id`,
    [id]
  )
  return {
    ...item.rows[0],
    location_levels: levels.rows.map((l) => ({
      id: levelRefId(l.inventory_item_id, l.location_id),
      inventory_item_id: l.inventory_item_id,
      location_id: l.location_id,
      stocked_quantity: l.stocked_quantity,
      reserved_quantity: l.reserved_quantity,
      available_quantity: Number(l.stocked_quantity) - Number(l.reserved_quantity),
      incoming_quantity: l.incoming_quantity,
    })),
  }
}

async function hydrateShippingOption(id: string) {
  const opt = await pool.query(`SELECT * FROM shipping_option WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!opt.rows[0]) {
    throw notFound(`Shipping option with id ${id} was not found`)
  }
  const rules = await pool.query(`SELECT * FROM shipping_option_rule WHERE shipping_option_id=$1`, [id])
  return { ...opt.rows[0], rules: rules.rows }
}

const levelInput = z.object({
  location_id: z.string(),
  stocked_quantity: z.number().int().nonnegative().optional(),
  incoming_quantity: z.number().int().nonnegative().optional(),
})

async function applyLevelUpsert(inventoryItemId: string, input: { location_id: string; stocked_quantity?: number; incoming_quantity?: number }) {
  const existing = await pool.query(`SELECT * FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [inventoryItemId, input.location_id])
  if (!existing.rows[0]) {
    const loc = await pool.query(`SELECT id FROM stock_location WHERE id=$1 AND deleted_at IS NULL`, [input.location_id])
    if (!loc.rows[0]) {
      throw notFound(`Stock location with id ${input.location_id} was not found`)
    }
    const ins = await pool.query(
      `INSERT INTO inventory_level_location (inventory_item_id, location_id, stocked_quantity, incoming_quantity) VALUES ($1,$2,$3,$4) RETURNING *`,
      [inventoryItemId, input.location_id, input.stocked_quantity ?? 0, input.incoming_quantity ?? 0]
    )
    return { row: ins.rows[0], created: true }
  }
  const upd = await pool.query(
    `UPDATE inventory_level_location SET stocked_quantity=COALESCE($3, stocked_quantity), incoming_quantity=COALESCE($4, incoming_quantity), updated_at=NOW() WHERE inventory_item_id=$1 AND location_id=$2 RETURNING *`,
    [inventoryItemId, input.location_id, input.stocked_quantity ?? null, input.incoming_quantity ?? null]
  )
  return { row: upd.rows[0], created: false }
}

function toLevelDto(l: any) {
  return {
    id: levelRefId(l.inventory_item_id, l.location_id),
    inventory_item_id: l.inventory_item_id,
    location_id: l.location_id,
    stocked_quantity: l.stocked_quantity,
    reserved_quantity: l.reserved_quantity,
    available_quantity: Number(l.stocked_quantity) - Number(l.reserved_quantity),
    incoming_quantity: l.incoming_quantity,
  }
}

async function runLevelBatch(input: {
  create?: { inventory_item_id?: string; location_id: string; stocked_quantity?: number; incoming_quantity?: number }[]
  update?: { inventory_item_id?: string; location_id: string; stocked_quantity?: number; incoming_quantity?: number }[]
  delete?: string[]
  force?: boolean
  defaultItemId?: string
}) {
  const created: any[] = []
  const updated: any[] = []
  for (const c of input.create ?? []) {
    const itemId = c.inventory_item_id ?? input.defaultItemId
    if (!itemId) {
      throw Object.assign(new Error("create entries require inventory_item_id"), { statusCode: 400 })
    }
    const item = await pool.query(`SELECT id FROM inventory_item WHERE id=$1 AND deleted_at IS NULL`, [itemId])
    if (!item.rows[0]) {
      throw notFound(`Inventory item with id ${itemId} was not found`)
    }
    const { row, created: wasCreated } = await applyLevelUpsert(itemId, c)
    ;(wasCreated ? created : updated).push(toLevelDto(row))
  }
  for (const u of input.update ?? []) {
    const itemId = u.inventory_item_id ?? input.defaultItemId
    if (!itemId) {
      throw Object.assign(new Error("update entries require inventory_item_id"), { statusCode: 400 })
    }
    const { row } = await applyLevelUpsert(itemId, u)
    updated.push(toLevelDto(row))
  }
  const deleted: string[] = []
  for (const ref of input.delete ?? []) {
    const parsed = parseLevelRef(ref, input.defaultItemId)
    const lvl = await pool.query(`SELECT * FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [parsed.inventory_item_id, parsed.location_id])
    if (!lvl.rows[0]) {
      if (input.force) {
        continue
      }
      throw notFound(`Inventory level for item ${parsed.inventory_item_id} at location ${parsed.location_id} was not found`)
    }
    if (Number(lvl.rows[0].reserved_quantity) > 0 && !input.force) {
      throw Object.assign(new Error(`Cannot remove inventory level for item ${parsed.inventory_item_id} at location ${parsed.location_id} because there are reservations at location`), { statusCode: 400 })
    }
    await pool.query(`DELETE FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [parsed.inventory_item_id, parsed.location_id])
    deleted.push(levelRefId(parsed.inventory_item_id, parsed.location_id))
  }
  return { created, updated, deleted }
}

// ---------------------------------------------------------------------------
// Inventory items
// ---------------------------------------------------------------------------

fulfillmentCompatRouter.post("/admin/inventory-items/export", requireAuth, async (req, res, next) => {
  try {
    const items = await pool.query(`SELECT * FROM inventory_item WHERE deleted_at IS NULL ORDER BY created_at`)
    const levels = await pool.query(
      `SELECT l.*, s.name AS location_name FROM inventory_level_location l LEFT JOIN stock_location s ON s.id=l.location_id ORDER BY l.inventory_item_id, l.location_id`
    )
    const byItem = new Map<string, any[]>()
    for (const l of levels.rows) {
      const arr = byItem.get(l.inventory_item_id) ?? []
      arr.push(l)
      byItem.set(l.inventory_item_id, arr)
    }
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = ["inventory_item_id,sku,location_id,location_name,stocked_quantity,reserved_quantity,incoming_quantity"]
    for (const item of items.rows) {
      const itemLevels = byItem.get(item.id) ?? []
      if (itemLevels.length === 0) {
        lines.push([item.id, item.sku ?? "", "", "", 0, 0, 0].map(escape).join(","))
      }
      for (const l of itemLevels) {
        lines.push([item.id, item.sku ?? "", l.location_id, l.location_name ?? "", l.stocked_quantity, l.reserved_quantity, l.incoming_quantity].map(escape).join(","))
      }
    }
    const file = await fileService.upload({
      filename: `inventory-export-${Date.now()}.csv`,
      content_base64: Buffer.from(lines.join("\n"), "utf8").toString("base64"),
      mime_type: "text/csv",
    })
    res.status(202).json({ transaction_id: file.id })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.post("/admin/inventory-items/location-levels/batch", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        create: z.array(levelInput.merge(z.object({ inventory_item_id: z.string() }))).optional(),
        update: z.array(levelInput.merge(z.object({ inventory_item_id: z.string() }))).optional(),
        delete: z.array(z.string()).optional(),
        force: z.boolean().optional(),
      })
      .parse(req.body)
    res.json(await runLevelBatch(body))
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.get("/admin/inventory-items", requireAuth, async (req, res, next) => {
  try {
    const lq = buildListQuery({
      base: "i.deleted_at IS NULL",
      query: req.query,
      specs: INVENTORY_ITEM_FILTERS,
      q: { columns: INVENTORY_ITEM_Q_COLUMNS },
      order: INVENTORY_ITEM_SORT,
      defaultOrder: "i.created_at DESC",
    })
    // location_id is not an inventory_item column: resolve it through the
    // inventory_level_location pivot with a bound param.
    const locations = queryList(req.query.location_id)
    const extra =
      locations.length > 0
        ? {
            sql: `EXISTS (SELECT 1 FROM inventory_level_location ill WHERE ill.inventory_item_id = i.id AND ill.location_id = ANY($${lq.params.length + 1}))`,
            params: [locations],
          }
        : null
    const params = extra ? [...lq.params, ...extra.params] : lq.params
    const conditions = [lq.where.replace(/^WHERE\s+/i, ""), extra?.sql ?? ""].filter((c) => c.length > 0)
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const from = "FROM inventory_item i"
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c ${from} ${where}`, params)
    const { rows } = await pool.query(
      `SELECT i.* ${from} ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lq.limit, lq.offset]
    )
    const inventory_items = []
    for (const r of rows) {
      inventory_items.push(await hydrateInventoryItem(r.id))
    }
    sendList(res, { inventory_items, count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.get("/admin/inventory-items/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ inventory_item: await hydrateInventoryItem(req.params.id) })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.post("/admin/inventory-items/:id", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        sku: z.string().nullish(),
        title: z.string().nullish(),
        description: z.string().nullish(),
        weight: z.number().nonnegative().nullish(),
        length: z.number().nonnegative().nullish(),
        height: z.number().nonnegative().nullish(),
        width: z.number().nonnegative().nullish(),
        mid_code: z.string().nullish(),
        material: z.string().nullish(),
        origin_country: z.string().nullish(),
        hs_code: z.string().nullish(),
        requires_shipping: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(req.body)
    const existing = await pool.query(`SELECT * FROM inventory_item WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!existing.rows[0]) {
      throw notFound(`Inventory item with id ${req.params.id} was not found`)
    }
    // Only the keys present in the body are written, so an explicit null clears a field
    // (COALESCE would silently keep the old value).
    const sets: string[] = []
    const values: unknown[] = []
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue
      if ((key === "requires_shipping") && value === null) continue
      values.push(key === "metadata" && value !== null ? JSON.stringify(value) : value)
      sets.push(`${key} = $${values.length}`)
    }
    if (sets.length > 0) {
      values.push(req.params.id)
      await pool.query(`UPDATE inventory_item SET ${sets.join(", ")} WHERE id = $${values.length}`, values)
    }
    res.json({ inventory_item: await hydrateInventoryItem(req.params.id) })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.delete("/admin/inventory-items/:id", requireAuth, async (req, res, next) => {
  try {
    const r = await pool.query(`UPDATE inventory_item SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (r.rowCount === 0) {
      throw notFound(`Inventory item with id ${req.params.id} was not found`)
    }
    res.json({ id: req.params.id, object: "inventory_item", deleted: true })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.get("/admin/inventory-items/:id/location-levels", requireAuth, async (req, res, next) => {
  try {
    const item = await pool.query(`SELECT id FROM inventory_item WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!item.rows[0]) {
      throw notFound(`Inventory item with id ${req.params.id} was not found`)
    }
    const lq = buildListQuery({
      base: "TRUE",
      query: req.query,
      specs: INVENTORY_LEVEL_FILTERS,
      q: { columns: INVENTORY_LEVEL_Q_COLUMNS },
      order: INVENTORY_LEVEL_SORT,
      defaultOrder: "l.location_id ASC",
    })
    // the owning item is pinned by the path, so it is appended as a bound param
    const params = [...lq.params, req.params.id]
    const where = `WHERE l.inventory_item_id = $${params.length}${lq.where ? ` AND ${lq.where.replace(/^WHERE\s+/i, "")}` : ""}`
    const from = "FROM inventory_level_location l"
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c ${from} ${where}`, params)
    const { rows } = await pool.query(
      `SELECT l.* ${from} ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lq.limit, lq.offset]
    )
    sendList(res, { inventory_levels: rows.map(toLevelDto), count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.post("/admin/inventory-items/:id/location-levels/batch", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        create: z.array(levelInput).optional(),
        update: z.array(levelInput).optional(),
        delete: z.array(z.string()).optional(),
        force: z.boolean().optional(),
      })
      .parse(req.body)
    const item = await pool.query(`SELECT id FROM inventory_item WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!item.rows[0]) {
      throw notFound(`Inventory item with id ${req.params.id} was not found`)
    }
    res.json(await runLevelBatch({ ...body, defaultItemId: req.params.id }))
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.post("/admin/inventory-items/:id/location-levels/:locationId", requireAuth, async (req, res, next) => {
  try {
    const body = z.object({ stocked_quantity: z.number().int().nonnegative().optional(), incoming_quantity: z.number().int().nonnegative().optional() }).parse(req.body)
    const item = await pool.query(`SELECT id FROM inventory_item WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!item.rows[0]) {
      throw notFound(`Inventory item with id ${req.params.id} was not found`)
    }
    await applyLevelUpsert(req.params.id, { location_id: req.params.locationId, ...body })
    res.json({ inventory_item: await hydrateInventoryItem(req.params.id) })
  } catch (e) {
    next(e)
  }
})

fulfillmentCompatRouter.delete("/admin/inventory-items/:id/location-levels/:locationId", requireAuth, async (req, res, next) => {
  try {
    const lvl = await pool.query(`SELECT * FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [req.params.id, req.params.locationId])
    if (!lvl.rows[0]) {
      throw notFound(`Inventory level for item ${req.params.id} at location ${req.params.locationId} was not found`)
    }
    if (Number(lvl.rows[0].reserved_quantity) > 0) {
      throw Object.assign(new Error(`Cannot remove inventory level for item ${req.params.id} at location ${req.params.locationId} because there are reservations at location`), { statusCode: 400 })
    }
    await pool.query(`DELETE FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [req.params.id, req.params.locationId])
    res.json({
      id: levelRefId(req.params.id, req.params.locationId),
      object: "inventory-level",
      deleted: true,
      parent: await hydrateInventoryItem(req.params.id),
    })
