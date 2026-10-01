import { useParams } from "react-router-dom"
import { getCategoryByHandle } from "@/entities/categories"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound, useSearchParams } from "@/shared/navigation/router"
import { parseOptionValueIds } from "@/shared/utils/product-option-filters"
import CategoryTemplate from "@/widgets/categories/category-template"
import { SortOptions } from "@/widgets/store/sort-products"

export function CategoryPage() {
  const params = useParams()
  const path = (params["*"] ?? "").split("/").filter(Boolean)
  const { countryCode } = useCountryRegion()
  const searchParams = useSearchParams()

  const { data: category, loading } = useAsync(() => getCategoryByHandle(path), [path.join("/")])
  usePageTitle(category ? `${category.name} | Lupus Store` : undefined, category ? (category.description ?? `${category.name} category.`) : undefined)

  if (loading) {
    return null
  }
  if (!category) {
    return notFound()
  }

  return (
    <CategoryTemplate
      category={category}
      sortBy={(searchParams.get("sortBy") ?? undefined) as SortOptions | undefined}
      page={searchParams.get("page") ?? undefined}
      countryCode={countryCode}
      optionValueIds={parseOptionValueIds(searchParams)}
    />
  )
}