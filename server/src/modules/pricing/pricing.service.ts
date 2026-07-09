import { pool } from "../../db"

// Port of Lupus pricing resolution (packages/modules/pricing + price-list rules +
// customer-group price preferences). Priority: customer-group override (lowest) >
// price-list override/sale > base money_amount. Min/max quantity and date windows honored.
export class PricingService {
  async resolveUnitPrice(variantId: string, currency: string, quantity = 1, customerId?: string | null): Promise<number> {
    const cur = currency.toLowerCase()
    // 0. customer-group price (price preference): lowest group price wins
    if (customerId) {
      const gp = await pool.query(
        `SELECT gp.amount FROM group_price gp
         JOIN customer_group_customer cgc ON cgc.customer_group_id = gp.customer_group_id
         WHERE cgc.customer_id = $1 AND gp.variant_id = $2 AND gp.currency_code = $3
         ORDER BY gp.amount ASC LIMIT 1`,
        [customerId, variantId, cur]
      )
      if (gp.rows[0]) {
        return Number(gp.rows[0].amount)
      }
    }
    const now = new Date().toISOString()
    // 1. price-list candidates (active, in window, qty match, customer-group rules).
    // A list with linked groups applies only when the customer belongs to one of them
    // (Lupus price-list rules parity); lists without rules apply to everyone.
    const customerGroups: string[] = customerId
      ? (await pool.query(`SELECT customer_group_id FROM customer_group_customer WHERE customer_id = $1`, [customerId])).rows.map((r: any) => r.customer_group_id)
      : []
    const pl = await pool.query(
      `SELECT p.amount, pl.type FROM price p
       JOIN price_set ps ON ps.id = p.price_set_id AND ps.deleted_at IS NULL
       JOIN product_variant v ON v.price_set_id = ps.id
       LEFT JOIN price_list pl ON pl.id = p.price_list_id AND pl.deleted_at IS NULL
       WHERE v.id = $1 AND p.currency_code = $2 AND p.deleted_at IS NULL
         AND (p.min_quantity IS NULL OR p.min_quantity <= $3)
         AND (p.max_quantity IS NULL OR p.max_quantity >= $3)
         AND (p.price_list_id IS NULL OR (pl.id IS NOT NULL AND pl.status='active'
           AND (pl.starts_at IS NULL OR pl.starts_at <= $4)
           AND (pl.ends_at IS NULL OR pl.ends_at >= $4)
           AND (NOT EXISTS (SELECT 1 FROM price_list_customer_group g WHERE g.price_list_id = pl.id)
             OR EXISTS (SELECT 1 FROM price_list_customer_group g WHERE g.price_list_id = pl.id AND g.customer_group_id = ANY($5)))))
       ORDER BY CASE WHEN pl.type='override' THEN 0 ELSE 1 END, p.amount ASC LIMIT 1`,
      [variantId, cur, quantity, now, customerGroups]
    )
    if (pl.rows[0]) {
      return Number(pl.rows[0].amount)
    }
    throw Object.assign(new Error(`No price for variant in ${cur}`), { statusCode: 400 })
  }

  // ---- Lupus-compat price lists (admin/price-lists) ----
  // Refs: upstream/packages/core/js-sdk/src/admin/price-list.ts
  // (retrieve/update/prices/batchPrices/linkProducts) +
  // upstream/src/api/admin/price-lists/.../route.ts.

  /** Lupus keeps the customer-group condition under this rule attribute. */
  static readonly GROUP_RULE = "customer.groups.id"

  private bad(message: string, statusCode = 400): never {
    throw Object.assign(new Error(message), { statusCode })
  }

