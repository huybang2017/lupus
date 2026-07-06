// Port of Lupus order/payment DTOs (order.ts status enum, payment-collection.ts statuses).
export type OrderStatus = "pending" | "completed" | "archived" | "canceled" | "requires_action"
export type PaymentStatus = "not_paid" | "awaiting" | "authorized" | "captured" | "refunded" | "canceled"

export interface OrderLineDTO {
  id: string
  variant_id: string | null
  title: string
  quantity: number
  unit_price: number
  discount_total: number
}

export interface OrderDTO {
  id: string
  display_id: number
  cart_id: string | null
  customer_id: string | null
  email: string | null
  currency_code: string
  status: OrderStatus
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  total: number
  payment_status: PaymentStatus
  items: OrderLineDTO[]
}
