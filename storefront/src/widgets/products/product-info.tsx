import { HttpTypes } from "@/shared/types/http"
import { Heading, Text } from "@/widgets/common/ui"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { descriptionToText, getBookMetadata } from "@/shared/utils/book"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  const { author } = getBookMetadata(product)
  const description = descriptionToText(product.description)

  return (
    <div id="product-info">
      <div className="flex flex-col lg:max-w-[580px]">
        {product.collection && (
          <LocalizedClientLink
            href={`/collections/${product.collection.handle}`}
            className="eyebrow mb-4 hover:text-brand-clay-dark"
          >
            {product.collection.title}
          </LocalizedClientLink>
        )}
        <Heading
          level="h1"
          className="font-display text-4xl font-semibold leading-[1.12] tracking-[-0.035em] text-brand-forest sm:text-5xl"
          data-testid="product-title"
        >
          {product.title}
        </Heading>
        {product.subtitle && <Text className="mt-3 text-base leading-7 text-brand-ink/55">{product.subtitle}</Text>}
        {author && <Text className="mt-4 text-sm font-semibold text-brand-clay">Tác giả · {author}</Text>}
        <div
          className={description ? "mt-6 space-y-3 text-sm leading-7 text-brand-ink/65" : "hidden"}
          data-testid="product-description"
        >
          {description.split("\n").filter(Boolean).map((paragraph, index) => <p key={`${paragraph.slice(0, 20)}-${index}`}>{paragraph}</p>)}
        </div>
      </div>
    </div>
  )
}

export default ProductInfo
