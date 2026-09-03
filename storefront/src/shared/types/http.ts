// Store API types, shaped after the upstream store HttpTypes (the storefront has no framework dependency).
// Fields the lupus API may omit are optional; the index signature keeps rarely used fields reachable.

type Metadata = Record<string, any> | null

export namespace HttpTypes {
  export interface FindParams {
    limit?: number
    offset?: number
    order?: string
    fields?: string
  }

  export interface StoreCountry {
    iso_2: string
    name?: string
    display_name?: string
  }

  export interface StorePaymentProvider {
    id: string
    is_enabled?: boolean
  }

  export interface StoreRegion {
    id: string
    name: string
    currency_code: string
    automatic_taxes?: boolean
    is_tax_inclusive?: boolean
    countries?: StoreCountry[]
    payment_providers?: StorePaymentProvider[]
    metadata?: Metadata
    [key: string]: any
  }

  export interface StoreCartAddress {
    id?: string
    first_name?: string | null
    last_name?: string | null
    company?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    country_code?: string | null
    province?: string | null
    postal_code?: string | null
    phone?: string | null
    metadata?: Metadata
    [key: string]: any
  }

  export interface StoreProductImage {
    id: string
    url: string
    rank?: number
  }

  export interface StoreProductOptionValue {
    id: string
    value: string
    option_id?: string
  }

  export interface StoreProductOption {
    id: string
    title: string
    product_id?: string
    values?: StoreProductOptionValue[]
  }

  export interface StorePrice {
    id?: string
    amount: number
    currency_code: string
    min_quantity?: number | null
    max_quantity?: number | null
    [key: string]: any
  }

  export interface StoreCalculatedPrice {
    calculated_amount: number
    original_amount: number
    currency_code: string
    is_calculated_price_price_list?: boolean
    calculated_price?: { price_list_type?: string | null }
    [key: string]: any
  }

  export interface StoreProductVariant {
    id: string
    title?: string | null
    sku?: string | null
    product_id?: string
    manage_inventory?: boolean
    allow_backorder?: boolean
    inventory_quantity?: number | null
    thumbnail?: string | null
    options?: { id?: string; option_id?: string; value: string; option?: { id?: string; title?: string } }[]
    prices?: StorePrice[]
    calculated_price?: StoreCalculatedPrice
    metadata?: Metadata
    [key: string]: any
  }

  export interface StoreCollection {
    id: string
    title: string
    handle: string
    metadata?: Metadata
    products?: StoreProduct[]
    [key: string]: any
  }

  export interface StoreProductCategory {
    id: string
    name: string
    handle: string
    description?: string
    parent_category?: StoreProductCategory | null
    parent_category_id?: string | null
    category_children?: StoreProductCategory[]
    products?: StoreProduct[]
    [key: string]: any
  }

  export interface StoreProductTag {
    id: string
    value: string
  }

  export interface StoreProduct {
    id: string
    title: string
    handle: string
    subtitle?: string | null
    description?: string | null
    thumbnail?: string | null
    status?: string
    material?: string | null
    origin_country?: string | null
    weight?: number | null
    length?: number | null
    height?: number | null
    width?: number | null
    created_at?: string
    metadata?: Metadata
    images?: StoreProductImage[] | null
    options?: StoreProductOption[] | null
    variants?: StoreProductVariant[] | null
    collection_id?: string | null
    collection?: StoreCollection | null
    type?: { id: string; value: string } | null
    categories?: StoreProductCategory[] | null
    tags?: StoreProductTag[] | null
    [key: string]: any
  }

  export interface StoreProductListParams extends FindParams {
    q?: string
    id?: string | string[]
    handle?: string | string[]
    collection_id?: string | string[]
    category_id?: string | string[]
    type_id?: string | string[]
    tag_id?: string | string[]
    region_id?: string
    [key: string]: any
  }

  export interface StorePromotion {
    id?: string
    code?: string
    is_automatic?: boolean
    application_method?: { type?: string; value?: number; currency_code?: string | null; target_type?: string; allocation?: string | null }
    [key: string]: any
