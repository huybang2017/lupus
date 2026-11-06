import { listProducts } from "@/entities/products"
import { useAsync } from "@/shared/hooks/use-async"
import { getRegion } from "@/entities/regions"
import { HttpTypes } from "@/shared/types/http"
import Product from "@/widgets/products/product-preview"

type RelatedProductsProps = {
  product: HttpTypes.StoreProduct
  countryCode: string
}

export default function RelatedProducts({
  product,
  countryCode,
}: RelatedProductsProps) {
  const { data } = useAsync(async () => {
    const region = await getRegion(countryCode)

    if (!region) {
      return null
    }

    // edit this function to define your related products logic
    const queryParams: HttpTypes.StoreProductListParams = {}
    if (region?.id) {
      queryParams.region_id = region.id
    }
    if (product.collection_id) {
      queryParams.collection_id = [product.collection_id]
    }
    if (product.tags) {
      queryParams.tag_id = product.tags.map((t) => t.id).filter(Boolean) as string[]
    }
    queryParams.is_giftcard = false

    const products = await listProducts({
      queryParams,
      countryCode,
    }).then(({ response }) => {
      return response.products.filter((responseProduct) => responseProduct.id !== product.id)
    })

    return { region, products }
  }, [product.id, countryCode])

  if (!data || !data.products.length) {
    return null
  }

  const { region, products } = data

  return (
    <div className="product-page-constraint">
      <div className="mb-10 flex flex-col items-center text-center">
        <span className="eyebrow mb-3">
          Có thể bạn cũng thích
        </span>
        <p className="max-w-xl font-display text-3xl font-semibold text-brand-forest sm:text-4xl">
          Những cuốn sách cùng mạch đọc
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <Product region={region} product={product} />
          </li>
        ))}
      </ul>
    </div>
  )
}
