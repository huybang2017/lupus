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
    <main data-testid="category-container">
      <div className="border-b border-brand-sand/70 bg-brand-paper">
        <div className="content-container py-12 sm:py-16">
          <p className="eyebrow">Thư viện của Lupus</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-brand-forest sm:text-5xl" data-testid="store-page-title">
            Tất cả sách
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-brand-ink/60 sm:text-base">
            Chọn một cuốn cho buổi chiều yên tĩnh, một ý tưởng mới hoặc hành trình tiếp theo của bạn.
          </p>
        </div>
      </div>
      <div className="content-container flex flex-col items-start gap-8 py-10 lg:flex-row lg:gap-12 lg:py-14">
        <RefinementList sortBy={sort} />
        <div className="w-full min-w-0">
          <PaginatedProducts sortBy={sort} page={pageNumber} countryCode={countryCode} optionValueIds={optionValueIds} />
        </div>
      </div>
    </main>
  )
}

export default StoreTemplate
