import { listProducts } from "@/entities/products"
import { useAsync } from "@/shared/hooks/use-async"
import { HttpTypes } from "@/shared/types/http"
import ProductActions from "@/widgets/products/product-actions"

/**
 * Fetches real time pricing for a product and renders the product actions component
 * (disabled, with the already loaded product, until the fresh prices arrive).
 */
export default function ProductActionsWrapper({
  id,
  region,
  fallback,
}: {
  id: string
  region: HttpTypes.StoreRegion
  fallback: HttpTypes.StoreProduct
}) {
  const { data: product } = useAsync(
    () =>
      listProducts({
        queryParams: { id: [id] },
        regionId: region.id,
      }).then(({ response }) => response.products[0]),
    [id, region.id]
  )

  if (!product) {
    return <ProductActions disabled={true} product={fallback} region={region} />
  }

  return <ProductActions product={product} region={region} />
}