  private assertWindow(startsAt?: string | null, endsAt?: string | null): void {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      this.bad("The end date must be after the start date")
    }
  }

  private assertQuantities(p: { min_quantity?: number | null; max_quantity?: number | null }): void {
    if (p.min_quantity != null && p.max_quantity != null && p.min_quantity > p.max_quantity) {
      this.bad("The minimum quantity cannot be greater than the maximum quantity")
    }
  }

  private async assertGroups(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const { rows } = await pool.query(`SELECT id FROM customer_group WHERE id = ANY($1) AND deleted_at IS NULL`, [ids])
    const found = new Set(rows.map((r: any) => r.id))
    const missing = ids.filter((id) => !found.has(id))
    if (missing.length > 0) this.bad(`Customer group not found: ${missing.join(", ")}`)
  }

  /** `rules: { "customer.groups.id": [...] }` (Lupus) or the lupus `customer_group_ids`. */
  private groupIdsFrom(input: { rules?: Record<string, unknown> | null; customer_group_ids?: string[] }): string[] | undefined {
    if (input.customer_group_ids !== undefined) return [...new Set(input.customer_group_ids)]
    if (input.rules === undefined) return undefined
    const v = input.rules?.[PricingService.GROUP_RULE]
    return Array.isArray(v) ? [...new Set(v.map(String))] : []
  }

  async createPriceList(input: {
    title: string
    description?: string | null
    type?: "sale" | "override"
    status?: "active" | "draft"
    starts_at?: string | null
    ends_at?: string | null
    rules?: Record<string, unknown> | null
    customer_group_ids?: string[]
    metadata?: Record<string, unknown> | null
    prices?: { variant_id: string; currency_code: string; amount: number; min_quantity?: number | null; max_quantity?: number | null }[]
  }): Promise<any> {
    const groups = this.groupIdsFrom(input) ?? []
    const prices = input.prices ?? []
    this.assertWindow(input.starts_at, input.ends_at)
    await this.assertGroups(groups)
    for (const p of prices) this.assertQuantities(p)

    const variantIds = [...new Set(prices.map((p) => p.variant_id))]
    if (variantIds.length > 0) {
      const { rows } = await pool.query(`SELECT id FROM product_variant WHERE id = ANY($1) AND deleted_at IS NULL`, [variantIds])
      const found = new Set(rows.map((r: any) => r.id))
      const missing = variantIds.filter((id) => !found.has(id))
      if (missing.length > 0) this.bad(`Variant not found: ${missing.join(", ")}`, 404)
    }
    const seen = new Set<string>()
    for (const p of prices) {
      const key = [p.variant_id, p.currency_code.toLowerCase(), p.min_quantity ?? "", p.max_quantity ?? ""].join("|")
      if (seen.has(key)) this.bad("Duplicate price for the same variant, currency and quantity range")
      seen.add(key)
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const pl = await client.query(
        `INSERT INTO price_list (title, type, description, status, starts_at, ends_at, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.title, input.type ?? "sale", input.description ?? null, input.status ?? "active", input.starts_at ?? null, input.ends_at ?? null, input.metadata ?? null]
      )
      const id = pl.rows[0].id as string
      for (const gid of groups) {
        await client.query(`INSERT INTO price_list_customer_group (price_list_id, customer_group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, gid])
      }
      for (const p of prices) {
        const ps = await client.query(`SELECT price_set_id FROM product_variant WHERE id = $1`, [p.variant_id])
        let psId = ps.rows[0]?.price_set_id as string | null
        if (!psId) {
          const created = await client.query(`INSERT INTO price_set DEFAULT VALUES RETURNING id`)
          psId = created.rows[0].id as string
          await client.query(`UPDATE product_variant SET price_set_id = $2 WHERE id = $1`, [p.variant_id, psId])
        }
        await client.query(
          `INSERT INTO price (price_set_id, currency_code, amount, min_quantity, max_quantity, price_list_id) VALUES ($1,$2,$3,$4,$5,$6)`,
          [psId, p.currency_code.toLowerCase(), p.amount, p.min_quantity ?? null, p.max_quantity ?? null, id]
        )
      }
      await client.query("COMMIT")
      return this.retrievePriceList(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async retrievePriceList(id: string): Promise<any> {
    const { rows } = await pool.query(`SELECT * FROM price_list WHERE id = $1 AND deleted_at IS NULL`, [id])
    const list = rows[0]
    if (!list) {
      throw Object.assign(new Error("Price list not found"), { statusCode: 404 })
    }
    const prices = await pool.query(
      `SELECT p.*, v.id AS variant_id FROM price p
       JOIN price_set ps ON ps.id = p.price_set_id
       JOIN product_variant v ON v.price_set_id = ps.id
       WHERE p.price_list_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
      [id]
    )
    const groups = await pool.query(
      `SELECT cg.* FROM customer_group cg
       JOIN price_list_customer_group g ON g.customer_group_id = cg.id
       WHERE g.price_list_id = $1 AND cg.deleted_at IS NULL ORDER BY cg.name`,
      [id]
    )
    return {
      ...list,
      prices: prices.rows.map((p: any) => ({ ...p, amount: Number(p.amount) })),
      price_count: prices.rows.length,
      customer_groups: groups.rows,
      rules: groups.rows.length > 0 ? { [PricingService.GROUP_RULE]: groups.rows.map((g: any) => g.id) } : {},
    }
  }

  async deletePriceList(id: string): Promise<void> {
    const { rows } = await pool.query(`UPDATE price_list SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!rows[0]) {
      throw Object.assign(new Error("Price list not found"), { statusCode: 404 })
    }
    // the overrides die with their list, otherwise they would read as base prices
    await pool.query(`UPDATE price SET deleted_at = NOW() WHERE price_list_id = $1 AND deleted_at IS NULL`, [id])
  }

  async updatePriceList(
    id: string,
    patch: {
      title?: string
      description?: string | null
      starts_at?: string | null
      ends_at?: string | null
      status?: string
      type?: string
      metadata?: Record<string, unknown> | null
      rules?: Record<string, unknown> | null
      customer_group_ids?: string[]
    }
  ): Promise<any> {
    const cur = await pool.query(`SELECT * FROM price_list WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!cur.rows[0]) {
      throw Object.assign(new Error("Price list not found"), { statusCode: 404 })
    }
    const startsAt = patch.starts_at !== undefined ? patch.starts_at : (cur.rows[0].starts_at?.toISOString?.() ?? null)
    const endsAt = patch.ends_at !== undefined ? patch.ends_at : (cur.rows[0].ends_at?.toISOString?.() ?? null)
    this.assertWindow(startsAt, endsAt)
    const groups = this.groupIdsFrom(patch)
    if (groups) await this.assertGroups(groups)

    const sets: string[] = []
    const params: any[] = []
    for (const k of ["title", "description", "starts_at", "ends_at", "status", "type", "metadata"] as const) {
      const v = (patch as any)[k]
      if (v === undefined) continue
      params.push(v)
      sets.push(`${k} = $${params.length}`)
    }
    if (sets.length > 0 || groups !== undefined) {
      sets.push("updated_at = NOW()")
      params.push(id)
      await pool.query(`UPDATE price_list SET ${sets.join(", ")} WHERE id = $${params.length} AND deleted_at IS NULL`, params)
    }
    if (groups !== undefined) {
      await pool.query(`DELETE FROM price_list_customer_group WHERE price_list_id = $1`, [id])
      for (const gid of groups) {
        await pool.query(
          `INSERT INTO price_list_customer_group (price_list_id, customer_group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, gid]
        )
      }
    }
    return this.retrievePriceList(id)
  }

  async listPriceListPrices(id: string, limit: number, offset: number): Promise<{ prices: any[]; count: number }> {
    const exists = await pool.query(`SELECT id FROM price_list WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!exists.rows[0]) {
      throw Object.assign(new Error("Price list not found"), { statusCode: 404 })
    }
    const { rows } = await pool.query(
      `SELECT p.*, v.id AS variant_id FROM price p
       JOIN price_set ps ON ps.id = p.price_set_id
       JOIN product_variant v ON v.price_set_id = ps.id
       WHERE p.price_list_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    )
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM price WHERE price_list_id = $1 AND deleted_at IS NULL`, [id])
    return { prices: rows, count: Number(total.rows[0].c) }
  }

  /** Ensure a variant has a price_set, creating one if missing. Shared with product create/update. */
  async ensureVariantPriceSet(variantId: string): Promise<string> {
    const ps = await pool.query(`SELECT price_set_id FROM product_variant WHERE id = $1`, [variantId])
    if (!ps.rows[0]) {
      throw Object.assign(new Error(`Variant ${variantId} not found`), { statusCode: 404 })
    }
    if (ps.rows[0].price_set_id) {
      return ps.rows[0].price_set_id as string
    }
    const created = await pool.query(`INSERT INTO price_set DEFAULT VALUES RETURNING id`)
    await pool.query(`UPDATE product_variant SET price_set_id = $2 WHERE id = $1`, [variantId, created.rows[0].id])
    return created.rows[0].id as string
  }

  async batchPriceListPrices(
    id: string,
    input: {
      create?: { variant_id: string; currency_code: string; amount: number; min_quantity?: number | null; max_quantity?: number | null }[]
      update?: { id: string; variant_id?: string; currency_code?: string; amount?: number; min_quantity?: number | null; max_quantity?: number | null }[]
      delete?: string[]
    }
  ): Promise<{ created: any[]; updated: any[]; deleted: string[] }> {
    const exists = await pool.query(`SELECT id FROM price_list WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!exists.rows[0]) {
      throw Object.assign(new Error("Price list not found"), { statusCode: 404 })
    }
    const created: any[] = []
    for (const c of input.create ?? []) {
      this.assertQuantities(c)
      const psId = await this.ensureVariantPriceSet(c.variant_id)
      const { rows } = await pool.query(
        `INSERT INTO price (price_set_id, currency_code, amount, min_quantity, max_quantity, price_list_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [psId, c.currency_code.toLowerCase(), c.amount, c.min_quantity ?? null, c.max_quantity ?? null, id]
      )
      created.push({ ...rows[0], variant_id: c.variant_id })
    }
    const updated: any[] = []
    for (const u of input.update ?? []) {
      {
        // the range that will exist after the update must still make sense
        const was = await pool.query(`SELECT min_quantity, max_quantity FROM price WHERE id = $1 AND price_list_id = $2 AND deleted_at IS NULL`, [u.id, id])
        if (was.rows[0]) {
          this.assertQuantities({
            min_quantity: u.min_quantity !== undefined ? u.min_quantity : was.rows[0].min_quantity,
            max_quantity: u.max_quantity !== undefined ? u.max_quantity : was.rows[0].max_quantity,
          })
        }
      }
      const sets: string[] = []
      const params: any[] = []
      if (u.currency_code !== undefined) {
        params.push(u.currency_code.toLowerCase())
        sets.push(`currency_code = $${params.length}`)
      }
      if (u.amount !== undefined) {
        params.push(u.amount)
        sets.push(`amount = $${params.length}`)
      }
      if (u.min_quantity !== undefined) {
        params.push(u.min_quantity)
        sets.push(`min_quantity = $${params.length}`)
      }
      if (u.max_quantity !== undefined) {
        params.push(u.max_quantity)
        sets.push(`max_quantity = $${params.length}`)
      }
      if (u.variant_id !== undefined) {
        params.push(await this.ensureVariantPriceSet(u.variant_id))
        sets.push(`price_set_id = $${params.length}`)
      }
      if (sets.length === 0) {
        const cur = await pool.query(`SELECT * FROM price WHERE id = $1 AND price_list_id = $2 AND deleted_at IS NULL`, [u.id, id])
        if (cur.rows[0]) updated.push(cur.rows[0])
        continue
      }
      params.push(u.id, id)
      const { rows } = await pool.query(
        `UPDATE price SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND price_list_id = $${params.length} AND deleted_at IS NULL RETURNING *`,
        params
      )
      if (rows[0]) updated.push(rows[0])
    }
    const deleted: string[] = []
    for (const pid of input.delete ?? []) {
      await pool.query(`UPDATE price SET deleted_at = NOW() WHERE id = $1 AND price_list_id = $2`, [pid, id])
      deleted.push(pid)
    }
    await pool.query(`UPDATE price_list SET updated_at = NOW() WHERE id = $1`, [id])
    return { created, updated, deleted }
  }

  async linkPriceListProducts(id: string, input: { add?: string[]; remove?: string[] }): Promise<any> {
    const exists = await pool.query(`SELECT id FROM price_list WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!exists.rows[0]) {
      throw Object.assign(new Error("Price list not found"), { statusCode: 404 })
    }
    for (const productId of input.add ?? []) {
      const variants = await pool.query(`SELECT id FROM product_variant WHERE product_id = $1 AND deleted_at IS NULL`, [productId])
      for (const v of variants.rows) {
        const psId = await this.ensureVariantPriceSet(v.id)
        const base = await pool.query(
          `SELECT currency_code, amount, min_quantity, max_quantity FROM price
           WHERE price_set_id = $1 AND price_list_id IS NULL AND deleted_at IS NULL`,
          [psId]
        )
        for (const b of base.rows) {
          const dup = await pool.query(
            `SELECT id FROM price WHERE price_set_id = $1 AND price_list_id = $2 AND currency_code = $3 AND deleted_at IS NULL LIMIT 1`,
            [psId, id, b.currency_code]
          )
          if (dup.rows[0]) continue
          await pool.query(
            `INSERT INTO price (price_set_id, currency_code, amount, min_quantity, max_quantity, price_list_id)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [psId, b.currency_code, b.amount, b.min_quantity ?? null, b.max_quantity ?? null, id]
          )
        }
      }
    }
    for (const productId of input.remove ?? []) {
      await pool.query(
        `UPDATE price SET deleted_at = NOW() WHERE id IN (
           SELECT p.id FROM price p
           JOIN product_variant v ON v.price_set_id = p.price_set_id
           WHERE p.price_list_id = $1 AND v.product_id = $2 AND p.deleted_at IS NULL
         )`,
        [id, productId]
      )
    }
    return this.retrievePriceList(id)
  }

  // ---- Lupus-compat price preferences (admin/price-preferences) ----
  // Refs: upstream/packages/core/js-sdk/src/admin/price-preference.ts +
  // upstream/src/api/admin/price-preferences/.../route.ts.
  // No dedicated table ships in the .sql schemas, so the table is ensured here
  // (runtime DDL, not a migration file): { attribute, value, is_tax_inclusive }.

  private prefTableReady = false

  private async ensurePreferenceTable(): Promise<void> {
    if (this.prefTableReady) return
    await pool.query(
      `CREATE TABLE IF NOT EXISTS price_preference (
        id TEXT PRIMARY KEY DEFAULT ('pp_' || encode(gen_random_bytes(12), 'hex')),
        attribute TEXT,
        value TEXT,
        is_tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )`
    )
    this.prefTableReady = true
  }

  async listPricePreferences(limit: number, offset: number): Promise<{ preferences: any[]; count: number }> {
    await this.ensurePreferenceTable()
    const { rows } = await pool.query(
      `SELECT * FROM price_preference WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM price_preference WHERE deleted_at IS NULL`)
    return { preferences: rows, count: Number(total.rows[0].c) }
  }

  async createPricePreference(input: { attribute?: string | null; value?: string | null; is_tax_inclusive?: boolean }): Promise<any> {
    await this.ensurePreferenceTable()
    const { rows } = await pool.query(
      `INSERT INTO price_preference (attribute, value, is_tax_inclusive) VALUES ($1,$2,$3) RETURNING *`,
      [input.attribute ?? null, input.value ?? null, input.is_tax_inclusive ?? false]
    )
    return rows[0]
  }

  async retrievePricePreference(id: string): Promise<any> {
    await this.ensurePreferenceTable()
    const { rows } = await pool.query(`SELECT * FROM price_preference WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) {
      throw Object.assign(new Error("Price preference not found"), { statusCode: 404 })
    }
    return rows[0]
  }

  async updatePricePreference(id: string, patch: { attribute?: string | null; value?: string | null; is_tax_inclusive?: boolean }): Promise<any> {
    await this.ensurePreferenceTable()
    const sets: string[] = []
    const params: any[] = []
    if (patch.attribute !== undefined) {
      params.push(patch.attribute)
      sets.push(`attribute = $${params.length}`)
    }
    if (patch.value !== undefined) {
      params.push(patch.value)
      sets.push(`value = $${params.length}`)
    }
    if (patch.is_tax_inclusive !== undefined) {
      params.push(patch.is_tax_inclusive)
      sets.push(`is_tax_inclusive = $${params.length}`)
    }
    sets.push(`updated_at = NOW()`)
    params.push(id)
    const { rows } = await pool.query(
      `UPDATE price_preference SET ${sets.join(", ")} WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params
    )
    if (!rows[0]) {
      throw Object.assign(new Error("Price preference not found"), { statusCode: 404 })
    }
    return rows[0]
  }

  async deletePricePreference(id: string): Promise<void> {
    await this.ensurePreferenceTable()
    await pool.query(`UPDATE price_preference SET deleted_at = NOW() WHERE id = $1`, [id])
  }
}

export const pricingService = new PricingService()
