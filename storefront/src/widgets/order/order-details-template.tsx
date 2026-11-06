
import { XMark } from "@/widgets/common/icons"
import { HttpTypes } from "@/shared/types/http"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import Help from "@/widgets/order/help"
import Items from "@/widgets/order/items"
import OrderDetails from "@/widgets/order/order-details"
import OrderSummary from "@/widgets/order/order-summary"
import ShippingDetails from "@/widgets/order/shipping-details"
import React from "react"

type OrderDetailsTemplateProps = {
  order: HttpTypes.StoreOrder
}

const OrderDetailsTemplate: React.FC<OrderDetailsTemplateProps> = ({
  order,
}) => {
  return (
    <div className="flex flex-col justify-center gap-y-5 text-brand-ink">
      <div className="flex gap-2 justify-between items-center">
        <h1 className="font-serif text-3xl font-semibold text-brand-forest">Chi tiết đơn hàng</h1>
        <LocalizedClientLink
          href="/account/orders"
          className="flex items-center gap-2 text-brand-ink/60 transition-colors hover:text-brand-clay"
          data-testid="back-to-overview-button"
        >
          <XMark /> Quay lại danh sách
        </LocalizedClientLink>
      </div>
      <div
        className="flex h-full w-full flex-col gap-5 rounded-xl border border-brand-gold/40 bg-brand-paper p-5 small:p-7"
        data-testid="order-details-container"
      >
        <OrderDetails order={order} showStatus />
        <Items order={order} />
        <ShippingDetails order={order} />
        <OrderSummary order={order} />
        <Help />
      </div>
    </div>
  )
}

export default OrderDetailsTemplate
