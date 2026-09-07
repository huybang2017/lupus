import { HttpTypes } from "@/shared/types/http"

export const isSimpleProduct = (product: HttpTypes.StoreProduct): boolean => {
  return product.options?.length === 1 && product.options[0].values?.length === 1
}
