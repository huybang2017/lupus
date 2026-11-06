
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import { convertToLocale } from "@/shared/formatting/money"
import { HttpTypes } from "@/shared/types/http"
import DeleteButton from "@/widgets/common/delete-button"
import LineItemOptions from "@/widgets/common/line-item-options"
import LineItemPrice from "@/widgets/common/line-item-price"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import Thumbnail from "@/widgets/products/thumbnail"
import { usePathname } from "@/shared/navigation/router"
import { Fragment, useEffect, useRef, useState } from "react"
import { ShoppingBag } from "lucide-react"

const CartDropdown = ({
  cart: cartState,
}: {
  cart?: HttpTypes.StoreCart | null
}) => {
  const [activeTimer, setActiveTimer] = useState<number | undefined>(
    undefined
  )
  const [cartDropdownOpen, setCartDropdownOpen] = useState(false)

  const open = () => setCartDropdownOpen(true)
  const close = () => setCartDropdownOpen(false)

  const totalItems =
    cartState?.items?.reduce((acc, item) => {
      return acc + item.quantity
    }, 0) || 0

  const subtotal = cartState?.subtotal ?? 0
  const itemRef = useRef<number>(totalItems || 0)

  const timedOpen = () => {
    open()

    const timer = setTimeout(close, 5000)

    setActiveTimer(timer)
  }

  const openAndCancel = () => {
    if (activeTimer) {
      clearTimeout(activeTimer)
    }

    open()
  }

  // Clean up the timer when the component unmounts
  useEffect(() => {
    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer)
      }
    }
  }, [activeTimer])

  const pathname = usePathname()

  // open cart dropdown when modifying the cart items, but only if we're not on the cart page
  useEffect(() => {
    if (itemRef.current !== totalItems && !pathname.includes("/cart")) {
      timedOpen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems, itemRef.current])

  return (
    <div
      className="h-full z-50"
      onMouseEnter={openAndCancel}
      onMouseLeave={close}
    >
      <Popover className="relative h-full">
        <PopoverButton as={Fragment}>
          <LocalizedClientLink
            className="relative inline-flex h-full items-center gap-2 rounded-full px-2 font-medium text-brand-ink transition-colors hover:bg-brand-mist hover:text-brand-forest sm:px-3"
            href="/cart"
            aria-label={`Giỏ sách, ${totalItems} sản phẩm`}
            data-testid="nav-cart-link"
          >
            <ShoppingBag size={18} aria-hidden="true" />
            <span className="hidden sm:inline">Giỏ sách</span>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-clay px-1 text-[10px] font-bold text-white">{totalItems}</span>
          </LocalizedClientLink>
        </PopoverButton>
        <Transition
          show={cartDropdownOpen}
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <PopoverPanel
            static
            className="absolute right-0 top-[calc(100%+10px)] hidden w-[420px] overflow-hidden rounded-2xl border border-brand-sand bg-brand-paper text-brand-ink shadow-2xl lg:block"
            data-testid="nav-cart-dropdown"
          >
            <div className="flex items-center justify-between border-b border-brand-sand px-5 py-4">
              <h3 className="font-display text-xl font-semibold text-brand-forest">Giỏ sách của bạn</h3>
              <span className="text-xs text-brand-ink/65">{totalItems} cuốn sách</span>
            </div>
            {cartState && cartState.items?.length ? (
              <>
                <div className="no-scrollbar grid max-h-[402px] grid-cols-1 gap-y-5 overflow-y-auto px-5 py-5">
                  {cartState.items
                    .sort((a, b) => {
                      return (a.created_at ?? "") > (b.created_at ?? "")
                        ? -1
                        : 1
                    })
                    .map((item) => (
                      <div
                        className="grid grid-cols-[84px_1fr] gap-x-4"
                        key={item.id}
                        data-testid="cart-item"
                      >
                        <LocalizedClientLink
                          href={`/products/${item.product_handle}`}
                          className="w-[84px]"
                        >
                          <Thumbnail
                            thumbnail={item.thumbnail}
                            size="square"
                            alt={`Bìa sách ${item.title}`}
                            className="rounded-xl p-2 shadow-sm group-hover:translate-y-0"
                          />
                        </LocalizedClientLink>
                        <div className="flex flex-col justify-between flex-1">
                          <div className="flex flex-col flex-1">
                            <div className="flex items-start justify-between">
                              <div className="mr-3 flex w-[190px] flex-col overflow-hidden">
                                <h3 className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-base font-semibold text-brand-forest">
                                  <LocalizedClientLink
                                    href={`/products/${item.product_handle}`}
                                    data-testid="product-link"
                                  >
                                    {item.title}
                                  </LocalizedClientLink>
                                </h3>
                                <LineItemOptions
                                  variant={item.variant}
                                  data-testid="cart-item-variant"
                                  data-value={item.variant}
                                />
                                <span
                                  data-testid="cart-item-quantity"
                                  data-value={item.quantity}
                                >
                                  Số lượng: {item.quantity}
                                </span>
                              </div>
                              <div className="flex justify-end">
                                <LineItemPrice
                                  item={item}
                                  style="tight"
                                  currencyCode={cartState.currency_code}
                                />
                              </div>
                            </div>
                          </div>
                          <DeleteButton
                            id={item.id}
                            className="mt-1"
                            data-testid="cart-item-remove-button"
                          >
                            Xóa
                          </DeleteButton>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="flex flex-col gap-y-4 border-t border-brand-sand bg-brand-cream/60 p-5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-brand-forest">
                      Tạm tính{" "}
                      <span className="font-normal text-brand-ink/65">(chưa gồm thuế)</span>
                    </span>
                    <span
                      className="font-display text-lg font-semibold text-brand-forest"
                      data-testid="cart-subtotal"
                      data-value={subtotal}
                    >
                      {convertToLocale({
                        amount: subtotal,
                        currency_code: cartState.currency_code,
                      })}
                    </span>
                  </div>
                  <LocalizedClientLink
                    href="/cart"
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-brand-forest px-5 font-semibold text-white transition-colors hover:bg-brand-forest-dark"
                    data-testid="go-to-cart-button"
                  >
                    Xem giỏ sách
                  </LocalizedClientLink>
                </div>
              </>
            ) : (
              <div>
                <div className="flex flex-col items-center justify-center gap-y-4 px-6 py-14 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-mist text-brand-forest"><ShoppingBag size={20} aria-hidden="true" /></span>
                  <div>
                    <p className="font-display text-xl font-semibold text-brand-forest">Giỏ sách đang trống</p>
                    <p className="mt-1 text-xs text-brand-ink/50">Một cuốn sách hay đang chờ bạn khám phá.</p>
                  </div>
                  <div>
                    <LocalizedClientLink
                      href="/store"
                      onClick={close}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-brand-forest px-5 text-sm font-semibold text-white hover:bg-brand-forest-dark"
                    >
                      <span className="sr-only">Đi đến trang tất cả sách</span>
                      Khám phá tủ sách
                    </LocalizedClientLink>
                  </div>
                </div>
              </div>
            )}
          </PopoverPanel>
        </Transition>
      </Popover>
    </div>
  )
}

export default CartDropdown
