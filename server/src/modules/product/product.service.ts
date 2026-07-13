import { pool } from "../../db"
import {
  CreateProductFullInput,
  CreateProductInput,
  CreateProductVariantInput,
  CreateProductVariantPriceInput,
  ListProductFilters,
  ProductDTO,
  UpdateProductFullInput,
} from "./product.types"
import { assignVariantOptions } from "./product-options.util"
import { pricingService } from "../pricing/pricing.service"
import { locationInventoryService } from "../inventory/location-inventory.service"

// Plain port of ProductModuleService (upstream/packages/modules/product/src/services/product-module-service.ts, 4271 lines)
// plus the create/update workflow steps (core-flows/product/workflows/create-products.js,
// create-product-variants.js, update-products.js) collapsed into single-transaction methods.
// What was dropped:
// - the upstream base service class + @InjectManager/@InjectTransactionManager/@EmitEvents decorators
// - MikroORM EntityManager / DAL.RepositoryService / MessageAggregator event bus
// - Remote query / joiner-config / separate pricing+inventory module round trips
// What was kept: the business rules (handle slugify + unique, default status=draft,
// soft-delete via deleted_at, cascade delete variants on product delete, every variant
// must cover every declared option, prices required per variant, default inventory
// item auto-created when manage_inventory and no explicit inventory_items given).

function toHandle(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 })
}

const VARIANT_SCALAR_COLUMNS = [
  "title",
  "sku",
  "barcode",
  "ean",
  "upc",
  "manage_inventory",
  "allow_backorder",
  "variant_rank",
  "origin_country",
  "mid_code",
  "material",
  "hs_code",
  "weight",
  "length",
  "height",
  "width",
  "thumbnail",
] as const

