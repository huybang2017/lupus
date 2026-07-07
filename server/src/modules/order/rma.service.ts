import { pool } from "../../db"

// Port of Lupus RMA lifecycles (returns/claims/exchanges workflows):
// request -> confirm -> receive (partial/full, damaged tracked, good units restocked)
// -> refund via payment_collection. Claims add an outbound replacement leg fulfilled
// through fulfillment; exchanges have inbound + outbound legs. Dismiss removes items.
export class RmaService {
  // ---------- returns ----------
  async createReturn(orderId: string, items: { line_item_id: string; quantity: number; reason_id?: string }[], createdBy?: string) {
    const o = await pool.query(`SELECT id FROM "order" WHERE id=$1 AND deleted_at IS NULL`, [orderId])
    if (!o.rows[0]) throw Object.assign(new Error("Order not found"), { statusCode: 404 })
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const r = await client.query(`INSERT INTO return_request (order_id, created_by) VALUES ($1,$2) RETURNING *`, [orderId, createdBy ?? null])
      for (const it of items) {
        const line = await client.query(`SELECT quantity FROM order_line_item WHERE id=$1`, [it.line_item_id])
        if (!line.rows[0]) throw Object.assign(new Error(`Order line ${it.line_item_id} not found`), { statusCode: 404 })
        if (it.quantity > line.rows[0].quantity) throw Object.assign(new Error("Return qty exceeds ordered qty"), { statusCode: 400 })
        await client.query(`INSERT INTO return_item (return_id, line_item_id, quantity, reason_id) VALUES ($1,$2,$3,$4)`, [r.rows[0].id, it.line_item_id, it.quantity, it.reason_id ?? null])
      }
      await client.query("COMMIT")
      return r.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async confirmReturn(id: string) {
    const r = await pool.query(`UPDATE return_request SET status='confirmed', updated_at=NOW() WHERE id=$1 AND status='requested' RETURNING *`, [id])
    if (!r.rows[0]) throw Object.assign(new Error("Return is not confirmable"), { statusCode: 400 })
    return r.rows[0]
  }

  async receiveReturn(id: string, items: { item_id: string; received_quantity: number; damaged_quantity?: number }[]) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ret = await client.query(`SELECT * FROM return_request WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])
      if (!ret.rows[0] || !["confirmed", "partially_received"].includes(ret.rows[0].status)) {
        throw Object.assign(new Error("Return is not receivable"), { statusCode: 400 })
      }
      for (const it of items) {
        const cur = await client.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [it.item_id, id])
        if (!cur.rows[0] || cur.rows[0].dismissed) throw Object.assign(new Error(`Return item ${it.item_id} not found`), { statusCode: 404 })
        const recv = Math.min(it.received_quantity, cur.rows[0].quantity - cur.rows[0].received_quantity)
        const dmg = Math.min(it.damaged_quantity ?? 0, recv)
        await client.query(`UPDATE return_item SET received_quantity = received_quantity + $2, damaged_quantity = damaged_quantity + $3 WHERE id=$1`, [it.item_id, recv, dmg])
        // restock good units to legacy inventory_level (variant resolved via order line)
        const line = await client.query(`SELECT variant_id, unit_price FROM order_line_item WHERE id=$1`, [cur.rows[0].line_item_id])
        const good = recv - dmg
        if (good > 0 && line.rows[0]?.variant_id) {
          await client.query(`INSERT INTO inventory_level (variant_id, stocked_quantity) VALUES ($1,$2) ON CONFLICT (variant_id) DO UPDATE SET stocked_quantity = inventory_level.stocked_quantity + $2`, [line.rows[0].variant_id, good])
        }
      }
      const agg = await client.query(`SELECT COALESCE(SUM(quantity),0)::int AS q, COALESCE(SUM(received_quantity),0)::int AS r FROM return_item WHERE return_id=$1 AND dismissed=FALSE`, [id])
      const status = Number(agg.rows[0].r) >= Number(agg.rows[0].q) ? "received" : "partially_received"
      await client.query(`UPDATE return_request SET status=$2, updated_at=NOW() WHERE id=$1`, [id, status])
      await client.query("COMMIT")
      return { id, status }
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async refundReturn(id: string, amount?: number) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const ret = await client.query(`SELECT * FROM return_request WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])
      if (!ret.rows[0] || !["confirmed", "partially_received", "received"].includes(ret.rows[0].status)) {
        throw Object.assign(new Error("Return is not refundable"), { statusCode: 400 })
      }
      const items = await client.query(
        `SELECT ri.quantity, oli.unit_price FROM return_item ri JOIN order_line_item oli ON oli.id = ri.line_item_id WHERE ri.return_id=$1 AND ri.dismissed=FALSE`,
        [id]
      )
      const maxRefund = items.rows.reduce((s: number, r: any) => s + r.quantity * Number(r.unit_price), 0)
      const refund = amount ?? maxRefund
      if (refund > maxRefund) throw Object.assign(new Error("Refund exceeds return value"), { statusCode: 400 })
      const order = await client.query(`SELECT payment_collection_id FROM "order" WHERE id=$1`, [ret.rows[0].order_id])
      if (order.rows[0]?.payment_collection_id) {
        await client.query(`UPDATE payment_collection SET refunded_amount = refunded_amount + $2 WHERE id=$1`, [order.rows[0].payment_collection_id, refund])
        await client.query(`UPDATE payment SET status='refunded' WHERE payment_collection_id=$1 AND status IN ('captured','authorized')`, [order.rows[0].payment_collection_id])
      }
      await client.query(`UPDATE return_request SET refund_amount=$2, refunded=TRUE, updated_at=NOW() WHERE id=$1`, [id, refund])
      await client.query("COMMIT")
      return { id, refunded: refund }
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async dismissReturnItem(itemId: string) {
    await pool.query(`UPDATE return_item SET dismissed=TRUE WHERE id=$1`, [itemId])
  }

