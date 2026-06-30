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
