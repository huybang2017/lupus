// Plain-TS port of Lupus product DTOs.
// Source: upstream/packages/modules/product + its ProductTypes
// Lupus `InferEntityType<typeof Product>` -> explicit interface. No DML inference.

export type ProductStatus = "draft" | "proposed" | "published" | "rejected"

export interface ProductDTO {
  id: string
  title: string
  handle: string
  subtitle?: string | null
  description?: string | null
  is_giftcard: boolean
  status: ProductStatus
  thumbnail?: string | null
  weight?: number | null
  discountable: boolean
  external_id?: string | null
  metadata?: Record<string, unknown> | null
  collection_id?: string | null
  type_id?: string | null
  created_at: string
  updated_at: string
}

export interface ProductVariantDTO {
  id: string
  product_id: string
  title: string
  sku?: string | null
  manage_inventory: boolean
  allow_backorder: boolean
  inventory_quantity: number
  prices: { currency_code: string; amount: number }[]
}

export interface CreateProductInput {
  title: string
  handle?: string
  description?: string | null
  status?: ProductStatus
  variants?: { title: string; sku?: string; prices?: { currency_code: string; amount: number }[] }[]
}

// ---- Single-call create/update contract (Lupus-shaped: options+variants+images+
// prices+categories+tags+collection+type in one transaction) ----

export interface CreateProductImageInput {
  url: string
}

export interface CreateProductOptionInput {
  title: string
  values: string[]
}

export interface CreateProductVariantPriceInput {
  currency_code: string
  amount: number
  min_quantity?: number | null
  max_quantity?: number | null
}

export interface CreateProductVariantInput {
  title: string
  sku?: string | null
  barcode?: string | null
  ean?: string | null
  upc?: string | null
  manage_inventory?: boolean
  allow_backorder?: boolean
  variant_rank?: number
  origin_country?: string | null
  mid_code?: string | null
  material?: string | null
  hs_code?: string | null
  weight?: number | null
  length?: number | null
  height?: number | null
  width?: number | null
  thumbnail?: string | null
  metadata?: Record<string, unknown> | null
  prices: CreateProductVariantPriceInput[]
  options?: Record<string, string>
  inventory_items?: { inventory_item_id: string; required_quantity?: number }[]
}

export interface CreateProductFullInput {
  title: string
  handle?: string
  subtitle?: string | null
  description?: string | null
  is_giftcard?: boolean
  status?: ProductStatus
  thumbnail?: string | null
  weight?: number | null
  discountable?: boolean
  external_id?: string | null
  metadata?: Record<string, unknown> | null
  collection_id?: string | null
  type_id?: string | null
  shipping_profile_id?: string | null
  height?: number | null
  width?: number | null
  length?: number | null
  mid_code?: string | null
  hs_code?: string | null
  origin_country?: string | null
  material?: string | null
  images?: CreateProductImageInput[]
  options?: CreateProductOptionInput[]
  variants?: CreateProductVariantInput[]
  categories?: { id: string }[]
  tags?: { id?: string; value?: string }[]
  sales_channels?: { id: string }[]
}

export interface UpdateProductVariantInput extends Partial<CreateProductVariantInput> {
  id?: string
  title: string
}

export interface UpdateProductFullInput {
  title?: string
  handle?: string
  subtitle?: string | null
  description?: string | null
  status?: ProductStatus
  thumbnail?: string | null
  weight?: number | null
  discountable?: boolean
  external_id?: string | null
  metadata?: Record<string, unknown> | null
  collection_id?: string | null
  type_id?: string | null
  shipping_profile_id?: string | null
  height?: number | null
  width?: number | null
  length?: number | null
  mid_code?: string | null
  hs_code?: string | null
  origin_country?: string | null
  material?: string | null
  images?: ({ id?: string } & CreateProductImageInput)[]
  options?: ({ id?: string } & CreateProductOptionInput)[]
  variants?: UpdateProductVariantInput[]
  categories?: { id: string }[]
  tags?: { id?: string; value?: string }[]
  sales_channels?: { id: string }[]
}

export interface ListProductFilters {
  status?: ProductStatus
  handle?: string
  q?: string
  limit?: number
  offset?: number
  /** Only products published in one of these sales channels (a publishable key scopes the storefront). */
  sales_channel_ids?: string[]
}
