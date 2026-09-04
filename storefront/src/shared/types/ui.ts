import { StorePrice } from "@/shared/types/http"

export type IconProps = {
  color?: string
  size?: string | number
} & React.SVGAttributes<SVGElement>

export type VariantPrice = {
  calculated_price_number: number
  calculated_price: string
  original_price_number: number
  original_price: string
  currency_code: string
  price_type: string
  percentage_diff: string
}

export type StoreFreeShippingPrice = StorePrice & {
  target_reached: boolean
  target_remaining: number
  remaining_percentage: number
}