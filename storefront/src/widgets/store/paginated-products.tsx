import { listProductsWithSort } from "@/entities/products"
import { getRegion } from "@/entities/regions"
import { useAsync } from "@/shared/hooks/use-async"
import SkeletonProductGrid from "@/widgets/skeletons/skeleton-product-grid"
import { OptionValueIds } from "@/shared/utils/product-option-filters"
import ProductPreview from "@/widgets/products/product-preview"
import { Pagination } from "@/widgets/store/pagination"
import { SortOptions } from "@/widgets/store/sort-products"
import { PageLoadError } from "@/widgets/common/page-state"

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
  categoryIds,
  productsIds,
  countryCode,
  optionValueIds,
  numberOfProducts,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryIds?: string[]
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

  if (categoryIds?.length) {
    queryParams["category_id"] = categoryIds
  }

  if (productsIds) {
    queryParams["id"] = productsIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const { data, error, loading, reload } = useAsync(async () => {
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
  }, [page, sortBy, collectionId, categoryIds?.join(","), productsIds?.join(","), countryCode, optionValueIds?.join(",")])

  if (loading) {
    return <SkeletonProductGrid numberOfProducts={numberOfProducts} />
  }

  if (error) {
    return (
      <PageLoadError
        compact
        title="Chưa thể tải kệ sách"
        description="Kết nối đến danh mục sách đang gián đoạn. Bạn vui lòng thử lại."
        onRetry={reload}
      />
    )
  }

  if (!data) {
    return (
      <PageLoadError
        compact
        title="Chưa tìm thấy khu vực mua hàng"
        description="Hãy kiểm tra mã quốc gia trong đường dẫn hoặc cấu hình khu vực bán hàng."
      />
    )
  }

  const { region, products, count } = data
  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  return (
    <>
      <ul
        className="grid w-full grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4"
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
      {!products.length && (
        <div className="surface-card py-16 text-center">
          <p className="font-display text-2xl font-semibold text-brand-forest">Chưa tìm thấy cuốn sách phù hợp</p>
          <p className="mt-2 text-sm text-brand-ink/55">Hãy thử bỏ bớt bộ lọc hoặc quay lại sau nhé.</p>
        </div>
      )}
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
