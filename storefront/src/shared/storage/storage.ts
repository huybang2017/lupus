// Browser storage for what the Next.js starter keeps in cookies (_lupus_jwt, _lupus_cart_id,
// _lupus_locale, _lupus_pending_customer). Every access is guarded: storage can be unavailable
// (private windows, blocked site data) and the storefront must still render.
//
// Note: unlike the starter's httpOnly cookies, the auth token lives in localStorage and is readable
// by page scripts. That is the usual trade-off of a pure SPA.

const KEYS = {
  token: "_lupus_jwt",
  cartId: "_lupus_cart_id",
  locale: "_lupus_locale",
  pendingCustomer: "_lupus_pending_customer",
} as const

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // storage unavailable: the value only lives for this page view
  }
}

export const getAuthToken = () => read(KEYS.token)
export const setAuthToken = (token: string) => write(KEYS.token, token)
export const removeAuthToken = () => write(KEYS.token, null)

export const getCartId = () => read(KEYS.cartId) ?? undefined
export const setCartId = (id: string) => write(KEYS.cartId, id)
export const removeCartId = () => write(KEYS.cartId, null)

export const getStoredLocale = () => read(KEYS.locale)
export const setStoredLocale = (locale: string) => write(KEYS.locale, locale)

export type PendingCustomer = {
  email: string
  first_name?: string
  last_name?: string
  phone?: string
}

export const getPendingCustomer = (): PendingCustomer | null => {
  const raw = read(KEYS.pendingCustomer)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as PendingCustomer
  } catch {
    return null
  }
}
export const setPendingCustomer = (customer: PendingCustomer) => write(KEYS.pendingCustomer, JSON.stringify(customer))
export const removePendingCustomer = () => write(KEYS.pendingCustomer, null)
