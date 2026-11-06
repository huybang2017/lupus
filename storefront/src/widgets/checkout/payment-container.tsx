import { Radio as RadioGroupOption } from "@headlessui/react"
import { Text, clx } from "@/widgets/common/ui"
import React, { type JSX } from "react"

import Radio from "@/widgets/common/radio"

type PaymentContainerProps = {
  paymentProviderId: string
  selectedPaymentOptionId: string | null
  disabled?: boolean
  paymentInfoMap: Record<string, { title: string; icon: JSX.Element }>
  children?: React.ReactNode
}

const PaymentContainer: React.FC<PaymentContainerProps> = ({
  paymentProviderId,
  selectedPaymentOptionId,
  paymentInfoMap,
  disabled = false,
  children,
}) => {
  const paymentTitle =
    paymentProviderId === "pp_system_default" || paymentProviderId === "manual"
      ? "Thanh toán khi nhận hàng (COD)"
      : paymentProviderId === "pp_stripe_stripe"
      ? "Thẻ tín dụng hoặc ghi nợ"
      : paymentProviderId === "pp_vietqr"
      ? "Chuyển khoản VietQR"
      : paymentProviderId === "pp_demo_bank"
      ? "Thanh toán thẻ ngân hàng"
      : paymentInfoMap[paymentProviderId]?.title || paymentProviderId
  const paymentDescription =
    paymentProviderId === "pp_demo_bank"
      ? "Thanh toán tức thì bằng thẻ hoặc tài khoản ngân hàng."
      : paymentProviderId === "pp_vietqr"
      ? "Quét mã theo đơn hàng, cửa hàng xác nhận sau khi nhận tiền."
      : paymentProviderId === "pp_system_default" || paymentProviderId === "manual"
      ? "Thanh toán cho nhân viên khi đơn sách được giao đến."
      : ""

  return (
    <RadioGroupOption
      key={paymentProviderId}
      value={paymentProviderId}
      disabled={disabled}
      className={clx(
        "flex flex-col gap-y-2 text-small-regular cursor-pointer py-4 border border-brand-gold/40 rounded-xl bg-brand-paper px-5 sm:px-8 mb-2 transition-colors hover:border-brand-forest/50 hover:bg-brand-cream/50",
        {
          "border-brand-forest bg-brand-cream/70": selectedPaymentOptionId === paymentProviderId,
        }
      )}
    >
      <div className="flex items-center justify-between ">
        <div className="flex items-start gap-x-4">
          <Radio checked={selectedPaymentOptionId === paymentProviderId} />
          <div>
            <Text className="text-base-regular font-semibold text-brand-ink">{paymentTitle}</Text>
            {paymentDescription && (
              <Text className="mt-1 max-w-xl text-sm leading-5 text-brand-ink/55">{paymentDescription}</Text>
            )}
          </div>
        </div>
        <span className="justify-self-end text-ui-fg-base">{paymentInfoMap[paymentProviderId]?.icon}</span>
      </div>
      {children}
    </RadioGroupOption>
  )
}

export default PaymentContainer
