import { pool } from "../../db"
import { locationInventoryService } from "./location-inventory.service"

// Port of Lupus confirm-variant-inventory workflow step + reservation logic (simplified to
// single-location levels; Lupus: stock_location + inventory_item + reservation per location).
// available = stocked - reserved. addItem path reserves implicitly by checking; checkout
// decrements stocked (like Lupus's create-reservations on complete-cart).
export class InventoryService {
  async ensureAvailable(variantId: string, quantity: number): Promise<void> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw Object.assign(new Error("Quantity must be a positive integer"), { statusCode: 400 })
    }
    const variant = await pool.query(`SELECT manage_inventory, allow_backorder FROM product_variant WHERE id=$1 AND deleted_at IS NULL`, [variantId])
    if (!variant.rows[0]?.manage_inventory || variant.rows[0]?.allow_backorder) return

    const available = await locationInventoryService.availableForVariant(variantId)
    if (available === Number.MAX_SAFE_INTEGER) return
    if (available < quantity) {
      throw Object.assign(new Error(`Insufficient stock: only ${available} available`), { statusCode: 400 })
    }
  }

  async decrement(variantId: string, quantity: number): Promise<void> {
    const res = await pool.query(
      `UPDATE inventory_level SET stocked_quantity = stocked_quantity - $2 WHERE variant_id=$1 AND stocked_quantity >= $2`,
      [variantId, quantity]
    )
    if (res.rowCount === 0) {
      const cur = await pool.query(`SELECT 1 FROM inventory_level WHERE variant_id=$1`, [variantId])
      if (cur.rows.length > 0) {
        throw Object.assign(new Error("Insufficient stock at checkout"), { statusCode: 400 })
      }
    }
  }
}

export const inventoryService = new InventoryService()
