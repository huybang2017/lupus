import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const listCartShippingMethods = async (cartId: string) =>
  apiFetch<{ shipping_options: HttpTypes.StoreCartShippingOption[] }>("/store/shipping-options", { query: { cart_id: cartId } })
    .then(({ shipping_options }) => shipping_options)
    .catch(() => null)

export const calculatePriceForShippingOption = async (optionId: string, cartId: string, data?: Record<string, unknown>) =>
  apiFetch<{ shipping_option: HttpTypes.StoreCartShippingOption }>(`/store/shipping-options/${optionId}/calculate`, {
    method: "POST",
    body: { cart_id: cartId, ...(data ? { data } : {}) },
  })
    .then(({ shipping_option }) => shipping_option)
    .catch(() => null)