  async cancelReturn(id: string) {
    const r = await pool.query(`UPDATE return_request SET status='canceled', updated_at=NOW() WHERE id=$1 AND status IN ('requested','confirmed')`, [id])
    if (r.rowCount === 0) throw Object.assign(new Error("Return is not cancelable"), { statusCode: 400 })
  }

  async listReturns(orderId?: string) {
    const { rows } = await pool.query(
      `SELECT * FROM return_request WHERE deleted_at IS NULL ${orderId ? "AND order_id=$1" : ""} ORDER BY created_at DESC`,
      orderId ? [orderId] : []
    )
    return rows
  }

  // ---------- claims (inbound damaged leg + outbound replacement leg) ----------
  async createClaim(orderId: string, type: "refund" | "replace", inbound: { line_item_id: string; quantity: number; reason_id?: string }[], outbound: { variant_id: string; title?: string; quantity: number; unit_price?: number }[], createdBy?: string) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const c = await client.query(`INSERT INTO claim (order_id, type, created_by) VALUES ($1,$2,$3) RETURNING *`, [orderId, type, createdBy ?? null])
      for (const it of inbound) {
        await client.query(`INSERT INTO claim_item (claim_id, direction, line_item_id, quantity) VALUES ($1,'inbound',$2,$3)`, [c.rows[0].id, it.line_item_id, it.quantity])
      }
      for (const it of outbound) {
        if (type !== "replace") throw Object.assign(new Error("Outbound items require type=replace"), { statusCode: 400 })
        await client.query(`INSERT INTO claim_item (claim_id, direction, variant_id, title, quantity, unit_price) VALUES ($1,'outbound',$2,$3,$4,$5)`, [c.rows[0].id, it.variant_id, it.title ?? "Replacement", it.quantity, it.unit_price ?? 0])
      }
      await client.query("COMMIT")
      return c.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async confirmClaim(id: string) {
    const r = await pool.query(`UPDATE claim SET status='confirmed' WHERE id=$1 AND status='requested' RETURNING *`, [id])
    if (!r.rows[0]) throw Object.assign(new Error("Claim is not confirmable"), { statusCode: 400 })
    return r.rows[0]
  }

  async receiveClaimInbound(id: string, items: { item_id: string; received_quantity: number }[]) {
    for (const it of items) {
      await pool.query(`UPDATE claim_item SET received_quantity = received_quantity + $2 WHERE id=$1 AND claim_id=$3 AND direction='inbound'`, [it.item_id, it.received_quantity, id])
    }
    await pool.query(`UPDATE claim SET status='received' WHERE id=$1 AND status='confirmed'`, [id])
  }

  async cancelClaim(id: string) {
    const r = await pool.query(`UPDATE claim SET status='canceled' WHERE id=$1 AND status IN ('requested','confirmed')`, [id])
    if (r.rowCount === 0) throw Object.assign(new Error("Claim is not cancelable"), { statusCode: 400 })
  }

