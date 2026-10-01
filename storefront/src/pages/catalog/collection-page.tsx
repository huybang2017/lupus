import { useParams } from "react-router-dom"
import { getCollectionByHandle } from "@/entities/collections"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound, useSearchParams } from "@/shared/navigation/router"
import { parseOptionValueIds } from "@/shared/utils/product-option-filters"
import CollectionTemplate from "@/widgets/collections/collection-template"
import { SortOptions } from "@/widgets/store/sort-products"

export function CollectionPage() {
  const { handle = "" } = useParams()
  const { countryCode } = useCountryRegion()
  const searchParams = useSearchParams()

  const { data: collection, loading } = useAsync(() => getCollectionByHandle(handle), [handle])
  usePageTitle(collection ? `${collection.title} | Lupus Store` : undefined, collection ? `${collection.title} collection` : undefined)

  if (loading) {
    return null
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