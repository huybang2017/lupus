import { Heading } from "@/widgets/common/ui"

import CartTotals from "@/widgets/common/cart-totals"
import Help from "@/widgets/order/help"
import Items from "@/widgets/order/items"
import OrderDetails from "@/widgets/order/order-details"
import ShippingDetails from "@/widgets/order/shipping-details"
import PaymentDetails from "@/widgets/order/payment-details"
import { HttpTypes } from "@/shared/types/http"
import VietQrPayment from "@/widgets/order/vietqr-payment"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const usesVietQr = order.payment_collections?.[0]?.payment_sessions?.some(
    (session) => session.provider_id === "pp_vietqr"
  )

  return (
    <div className="min-h-[calc(100vh-64px)] bg-brand-cream py-8 text-brand-ink small:py-12">
      <div className="content-container flex flex-col justify-center items-center gap-y-10 max-w-4xl h-full w-full">
        <div
          className="flex h-full w-full max-w-4xl flex-col gap-5 rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 shadow-sm small:p-10"
          data-testid="order-complete-container"
        >
          <Heading
            level="h1"
            className="mb-4 flex flex-col gap-y-2 font-serif text-3xl text-brand-forest"
          >
            <span>Cảm ơn bạn!</span>
            <span>Đơn sách đã được đặt thành công.</span>
          </Heading>
          <OrderDetails order={order} showStatus />
          {usesVietQr && <VietQrPayment orderId={order.id} />}
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            Tóm tắt đơn hàng
          </Heading>
          <Items order={order} />
          <CartTotals totals={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
          <Help />
        </div>
      </div>
    </div>
  )
}
