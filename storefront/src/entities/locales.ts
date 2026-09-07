import { apiFetch, clearApiCache } from "@/shared/api/client"
import { getCartId, getStoredLocale, setStoredLocale } from "@/shared/storage/storage"

export type Locale = {
  code: string
  name: string
}

/** Available locales from the backend; null when none are configured. */
export const listLocales = async (): Promise<Locale[] | null> =>
  apiFetch<{ locales: Locale[] }>("/store/locales", { cacheMs: 60_000 })
    .then(({ locales }) => locales)
    .catch(() => null)

export const getLocale = (): string | null => getStoredLocale()

/** Stores the locale and moves an existing cart to it; callers re-fetch what they show afterwards. */
export const updateLocale = async (localeCode: string): Promise<string> => {
  setStoredLocale(localeCode)
  clearApiCache()
  const cartId = getCartId()
  if (cartId) {
    await apiFetch(`/store/carts/${cartId}`, { method: "POST", body: { locale: localeCode } }).catch(() => undefined)
  }
  return localeCode
}
