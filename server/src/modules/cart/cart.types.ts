// Port of Lupus cart DTOs + totals (packages/modules/cart + core-flows/src/cart totals).
// Lupus BigNumber fields mapped: subtotal, discount_total (negative), shipping,
// tax_total (exclusive; inclusive lines already contain tax), total.
export interface CartLineItemDTO {
  id: string
  cart_id: string
  variant_id: string | null
  product_id: string | null
  title: string
  quantity: number
  unit_price: number
  is_tax_inclusive: boolean
  discount_total: number
  adjustments: { code: string | null; amount: number }[]
  tax_lines: { code: string | null; rate: number }[]
}

export interface CartTotals {
  subtotal: number
  discount_total: number
  shipping: number
  tax_total: number
  gift_card_total: number
  credit_total: number
  total: number
}

export interface CartDTO {
  id: string
  region_id: string | null
  customer_id: string | null
  email: string | null
  currency_code: string
  completed_at: string | null
  items: CartLineItemDTO[]
  totals: CartTotals
}

export interface CreateCartInput {
  region_id?: string
  customer_id?: string
  sales_channel_id?: string
  email?: string
  currency_code?: string
}

export interface AddLineItemInput {
  variant_id: string
  quantity: number
}

export function calcTotals(
  items: { quantity: number; unit_price: number; discount_total?: number; is_tax_inclusive?: boolean }[],
  shipping = 0,
  taxTotal = 0,
  giftTotal = 0,
  creditTotal = 0
): CartTotals {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const discount_total = items.reduce((s, i) => s + (i.discount_total ?? 0), 0)
  const hasInclusive = items.some((i) => i.is_tax_inclusive)
  const payable = Math.max(subtotal + discount_total + shipping + (hasInclusive ? 0 : taxTotal), 0)
  const gift_card_total = Math.min(giftTotal, payable)
  const credit_total = Math.min(creditTotal, payable - gift_card_total)
  return { subtotal, discount_total, shipping, tax_total: taxTotal, gift_card_total, credit_total, total: payable - gift_card_total - credit_total }
}
