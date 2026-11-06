import { Text } from "@/widgets/common/ui"
import { getProductPrice } from "@/shared/utils/get-product-price"
import { HttpTypes } from "@/shared/types/http"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import Thumbnail from "@/widgets/products/thumbnail"
import PreviewPrice from "@/widgets/products/product-preview-price"
import { getBookMetadata } from "@/shared/utils/book"

export default function ProductPreview({
  product,
  isFeatured,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  // const pricedProduct = await listProducts({
  //   regionId: region.id,
  //   queryParams: { id: [product.id!] },
  // }).then(({ response }) => response.products[0])

  // if (!pricedProduct) {
  //   return null
  // }

  const { cheapestPrice } = getProductPrice({
    product,
  })
  const { author } = getBookMetadata(product)
  const badge = product.tags?.some((tag) => tag.value === "bestseller")
    ? "Bán chạy"
    : product.tags?.some((tag) => tag.value === "new")
      ? "Mới"
      : product.collection?.title

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group block h-full rounded-2xl">
      <article data-testid="product-wrapper" className="flex h-full flex-col">
        <div className="relative">
          {badge && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-brand-paper/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-clay shadow-sm backdrop-blur">
              {badge}
            </span>
          )}
          <Thumbnail
            thumbnail={product.thumbnail}
            images={product.images}
            size="full"
            isFeatured={isFeatured}
            alt={`Bìa sách ${product.title}`}
            className="rounded-[1.35rem]"
          />
        </div>
        <div className="mt-4 flex flex-1 flex-col">
          {author && <Text className="mb-1 text-xs font-medium text-brand-clay">{author}</Text>}
          <Text className="line-clamp-2 font-display text-base font-semibold leading-snug text-brand-forest transition-colors group-hover:text-brand-clay sm:text-lg" data-testid="product-title">
            {product.title}
          </Text>
          <div className="mt-2 flex items-center gap-x-2 font-semibold text-brand-ink/75">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </article>
    </LocalizedClientLink>
  )
}
