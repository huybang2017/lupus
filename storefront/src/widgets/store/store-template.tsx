import { OptionValueIds } from "@/shared/utils/product-option-filters"
import RefinementList from "@/widgets/store/refinement-list"
import { SortOptions } from "@/widgets/store/sort-products"

import PaginatedProducts from "@/widgets/store/paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div
      className="flex flex-col small:flex-row small:items-start py-6 content-container"
      data-testid="category-container"
    >
      <RefinementList sortBy={sort} />
      <div className="w-full">
        <div className="mb-8 text-2xl-semi">
          <h1 data-testid="store-page-title">All products</h1>
        </div>
        <PaginatedProducts sortBy={sort} page={pageNumber} countryCode={countryCode} optionValueIds={optionValueIds} />
      </div>
    </div>
  )
}

export default StoreTemplate
