import { pool } from "../../db"

// Port of Lupus inventory + reservation + stock-location/SalesChannel link logic
// (modules/inventory, modules/stock-location, linkSalesChannelsToStockLocation workflow,
// confirm-variant-inventory with location granularity, create-reservations on checkout).
// Availability is computed per location: stocked - reserved. allow_backorder bypasses the check.
// Legacy single-location inventory_level rows are summed as fallback when no location levels exist.
export class LocationInventoryService {
  async availableForVariant(variantId: string, locationId?: string): Promise<number> {
    const links = await pool.query(`SELECT inventory_item_id, required_quantity FROM variant_inventory_item WHERE variant_id=$1`, [variantId])
    if (links.rows.length === 0) {
      const legacy = await pool.query(`SELECT stocked_quantity, reserved_quantity FROM inventory_level WHERE variant_id=$1`, [variantId])
      if (legacy.rows.length === 0) {
        return Number.MAX_SAFE_INTEGER // untracked = unlimited
      }
      return legacy.rows[0].stocked_quantity - legacy.rows[0].reserved_quantity
    }
    let minAvail = Number.MAX_SAFE_INTEGER
    for (const l of links.rows) {
      const loc = locationId
        ? await pool.query(`SELECT stocked_quantity, reserved_quantity FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [l.inventory_item_id, locationId])
        : await pool.query(
            `SELECT COALESCE(SUM(stocked_quantity),0)::int AS s, COALESCE(SUM(reserved_quantity),0)::int AS r FROM inventory_level_location WHERE inventory_item_id=$1`,
            [l.inventory_item_id]
          )
      const row = loc.rows[0]
      const avail = row ? (Number(row.stocked_quantity ?? row.s) - Number(row.reserved_quantity ?? row.r)) / l.required_quantity : 0
      minAvail = Math.min(minAvail, Math.floor(avail))
    }
    return minAvail
  }

  async reserve(input: { inventory_item_id: string; location_id: string; line_item_id?: string; quantity: number; allow_backorder?: boolean; description?: string }) {
    if (!input.allow_backorder) {
      const lvl = await pool.query(`SELECT stocked_quantity, reserved_quantity FROM inventory_level_location WHERE inventory_item_id=$1 AND location_id=$2`, [
        input.inventory_item_id,
        input.location_id,
      ])
      const avail = lvl.rows[0] ? lvl.rows[0].stocked_quantity - lvl.rows[0].reserved_quantity : 0
      if (avail < input.quantity) {
        throw Object.assign(new Error(`Insufficient stock at location (available ${avail})`), { statusCode: 400 })
      }
      await pool.query(`UPDATE inventory_level_location SET reserved_quantity = reserved_quantity + $3 WHERE inventory_item_id=$1 AND location_id=$2`, [
        input.inventory_item_id,
        input.location_id,
        input.quantity,
      ])
    }
    const { rows } = await pool.query(
      `INSERT INTO reservation_item (inventory_item_id, location_id, line_item_id, quantity, allow_backorder, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [input.inventory_item_id, input.location_id, input.line_item_id ?? null, input.quantity, input.allow_backorder ?? false, input.description ?? null]
    )
    return rows[0]
  }

  async fulfillReservation(reservationId: string) {
    const r = await pool.query(`SELECT * FROM reservation_item WHERE id=$1 AND deleted_at IS NULL`, [reservationId])
    if (!r.rows[0]) {
      throw Object.assign(new Error("Reservation not found"), { statusCode: 404 })
    }
    await pool.query(`UPDATE inventory_level_location SET stocked_quantity = stocked_quantity - $3, reserved_quantity = reserved_quantity - $3 WHERE inventory_item_id=$1 AND location_id=$2`, [
      r.rows[0].inventory_item_id,
      r.rows[0].location_id,
      r.rows[0].quantity,
    ])
    await pool.query(`UPDATE reservation_item SET deleted_at=NOW() WHERE id=$1`, [reservationId])
  }
}

export const locationInventoryService = new LocationInventoryService()
