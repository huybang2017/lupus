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
    <main>
      <div className="border-b border-brand-sand/70 bg-brand-paper">
        <div className="content-container py-12 sm:py-16">
          <p className="eyebrow">Tuyển tập Lupus</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-brand-forest sm:text-5xl">{collection.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-brand-ink/60 sm:text-base">Những cuốn sách được tuyển chọn để bạn dễ dàng tìm thấy lần đọc tiếp theo.</p>
        </div>
      </div>
      <div className="content-container flex flex-col items-start gap-8 py-10 lg:flex-row lg:gap-12 lg:py-14">
        <RefinementList sortBy={sort} hideOptionsPicker />
        <div className="w-full min-w-0">
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
    </main>
  )
}
