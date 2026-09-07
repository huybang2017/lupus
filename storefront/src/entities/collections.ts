import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const listCollections = async (
  queryParams: Record<string, string> = {}
): Promise<{ collections: HttpTypes.StoreCollection[]; count: number }> => {
  queryParams.limit = queryParams.limit || "100"
  queryParams.offset = queryParams.offset || "0"
  return apiFetch<{ collections: HttpTypes.StoreCollection[]; count: number }>("/store/collections", {
    query: queryParams,
    cacheMs: 30_000,
  }).then(({ collections }) => ({ collections, count: collections.length }))
}

export const getCollectionByHandle = async (handle: string): Promise<HttpTypes.StoreCollection | null> =>
  apiFetch<{ collections: HttpTypes.StoreCollection[] }>("/store/collections", { query: { handle }, cacheMs: 30_000 }).then(
    ({ collections }) => collections[0] || null
  )
