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

