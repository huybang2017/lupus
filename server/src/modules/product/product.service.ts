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
