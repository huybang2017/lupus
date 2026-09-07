import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const listCategories = async (query?: Record<string, unknown>) =>
  apiFetch<{ product_categories: HttpTypes.StoreProductCategory[] }>("/store/product-categories", {
    query: { limit: query?.limit || 100, ...query },
    cacheMs: 30_000,
  }).then(({ product_categories }) => product_categories)

export const getCategoryByHandle = async (categoryHandle: string[]) => {
  const handle = `${categoryHandle.join("/")}`
  return apiFetch<{ product_categories: HttpTypes.StoreProductCategory[] }>("/store/product-categories", {
    query: { handle },
    cacheMs: 30_000,
  }).then(({ product_categories }) => product_categories[0])
}
