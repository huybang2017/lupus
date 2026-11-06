
import OrderCard from "@/widgets/account/order-card"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { HttpTypes } from "@/shared/types/http"

const OrderOverview = ({ orders }: { orders: HttpTypes.StoreOrder[] }) => {
  if (orders?.length) {
    return (
      <div className="flex flex-col gap-y-8 w-full">
        {orders.map((o) => (
          <div
            key={o.id}
            className="border-b border-brand-gold/40 pb-6 last:border-none last:pb-0"
          >
            <OrderCard order={o} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="w-full flex flex-col items-center gap-y-4"
      data-testid="no-orders-container"
    >
      <h2 className="font-serif text-2xl font-semibold text-brand-forest">Kệ đơn hàng đang trống</h2>
      <p className="text-base-regular text-brand-ink/70">
        Bạn chưa có đơn hàng nào. Hãy chọn một cuốn sách thật hay để bắt đầu nhé.
      </p>
      <div className="mt-4">
        <LocalizedClientLink
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-forest-dark"
          data-testid="continue-shopping-button"
        >
          Khám phá sách
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default OrderOverview
