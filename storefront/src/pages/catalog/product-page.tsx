import { useParams } from "react-router-dom"
import { listProducts } from "@/entities/products"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound, useSearchParams } from "@/shared/navigation/router"
import { HttpTypes } from "@/shared/types/http"
import ProductTemplate from "@/widgets/products/product-template"

function getImagesForVariant(product: HttpTypes.StoreProduct, selectedVariantId?: string) {
  if (!selectedVariantId || !product.variants) {
    return product.images
  }

  const variant = product.variants!.find((v) => v.id === selectedVariantId)
  if (!variant || !variant.images?.length) {
    return product.images
  }

  const imageIdsMap = new Map((variant.images as { id: string }[]).map((i) => [i.id, true]))
  return product.images?.filter((i) => imageIdsMap.has(i.id)) ?? null
}

export function ProductPage() {
  const { handle = "" } = useParams()
  const { region, countryCode } = useCountryRegion()
  const searchParams = useSearchParams()
  const selectedVariantId = searchParams.get("v_id") ?? undefined

  const { data: product, loading } = useAsync(
    () =>
      listProducts({
        countryCode,
        queryParams: { handle },
      }).then(({ response }) => response.products[0] ?? null),
    [handle, countryCode]
  )

  usePageTitle(product ? `${product.title} | Lupus Store` : undefined, product ? product.title : undefined)

  if (loading) {
    return null
  }
  if (!product) {
    return notFound()
  }

  const images = getImagesForVariant(product, selectedVariantId)

  return <ProductTemplate product={product} region={region} countryCode={countryCode} images={images ?? []} />
}