import { useParams } from "react-router-dom"
import { getCollectionByHandle } from "@/entities/collections"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound, useSearchParams } from "@/shared/navigation/router"
import { parseOptionValueIds } from "@/shared/utils/product-option-filters"
import CollectionTemplate from "@/widgets/collections/collection-template"
import { SortOptions } from "@/widgets/store/sort-products"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"

export function CollectionPage() {
  const { handle = "" } = useParams()
  const { countryCode } = useCountryRegion()
  const searchParams = useSearchParams()

  const { data: collection, error, loading, reload } = useAsync(() => getCollectionByHandle(handle), [handle])
  usePageTitle(collection ? `${collection.title} | Lupus Books` : undefined, collection ? `Tuyển tập ${collection.title} từ Lupus Books.` : undefined)

  if (loading) {
    return <PageLoading message="Đang sắp xếp tuyển tập sách…" />
  }
  if (error) {
    return <PageLoadError title="Chưa thể tải tuyển tập" onRetry={reload} />
  }
  if (!collection) {
    return notFound()
  }

  return (
    <CollectionTemplate
      collection={collection}
      page={searchParams.get("page") ?? undefined}
      sortBy={(searchParams.get("sortBy") ?? undefined) as SortOptions | undefined}
      countryCode={countryCode}
      optionValueIds={parseOptionValueIds(searchParams)}
    />
  )
}
