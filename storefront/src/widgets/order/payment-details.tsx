import { Container, Heading, Text } from "@/widgets/common/ui"

import { isStripeLike, paymentInfoMap } from "@/shared/constants"
import Divider from "@/widgets/common/divider"
import { convertToLocale } from "@/shared/formatting/money"
import { HttpTypes } from "@/shared/types/http"

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const payment = order.payment_collections?.[0].payments?.[0]
  const localizedPaymentTitles: Record<string, string> = {
    pp_stripe_stripe: "Thẻ tín dụng / ghi nợ",
    pp_system_default: "Thanh toán thủ công",
    manual: "Thanh toán thủ công",
    pp_vietqr: "Chuyển khoản VietQR",
    pp_demo_bank: "Thanh toán thẻ ngân hàng",
  }
  const paymentTitle = payment
    ? localizedPaymentTitles[payment.provider_id] ??
      paymentInfoMap[payment.provider_id]?.title ??
      payment.provider_id
    : ""

  return (
    <div className="text-brand-ink">
      <Heading level="h2" className="my-6 flex flex-row font-serif text-2xl font-semibold text-brand-forest">
        Thanh toán
      </Heading>
      <div>
        {payment && (
          <div className="flex items-start gap-x-1 w-full">
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Phương thức thanh toán
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method"
              >
                {paymentTitle}
              </Text>
            </div>
            <div className="flex flex-col w-2/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Chi tiết thanh toán
              </Text>
              <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                  {paymentInfoMap[payment.provider_id]?.icon}
                </Container>
                <Text data-testid="payment-amount">
                  {isStripeLike(payment.provider_id) && payment.data?.card_last4
                    ? `**** **** **** ${payment.data.card_last4}`
                    : `${convertToLocale({
                        amount: payment.amount,
                        currency_code: order.currency_code,
                      })} · thanh toán lúc ${new Date(
                        payment.created_at ?? ""
                      ).toLocaleString("vi-VN")}`}
                </Text>
              </div>
            </div>
          </div>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default PaymentDetails
