import { pool } from "../../db"

// Lupus "Product Types" and "Product Tags": a short unique value plus metadata. A product has one
// type and any number of tags; deleting one detaches it from its products.
// Refs: upstream/packages/modules/product (product_type, product_tag).

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}

export type TaxonomyKind = "type" | "tag"

const CONFIG = {
  type: { table: "product_type", noun: "Product type", object: "product_type" },
  tag: { table: "product_tag", noun: "Product tag", object: "product_tag" },
} as const

export function taxonomyShape(row: any) {
  return {
    id: row.id,
    value: row.value,
    metadata: row.metadata ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  }
}

export class ProductTaxonomyService {
  object(kind: TaxonomyKind) {
    return CONFIG[kind].object
  }

  async retrieve(kind: TaxonomyKind, id: string) {
    const { table, noun } = CONFIG[kind]
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) fail(`${noun} with id: ${id} was not found`, 404)
    return taxonomyShape(rows[0])
  }

  private async assertFree(kind: TaxonomyKind, value: string, selfId?: string) {
    const { table, noun } = CONFIG[kind]
    const dup = await pool.query(`SELECT 1 FROM ${table} WHERE value = $1 AND deleted_at IS NULL AND ($2::text IS NULL OR id <> $2)`, [value, selfId ?? null])
    if (dup.rows[0]) fail(`${noun} with value: ${value}, already exists.`, 409)
  }

  async create(kind: TaxonomyKind, input: { value: string; metadata?: Record<string, unknown> | null }) {
    const { table, noun } = CONFIG[kind]
    const value = input.value.trim()
    if (!value) fail("value is required")
    await this.assertFree(kind, value)
    try {
      const { rows } = await pool.query(`INSERT INTO ${table} (value, metadata) VALUES ($1,$2) RETURNING *`, [value, input.metadata ?? null])
      return taxonomyShape(rows[0])
    } catch (e: any) {
      if (e?.code === "23505") fail(`${noun} with value: ${value}, already exists.`, 409)
      throw e
    }
  }

  async update(kind: TaxonomyKind, id: string, input: { value?: string; metadata?: Record<string, unknown> | null }) {
    const { table, noun } = CONFIG[kind]
    const cur = await this.retrieve(kind, id)
    const sets: string[] = []
    const params: unknown[] = []
    if (input.value !== undefined) {
      const value = input.value.trim()
      if (!value) fail("value cannot be empty")
      if (value !== cur.value) await this.assertFree(kind, value, id)
      params.push(value)
      sets.push(`value = $${params.length}`)
    }
    if (input.metadata !== undefined) {
      params.push(input.metadata)
      sets.push(`metadata = $${params.length}`)
    }
    sets.push("updated_at = NOW()")
    params.push(id)
    try {
      await pool.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    } catch (e: any) {
      if (e?.code === "23505") fail(`${noun} with value: ${input.value}, already exists.`, 409)
      throw e
    }
    return this.retrieve(kind, id)
  }

  async remove(kind: TaxonomyKind, id: string) {
    const { table, noun } = CONFIG[kind]
    const gone = await pool.query(`UPDATE ${table} SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) fail(`${noun} with id: ${id} was not found`, 404)
    if (kind === "type") await pool.query(`UPDATE product SET type_id = NULL, updated_at = NOW() WHERE type_id = $1`, [id])
    else await pool.query(`DELETE FROM product_tags WHERE tag_id = $1`, [id])
  }
}

export const productTaxonomyService = new ProductTaxonomyService()
