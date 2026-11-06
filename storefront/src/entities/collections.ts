import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

const STOREFRONT_COLLECTIONS = ["best-sellers", "new-arrivals", "staff-picks"]

export const listCollections = async (
  queryParams: Record<string, string> = {}
): Promise<{ collections: HttpTypes.StoreCollection[]; count: number }> => {
  queryParams.limit = queryParams.limit || "100"
  queryParams.offset = queryParams.offset || "0"
  return apiFetch<{ collections: HttpTypes.StoreCollection[]; count: number }>("/store/collections", {
    query: queryParams,
    cacheMs: 30_000,
  }).then(({ collections }) => {
    const visible = collections
      .filter((collection) => STOREFRONT_COLLECTIONS.includes(collection.handle))
      .sort((a, b) => STOREFRONT_COLLECTIONS.indexOf(a.handle) - STOREFRONT_COLLECTIONS.indexOf(b.handle))
    return { collections: visible, count: visible.length }
  })
}

export const getCollectionByHandle = async (handle: string): Promise<HttpTypes.StoreCollection | null> =>
  apiFetch<{ collections: HttpTypes.StoreCollection[] }>("/store/collections", { query: { handle }, cacheMs: 30_000 }).then(
    ({ collections }) => collections[0] || null
  )