  // ---------- exchanges (inbound return leg + outbound new-items leg) ----------
  async createExchange(orderId: string, inbound: { line_item_id: string; quantity: number }[], outbound: { variant_id: string; title?: string; quantity: number; unit_price?: number }[], createdBy?: string) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const e = await client.query(`INSERT INTO exchange (order_id, created_by) VALUES ($1,$2) RETURNING *`, [orderId, createdBy ?? null])
      for (const it of inbound) {
        await client.query(`INSERT INTO exchange_item (exchange_id, direction, line_item_id, quantity) VALUES ($1,'inbound',$2,$3)`, [e.rows[0].id, it.line_item_id, it.quantity])
      }
      for (const it of outbound) {
        await client.query(`INSERT INTO exchange_item (exchange_id, direction, variant_id, title, quantity, unit_price) VALUES ($1,'outbound',$2,$3,$4,$5)`, [e.rows[0].id, it.variant_id, it.title ?? "Exchange item", it.quantity, it.unit_price ?? 0])
      }
      await client.query("COMMIT")
      return e.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async confirmExchange(id: string) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const e = await client.query(`SELECT * FROM exchange WHERE id=$1 AND status='requested' FOR UPDATE`, [id])
      if (!e.rows[0]) throw Object.assign(new Error("Exchange is not confirmable"), { statusCode: 400 })
      const out = await client.query(`SELECT * FROM exchange_item WHERE exchange_id=$1 AND direction='outbound' AND dismissed=FALSE`, [id])
      for (const it of out.rows) {
        await client.query(`INSERT INTO order_line_item (order_id, variant_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)`, [e.rows[0].order_id, it.variant_id, it.title, it.quantity, it.unit_price])
      }
      await client.query(`UPDATE exchange SET status='confirmed' WHERE id=$1`, [id])
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async cancelExchange(id: string) {
    const r = await pool.query(`UPDATE exchange SET status='canceled' WHERE id=$1 AND status IN ('requested','confirmed')`, [id])
    if (r.rowCount === 0) throw Object.assign(new Error("Exchange is not cancelable"), { statusCode: 400 })
  }

  async dismissExchangeItem(itemId: string) {
    await pool.query(`UPDATE exchange_item SET dismissed=TRUE WHERE id=$1`, [itemId])
  }

  // ---------- Lupus-compat: action-based sub-resources ----------
  // Lupus's dashboard drives claims/exchanges/returns through fine-grained
  // order-change actions (claim-items/inbound/outbound/request legs). Lupus has
  // no order_change actions table, so an actionId IS the underlying row id
  // (claim_item / exchange_item / return_item). Shipping methods have no table
  // either, so they are kept in a process-local registry keyed by parent and
  // exposed with synthetic SHIPPING_ADD actions.
  async requireClaim(id: string) {
    const { rows } = await pool.query(`SELECT * FROM claim WHERE id=$1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) throw Object.assign(new Error("Claim not found"), { statusCode: 404 })
    return rows[0]
  }

  async requireExchange(id: string) {
    const { rows } = await pool.query(`SELECT * FROM exchange WHERE id=$1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) throw Object.assign(new Error("Exchange not found"), { statusCode: 404 })
    return rows[0]
  }

