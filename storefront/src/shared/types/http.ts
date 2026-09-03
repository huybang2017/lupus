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
  }

  export interface StorePaymentSession {
    id: string
    provider_id: string
    status?: string
    data?: Record<string, any>
    [key: string]: any
  }

  export interface StorePaymentCollection {
    id: string
    status?: string
    amount?: number
    currency_code?: string
    payment_sessions?: StorePaymentSession[]
    payments?: { id: string; provider_id: string; amount: number; created_at?: string; data?: Record<string, any> }[]
    [key: string]: any
  }

  export interface StoreCartShippingMethod {
    id: string
    name: string
    amount: number
    total?: number
    shipping_option_id?: string | null
    data?: Record<string, any>
    [key: string]: any
  }

  export interface StoreCartShippingOption {
    id: string
    name: string
    amount?: number
    price_type?: string
    calculated_price?: { calculated_amount: number; original_amount?: number; currency_code?: string }
    insufficient_inventory?: boolean
    data?: Record<string, any> | null
    service_zone?: { fulfillment_set?: { type?: string; location?: { address?: StoreCartAddress | null } } }
    type?: { id?: string; label?: string; code?: string }
    [key: string]: any
  }

  export interface StoreCartLineItem {
    id: string
    cart_id?: string
    title: string
    product_title?: string | null
    product_handle?: string | null
    product_id?: string | null
    variant_id?: string | null
    variant_title?: string | null
    variant?: { id: string; sku?: string | null; title?: string | null; options?: StoreProductVariant["options"] } | null
    thumbnail?: string | null
    quantity: number
    unit_price: number
    compare_at_unit_price?: number | null
    original_unit_price?: number
    subtotal?: number
    total?: number
    original_total?: number
    tax_total?: number
    discount_total?: number
    requires_shipping?: boolean
    [key: string]: any
  }

  export interface StoreCart {
    id: string
    region_id?: string | null
    customer_id?: string | null
    email?: string | null
    currency_code: string
    region?: StoreRegion | null
    items?: StoreCartLineItem[]
    shipping_address?: StoreCartAddress | null
    billing_address?: StoreCartAddress | null
    shipping_methods?: StoreCartShippingMethod[]
    promotions?: StorePromotion[]
    payment_collection?: StorePaymentCollection | null
    subtotal: number
    item_subtotal?: number
    item_total?: number
    total: number
    tax_total: number
    discount_total: number
    shipping_subtotal?: number
    shipping_total: number
    gift_card_total?: number
    metadata?: Metadata
    [key: string]: any
  }

  export interface StoreUpdateCart {
    email?: string
    region_id?: string
    shipping_address?: StoreCartAddress
    billing_address?: StoreCartAddress
    promo_codes?: string[]
    locale?: string
    metadata?: Metadata
  }

  export interface StoreOrderLineItem extends StoreCartLineItem {
    order_id?: string
  }

  export interface StoreOrder {
    id: string
    display_id: number
    status?: string
    email?: string | null
    currency_code: string
    created_at: string
    items?: StoreOrderLineItem[]
    shipping_address?: StoreCartAddress | null
    billing_address?: StoreCartAddress | null
    shipping_methods?: StoreCartShippingMethod[]
    payment_collections?: StorePaymentCollection[]
    payment_status?: string
    fulfillment_status?: string
    subtotal: number
    item_subtotal?: number
    total: number
    tax_total: number
    discount_total: number
    shipping_total: number
    gift_card_total: number
    [key: string]: any
  }

  export interface StoreCustomerAddress {
    id: string
    address_name?: string | null
    is_default_shipping?: boolean
    is_default_billing?: boolean
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
    [key: string]: any
  }

  export interface StoreCustomer {
    id: string
    email: string
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    company_name?: string | null
    has_account?: boolean
    addresses: StoreCustomerAddress[]
    orders?: StoreOrder[]
    metadata?: Metadata
    [key: string]: any
  }

  export interface StoreUpdateCustomer {
    first_name?: string
    last_name?: string
    phone?: string
    company_name?: string
    email?: string
  }
}

export type StoreCart = HttpTypes.StoreCart
export type StoreCustomer = HttpTypes.StoreCustomer
export type StorePrice = HttpTypes.StorePrice
export type StoreCartShippingOption = HttpTypes.StoreCartShippingOption
