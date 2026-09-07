import { apiFetch, clearApiCache } from "@/shared/api/client"
import { redirect } from "@/shared/navigation/navigation"
import { getCartId, removeCartId, setCartId } from "@/shared/storage/storage"
import { createStore } from "@/shared/store/create-store"
import { HttpTypes } from "@/shared/types/http"
import { getLocale } from "@/entities/locales"
import { getRegion } from "@/entities/regions"

// Client-side stand-in for the starter's server actions: each mutation talks to the Store API and then
// publishes the fresh cart to cartStore, which is what revalidateTag("carts") + a server re-render do there.
type CartState = { cart: HttpTypes.StoreCart | null; loaded: boolean }

export const cartStore = createStore<CartState>({ cart: null, loaded: false })

/** The current cart (null when there is none) and whether the first load finished. */
export const useCart = () => cartStore.use()

function publish(cart: HttpTypes.StoreCart | null) {
  cartStore.set({ cart, loaded: true })
}

/**
 * Retrieves a cart by its ID. If no ID is provided, it uses the cart ID kept in storage.
 * A cart that is gone or already completed is forgotten.
 */
export async function retrieveCart(cartId?: string): Promise<HttpTypes.StoreCart | null> {
  const id = cartId || getCartId()

  if (!id) {
    publish(null)
    return null
  }

  let cart = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${id}`)
    .then(({ cart }) => cart)
    .catch(() => null)

  if (cart?.completed_at) {
    cart = null
  }
  if (!cart && id === getCartId()) {
    removeCartId()
  }
  if (id === getCartId() || !cart) {
    publish(cart)
  }
  return cart
}

export async function getOrSetCart(countryCode: string) {
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  let cart = await retrieveCart()

  if (!cart) {
    const locale = getLocale()
    const resp = await apiFetch<{ cart: HttpTypes.StoreCart }>("/store/carts", {
      method: "POST",
      body: { region_id: region.id, ...(locale ? { locale } : {}) },
    })
    cart = resp.cart
    setCartId(cart.id)
    publish(cart)
  }

  if (cart && cart.region_id !== region.id) {
    cart = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cart.id}`, { method: "POST", body: { region_id: region.id } }).then(
      ({ cart }) => cart
    )
    publish(cart)
  }

  return cart
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = getCartId()

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const { cart } = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cartId}`, { method: "POST", body: data })
  publish(cart)
  return cart
}

export async function addToCart({ variantId, quantity, countryCode }: { variantId: string; quantity: number; countryCode: string }) {
  if (!variantId) {
    throw new Error("Missing variant ID when adding to cart")
  }

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  const resp = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cart.id}/line-items`, {
    method: "POST",
    body: { variant_id: variantId, quantity },
  })
  publish(resp.cart)
}

export async function updateLineItem({ lineId, quantity }: { lineId: string; quantity: number }) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when updating line item")
  }

  const cartId = getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when updating line item")
  }

  const resp = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cartId}/line-items/${lineId}`, {
    method: "POST",
    body: { quantity },
  })
  publish(resp.cart)
}

export async function deleteLineItem(lineId: string) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when deleting line item")
  }

  const cartId = getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when deleting line item")
  }

  const resp = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cartId}/line-items/${lineId}`, { method: "DELETE" })
  publish(resp.cart)
}

export async function setShippingMethod({ cartId, shippingMethodId }: { cartId: string; shippingMethodId: string }) {
  const resp = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    body: { option_id: shippingMethodId },
  })
  publish(resp.cart)
}

/** Lupus initiatePaymentSession: one payment collection per cart, then a session for the chosen provider. */
export async function initiatePaymentSession(cart: HttpTypes.StoreCart, data: { provider_id: string; data?: Record<string, unknown> }) {
  let collectionId = cart.payment_collection?.id
  if (!collectionId) {
    const created = await apiFetch<{ payment_collection: HttpTypes.StorePaymentCollection }>("/store/payment-collections", {
      method: "POST",
      body: { cart_id: cart.id },
    })
    collectionId = created.payment_collection.id
  }
  const resp = await apiFetch<{ payment_collection: HttpTypes.StorePaymentCollection }>(`/store/payment-collections/${collectionId}/payment-sessions`, {
    method: "POST",
    body: data,
  })
  await retrieveCart(cart.id)
  return resp
}

export async function applyPromotions(codes: string[]) {
  const cartId = getCartId()

  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const resp = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cartId}`, { method: "POST", body: { promo_codes: codes } })
  publish(resp.cart)
}

export async function setAddresses(_currentState: unknown, formData: FormData) {
  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }
    const cartId = getCartId()
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    const read = (name: string) => (formData.get(name) as string | null) ?? ""

    const data: HttpTypes.StoreUpdateCart = {
      shipping_address: {
        first_name: read("shipping_address.first_name"),
        last_name: read("shipping_address.last_name"),
        address_1: read("shipping_address.address_1"),
        address_2: "",
        company: read("shipping_address.company"),
        postal_code: read("shipping_address.postal_code"),
        city: read("shipping_address.city"),
        country_code: read("shipping_address.country_code"),
        province: read("shipping_address.province"),
        phone: read("shipping_address.phone"),
      },
      email: read("email"),
    }

    if (formData.get("same_as_billing") === "on") {
      data.billing_address = data.shipping_address
    } else {
      data.billing_address = {
        first_name: read("billing_address.first_name"),
        last_name: read("billing_address.last_name"),
        address_1: read("billing_address.address_1"),
        address_2: "",
        company: read("billing_address.company"),
        postal_code: read("billing_address.postal_code"),
        city: read("billing_address.city"),
        country_code: read("billing_address.country_code"),
        province: read("billing_address.province"),
        phone: read("billing_address.phone"),
      }
    }
    await updateCart(data)
  } catch (e: any) {
    return e.message as string
  }

  redirect(`/${formData.get("shipping_address.country_code")}/checkout?step=delivery`)
}

/**
 * Places an order for a cart. If no cart ID is provided, it uses the cart ID kept in storage.
 * On success it forgets the cart and goes to the confirmation page.
 */
export async function placeOrder(cartId?: string) {
  const id = cartId || getCartId()

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const cartRes = await apiFetch<{ type: "order" | "cart"; order?: HttpTypes.StoreOrder; cart?: HttpTypes.StoreCart }>(`/store/carts/${id}/complete`, {
    method: "POST",
  })

  if (cartRes.type === "order" && cartRes.order) {
    const countryCode = cartRes.order.shipping_address?.country_code?.toLowerCase()

    removeCartId()
    publish(null)
    redirect(`/${countryCode}/order/${cartRes.order.id}/confirmed`)
    return undefined
  }

  return cartRes.cart
}

/** Moves the cart to the region of the chosen country and goes to the same page under that country. */
export async function updateRegion(countryCode: string, currentPath: string) {
  const cartId = getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    await updateCart({ region_id: region.id })
  }

  clearApiCache()
  redirect(`/${countryCode}${currentPath}`)
}

export async function listCartOptions() {
  const cartId = getCartId()
  return apiFetch<{ shipping_options: HttpTypes.StoreCartShippingOption[] }>("/store/shipping-options", { query: { cart_id: cartId } })
}