export class ProductService {
  async list(filters: ListProductFilters = {}): Promise<ProductDTO[]> {
    const limit = Math.min(filters.limit ?? 50, 100)
    const offset = filters.offset ?? 0
    const conditions: string[] = ["deleted_at IS NULL"]
    const params: any[] = []
    if (filters.status) {
      params.push(filters.status)
      conditions.push(`status = $${params.length}`)
    }
    if (filters.handle) {
      params.push(filters.handle)
      conditions.push(`handle = $${params.length}`)
    }
    if (filters.q) {
      params.push(`%${filters.q}%`)
      conditions.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`)
    }
    params.push(limit, offset)
    const { rows } = await pool.query(
      `SELECT * FROM product WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    return this.enrichMany(rows)
  }

  async retrieve(id: string): Promise<ProductDTO | null> {
    const { rows } = await pool.query(`SELECT * FROM product WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) return null
    const [enriched] = await this.enrichMany(rows)
    return enriched ?? rows[0]
  }

  // ---- store-facing reads: status is never trusted from the caller (Lupus's Store
  // API only ever returns published products), and the shape carries what a storefront
  // variant picker needs: product-level options, images, and per-variant option keymap
  // + manage_inventory/allow_backorder/inventory_quantity. ----
  async listPublic(filters: Omit<ListProductFilters, "status"> = {}): Promise<ProductDTO[]> {
    const limit = Math.min(filters.limit ?? 50, 100)
    const offset = filters.offset ?? 0
    const conditions: string[] = ["deleted_at IS NULL", "status = 'published'"]
    const params: any[] = []
    if (filters.handle) {
      params.push(filters.handle)
      conditions.push(`handle = $${params.length}`)
    }
    if (filters.q) {
      params.push(`%${filters.q}%`)
      conditions.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`)
    }
    if (filters.sales_channel_ids?.length) {
      params.push(filters.sales_channel_ids)
      conditions.push(`id IN (SELECT product_id FROM product_sales_channel WHERE sales_channel_id = ANY($${params.length}))`)
    }
    params.push(limit, offset)
    const { rows } = await pool.query(
      `SELECT * FROM product WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    return this.enrichForStore(rows)
  }

  async retrievePublic(id: string, salesChannelIds?: string[]): Promise<ProductDTO | null> {
    const { rows } = await pool.query(
      `SELECT * FROM product WHERE id = $1 AND status = 'published' AND deleted_at IS NULL
       AND ($2::text[] IS NULL OR id IN (SELECT product_id FROM product_sales_channel WHERE sales_channel_id = ANY($2)))`,
      [id, salesChannelIds ?? null]
    )
    if (!rows[0]) return null
    const [enriched] = await this.enrichForStore(rows)
    return enriched ?? null
  }

  /** Attach variants (with prices) — basic shape used by internal/admin-ish callers. */
  private async enrichMany(products: any[]): Promise<any[]> {
    if (products.length === 0) return []
    const ids = products.map((p) => p.id)
    const { rows: variants } = await pool.query(
      `SELECT v.* FROM product_variant v WHERE v.product_id = ANY($1) AND v.deleted_at IS NULL ORDER BY v.created_at`,
      [ids]
    )
    if (variants.length === 0) {
      return products.map((p) => ({ ...p, variants: [] }))
    }
    const variantIds = variants.map((v) => v.id)
    const { rows: prices } = await pool.query(
      `SELECT v.id AS variant_id, p.currency_code, p.amount
       FROM product_variant v
       JOIN price p ON p.price_set_id = v.price_set_id AND p.price_list_id IS NULL AND p.deleted_at IS NULL
       WHERE v.id = ANY($1)`,
      [variantIds]
    )
    const pricesBy: Record<string, any[]> = {}
    for (const row of prices) {
      pricesBy[row.variant_id] = pricesBy[row.variant_id] ?? []
      pricesBy[row.variant_id].push({ currency_code: row.currency_code, amount: Number(row.amount) })
    }
    const byProduct: Record<string, any[]> = {}
    for (const v of variants) {
      byProduct[v.product_id] = byProduct[v.product_id] ?? []
      byProduct[v.product_id].push({ ...v, prices: pricesBy[v.id] ?? [] })
    }
    return products.map((p) => ({ ...p, variants: byProduct[p.id] ?? [] }))
  }

  /** Full store shape: product-level options, ordered images, variant option keymap + stock fields. */
  async enrichForStore(products: any[]): Promise<any[]> {
    if (products.length === 0) return []
    const ids = products.map((p) => p.id)
    const [variantRes, optionRes, imageRes] = await Promise.all([
      pool.query(`SELECT * FROM product_variant WHERE product_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at`, [ids]),
      pool.query(
        `SELECT o.id, o.product_id, o.title,
           COALESCE((SELECT json_agg(json_build_object('id', ov.id, 'value', ov.value) ORDER BY ov.rank, ov.created_at) FROM product_option_value ov WHERE ov.option_id = o.id AND ov.deleted_at IS NULL), '[]') AS values
         FROM product_option o WHERE o.product_id = ANY($1) AND o.deleted_at IS NULL ORDER BY o.created_at`,
        [ids]
      ),
      pool.query(`SELECT id, product_id, url, rank FROM product_image WHERE product_id = ANY($1) AND deleted_at IS NULL ORDER BY rank`, [ids]),
    ])
    const variantIds = variantRes.rows.map((v: any) => v.id)
    const [priceRes, optValRes] = await Promise.all([
      variantIds.length
        ? pool.query(
            `SELECT v.id AS variant_id, p.currency_code, p.amount
             FROM product_variant v
             JOIN price p ON p.price_set_id = v.price_set_id AND p.price_list_id IS NULL AND p.deleted_at IS NULL
             WHERE v.id = ANY($1)`,
            [variantIds]
          )
        : Promise.resolve({ rows: [] as any[] }),
      variantIds.length
        ? pool.query(
            `SELECT pvov.variant_id, ov.option_id, ov.value
             FROM product_variant_option_value pvov
             JOIN product_option_value ov ON ov.id = pvov.option_value_id
             WHERE pvov.variant_id = ANY($1)`,
            [variantIds]
          )
        : Promise.resolve({ rows: [] as any[] }),
    ])

    const inventoryByVariant: Record<string, number | null> = {}
    await Promise.all(
      variantRes.rows.map(async (v: any) => {
        if (!v.manage_inventory) {
          inventoryByVariant[v.id] = null
          return
        }
        const avail = await locationInventoryService.availableForVariant(v.id)
        inventoryByVariant[v.id] = avail === Number.MAX_SAFE_INTEGER ? null : Math.max(0, avail)
      })
    )

    const pricesBy: Record<string, any[]> = {}
    for (const r of priceRes.rows) {
      pricesBy[r.variant_id] = pricesBy[r.variant_id] ?? []
      pricesBy[r.variant_id].push({ currency_code: r.currency_code, amount: Number(r.amount) })
    }
    const optsBy: Record<string, { option_id: string; value: string }[]> = {}
    for (const r of optValRes.rows) {
      optsBy[r.variant_id] = optsBy[r.variant_id] ?? []
      optsBy[r.variant_id].push({ option_id: r.option_id, value: r.value })
    }
    const variantsByProduct: Record<string, any[]> = {}
    for (const v of variantRes.rows) {
      variantsByProduct[v.product_id] = variantsByProduct[v.product_id] ?? []
      variantsByProduct[v.product_id].push({
        id: v.id,
        product_id: v.product_id,
        title: v.title,
        sku: v.sku,
        manage_inventory: v.manage_inventory,
        allow_backorder: v.allow_backorder,
        inventory_quantity: inventoryByVariant[v.id],
        thumbnail: v.thumbnail,
        prices: pricesBy[v.id] ?? [],
        options: optsBy[v.id] ?? [],
      })
    }
    const optionsByProduct: Record<string, any[]> = {}
    for (const o of optionRes.rows) {
      optionsByProduct[o.product_id] = optionsByProduct[o.product_id] ?? []
      optionsByProduct[o.product_id].push({ id: o.id, title: o.title, values: o.values })
    }
    const imagesByProduct: Record<string, any[]> = {}
    for (const i of imageRes.rows) {
      imagesByProduct[i.product_id] = imagesByProduct[i.product_id] ?? []
      imagesByProduct[i.product_id].push({ id: i.id, url: i.url, rank: i.rank })
    }
    return products.map((p) => ({
      ...p,
      variants: variantsByProduct[p.id] ?? [],
      options: optionsByProduct[p.id] ?? [],
      images: imagesByProduct[p.id] ?? [],
    }))
  }

  async create(input: CreateProductInput): Promise<ProductDTO> {
    const handle = input.handle ?? toHandle(input.title)
    if (!/^[a-z0-9-]+$/.test(handle)) {
      throw badRequest(`Invalid handle: ${handle}`)
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO product (title, handle, description, status) VALUES ($1,$2,$3,$4) RETURNING *`,
        [input.title, handle, input.description ?? null, input.status ?? "draft"]
      )
      const product = rows[0]
      for (const v of input.variants ?? []) {
        const vr = await client.query(
          `INSERT INTO product_variant (product_id, title, sku) VALUES ($1,$2,$3) RETURNING id`,
          [product.id, v.title, v.sku ?? null]
        )
        if (v.prices && v.prices.length > 0) {
          await this.setVariantPrices(client, vr.rows[0].id, v.prices)
        }
      }
      await client.query("COMMIT")
      const { eventBus } = await import("../infra/platform-infra.service")
      await eventBus.emit("product.created", { product_id: product.id }).catch(() => undefined)
      return product
    } catch (err: any) {
      await client.query("ROLLBACK")
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Product with handle ${handle} already exists`), { statusCode: 409 })
      }
      throw err
    } finally {
      client.release()
    }
  }

  async update(id: string, patch: Partial<{ title: string; handle: string; subtitle: string | null; description: string | null; status: string; thumbnail: string | null; weight: number | null; discountable: boolean; collection_id: string | null; type_id: string | null; shipping_profile_id: string | null; metadata: Record<string, unknown> | null }>): Promise<ProductDTO> {
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      params.push(v)
      sets.push(`${k} = $${params.length}`)
    }
    if (sets.length === 0) {
      const cur = await this.retrieve(id)
      if (!cur) throw notFound("Product not found")
      return cur
    }
    params.push(id)
    try {
      const { rows } = await pool.query(
        `UPDATE product SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
        params
      )
      if (!rows[0]) throw notFound("Product not found")
      const { eventBus } = await import("../infra/platform-infra.service")
      await eventBus.emit("product.updated", { product_id: id }).catch(() => undefined)
      return rows[0]
    } catch (err: any) {
      if (err?.code === "23505") throw Object.assign(new Error("Handle already exists"), { statusCode: 409 })
      throw err
    }
  }

  // ---- single-call create/update contract (Lupus-shaped: options+variants+images+
  // prices+categories+tags+collection+type in one transaction) ----

  private validateCreateFullInput(input: CreateProductFullInput): void {
    const optionTitles = (input.options ?? []).map((o) => o.title)
    const seen = new Set<string>()
    for (const t of optionTitles) {
      if (seen.has(t)) throw badRequest(`Duplicate product option: ${t}`)
      seen.add(t)
    }
    for (const v of input.variants ?? []) {
      if (!v.prices || v.prices.length === 0) {
        throw badRequest(`Variant "${v.title}" must have at least one price`)
      }
      for (const t of optionTitles) {
        if (!v.options?.[t]) {
          throw badRequest(`Variant "${v.title}" is missing a value for option "${t}"`)
        }
      }
    }
  }

  private validateUpdateFullInput(patch: UpdateProductFullInput): void {
    const optionTitles = (patch.options ?? []).map((o) => o.title)
    const seen = new Set<string>()
    for (const t of optionTitles) {
      if (seen.has(t)) throw badRequest(`Duplicate product option: ${t}`)
      seen.add(t)
    }
    if (patch.options !== undefined && patch.variants !== undefined) {
      // Only brand-new variants (no id) must state a value for every option here —
      // an existing variant being partially patched (e.g. just a price change)
      // keeps whatever option assignment it already has unless it resends `options`.
      for (const v of patch.variants) {
        if (v.id) continue
        for (const t of optionTitles) {
          if (!v.options?.[t]) {
            throw badRequest(`Variant "${v.title}" is missing a value for option "${t}"`)
          }
        }
      }
    }
    for (const v of patch.variants ?? []) {
      if (!v.id && (!v.prices || v.prices.length === 0)) {
        throw badRequest(`Variant "${v.title}" must have at least one price`)
      }
    }
  }

  private async insertVariantRow(client: any, productId: string, v: CreateProductVariantInput): Promise<string> {
    const { rows } = await client.query(
      `INSERT INTO product_variant (product_id, title, sku, barcode, ean, upc, manage_inventory, allow_backorder, variant_rank, origin_country, mid_code, material, hs_code, weight, length, height, width, thumbnail, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        productId,
        v.title,
        v.sku ?? null,
        v.barcode ?? null,
        v.ean ?? null,
        v.upc ?? null,
        v.manage_inventory ?? true,
        v.allow_backorder ?? false,
        v.variant_rank ?? null,
        v.origin_country ?? null,
        v.mid_code ?? null,
        v.material ?? null,
        v.hs_code ?? null,
        v.weight ?? null,
        v.length ?? null,
        v.height ?? null,
        v.width ?? null,
        v.thumbnail ?? null,
        v.metadata ? JSON.stringify(v.metadata) : null,
      ]
    )
    return rows[0].id as string
  }

  private async updateVariantRow(client: any, variantId: string, v: Partial<CreateProductVariantInput>): Promise<void> {
    const sets: string[] = []
    const params: any[] = []
    for (const k of VARIANT_SCALAR_COLUMNS) {
      const value = (v as any)[k]
      if (value !== undefined) {
        params.push(value)
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (v.metadata !== undefined) {
      params.push(v.metadata ? JSON.stringify(v.metadata) : null)
      sets.push(`metadata = $${params.length}`)
    }
    if (sets.length === 0) return
    params.push(variantId)
    await client.query(`UPDATE product_variant SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params)
  }

  /** Create (or replace) the variant's base (non price-list) price_set rows. */
  private async setVariantPrices(client: any, variantId: string, prices: CreateProductVariantPriceInput[]): Promise<void> {
    const cur = await client.query(`SELECT price_set_id FROM product_variant WHERE id = $1`, [variantId])
    let priceSetId = cur.rows[0]?.price_set_id as string | undefined
    if (!priceSetId) {
      const ps = await client.query(`INSERT INTO price_set DEFAULT VALUES RETURNING id`)
      priceSetId = ps.rows[0].id
      await client.query(`UPDATE product_variant SET price_set_id = $2 WHERE id = $1`, [variantId, priceSetId])
    }
    await client.query(`UPDATE price SET deleted_at = NOW() WHERE price_set_id = $1 AND price_list_id IS NULL AND deleted_at IS NULL`, [priceSetId])
    for (const p of prices) {
      await client.query(
        `INSERT INTO price (price_set_id, currency_code, amount, min_quantity, max_quantity, price_list_id) VALUES ($1,$2,$3,$4,$5,NULL)
         ON CONFLICT (price_set_id, currency_code) WHERE price_list_id IS NULL AND deleted_at IS NULL
         DO UPDATE SET amount = $3, min_quantity = $4, max_quantity = $5, deleted_at = NULL`,
        [priceSetId, p.currency_code.toLowerCase(), p.amount, p.min_quantity ?? null, p.max_quantity ?? null]
      )
    }
  }

  /** Link explicit inventory items, or auto-create a default one (Lupus: createProductVariantsWorkflow). */
  private async setupVariantInventory(client: any, variantId: string, v: CreateProductVariantInput): Promise<void> {
    if (v.manage_inventory === false) return
    if (v.inventory_items && v.inventory_items.length > 0) {
      for (const link of v.inventory_items) {
        const exists = await client.query(`SELECT id FROM inventory_item WHERE id = $1 AND deleted_at IS NULL`, [link.inventory_item_id])
        if (!exists.rows[0]) {
          throw notFound(`Inventory item not found: ${link.inventory_item_id}`)
        }
        await client.query(
          `INSERT INTO variant_inventory_item (variant_id, inventory_item_id, required_quantity) VALUES ($1,$2,$3)
           ON CONFLICT (variant_id, inventory_item_id) DO UPDATE SET required_quantity = $3`,
          [variantId, link.inventory_item_id, link.required_quantity ?? 1]
        )
      }
      return
    }
    const already = await client.query(`SELECT 1 FROM variant_inventory_item WHERE variant_id = $1 LIMIT 1`, [variantId])
    if (already.rows[0]) return
    const item = await client.query(
      `INSERT INTO inventory_item (sku, origin_country, hs_code, requires_shipping, title, description, weight, length, height, width, mid_code, material)
       VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [v.sku ?? null, v.origin_country ?? null, v.hs_code ?? null, v.title, v.title, v.weight ?? null, v.length ?? null, v.height ?? null, v.width ?? null, v.mid_code ?? null, v.material ?? null]
    )
    await client.query(`INSERT INTO variant_inventory_item (variant_id, inventory_item_id, required_quantity) VALUES ($1,$2,1)`, [variantId, item.rows[0].id])
  }

  private async upsertTag(client: any, t: { id?: string; value?: string }): Promise<string | undefined> {
    if (t.id) return t.id
    if (!t.value) return undefined
    const tr = await client.query(`INSERT INTO product_tag (value) VALUES ($1) ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value = $1 RETURNING id`, [t.value])
    return tr.rows[0].id as string
  }

  async createFull(input: CreateProductFullInput): Promise<ProductDTO> {
    if (!input.title) throw badRequest("title is required")
    this.validateCreateFullInput(input)
    const handle = input.handle ?? toHandle(input.title)
    if (!/^[a-z0-9-]+$/.test(handle)) {
      throw badRequest(`Invalid handle: ${handle}`)
    }
    const images = input.images ?? []
    const thumbnail = input.thumbnail ?? images[0]?.url ?? null
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO product (title, handle, subtitle, description, is_giftcard, status, thumbnail, weight, discountable, external_id, metadata, collection_id, type_id, shipping_profile_id, height, width, length, mid_code, hs_code, origin_country, material)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [
          input.title,
          handle,
          input.subtitle ?? null,
          input.description ?? null,
          input.is_giftcard ?? false,
          input.status ?? "draft",
          thumbnail,
          input.weight ?? null,
          input.discountable ?? true,
          input.external_id ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
          input.collection_id ?? null,
          input.type_id ?? null,
          input.shipping_profile_id ?? null,
          input.height ?? null,
          input.width ?? null,
          input.length ?? null,
          input.mid_code ?? null,
          input.hs_code ?? null,
          input.origin_country ?? null,
          input.material ?? null,
        ]
      )
      const product = rows[0]
      const productId = product.id as string

      for (let i = 0; i < images.length; i++) {
        await client.query(`INSERT INTO product_image (product_id, url, rank) VALUES ($1,$2,$3)`, [productId, images[i].url, i])
      }

      for (const o of input.options ?? []) {
        const created = await client.query(`INSERT INTO product_option (product_id, title) VALUES ($1,$2) RETURNING id`, [productId, o.title])
        const optionId = created.rows[0].id
        for (const v of [...new Set(o.values)]) {
          await client.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2)`, [optionId, v])
        }
      }

      for (const v of input.variants ?? []) {
        const variantId = await this.insertVariantRow(client, productId, v)
        if (v.options) {
          await assignVariantOptions(client, productId, variantId, v.options)
        }
        await this.setVariantPrices(client, variantId, v.prices)
        await this.setupVariantInventory(client, variantId, v)
      }

      for (const c of input.categories ?? []) {
        await client.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [productId, c.id])
      }

      for (const t of input.tags ?? []) {
        const tagId = await this.upsertTag(client, t)
        if (tagId) {
          await client.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [productId, tagId])
        }
      }

      for (const sc of input.sales_channels ?? []) {
        await client.query(`INSERT INTO product_sales_channel (product_id, sales_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [productId, sc.id])
      }

      await client.query("COMMIT")
      const { eventBus } = await import("../infra/platform-infra.service")
      await eventBus.emit("product.created", { product_id: productId }).catch(() => undefined)
      const full = await this.retrieve(productId)
      return full as ProductDTO
    } catch (err: any) {
      await client.query("ROLLBACK")
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Product with handle ${handle} already exists`), { statusCode: 409 })
      }
      throw err
    } finally {
      client.release()
    }
  }

  async updateFull(id: string, patch: UpdateProductFullInput): Promise<ProductDTO> {
    this.validateUpdateFullInput(patch)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const existing = await client.query(`SELECT id FROM product WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id])
      if (!existing.rows[0]) {
        throw notFound("Product not found")
      }

      const sets: string[] = []
      const params: any[] = []
      for (const k of ["title", "handle", "subtitle", "description", "status", "thumbnail", "weight", "discountable", "external_id", "collection_id", "type_id", "shipping_profile_id", "height", "width", "length", "mid_code", "hs_code", "origin_country", "material"] as const) {
        const v = (patch as any)[k]
        if (v !== undefined) {
          params.push(v)
          sets.push(`${k} = $${params.length}`)
        }
      }
      if (patch.metadata !== undefined) {
        params.push(patch.metadata ? JSON.stringify(patch.metadata) : null)
        sets.push(`metadata = $${params.length}`)
      }
      if (sets.length > 0) {
        params.push(id)
        await client.query(`UPDATE product SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params)
      }

      if (patch.images !== undefined) {
        const keepIds = patch.images.filter((i) => i.id).map((i) => i.id as string)
        if (keepIds.length > 0) {
          await client.query(`DELETE FROM product_image WHERE product_id = $1 AND id <> ALL($2)`, [id, keepIds])
        } else {
          await client.query(`DELETE FROM product_image WHERE product_id = $1`, [id])
        }
        for (let i = 0; i < patch.images.length; i++) {
          const img = patch.images[i]
          if (img.id) {
            await client.query(`UPDATE product_image SET url = $2, rank = $3 WHERE id = $1 AND product_id = $4`, [img.id, img.url, i, id])
          } else {
            await client.query(`INSERT INTO product_image (product_id, url, rank) VALUES ($1,$2,$3)`, [id, img.url, i])
          }
        }
      }

      if (patch.options !== undefined) {
        const keepIds = patch.options.filter((o) => o.id).map((o) => o.id as string)
        const existingOpts = await client.query(`SELECT id FROM product_option WHERE product_id = $1 AND deleted_at IS NULL`, [id])
        for (const row of existingOpts.rows) {
          if (!keepIds.includes(row.id)) {
            await client.query(`UPDATE product_option SET deleted_at = NOW() WHERE id = $1`, [row.id])
            await client.query(`UPDATE product_option_value SET deleted_at = NOW() WHERE option_id = $1`, [row.id])
          }
        }
        for (const o of patch.options) {
          if (o.id) {
            await client.query(`UPDATE product_option SET title = $2, deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [o.id, o.title])
            const existingVals = await client.query(`SELECT id, value FROM product_option_value WHERE option_id = $1 AND deleted_at IS NULL`, [o.id])
            const wantValues = new Set(o.values)
            for (const row of existingVals.rows) {
              if (!wantValues.has(row.value)) {
                await client.query(`UPDATE product_option_value SET deleted_at = NOW() WHERE id = $1`, [row.id])
              }
            }
            const haveValues = new Set(existingVals.rows.map((r: any) => r.value))
            for (const val of o.values) {
              if (!haveValues.has(val)) {
                await client.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2)`, [o.id, val])
              }
            }
          } else {
            const created = await client.query(`INSERT INTO product_option (product_id, title) VALUES ($1,$2) RETURNING id`, [id, o.title])
            for (const val of [...new Set(o.values)]) {
              await client.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2)`, [created.rows[0].id, val])
            }
          }
        }
      }

      if (patch.variants !== undefined) {
        const keepIds = patch.variants.filter((v) => v.id).map((v) => v.id as string)
        const existingVariants = await client.query(`SELECT id FROM product_variant WHERE product_id = $1 AND deleted_at IS NULL`, [id])
        for (const row of existingVariants.rows) {
          if (!keepIds.includes(row.id)) {
            await client.query(`UPDATE product_variant SET deleted_at = NOW() WHERE id = $1`, [row.id])
          }
        }
        for (const v of patch.variants) {
          let variantId = v.id
          if (variantId) {
            await this.updateVariantRow(client, variantId, v)
          } else {
            variantId = await this.insertVariantRow(client, id, v as CreateProductVariantInput)
          }
          if (v.options) {
            await assignVariantOptions(client, id, variantId, v.options)
          }
          if (v.prices) {
            await this.setVariantPrices(client, variantId, v.prices)
          }
          if (v.manage_inventory !== false) {
            await this.setupVariantInventory(client, variantId, v as CreateProductVariantInput)
          }
        }
      }

      if (patch.categories !== undefined) {
        await client.query(`DELETE FROM product_category_product WHERE product_id = $1`, [id])
        for (const c of patch.categories) {
          await client.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, c.id])
        }
      }

      if (patch.tags !== undefined) {
        await client.query(`DELETE FROM product_tags WHERE product_id = $1`, [id])
        for (const t of patch.tags) {
          const tagId = await this.upsertTag(client, t)
          if (tagId) {
            await client.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, tagId])
          }
        }
      }

      if (patch.sales_channels !== undefined) {
        await client.query(`DELETE FROM product_sales_channel WHERE product_id = $1`, [id])
        for (const sc of patch.sales_channels) {
          await client.query(`INSERT INTO product_sales_channel (product_id, sales_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, sc.id])
        }
      }

      await client.query("COMMIT")
      const { eventBus } = await import("../infra/platform-infra.service")
      await eventBus.emit("product.updated", { product_id: id }).catch(() => undefined)
      return (await this.retrieve(id)) as ProductDTO
    } catch (err: any) {
      await client.query("ROLLBACK")
      if (err?.code === "23505") throw Object.assign(new Error("Handle already exists"), { statusCode: 409 })
      throw err
    } finally {
      client.release()
    }
  }

  // ---- variants (admin/product-variants parity) ----
  async listVariants(productId: string) {
    const { rows } = await pool.query(
      `SELECT v.*,
         COALESCE((SELECT json_agg(json_build_object('currency_code', p.currency_code, 'amount', p.amount))
                   FROM price p WHERE p.price_set_id = v.price_set_id AND p.price_list_id IS NULL AND p.deleted_at IS NULL), '[]') AS prices
       FROM product_variant v WHERE v.product_id = $1 AND v.deleted_at IS NULL ORDER BY v.created_at`,
      [productId]
    )
    return rows
  }

  async createVariant(productId: string, input: { title: string; sku?: string; prices?: { currency_code: string; amount: number }[]; options?: Record<string, string> }) {
    const p = await this.retrieve(productId)
    if (!p) throw notFound("Product not found")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const vr = await client.query(`INSERT INTO product_variant (product_id, title, sku) VALUES ($1,$2,$3) RETURNING *`, [productId, input.title, input.sku ?? null])
      const variantId = vr.rows[0].id as string
      if (input.prices && input.prices.length > 0) {
        await this.setVariantPrices(client, variantId, input.prices)
      }
      await assignVariantOptions(client, productId, variantId, input.options ?? {})
      await client.query("COMMIT")
      return vr.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async updateVariant(variantId: string, patch: Partial<{ title: string; sku: string | null }>) {
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      params.push(v)
      sets.push(`${k} = $${params.length}`)
    }
    if (sets.length === 0) return null
    params.push(variantId)
    const { rows } = await pool.query(`UPDATE product_variant SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`, params)
    if (!rows[0]) throw notFound("Variant not found")
    return rows[0]
  }

  async deleteVariant(variantId: string) {
    await pool.query(`UPDATE product_variant SET deleted_at = NOW() WHERE id = $1`, [variantId])
  }

  // ---- options (admin/product-options parity) ----
  async listOptions(productId: string) {
    const { rows } = await pool.query(
      `SELECT o.*, COALESCE((SELECT json_agg(json_build_object('id', id, 'value', value) ORDER BY rank, created_at) FROM product_option_value WHERE option_id = o.id AND deleted_at IS NULL), '[]') AS values
       FROM product_option o WHERE o.product_id = $1 AND o.deleted_at IS NULL ORDER BY o.created_at`,
      [productId]
    )
    return rows
  }

  async createOption(productId: string, title: string, values: string[] = []) {
    const p = await this.retrieve(productId)
    if (!p) throw notFound("Product not found")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const o = await client.query(`INSERT INTO product_option (product_id, title) VALUES ($1,$2) RETURNING *`, [productId, title])
      for (const v of [...new Set(values)]) {
        await client.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2)`, [o.rows[0].id, v])
      }
      await client.query("COMMIT")
      return o.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  /** Global (non-exclusive) option: a reusable title + values template not owned by a product. */
  async createGlobalOption(title: string, values: string[] = []) {
    const t = title.trim()
    if (!t) throw badRequest("Option title is required")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const o = await client.query(
        `INSERT INTO product_option (product_id, title, is_exclusive) VALUES (NULL, $1, FALSE) RETURNING *`,
        [t]
      )
      const ordered = [...new Set(values.map((x) => x.trim()).filter(Boolean))]
      for (let i = 0; i < ordered.length; i++) {
        await client.query(`INSERT INTO product_option_value (option_id, value, rank) VALUES ($1,$2,$3)`, [o.rows[0].id, ordered[i], i])
      }
      await client.query("COMMIT")
      return o.rows[0]
    } catch (e: any) {
      await client.query("ROLLBACK")
      if (e?.code === "23505") throw Object.assign(new Error(`A global option named "${t}" already exists`), { statusCode: 409 })
      throw e
    } finally {
      client.release()
    }
  }

  async addOptionValue(optionId: string, value: string) {
    const { rows } = await pool.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2) RETURNING *`, [optionId, value])
    return rows[0]
  }

  async deleteOption(optionId: string) {
    await pool.query(`UPDATE product_option SET deleted_at = NOW() WHERE id = $1`, [optionId])
    await pool.query(`UPDATE product_option_value SET deleted_at = NOW() WHERE option_id = $1`, [optionId])
  }

  async softDelete(id: string): Promise<void> {
    await pool.query(`UPDATE product SET deleted_at = NOW() WHERE id = $1`, [id])
    await pool.query(`UPDATE product_variant SET deleted_at = NOW() WHERE product_id = $1`, [id])
  }
}

export const productService = new ProductService()
