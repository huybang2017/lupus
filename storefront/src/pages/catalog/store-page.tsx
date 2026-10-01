import { useCountryRegion } from "@/providers/region-provider"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { useSearchParams } from "@/shared/navigation/router"
import { parseOptionValueIds } from "@/shared/utils/product-option-filters"
import { SortOptions } from "@/widgets/store/sort-products"
import StoreTemplate from "@/widgets/store/store-template"

export function StorePage() {
  const { countryCode } = useCountryRegion()
  const searchParams = useSearchParams()
  usePageTitle("Store", "Explore all of our products.")

  const sortBy = (searchParams.get("sortBy") ?? undefined) as SortOptions | undefined
  const page = searchParams.get("page") ?? undefined
  const optionValueIds = parseOptionValueIds(searchParams)

  return <StoreTemplate sortBy={sortBy} page={page} countryCode={countryCode} optionValueIds={optionValueIds} />
}