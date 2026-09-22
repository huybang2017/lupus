import { listProducts } from "@/entities/products"
import { useAsync } from "@/shared/hooks/use-async"
import { HttpTypes } from "@/shared/types/http"
import { Text } from "@/widgets/common/ui"

import InteractiveLink from "@/widgets/common/interactive-link"
import ProductPreview from "@/widgets/products/product-preview"

export default function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const { data } = useAsync(
    () =>
      listProducts({
        regionId: region.id,
        queryParams: {
          collection_id: collection.id,
        },
      }),
    [region.id, collection.id]
  )
  const pricedProducts = data?.response.products

  if (!pricedProducts) {
    return null
  }

  return (
    <div className="content-container py-12 small:py-24">
      <div className="flex justify-between mb-8">
        <Text className="txt-xlarge">{collection.title}</Text>
        <InteractiveLink href={`/collections/${collection.handle}`}>
          View all
        </InteractiveLink>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-3 gap-x-6 gap-y-24 small:gap-y-36">
        {pricedProducts &&
          pricedProducts.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} isFeatured />
            </li>
          ))}
      </ul>
    </div>
  )
}
