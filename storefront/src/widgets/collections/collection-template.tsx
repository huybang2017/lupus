import RefinementList from "@/widgets/store/refinement-list"
import { SortOptions } from "@/widgets/store/sort-products"
import PaginatedProducts from "@/widgets/store/paginated-products"
import { HttpTypes } from "@/shared/types/http"
import { OptionValueIds } from "@/shared/utils/product-option-filters"

export default function CollectionTemplate({
  sortBy,
  collection,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  collection: HttpTypes.StoreCollection
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="flex flex-col small:flex-row small:items-start py-6 content-container">
      <RefinementList sortBy={sort} hideOptionsPicker />
      <div className="w-full">
        <div className="mb-8 text-2xl-semi">
          <h1>{collection.title}</h1>
        </div>
        <PaginatedProducts
          sortBy={sort}
          page={pageNumber}
          collectionId={collection.id}
          countryCode={countryCode}
          optionValueIds={optionValueIds}
          numberOfProducts={collection.products?.length}
        />
      </div>
    </div>
  )
}
