import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import { SALES_CHANNEL_FILTERS, SALES_CHANNEL_Q_COLUMNS, SALES_CHANNEL_SORT, STOCK_LOCATION_FILTERS, STOCK_LOCATION_Q_COLUMNS, STOCK_LOCATION_SORT } from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { locationInventoryService } from "../inventory/location-inventory.service"

// Port of Lupus admin sales-channel / stock-location / inventory / reservation endpoints
// (modules/sales-channel, stock-location, inventory + link module).
export const channelLocationRouter = Router()

channelLocationRouter.post("/admin/sales-channels", requireAuth, async (req, res, next) => {
  try {
    const { name, description, is_disabled, metadata } = z
      .object({ name: z.string().trim().min(1), description: z.string().nullish(), is_disabled: z.boolean().optional(), metadata: z.record(z.string(), z.unknown()).nullish() })
      .parse(req.body)
    const { rows } = await pool.query(`INSERT INTO sales_channel (name, description, is_disabled, metadata) VALUES ($1,$2,COALESCE($3,FALSE),$4) RETURNING *`, [
      name,
      description ?? null,
      is_disabled ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ])
    res.status(201).json({ sales_channel: rows[0] })
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.get("/admin/sales-channels", requireAuth, async (req, res, next) => {
  try {
    const { body } = await runList({
      req,
      table: "sales_channel",
      alias: "s",
      select: "s.*",
      base: "s.deleted_at IS NULL",
      specs: SALES_CHANNEL_FILTERS,
      q: { columns: SALES_CHANNEL_Q_COLUMNS },
      order: SALES_CHANNEL_SORT,
      defaultOrder: "s.created_at DESC",
      key: "sales_channels",
    })
    sendList(res, body)
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.post("/admin/sales-channels/:id/products", requireAuth, async (req, res, next) => {
  try {
    // Lupus body is { add, remove }; { product_ids } is the older add-only form
    const input = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional(), product_ids: z.array(z.string()).optional() }).parse(req.body ?? {})
    const channel = await pool.query(`SELECT id FROM sales_channel WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!channel.rows[0]) {
      throw Object.assign(new Error(`Sales channel with id ${req.params.id} was not found`), { statusCode: 404 })
    }
    const add = [...new Set([...(input.add ?? []), ...(input.product_ids ?? [])])]
    const remove = input.remove ?? []
    if (add.length > 0) {
      const found = await pool.query(`SELECT id FROM product WHERE id = ANY($1) AND deleted_at IS NULL`, [add])
      const missing = add.filter((id) => !found.rows.some((r: any) => r.id === id))
      if (missing.length > 0) {
        throw Object.assign(new Error(`Product with id ${missing[0]} was not found`), { statusCode: 404 })
      }
    }
    for (const pid of add) {
      await pool.query(`INSERT INTO product_sales_channel (product_id, sales_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pid, req.params.id])
    }
    if (remove.length > 0) {
      await pool.query(`DELETE FROM product_sales_channel WHERE sales_channel_id=$1 AND product_id = ANY($2)`, [req.params.id, remove])
    }
    const { rows } = await pool.query(`SELECT * FROM sales_channel WHERE id=$1`, [req.params.id])
    res.json({ sales_channel: rows[0], sales_channel_id: req.params.id, added: add.length })
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.get("/admin/products/:id/sales-channels", requireAuth, async (req, res, next) => {
  try {
    const p = await pool.query(`SELECT id FROM product WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!p.rows[0]) {
      res.status(404).json({ message: "Product not found" })
      return
    }
    const { rows } = await pool.query(
      `SELECT s.* FROM product_sales_channel psc JOIN sales_channel s ON s.id = psc.sales_channel_id AND s.deleted_at IS NULL
       WHERE psc.product_id = $1 ORDER BY s.created_at`,
      [req.params.id]
    )
    res.json({ sales_channels: rows, count: rows.length, offset: 0, limit: rows.length })
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.post("/admin/inventory-items", requireAuth, async (req, res, next) => {
  try {
    const { sku, title, description, weight, length, height, width, mid_code, material, origin_country, hs_code, requires_shipping, metadata, levels } = z.object({
      sku: z.string().optional(),
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
      levels: z.array(z.object({ location_id: z.string(), stocked_quantity: z.number().int().nonnegative() })).optional(),
    }).parse(req.body)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const it = await client.query(
        `INSERT INTO inventory_item (sku, title, description, weight, length, height, width, mid_code, material, origin_country, hs_code, requires_shipping, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,TRUE),$13) RETURNING *`,
        [sku ?? null, title ?? null, description ?? null, weight ?? null, length ?? null, height ?? null, width ?? null, mid_code ?? null, material ?? null, origin_country ?? null, hs_code ?? null, requires_shipping ?? null, metadata ? JSON.stringify(metadata) : null]
      )
      for (const l of levels ?? []) {
        const loc = await client.query(`SELECT 1 FROM stock_location WHERE id = $1 AND deleted_at IS NULL`, [l.location_id])
        if (!loc.rows[0]) {
          throw Object.assign(new Error(`Stock location not found: ${l.location_id}`), { statusCode: 404 })
        }
        await client.query(`INSERT INTO inventory_level_location (inventory_item_id, location_id, stocked_quantity) VALUES ($1,$2,$3) ON CONFLICT (inventory_item_id, location_id) DO UPDATE SET stocked_quantity=$3`, [
          it.rows[0].id,
          l.location_id,
          l.stocked_quantity,
        ])
      }
      await client.query("COMMIT")
      res.status(201).json({ inventory_item: it.rows[0] })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.post("/admin/inventory-items/:id/link-variant", requireAuth, async (req, res, next) => {
  try {
    const { variant_id, required_quantity } = z.object({ variant_id: z.string(), required_quantity: z.number().int().positive().optional() }).parse(req.body)
    await pool.query(`INSERT INTO variant_inventory_item (variant_id, inventory_item_id, required_quantity) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [
      variant_id,
      req.params.id,
      required_quantity ?? 1,
    ])
    res.json({ linked: true })
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.post("/admin/reservations", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ inventory_item_id: z.string(), location_id: z.string(), line_item_id: z.string().optional(), quantity: z.number().int().positive(), allow_backorder: z.boolean().optional(), description: z.string().optional() }).parse(req.body)
    res.status(201).json({ reservation: await locationInventoryService.reserve(input) })
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.post("/admin/reservations/:id/fulfill", requireAuth, async (req, res, next) => {
  try {
    await locationInventoryService.fulfillReservation(req.params.id)
    res.json({ id: req.params.id, fulfilled: true })
  } catch (e) {
    next(e)
  }
})

channelLocationRouter.get("/store/sales-channels", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM sales_channel WHERE deleted_at IS NULL AND is_disabled=FALSE ORDER BY created_at DESC`)
    res.json({ sales_channels: rows })
  } catch (e) {
    next(e)
  }
})
