import { listProductsWithSort } from "@/entities/products"
import { getRegion } from "@/entities/regions"
import { useAsync } from "@/shared/hooks/use-async"
import SkeletonProductGrid from "@/widgets/skeletons/skeleton-product-grid"
import { OptionValueIds } from "@/shared/utils/product-option-filters"
import ProductPreview from "@/widgets/products/product-preview"
import { Pagination } from "@/widgets/store/pagination"
import { SortOptions } from "@/widgets/store/sort-products"

const PRODUCT_LIMIT = 12

type PaginatedProductsParams = {
  limit: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

export default function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
  optionValueIds,
  numberOfProducts,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
  optionValueIds?: OptionValueIds
  /** Placeholder count for the loading skeleton */
  numberOfProducts?: number
}) {
  const queryParams: PaginatedProductsParams = {
    limit: 12,
  }

  if (collectionId) {
    queryParams["collection_id"] = [collectionId]
  }

  if (categoryId) {
    queryParams["category_id"] = [categoryId]
  }

  if (productsIds) {
    queryParams["id"] = productsIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const { data } = useAsync(async () => {
    const region = await getRegion(countryCode)

    if (!region) {
      return null
    }

    const {
      response: { products, count },
    } = await listProductsWithSort({
      page,
      queryParams,
      sortBy,
      countryCode,
      optionValueIds,
    })

    return { region, products, count }
  }, [page, sortBy, collectionId, categoryId, productsIds?.join(","), countryCode, optionValueIds?.join(",")])

  if (!data) {
    return <SkeletonProductGrid numberOfProducts={numberOfProducts} />
  }

  const { region, products, count } = data
  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  return (
    <>
      <ul
        className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
        data-testid="products-list"
      >
        {products.map((p) => {
          return (
            <li key={p.id}>
              <ProductPreview product={p} region={region} />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}
