import { notFound } from "@/shared/navigation/router"

import RefinementList from "@/widgets/store/refinement-list"
import { SortOptions } from "@/widgets/store/sort-products"
import PaginatedProducts from "@/widgets/store/paginated-products"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { HttpTypes } from "@/shared/types/http"
import { OptionValueIds } from "@/shared/utils/product-option-filters"

export default function CategoryTemplate({
  category,
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  category: HttpTypes.StoreProductCategory
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!category || !countryCode) notFound()

  const parents = [] as HttpTypes.StoreProductCategory[]

  const getParents = (category: HttpTypes.StoreProductCategory) => {
    if (category.parent_category) {
      parents.push(category.parent_category)
      getParents(category.parent_category)
    }
  }

  getParents(category)

  const getCategoryIds = (current: HttpTypes.StoreProductCategory): string[] => [
    current.id,
    ...(current.category_children ?? []).flatMap(getCategoryIds),
  ]
  const categoryIds = getCategoryIds(category)

  return (
    <main data-testid="category-container">
      <div className="border-b border-brand-sand/70 bg-brand-paper">
        <div className="content-container py-12 sm:py-16">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-brand-ink/65">
          {parents &&
            [...parents].reverse().map((parent) => (
              <span key={parent.id} className="flex items-center gap-2">
                <LocalizedClientLink
                  className="transition-colors hover:text-brand-clay"
                  href={`/categories/${parent.handle}`}
                  data-testid="sort-by-link"
                >
                  {parent.name}
                </LocalizedClientLink>
                <span>/</span>
              </span>
            ))}
          </div>
          <p className="eyebrow">Thể loại</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-brand-forest sm:text-5xl" data-testid="category-page-title">{category.name}</h1>
        {category.description && (
          <div className="mt-4 max-w-2xl text-sm leading-7 text-brand-ink/60 sm:text-base">
            <p>{category.description}</p>
          </div>
        )}
        {category.category_children && (
          <div className="mt-7">
            <ul className="flex flex-wrap gap-2">
              {category.category_children?.map((c) => (
                <li key={c.id}>
                  <LocalizedClientLink className="inline-flex rounded-full border border-brand-sand bg-brand-cream px-4 py-2 text-xs font-semibold text-brand-forest transition-colors hover:border-brand-forest" href={`/categories/${c.handle}`}>
                    {c.name}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </div>
      <div className="content-container flex flex-col items-start gap-8 py-10 lg:flex-row lg:gap-12 lg:py-14">
        <RefinementList sortBy={sort} data-testid="sort-by-container" hideOptionsPicker />
        <div className="w-full min-w-0">
        <PaginatedProducts
          sortBy={sort}
          page={pageNumber}
          categoryIds={categoryIds}
          countryCode={countryCode}
          optionValueIds={optionValueIds}
          numberOfProducts={category.products?.length ?? 8}
        />
      </div>
      </div>
    </main>
  )
}
