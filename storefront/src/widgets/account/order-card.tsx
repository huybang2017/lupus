import { useMemo } from "react"

import Thumbnail from "@/widgets/products/thumbnail"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { convertToLocale } from "@/shared/formatting/money"
import { HttpTypes } from "@/shared/types/http"

type OrderCardProps = {
  order: HttpTypes.StoreOrder
}

const OrderCard = ({ order }: OrderCardProps) => {
  const numberOfLines = useMemo(() => {
    return (
      order.items?.reduce((acc, item) => {
        return acc + item.quantity
      }, 0) ?? 0
    )
  }, [order])

  const numberOfProducts = useMemo(() => {
    return order.items?.length ?? 0
  }, [order])

  return (
    <div className="flex flex-col rounded-xl border border-brand-gold/40 bg-brand-paper p-5 text-brand-ink shadow-sm" data-testid="order-card">
      <div className="mb-1 font-serif text-lg font-semibold text-brand-forest">
        #<span data-testid="order-display-id">{order.display_id}</span>
      </div>
      <div className="flex flex-wrap items-center divide-x divide-brand-gold/40 text-small-regular text-brand-ink/70">
        <span className="pr-2" data-testid="order-created-at">
          {new Date(order.created_at).toLocaleDateString("vi-VN")}
        </span>
        <span className="px-2" data-testid="order-amount">
          {convertToLocale({
            amount: order.total,
            currency_code: order.currency_code,
          })}
        </span>
        <span className="pl-2">{`${numberOfLines} cuốn sách`}</span>
      </div>
      <div className="grid grid-cols-2 small:grid-cols-4 gap-4 my-4">
        {order.items?.slice(0, 3).map((i) => {
          return (
            <div
              key={i.id}
              className="flex flex-col gap-y-2"
              data-testid="order-item"
            >
              <Thumbnail thumbnail={i.thumbnail} images={[]} size="full" />
              <div className="flex items-center text-small-regular text-ui-fg-base">
                <span
                  className="text-ui-fg-base font-semibold"
                  data-testid="item-title"
                >
                  {i.title}
                </span>
                <span className="ml-2">x</span>
                <span data-testid="item-quantity">{i.quantity}</span>
              </div>
            </div>
          )
        })}
        {numberOfProducts > 3 && (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <span className="text-small-regular text-ui-fg-base">
              + {numberOfProducts - 3}
            </span>
            <span className="text-small-regular text-ui-fg-base">cuốn sách khác</span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <LocalizedClientLink
          href={`/account/orders/details/${order.id}`}
          className="inline-flex h-10 items-center justify-center rounded-full border border-brand-forest/30 bg-brand-paper px-5 text-sm font-semibold text-brand-forest transition-colors hover:border-brand-forest hover:bg-brand-mist"
          data-testid="order-details-link"
        >
          Xem chi tiết
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default OrderCard
