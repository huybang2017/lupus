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
  return (
    <RadioGroupOption
      key={paymentProviderId}
      value={paymentProviderId}
      disabled={disabled}
      className={clx(
        "flex flex-col gap-y-2 text-small-regular cursor-pointer py-4 border rounded-rounded px-8 mb-2 hover:shadow-borders-interactive-with-active",
        {
          "border-ui-border-interactive": selectedPaymentOptionId === paymentProviderId,
        }
      )}
    >
      <div className="flex items-center justify-between ">
        <div className="flex items-center gap-x-4">
          <Radio checked={selectedPaymentOptionId === paymentProviderId} />
          <Text className="text-base-regular">{paymentInfoMap[paymentProviderId]?.title || paymentProviderId}</Text>
        </div>
        <span className="justify-self-end text-ui-fg-base">{paymentInfoMap[paymentProviderId]?.icon}</span>
      </div>
      {children}
    </RadioGroupOption>
  )
}

export default PaymentContainer
