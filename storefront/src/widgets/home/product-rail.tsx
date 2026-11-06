import { listProducts } from "@/entities/products"
import { useAsync } from "@/shared/hooks/use-async"
import { HttpTypes } from "@/shared/types/http"
import { Text } from "@/widgets/common/ui"

import InteractiveLink from "@/widgets/common/interactive-link"
import ProductPreview from "@/widgets/products/product-preview"
import { ArrowRight } from "lucide-react"

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
    <section className="content-container py-12 lg:py-16">
      <div className="mb-8 flex items-end justify-between gap-6 border-b border-brand-sand pb-5">
        <div>
          <Text className="eyebrow">Tủ sách Lupus</Text>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-forest sm:text-4xl">{collection.title}</h2>
        </div>
        <InteractiveLink href={`/collections/${collection.handle}`}>
          <span className="inline-flex items-center gap-2 font-semibold">Xem tất cả <ArrowRight size={15} aria-hidden="true" /></span>
        </InteractiveLink>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
        {pricedProducts &&
          pricedProducts.slice(0, 4).map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} isFeatured />
            </li>
          ))}
      </ul>
    </section>
  )
}
