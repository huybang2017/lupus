import { Heading } from "@/widgets/common/ui"

import ItemsPreviewTemplate from "@/widgets/cart/items-preview-template"
import DiscountCode from "@/widgets/checkout/discount-code"
import CartTotals from "@/widgets/common/cart-totals"
import Divider from "@/widgets/common/divider"
import { HttpTypes } from "@/shared/types/http"

const CheckoutSummary = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  return (
    <div className="sticky top-20 flex flex-col-reverse small:flex-col gap-y-8 py-8 small:py-0">
      <div className="w-full rounded-2xl border border-brand-gold/35 bg-brand-paper p-5 shadow-book flex flex-col sm:p-6">
        <Divider className="my-6 border-brand-gold/30 small:hidden" />
        <Heading
          level="h2"
          className="font-editorial flex flex-row text-3xl-regular items-baseline text-brand-ink"
        >
          Đơn sách của bạn
        </Heading>
        <Divider className="my-6 border-brand-gold/30" />
        <CartTotals totals={cart} />
        <ItemsPreviewTemplate cart={cart} />
        <div className="my-6">
          <DiscountCode cart={cart} />
        </div>
      </div>
    </div>
  )
}

export default CheckoutSummary
