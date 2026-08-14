// Mirrors server/src/modules/product/product.types.ts
// (CreateProductFullInput/UpdateProductFullInput/ProductDTO). No shared workspace
// package exists between client/storefront/server today, so this is kept in sync by
// hand — same convention as storefront/src/types/catalog.ts.

export type ProductStatus = "draft" | "proposed" | "published" | "rejected";

export interface MoneyAmount {
  currency_code: string;
  amount: number;
}

export interface ProductOptionValue {
  id?: string;
  value: string;
}

export interface ProductOption {
  id: string;
  title: string;
  values?: ProductOptionValue[] | null;
}

export interface ProductImage {
  id: string;
  url: string;
  rank?: number;
}

/** A row of a variant's `inventory_items` join, as the admin API returns it. */
export interface ProductVariantInventoryItem {
  inventory_item_id: string;
  required_quantity?: number | null;
  id?: string | null;
  sku?: string | null;
  inventory?: { id?: string; sku?: string | null } | null;
}

export interface ProductVariant {
  id: string;
  product_id?: string | null;
  title: string;
  sku?: string | null;
  ean?: string | null;
  upc?: string | null;
  barcode?: string | null;
  material?: string | null;
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  prices?: MoneyAmount[] | null;
  options?: Record<string, string> | null;
  inventory_items?: ProductVariantInventoryItem[] | null;
  images?: ProductImage[] | null;
  variant_rank?: number | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  weight?: number | null;
  mid_code?: string | null;
  hs_code?: string | null;
  origin_country?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProductTypeRef {
  id: string;
  value?: string | null;
  title?: string | null;
}

export interface ProductCollectionRef {
  id: string;
  title?: string | null;
}

export interface ProductCategoryRef {
  id: string;
  name?: string | null;
}

/** `value` is always present; `name` is only a legacy fallback for older rows. */
export interface ProductTagRef {
  id?: string;
  value: string;
  name?: string;
}

/** The physical/ customs attributes the attribute drawer reads and submits. */
export type ProductAttributeKey =
  | "height"
  | "width"
  | "length"
  | "weight"
  | "mid_code"
  | "hs_code"
  | "origin_country";

/** Every field the variant drawer seeds its form from. */
export type ProductVariantFieldKey =
  | ProductAttributeKey
  | "title"
  | "material"
  | "sku"
  | "ean"
  | "upc"
  | "barcode";

export interface Product {
  id: string;
  title: string;
  handle?: string | null;
  subtitle?: string | null;
  description?: string | null;
  status?: ProductStatus;
  thumbnail?: string | null;
  material?: string | null;
  discountable?: boolean;
  collection_id?: string | null;
  type_id?: string | null;
  shipping_profile_id?: string | null;
  shipping_profile?: { id: string } | null;
  type?: ProductTypeRef | null;
  collection?: ProductCollectionRef | null;
  categories?: ProductCategoryRef[] | null;
  tags?: ProductTagRef[] | null;
  variants?: ProductVariant[] | null;
  options?: ProductOption[] | null;
  images?: ProductImage[] | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  weight?: number | null;
  mid_code?: string | null;
  hs_code?: string | null;
  origin_country?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateProductVariantPayload {
  title: string;
  sku?: string;
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  variant_rank?: number;
  prices: MoneyAmount[];
  options?: Record<string, string>;
}

export interface CreateProductPayload {
  title: string;
  handle?: string;
  subtitle?: string;
  description?: string;
  status: ProductStatus;
  thumbnail?: string;
  discountable?: boolean;
  shipping_profile_id?: string;
  images?: { url: string }[];
  options?: { title: string; values: string[] }[];
  variants: CreateProductVariantPayload[];
  collection_id?: string;
  type_id?: string;
  categories?: { id: string }[];
  tags?: { value: string }[];
  sales_channels?: { id: string }[];
}
