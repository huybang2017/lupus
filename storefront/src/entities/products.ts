import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"
import { OptionValueIds } from "@/shared/utils/product-option-filters"
import { sortProducts } from "@/shared/utils/sort-products"
import { SortOptions } from "@/widgets/store/sort-products"
import { getRegion, retrieveRegion } from "@/entities/regions"

type ProductListQueryParams = (HttpTypes.FindParams & HttpTypes.StoreProductListParams) & {
  options?: string[]
  option_value_id?: string | string[]
}

export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: ProductListQueryParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: ProductListQueryParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = _pageParam === 1 ? 0 : (_pageParam - 1) * limit

  const region = countryCode ? await getRegion(countryCode) : await retrieveRegion(regionId!)

  if (!region) {
    return { response: { products: [], count: 0 }, nextPage: null }
  }

  return apiFetch<{ products: HttpTypes.StoreProduct[]; count: number }>("/store/products", {
    query: { limit, offset, region_id: region.id, ...queryParams },
  }).then(({ products, count }) => {
    const nextPage = count > offset + limit ? pageParam + 1 : null
    return { response: { products, count }, nextPage, queryParams }
  })
}

/**
 * Fetches up to 100 products and sorts them client-side by the sortBy parameter (the store API cannot
 * sort by price), then returns the requested page.
 */
export const listProductsWithSort = async ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  countryCode,
  optionValueIds,
}: {
  page?: number
  queryParams?: ProductListQueryParams
  sortBy?: SortOptions
  countryCode: string
  optionValueIds?: OptionValueIds
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: ProductListQueryParams
}> => {
  const limit = queryParams?.limit || 12
  const optionFilters = Array.from(new Set((optionValueIds || []).filter(Boolean)))

  const {
    response: { products },
  } = await listProducts({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      ...(optionFilters.length ? { option_value_id: optionFilters } : {}),
      limit: 100,
    },
    countryCode,
  })

  const sortedProducts = sortProducts(products, sortBy)
  const pageParam = (page - 1) * limit
  const filteredCount = products.length
  const nextPage = filteredCount > pageParam + limit ? pageParam + limit : null
  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: { products: paginatedProducts, count: filteredCount },
    nextPage,
    queryParams,
  }
}
