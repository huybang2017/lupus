import { useParams } from "react-router-dom"
import { getCategoryByHandle } from "@/entities/categories"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound, useSearchParams } from "@/shared/navigation/router"
import { parseOptionValueIds } from "@/shared/utils/product-option-filters"
import CategoryTemplate from "@/widgets/categories/category-template"
import { SortOptions } from "@/widgets/store/sort-products"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"

export function CategoryPage() {
  const params = useParams()
  const path = (params["*"] ?? "").split("/").filter(Boolean)
  const { countryCode } = useCountryRegion()
  const searchParams = useSearchParams()

  const { data: category, error, loading, reload } = useAsync(() => getCategoryByHandle(path), [path.join("/")])
  usePageTitle(category ? `${category.name} | Lupus Books` : undefined, category ? (category.description ?? `Khám phá sách ${category.name} tại Lupus Books.`) : undefined)

  if (loading) {
    return <PageLoading message="Đang mở kệ sách theo chủ đề…" />
  }
  if (error) {
    return <PageLoadError title="Chưa thể tải chủ đề sách" onRetry={reload} />
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
