
import { Heading } from "@/widgets/common/ui"

import CartTotals from "@/widgets/common/cart-totals"
import Divider from "@/widgets/common/divider"
import DiscountCode from "@/widgets/checkout/discount-code"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { HttpTypes } from "@/shared/types/http"

type SummaryProps = {
  cart: HttpTypes.StoreCart
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart }: SummaryProps) => {
  const step = getCheckoutStep(cart)

  return (
    <div className="flex flex-col gap-y-4 rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 shadow-book">
      <Heading level="h2" className="font-editorial text-[2rem] leading-[2.75rem] text-brand-ink">
        Tóm tắt đơn hàng
      </Heading>
      <DiscountCode cart={cart} />
      <Divider className="border-brand-gold/30" />
      <CartTotals totals={cart} />
      <LocalizedClientLink
        href={"/checkout?step=" + step}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-forest px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-forest-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-clay"
        data-testid="checkout-button"
      >
        Tiến hành thanh toán
      </LocalizedClientLink>
    </div>
  )
}

export default Summary
