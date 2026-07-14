import { pool } from "../../db"

// Lupus "Return Reasons" and "Refund Reasons" (Settings). Return reasons are what a customer picks
// on a returned item (value is the unique key, a reason can have a parent); refund reasons are what
// staff pick when refunding a payment (code is the unique key).
// Refs: upstream/packages/modules/order (return_reason), packages/modules/payment (refund_reason).

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}

const isUniqueViolation = (e: any) => e?.code === "23505"

export interface ReasonMetadata {
  metadata?: Record<string, unknown> | null
}

export interface ReturnReasonInput extends ReasonMetadata {
  value?: string
  label?: string
  description?: string | null
  parent_return_reason_id?: string | null
}

export interface RefundReasonInput extends ReasonMetadata {
  label?: string
  code?: string
  description?: string | null
}

export function returnReasonShape(row: any) {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    description: row.description ?? null,
    parent_return_reason_id: row.parent_return_reason_id ?? null,
    metadata: row.metadata ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  }
}

export function refundReasonShape(row: any) {
  return {
    id: row.id,
    label: row.label,
    code: row.code,
    description: row.description ?? null,
    metadata: row.metadata ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  }
}

export class ReasonsService {
  // ---------- return reasons ----------

  async retrieveReturnReason(id: string) {
    const { rows } = await pool.query(`SELECT * FROM return_reason WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) fail(`Return reason with id ${id} was not found`, 404)
    const [parent, children] = await Promise.all([
      rows[0].parent_return_reason_id
        ? pool.query(`SELECT * FROM return_reason WHERE id = $1 AND deleted_at IS NULL`, [rows[0].parent_return_reason_id])
        : Promise.resolve({ rows: [] as any[] }),
      pool.query(`SELECT * FROM return_reason WHERE parent_return_reason_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
    ])
    return {
      ...returnReasonShape(rows[0]),
      parent_return_reason: parent.rows[0] ? returnReasonShape(parent.rows[0]) : null,
      return_reason_children: children.rows.map(returnReasonShape),
    }
  }

  private async checkParent(parentId: string, selfId?: string) {
    if (selfId && parentId === selfId) fail("A return reason cannot be its own parent")
    const parent = await pool.query(`SELECT id, parent_return_reason_id FROM return_reason WHERE id = $1 AND deleted_at IS NULL`, [parentId])
    if (!parent.rows[0]) fail(`Return reason with id ${parentId} was not found`, 404)
    if (selfId) {
      // walking up from the new parent must never reach the reason being edited
      let cursor: string | null = parent.rows[0].parent_return_reason_id
      for (let hops = 0; cursor && hops < 50; hops++) {
        if (cursor === selfId) fail("A return reason cannot be moved below one of its own children")
        const up = await pool.query(`SELECT parent_return_reason_id FROM return_reason WHERE id = $1`, [cursor])
        cursor = up.rows[0]?.parent_return_reason_id ?? null
      }
    }
  }

  private async assertValueFree(value: string, selfId?: string) {
    const dup = await pool.query(`SELECT 1 FROM return_reason WHERE value = $1 AND deleted_at IS NULL AND ($2::text IS NULL OR id <> $2)`, [value, selfId ?? null])
    if (dup.rows[0]) fail(`Return reason with value "${value}" already exists`, 409)
  }

  async createReturnReason(input: ReturnReasonInput & { value: string; label: string }) {
    const value = input.value.trim()
    const label = input.label.trim()
    if (!value) fail("value is required")
    if (!label) fail("label is required")
    await this.assertValueFree(value)
    if (input.parent_return_reason_id) await this.checkParent(input.parent_return_reason_id)
    try {
      const { rows } = await pool.query(
        `INSERT INTO return_reason (value, label, description, parent_return_reason_id, metadata) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [value, label, input.description?.trim() || null, input.parent_return_reason_id ?? null, input.metadata ?? null]
      )
      return this.retrieveReturnReason(rows[0].id)
    } catch (e) {
      if (isUniqueViolation(e)) fail(`Return reason with value "${value}" already exists`, 409)
      throw e
    }
  }

  async updateReturnReason(id: string, input: ReturnReasonInput) {
    const cur = await this.retrieveReturnReason(id)
    const sets: string[] = []
    const params: unknown[] = []
    const set = (column: string, value: unknown) => {
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }
    if (input.value !== undefined) {
      const value = input.value.trim()
      if (!value) fail("value cannot be empty")
      if (value !== cur.value) await this.assertValueFree(value, id)
      set("value", value)
    }
    if (input.label !== undefined) {
      const label = input.label.trim()
      if (!label) fail("label cannot be empty")
      set("label", label)
    }
    if (input.description !== undefined) set("description", input.description?.trim() || null)
    if (input.parent_return_reason_id !== undefined) {
      if (input.parent_return_reason_id) await this.checkParent(input.parent_return_reason_id, id)
      set("parent_return_reason_id", input.parent_return_reason_id)
    }
    if (input.metadata !== undefined) set("metadata", input.metadata)
    sets.push("updated_at = NOW()")
    params.push(id)
    try {
      await pool.query(`UPDATE return_reason SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    } catch (e) {
      if (isUniqueViolation(e)) fail(`Return reason with value "${input.value}" already exists`, 409)
      throw e
    }
    return this.retrieveReturnReason(id)
  }

  async removeReturnReason(id: string) {
    const gone = await pool.query(`UPDATE return_reason SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) fail(`Return reason with id ${id} was not found`, 404)
    await pool.query(`UPDATE return_reason SET parent_return_reason_id = NULL, updated_at = NOW() WHERE parent_return_reason_id = $1`, [id])
  }

  // ---------- refund reasons ----------

  async retrieveRefundReason(id: string) {
    const { rows } = await pool.query(`SELECT * FROM refund_reason WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) fail(`Refund reason with id ${id} was not found`, 404)
    return refundReasonShape(rows[0])
  }

  private async assertCodeFree(code: string, selfId?: string) {
    const dup = await pool.query(`SELECT 1 FROM refund_reason WHERE code = $1 AND deleted_at IS NULL AND ($2::text IS NULL OR id <> $2)`, [code, selfId ?? null])
    if (dup.rows[0]) fail(`Refund reason with code "${code}" already exists`, 409)
  }

  async createRefundReason(input: RefundReasonInput & { label: string; code: string }) {
    const label = input.label.trim()
    const code = input.code.trim()
    if (!label) fail("label is required")
    if (!code) fail("code is required")
    await this.assertCodeFree(code)
    try {
      const { rows } = await pool.query(`INSERT INTO refund_reason (label, code, description, metadata) VALUES ($1,$2,$3,$4) RETURNING *`, [
        label,
        code,
        input.description?.trim() || null,
        input.metadata ?? null,
      ])
      return refundReasonShape(rows[0])
    } catch (e) {
      if (isUniqueViolation(e)) fail(`Refund reason with code "${code}" already exists`, 409)
      throw e
    }
  }

  async updateRefundReason(id: string, input: RefundReasonInput) {
    const cur = await this.retrieveRefundReason(id)
    const sets: string[] = []
    const params: unknown[] = []
    const set = (column: string, value: unknown) => {
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }
    if (input.label !== undefined) {
      const label = input.label.trim()
      if (!label) fail("label cannot be empty")
      set("label", label)
    }
    if (input.code !== undefined) {
      const code = input.code.trim()
      if (!code) fail("code cannot be empty")
      if (code !== cur.code) await this.assertCodeFree(code, id)
      set("code", code)
    }
    if (input.description !== undefined) set("description", input.description?.trim() || null)
    if (input.metadata !== undefined) set("metadata", input.metadata)
    sets.push("updated_at = NOW()")
    params.push(id)
    try {
      await pool.query(`UPDATE refund_reason SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    } catch (e) {
      if (isUniqueViolation(e)) fail(`Refund reason with code "${input.code}" already exists`, 409)
      throw e
    }
    return this.retrieveRefundReason(id)
  }

  async removeRefundReason(id: string) {
    const gone = await pool.query(`UPDATE refund_reason SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) fail(`Refund reason with id ${id} was not found`, 404)
  }
}

export const reasonsService = new ReasonsService()
