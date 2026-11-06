import { createTransferRequest } from "@/entities/orders"
import { CheckCircleMiniSolid, XCircleSolid } from "@/widgets/common/icons"
import { Heading, IconButton, Input, Text } from "@/widgets/common/ui"
import { useActionState } from "react"
// TODO: Re-add Toaster component when needed
import { SubmitButton } from "@/widgets/checkout/submit-button"
import { useEffect, useState } from "react"

export default function TransferRequestForm() {
  const [showSuccess, setShowSuccess] = useState(false)

  const [state, formAction] = useActionState(createTransferRequest, {
    success: false,
    error: null,
    order: null,
  })

  useEffect(() => {
    if (state.success && state.order) {
      setShowSuccess(true)
    }
  }, [state.success, state.order])

  return (
    <div className="flex w-full flex-col gap-y-4 rounded-xl bg-brand-cream/70 p-5 text-brand-ink">
      <div className="grid sm:grid-cols-2 items-center gap-x-8 gap-y-4 w-full">
        <div className="flex flex-col gap-y-1">
          <Heading level="h3" className="!text-sm font-semibold text-brand-forest">
            Chuyển đơn hàng vào tài khoản
          </Heading>
          <p className="text-small-regular text-brand-ink/65">
            Không thấy đơn hàng bạn đang tìm?
            <br /> Hãy gửi yêu cầu liên kết đơn hàng với tài khoản này.
          </p>
        </div>
        <form
          action={formAction}
          className="flex flex-col gap-y-1 sm:items-end"
        >
          <div className="flex flex-col gap-y-2 w-full">
            <Input className="w-full" name="order_id" placeholder="Mã đơn hàng" />
            <SubmitButton
              variant="secondary"
              size="small"
              className="w-fit whitespace-nowrap self-end"
            >
              Gửi yêu cầu
            </SubmitButton>
          </div>
        </form>
      </div>
      {!state.success && state.error && (
        <Text className="text-base-regular text-rose-500 text-right">
          {state.error}
        </Text>
      )}
      {showSuccess && (
        <div className="flex w-full items-center justify-between self-stretch rounded-lg border border-brand-gold/40 bg-brand-paper p-4">
          <div className="flex gap-x-2 items-center">
            <CheckCircleMiniSolid className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col gap-y-1">
              <Text className="text-medim-pl text-brand-ink">
                Đã yêu cầu chuyển đơn hàng {state.order?.id}
              </Text>
              <Text className="text-base-regular text-brand-ink/65">
                Email xác nhận đã được gửi đến {state.order?.email}
              </Text>
            </div>
          </div>
          <IconButton
            className="h-fit"
            onClick={() => setShowSuccess(false)}
            aria-label="Đóng thông báo"
          >
            <XCircleSolid className="w-4 h-4 text-neutral-500" />
          </IconButton>
        </div>
      )}
    </div>
  )
}
