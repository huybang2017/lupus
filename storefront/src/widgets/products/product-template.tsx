import React from "react"

import ImageGallery from "@/widgets/products/image-gallery"
import ProductTabs from "@/widgets/products/product-tabs"
import RelatedProducts from "@/widgets/products/related-products"
import ProductInfo from "@/widgets/products/product-info"
import { notFound } from "@/shared/navigation/router"
import { HttpTypes } from "@/shared/types/http"

import ProductActionsWrapper from "@/widgets/products/product-actions-wrapper"

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
    <>
      <div
        className="content-container  flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-6">
          <ProductInfo product={product} />
          <ProductTabs product={product} />
        </div>
        <div className="block w-full relative">
          <ImageGallery images={images} />
        </div>
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-12">
          <ProductActionsWrapper id={product.id} region={region} fallback={product} />
        </div>
      </div>
      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <RelatedProducts product={product} countryCode={countryCode} />
      </div>
    </>
  )
}

export default ProductTemplate
