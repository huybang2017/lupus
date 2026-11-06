
import { Heading, Text, clx } from "@/widgets/common/ui"

import PaymentButton from "@/widgets/checkout/payment-button"
import { useSearchParams } from "@/shared/navigation/router"
import { HttpTypes } from "@/shared/types/http"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards && ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 && cart?.total === 0
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="rounded-2xl border border-brand-gold/35 bg-brand-paper p-5 shadow-book sm:p-7">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "font-editorial flex flex-row text-3xl-regular gap-x-2 items-baseline text-brand-ink",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Kiểm tra đơn hàng
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium text-brand-ink/70 mb-1">
                Hãy kiểm tra lại địa chỉ, phương thức giao hàng, thanh toán và tổng tiền. Khi nhấn Đặt hàng, bạn xác nhận các thông tin trên là chính xác.
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
