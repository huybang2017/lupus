
import { addToCart } from "@/entities/cart"
import { useIntersection } from "@/shared/hooks/use-in-view"
import { HttpTypes } from "@/shared/types/http"
import { Button } from "@/widgets/common/ui"
import Divider from "@/widgets/common/divider"
import OptionSelect from "@/widgets/products/product-option-select"
import { isEqual } from "@/shared/utils/is-equal"
import { useParams, usePathname, useSearchParams } from "@/shared/navigation/router"
import { useEffect, useMemo, useRef, useState } from "react"
import ProductPrice from "@/widgets/products/product-price"
import MobileActions from "@/widgets/products/product-mobile-actions"
import { useRouter } from "@/shared/navigation/router"
import { Minus, PackageCheck, Plus } from "lucide-react"
import { isElectronicBookValue, isElectronicBookVariant } from "@/shared/utils/book-format"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt) => {
    if (varopt.option_id) acc[varopt.option_id] = varopt.value
    return acc
  }, {})
}

export default function ProductActions({
  product,
  disabled,
}: ProductActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [options, setOptions] = useState<Record<string, string | undefined>>(() => {
    const variantId = searchParams.get("v_id")
    const linkedVariant = product.variants?.find(
      (variant) => variant.id === variantId && !isElectronicBookVariant(variant)
    )
    return linkedVariant ? optionsAsKeymap(linkedVariant.options) ?? {} : {}
  })
  const [isAdding, setIsAdding] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [addError, setAddError] = useState<string | null>(null)
  const countryCode = useParams().countryCode as string
  const visibleVariants = useMemo(
    () => (product.variants ?? []).filter((variant) => !isElectronicBookVariant(variant)),
    [product.variants]
  )
  const visibleProduct = useMemo<HttpTypes.StoreProduct>(
    () => ({
      ...product,
      variants: visibleVariants,
      options: product.options?.map((option) => ({
        ...option,
        values: option.values?.filter((value) => !isElectronicBookValue(value.value)),
      })),
    }),
    [product, visibleVariants]
  )

  // If there is only 1 variant, preselect the options
  useEffect(() => {
    if (visibleVariants.length === 1) {
      const variantOptions = optionsAsKeymap(visibleVariants[0].options)
      setOptions(variantOptions ?? {})
    }
  }, [visibleVariants])

  const selectedVariant = useMemo(() => {
    if (visibleVariants.length === 0) {
      return
    }

    return visibleVariants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [visibleVariants, options])

  // update the options when a variant is selected
  const setOptionValue = (optionId: string, value: string) => {
    setAddError(null)
    setOptions((prev) => {
      const next = { ...prev, [optionId]: value }
      const changedIndex = (product.options ?? []).findIndex((option) => option.id === optionId)

      for (const laterOption of (product.options ?? []).slice(changedIndex + 1)) {
        delete next[laterOption.id]
      }

      return next
    })
  }

  //check if the selected options produce a valid variant
  const isValidVariant = useMemo(() => {
    return visibleVariants.some((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [visibleVariants, options])

  const unavailableValuesForOption = (optionId: string) => {
    const option = product.options?.find((item) => item.id === optionId)
    if (!option) return []
    const optionIndex = (product.options ?? []).findIndex((item) => item.id === optionId)
    const earlierOptionIds = new Set((product.options ?? []).slice(0, optionIndex).map((item) => item.id))

    return (option.values ?? [])
      .map((item) => item.value)
      .filter((value) => {
        return !visibleVariants.some((variant) => {
          const variantOptions = optionsAsKeymap(variant.options) ?? {}
          if (variantOptions[optionId] !== value) return false

          return Object.entries(options).every(([selectedOptionId, selectedValue]) => {
            return !earlierOptionIds.has(selectedOptionId) || !selectedValue || variantOptions[selectedOptionId] === selectedValue
          })
        })
      })
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const value = isValidVariant ? selectedVariant?.id : null

    if (params.get("v_id") === value) {
      return
    }

    if (value) {
      params.set("v_id", value)
    } else {
      params.delete("v_id")
    }

    router.replace(pathname + "?" + params.toString())
  }, [selectedVariant, isValidVariant])

  // check if the selected variant is in stock
  const inStock = useMemo(() => {
    // If we don't manage inventory, we can always add to cart
    if (selectedVariant && !selectedVariant.manage_inventory) {
      return true
    }

    // If we allow back orders on the variant, we can add to cart
    if (selectedVariant?.allow_backorder) {
      return true
    }

    // If there is inventory available, we can add to cart
    if (
      selectedVariant?.manage_inventory &&
      (selectedVariant?.inventory_quantity || 0) > 0
    ) {
      return true
    }

    // Otherwise, we can't add to cart
    return false
  }, [selectedVariant])

  const availableQuantity = useMemo(() => {
    if (!selectedVariant?.manage_inventory || selectedVariant.allow_backorder) return null
    return Math.max(0, Math.floor(Number(selectedVariant.inventory_quantity ?? 0)))
  }, [selectedVariant])

  useEffect(() => {
    setQuantity(1)
    setAddError(null)
  }, [selectedVariant?.id])

  const setSafeQuantity = (next: number) => {
    if (!Number.isFinite(next)) return
    const whole = Math.max(1, Math.trunc(next))
    setQuantity(availableQuantity == null ? whole : Math.min(whole, Math.max(1, availableQuantity)))
  }

  const actionsRef = useRef<HTMLDivElement>(null)

  const inView = useIntersection(actionsRef, "0px")

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)
    setAddError(null)

    try {
      await addToCart({
        variantId: selectedVariant.id,
        quantity,
        countryCode,
      })
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Không thể thêm sách vào giỏ. Vui lòng thử lại.")
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-y-2" ref={actionsRef}>
        <div>
          {visibleVariants.length > 1 && (
            <div className="flex flex-col gap-y-4">
              {(product.options || []).map((option) => {
                return (
                  <div key={option.id}>
                    <OptionSelect
                      option={option}
                      current={options[option.id]}
                      updateOption={setOptionValue}
                      title={option.title ?? ""}
                      data-testid="product-options"
                      disabled={!!disabled || isAdding}
                      unavailableValues={unavailableValuesForOption(option.id)}
                    />
                  </div>
                )
              })}
              <Divider />
            </div>
          )}
        </div>

        <ProductPrice product={visibleProduct} variant={selectedVariant} />

        {selectedVariant ? (
          <div className="rounded-2xl border border-brand-sand/80 bg-brand-cream/55 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-brand-forest">Số lượng</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-ink/60">
                  <PackageCheck size={14} aria-hidden="true" />
                  {availableQuantity == null
                    ? "Phiên bản luôn có sẵn"
                    : availableQuantity > 0
                    ? `Còn ${availableQuantity} sản phẩm trong kho`
                    : "Phiên bản này đang hết hàng"}
                </p>
              </div>
              <div className="flex h-11 items-center overflow-hidden rounded-full border border-brand-sand bg-white shadow-sm" role="group" aria-label="Chọn số lượng">
                <button
                  type="button"
                  className="flex h-full w-11 items-center justify-center text-brand-forest transition-colors hover:bg-brand-mist disabled:cursor-not-allowed disabled:text-brand-ink/25"
                  onClick={() => setSafeQuantity(quantity - 1)}
                  disabled={quantity <= 1 || !inStock || isAdding}
                  aria-label="Giảm số lượng"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={availableQuantity ?? undefined}
                  step={1}
                  value={quantity}
                  onChange={(event) => setSafeQuantity(Number(event.target.value))}
                  onBlur={() => setSafeQuantity(quantity)}
                  disabled={!inStock || isAdding}
                  className="field-control h-full w-12 border-x border-y-0 border-brand-sand bg-transparent p-0 text-center text-sm font-semibold text-brand-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Số lượng sách"
                  data-testid="product-quantity-input"
                />
                <button
                  type="button"
                  className="flex h-full w-11 items-center justify-center text-brand-forest transition-colors hover:bg-brand-mist disabled:cursor-not-allowed disabled:text-brand-ink/25"
                  onClick={() => setSafeQuantity(quantity + 1)}
                  disabled={!inStock || isAdding || (availableQuantity != null && quantity >= availableQuantity)}
                  aria-label="Tăng số lượng"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <p className="mt-3 border-t border-brand-sand/70 pt-3 text-xs text-brand-ink/55">
              Đã chọn: <span className="font-semibold text-brand-ink">{selectedVariant.title}</span>
              {selectedVariant.sku ? ` · ${selectedVariant.sku}` : ""}
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-brand-mist/65 px-3 py-2.5 text-xs leading-5 text-brand-forest">
            Chọn lần lượt định dạng và ngôn ngữ. Lựa chọn bị làm mờ là phiên bản không có trong kho dữ liệu hiện tại.
          </p>
        )}

        {addError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {addError}
          </p>
        )}

        <Button
          onClick={handleAddToCart}
          disabled={
            !inStock ||
            !selectedVariant ||
            !!disabled ||
            isAdding ||
            !isValidVariant
          }
          variant="primary"
          className="w-full h-12"
          isLoading={isAdding}
          data-testid="add-product-button"
        >
          {!selectedVariant
            ? "Chọn đủ phiên bản sách"
            : !inStock || !isValidVariant
            ? "Tạm hết hàng"
            : `Thêm ${quantity} vào giỏ sách`}
        </Button>
        <MobileActions
          product={visibleProduct}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          isAdding={isAdding}
          show={!inView}
          optionsDisabled={!!disabled || isAdding}
          unavailableValuesForOption={unavailableValuesForOption}
          quantity={quantity}
        />
      </div>
    </>
  )
}
