import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"

// Lupus's "Edit metadata" drawers post `{ metadata }` (and nothing else) to the entity's update route.
// This router answers exactly those requests for every entity that has a metadata column; any other
// body falls through to the entity's own update handler.
export const entityMetadataRouter = Router()

const ENTITIES: { path: string; table: string; key: string; label: string }[] = [
  { path: "orders", table: '"order"', key: "order", label: "Order" },
  { path: "customers", table: "customer", key: "customer", label: "Customer" },
  { path: "customer-groups", table: "customer_group", key: "customer_group", label: "Customer group" },
  { path: "collections", table: "product_collection", key: "collection", label: "Collection" },
  { path: "product-categories", table: "product_category", key: "product_category", label: "Product category" },
  { path: "product-options", table: "product_option", key: "product_option", label: "Product option" },
  { path: "inventory-items", table: "inventory_item", key: "inventory_item", label: "Inventory item" },
  { path: "reservations", table: "reservation_item", key: "reservation", label: "Reservation" },
  { path: "promotions", table: "promotion", key: "promotion", label: "Promotion" },
  { path: "campaigns", table: "campaign", key: "campaign", label: "Campaign" },
]

const columnCache = new Map<string, boolean>()
async function hasColumn(table: string, column: string) {
  const name = table.replace(/"/g, "")
  const cacheKey = `${name}.${column}`
  if (!columnCache.has(cacheKey)) {
    const r = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [name, column])
    columnCache.set(cacheKey, !!r.rows[0])
  }
  return columnCache.get(cacheKey)!
}

const body = z.object({ metadata: z.record(z.string(), z.unknown()).nullable() }).strict()

for (const entity of ENTITIES) {
  entityMetadataRouter.post(`/admin/${entity.path}/:id`, requireAuth, async (req, res, next) => {
    try {
      const keys = Object.keys(req.body ?? {})
      if (keys.length !== 1 || keys[0] !== "metadata") {
        next()
        return
      }
      const { metadata } = body.parse(req.body)
      const live = (await hasColumn(entity.table, "deleted_at")) ? "AND deleted_at IS NULL" : ""
      const touched = (await hasColumn(entity.table, "updated_at")) ? ", updated_at = NOW()" : ""
      const { rows } = await pool.query(`UPDATE ${entity.table} SET metadata = $2${touched} WHERE id = $1 ${live} RETURNING *`, [req.params.id, metadata ? JSON.stringify(metadata) : null])
      if (!rows[0]) {
        throw Object.assign(new Error(`${entity.label} with id: ${req.params.id} was not found`), { statusCode: 404 })
      }
      res.json({ [entity.key]: rows[0] })
    } catch (e) {
      next(e)
    }
  })
}