  async requireReturnRequest(id: string) {
    const { rows } = await pool.query(`SELECT * FROM return_request WHERE id=$1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) throw Object.assign(new Error("Return not found"), { statusCode: 404 })
    return rows[0]
  }

  assertEditable(row: any, kind: string) {
    if (["canceled", "dismissed"].includes(row.status)) {
      throw Object.assign(new Error(`${kind} is not editable`), { statusCode: 400 })
    }
  }

  // The list endpoints for returns/claims/exchanges are paged + filtered by the
  // shared list-query helper in the route files (rma.routes.ts,
  // lupus-rma-compat.routes.ts), so no list method lives here anymore.

  // Write-off (claim-items) rows share the claim_item table with inbound rows;
  // they are marked via WRITE_OFF_TITLE (masked back to null in views) so the
  // claim detail can separate additional_items from inbound return items.
  static readonly WRITE_OFF_TITLE = "write_off"

  async addClaimItemRow(claimId: string, direction: "inbound" | "outbound", input: { line_item_id?: string; variant_id?: string; title?: string; quantity: number; unit_price?: number; reason_id?: string; writeOff?: boolean }) {
    const claim = await this.requireClaim(claimId)
    this.assertEditable(claim, "Claim")
    if (input.line_item_id) {
      const line = await pool.query(`SELECT id FROM order_line_item WHERE id=$1`, [input.line_item_id])
      if (!line.rows[0]) throw Object.assign(new Error(`Order line ${input.line_item_id} not found`), { statusCode: 404 })
    }
    const title = input.writeOff ? RmaService.WRITE_OFF_TITLE : (input.title ?? null)
    const { rows } = await pool.query(
      `INSERT INTO claim_item (claim_id, direction, line_item_id, variant_id, title, quantity, unit_price, reason_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [claimId, direction, input.line_item_id ?? null, input.variant_id ?? null, title, input.quantity, input.unit_price ?? 0, input.reason_id ?? null]
    )
    return rows[0]
  }

  async updateClaimItemRow(claimId: string, rowId: string, patch: { quantity?: number }, direction?: "inbound" | "outbound") {
    await this.requireClaim(claimId)
    const params: any[] = [rowId, claimId]
    const dir = direction ? ` AND direction=$${params.length + 1}` : ""
    if (direction) params.push(direction)
    const updates: string[] = []
    if (patch.quantity !== undefined) {
      if (patch.quantity <= 0) throw Object.assign(new Error("Quantity must be positive"), { statusCode: 400 })
      updates.push(`quantity=$${params.length + 1}`)
      params.push(patch.quantity)
    }
    if (updates.length > 0) {
      const { rows } = await pool.query(`UPDATE claim_item SET ${updates.join(", ")} WHERE id=$1 AND claim_id=$2${dir} RETURNING *`, params)
      if (!rows[0]) throw Object.assign(new Error("Claim item not found"), { statusCode: 404 })
      return rows[0]
    }
    const { rows } = await pool.query(`SELECT * FROM claim_item WHERE id=$1 AND claim_id=$2${dir}`, params)
    if (!rows[0]) throw Object.assign(new Error("Claim item not found"), { statusCode: 404 })
    return rows[0]
  }

  async removeClaimItemRow(claimId: string, rowId: string, direction?: "inbound" | "outbound") {
    await this.requireClaim(claimId)
    const params: any[] = [rowId, claimId]
    if (direction) params.push(direction)
    const dir = direction ? ` AND direction=$3` : ""
    const { rows } = await pool.query(`DELETE FROM claim_item WHERE id=$1 AND claim_id=$2${dir} RETURNING *`, params)
    if (!rows[0]) throw Object.assign(new Error("Claim item not found"), { statusCode: 404 })
    return rows[0]
  }

  async addExchangeItemRow(exchangeId: string, direction: "inbound" | "outbound", input: { line_item_id?: string; variant_id?: string; title?: string; quantity: number; unit_price?: number }) {
    const exchange = await this.requireExchange(exchangeId)
    this.assertEditable(exchange, "Exchange")
    if (input.line_item_id) {
      const line = await pool.query(`SELECT id FROM order_line_item WHERE id=$1`, [input.line_item_id])
      if (!line.rows[0]) throw Object.assign(new Error(`Order line ${input.line_item_id} not found`), { statusCode: 404 })
    }
    const { rows } = await pool.query(
      `INSERT INTO exchange_item (exchange_id, direction, line_item_id, variant_id, title, quantity, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [exchangeId, direction, input.line_item_id ?? null, input.variant_id ?? null, input.title ?? (direction === "outbound" ? "Exchange item" : null), input.quantity, input.unit_price ?? 0]
    )
    return rows[0]
  }

  async updateExchangeItemRow(exchangeId: string, rowId: string, patch: { quantity?: number }, direction?: "inbound" | "outbound") {
    await this.requireExchange(exchangeId)
    if (patch.quantity !== undefined) {
      if (patch.quantity <= 0) throw Object.assign(new Error("Quantity must be positive"), { statusCode: 400 })
      const params: any[] = [patch.quantity, rowId, exchangeId]
      if (direction) params.push(direction)
      const { rows } = await pool.query(`UPDATE exchange_item SET quantity=$1 WHERE id=$2 AND exchange_id=$3${direction ? ` AND direction=$4` : ""} RETURNING *`, params)
      if (!rows[0]) throw Object.assign(new Error("Exchange item not found"), { statusCode: 404 })
      return rows[0]
    }
    const params: any[] = [rowId, exchangeId]
    if (direction) params.push(direction)
    const { rows } = await pool.query(`SELECT * FROM exchange_item WHERE id=$1 AND exchange_id=$2${direction ? ` AND direction=$3` : ""}`, params)
    if (!rows[0]) throw Object.assign(new Error("Exchange item not found"), { statusCode: 404 })
    return rows[0]
  }

  async removeExchangeItemRow(exchangeId: string, rowId: string, direction?: "inbound" | "outbound") {
    await this.requireExchange(exchangeId)
    const params: any[] = [rowId, exchangeId]
    if (direction) params.push(direction)
    const { rows } = await pool.query(`DELETE FROM exchange_item WHERE id=$1 AND exchange_id=$2${direction ? ` AND direction=$3` : ""} RETURNING *`, params)
    if (!rows[0]) throw Object.assign(new Error("Exchange item not found"), { statusCode: 404 })
    return rows[0]
  }

  // ----- return request items / receive / dismiss -----
  async listReturnItems(returnId: string) {
    await this.requireReturnRequest(returnId)
    const { rows } = await pool.query(`SELECT * FROM return_item WHERE return_id=$1 ORDER BY created_at ASC`, [returnId])
    return rows
  }

  async addReturnRequestItem(returnId: string, input: { line_item_id: string; quantity: number; reason_id?: string }) {
    const ret = await this.requireReturnRequest(returnId)
    this.assertEditable(ret, "Return")
    const line = await pool.query(`SELECT quantity FROM order_line_item WHERE id=$1`, [input.line_item_id])
    if (!line.rows[0]) throw Object.assign(new Error(`Order line ${input.line_item_id} not found`), { statusCode: 404 })
    if (input.quantity > line.rows[0].quantity) throw Object.assign(new Error("Return qty exceeds ordered qty"), { statusCode: 400 })
    const { rows } = await pool.query(
      `INSERT INTO return_item (return_id, line_item_id, quantity, reason_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [returnId, input.line_item_id, input.quantity, input.reason_id ?? null]
    )
    return rows[0]
  }

  async updateReturnRequestItem(returnId: string, rowId: string, patch: { quantity?: number }) {
    await this.requireReturnRequest(returnId)
    if (patch.quantity !== undefined) {
      if (patch.quantity <= 0) throw Object.assign(new Error("Quantity must be positive"), { statusCode: 400 })
      const cur = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [rowId, returnId])
      if (!cur.rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
      if (patch.quantity < cur.rows[0].received_quantity) throw Object.assign(new Error("Quantity is below received quantity"), { statusCode: 400 })
      const { rows } = await pool.query(`UPDATE return_item SET quantity=$3 WHERE id=$1 AND return_id=$2 RETURNING *`, [rowId, returnId, patch.quantity])
      return rows[0]
    }
    const { rows } = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [rowId, returnId])
    if (!rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
    return rows[0]
  }

  async removeReturnRequestItem(returnId: string, rowId: string) {
    await this.requireReturnRequest(returnId)
    const cur = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [rowId, returnId])
    if (!cur.rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
    if (Number(cur.rows[0].received_quantity) > 0 || Number(cur.rows[0].damaged_quantity) > 0) {
      const { rows } = await pool.query(`UPDATE return_item SET dismissed=TRUE WHERE id=$1 RETURNING *`, [rowId])
      return { ...rows[0], deleted: false }
    }
    const { rows } = await pool.query(`DELETE FROM return_item WHERE id=$1 RETURNING *`, [rowId])
    return { ...rows[0], deleted: true }
  }

  async resolveReturnItem(returnId: string, ref: string) {
    let { rows } = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2 AND dismissed=FALSE`, [ref, returnId])
    if (!rows[0]) {
      const byLine = await pool.query(`SELECT * FROM return_item WHERE line_item_id=$1 AND return_id=$2 AND dismissed=FALSE ORDER BY created_at ASC LIMIT 1`, [ref, returnId])
      rows = byLine.rows
    }
    if (!rows[0]) throw Object.assign(new Error(`Return item ${ref} not found`), { statusCode: 404 })
    return rows[0]
  }

  async recomputeReturnStatus(returnId: string) {
    const agg = await pool.query(`SELECT COALESCE(SUM(quantity),0)::int AS q, COALESCE(SUM(received_quantity),0)::int AS r FROM return_item WHERE return_id=$1 AND dismissed=FALSE`, [returnId])
    const status = Number(agg.rows[0].r) >= Number(agg.rows[0].q) ? "received" : "partially_received"
    await pool.query(`UPDATE return_request SET status=$2, updated_at=NOW() WHERE id=$1`, [returnId, status])
    return status
  }

  async receiveReturnItems(returnId: string, items: { id: string; quantity: number; damaged_quantity?: number }[]) {
    const ret = await this.requireReturnRequest(returnId)
    if (!["confirmed", "partially_received", "received"].includes(ret.status)) {
      throw Object.assign(new Error("Return is not receivable"), { statusCode: 400 })
    }
    const mapped = []
    for (const it of items) {
      const row = await this.resolveReturnItem(returnId, it.id)
      mapped.push({ item_id: row.id, received_quantity: it.quantity, damaged_quantity: it.damaged_quantity ?? 0 })
    }
    return this.receiveReturn(returnId, mapped)
  }

  async setReturnReceivedQuantity(returnId: string, rowId: string, quantity: number) {
    await this.requireReturnRequest(returnId)
    const cur = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [rowId, returnId])
    if (!cur.rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
    const recv = Math.max(0, Math.min(quantity, cur.rows[0].quantity))
    const dmg = Math.min(cur.rows[0].damaged_quantity, recv)
    const { rows } = await pool.query(`UPDATE return_item SET received_quantity=$3, damaged_quantity=$4 WHERE id=$1 AND return_id=$2 RETURNING *`, [rowId, returnId, recv, dmg])
    await this.recomputeReturnStatus(returnId)
    return rows[0]
  }

  async clearReturnReceived(returnId: string, rowId: string) {
    await this.requireReturnRequest(returnId)
    const cur = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [rowId, returnId])
    if (!cur.rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
    const { rows } = await pool.query(`UPDATE return_item SET received_quantity=damaged_quantity WHERE id=$1 AND return_id=$2 RETURNING *`, [rowId, returnId])
    await this.recomputeReturnStatus(returnId)
    return rows[0]
  }

  async dismissReturnItems(returnId: string, items: { id: string; quantity: number }[]) {
    const ret = await this.requireReturnRequest(returnId)
    if (!["confirmed", "partially_received", "received"].includes(ret.status)) {
      throw Object.assign(new Error("Return is not receivable"), { statusCode: 400 })
    }
    const out = []
    for (const it of items) {
      const row = await this.resolveReturnItem(returnId, it.id)
      const damaged = Math.min(Number(row.damaged_quantity) + it.quantity, row.quantity)
      const received = Math.min(row.quantity, Math.max(Number(row.received_quantity), damaged))
      const { rows } = await pool.query(`UPDATE return_item SET damaged_quantity=$3, received_quantity=$4 WHERE id=$1 AND return_id=$2 RETURNING *`, [row.id, returnId, damaged, received])
      out.push(rows[0])
    }
    await this.recomputeReturnStatus(returnId)
    return out
  }

  async setDismissedQuantity(returnId: string, rowId: string, quantity: number) {
    await this.requireReturnRequest(returnId)
    const cur = await pool.query(`SELECT * FROM return_item WHERE id=$1 AND return_id=$2`, [rowId, returnId])
    if (!cur.rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
    const damaged = Math.max(0, Math.min(quantity, cur.rows[0].quantity))
    const received = Math.min(cur.rows[0].quantity, Math.max(Number(cur.rows[0].received_quantity), damaged))
    const { rows } = await pool.query(`UPDATE return_item SET damaged_quantity=$3, received_quantity=$4 WHERE id=$1 AND return_id=$2 RETURNING *`, [rowId, returnId, damaged, received])
    await this.recomputeReturnStatus(returnId)
    return rows[0]
  }

  async clearDismissedQuantity(returnId: string, rowId: string) {
    await this.requireReturnRequest(returnId)
    const { rows } = await pool.query(`UPDATE return_item SET damaged_quantity=0 WHERE id=$1 AND return_id=$2 RETURNING *`, [rowId, returnId])
    if (!rows[0]) throw Object.assign(new Error("Return item not found"), { statusCode: 404 })
    await this.recomputeReturnStatus(returnId)
    return rows[0]
  }

  async touchReturnRequest(id: string) {
    const { rows } = await pool.query(`UPDATE return_request SET updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [id])
    if (!rows[0]) throw Object.assign(new Error("Return not found"), { statusCode: 404 })
    return rows[0]
  }

  async confirmReturnRequest(id: string) {
    return this.confirmReturn(id)
  }

  async cancelReturnRequest(id: string) {
    const r = await pool.query(`UPDATE return_request SET status='canceled', updated_at=NOW() WHERE id=$1 AND status='requested' AND deleted_at IS NULL`, [id])
    if (r.rowCount === 0) throw Object.assign(new Error("Return request is not cancelable"), { statusCode: 400 })
  }

  async finalizeReturnReceive(id: string) {
