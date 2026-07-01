import { pool } from "../../db"

// Port of Lupus confirm-variant-inventory workflow step + reservation logic (simplified to
// single-location levels; Lupus: stock_location + inventory_item + reservation per location).
// available = stocked - reserved. addItem path reserves implicitly by checking; checkout
// decrements stocked (like Lupus's create-reservations on complete-cart).
export class InventoryService {
  async ensureAvailable(variantId: string, quantity: number): Promise<void> {
    const { rows } = await pool.query(`SELECT stocked_quantity, reserved_quantity FROM inventory_level WHERE variant_id=$1`, [
      variantId,
    ])
    if (rows.length === 0) {
      return // untracked variant = unlimited (matches Lupus when no inventory item linked)
    }
    const available = rows[0].stocked_quantity - rows[0].reserved_quantity
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
