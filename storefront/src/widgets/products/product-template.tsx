import React from "react"

import ImageGallery from "@/widgets/products/image-gallery"
import ProductTabs from "@/widgets/products/product-tabs"
import RelatedProducts from "@/widgets/products/related-products"
import ProductInfo from "@/widgets/products/product-info"
import { notFound } from "@/shared/navigation/router"
import { HttpTypes } from "@/shared/types/http"

import ProductActionsWrapper from "@/widgets/products/product-actions-wrapper"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { ChevronRight, PackageCheck, RotateCcw, ShieldCheck } from "lucide-react"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <main>
      <div className="border-b border-brand-sand/70 bg-brand-paper">
        <div className="content-container py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-brand-ink/65">
            <LocalizedClientLink href="/store" className="transition-colors hover:text-brand-clay">Tất cả sách</LocalizedClientLink>
            <ChevronRight size={13} aria-hidden="true" />
            {product.categories?.[0] && (
              <>
                <LocalizedClientLink href={`/categories/${product.categories[0].handle}`} className="transition-colors hover:text-brand-clay">
                  {product.categories[0].name}
                </LocalizedClientLink>
                <ChevronRight size={13} aria-hidden="true" />
              </>
            )}
            <span className="max-w-[18rem] truncate text-brand-ink/70">{product.title}</span>
          </div>
        </div>
      </div>
      <div
        className="content-container grid items-start gap-10 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] lg:gap-16 lg:py-16"
        data-testid="product-container"
      >
        <ImageGallery images={images} productTitle={product.title} />
        <div className="flex w-full flex-col gap-y-8 lg:sticky lg:top-32">
          <ProductInfo product={product} />
          <div className="surface-card p-5 sm:p-6">
            <ProductActionsWrapper id={product.id} region={region} fallback={product} />
            <div className="mt-6 grid gap-3 border-t border-brand-sand pt-5 text-xs text-brand-ink/60 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-brand-clay" aria-hidden="true" />Sách chính hãng</span>
              <span className="flex items-center gap-2"><PackageCheck size={16} className="text-brand-clay" aria-hidden="true" />Đóng gói an toàn</span>
              <span className="flex items-center gap-2"><RotateCcw size={16} className="text-brand-clay" aria-hidden="true" />Hỗ trợ khi sách lỗi</span>
            </div>
          </div>
          <ProductTabs product={product} />
        </div>
      </div>
      <div
        className="border-t border-brand-sand/70 bg-brand-paper py-16 lg:py-24"
        data-testid="related-products-container"
      >
        <div className="content-container">
          <RelatedProducts product={product} countryCode={countryCode} />
        </div>
      </div>
    </main>
  )
}

export default ProductTemplate
