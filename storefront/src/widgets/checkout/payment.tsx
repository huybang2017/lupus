import { RadioGroup } from "@headlessui/react"
import { isStripeLike, paymentInfoMap } from "@/shared/constants"
import { initiatePaymentSession } from "@/entities/cart"
import { CheckCircleSolid, CreditCard } from "@/widgets/common/icons"
import ErrorMessage from "@/widgets/checkout/error-message"
import PaymentContainer from "@/widgets/checkout/payment-container"
import Divider from "@/widgets/common/divider"
import {
  Button,
  Container,
  Heading,
  Text,
  clx,
} from "@/widgets/common/ui"
import { HttpTypes } from "@/shared/types/http"
import { usePathname, useRouter, useSearchParams } from "@/shared/navigation/router"
import { useCallback, useEffect, useState } from "react"

const getPaymentTitle = (providerId: string) => {
  if (providerId === "pp_system_default" || providerId === "manual") {
    return "Thanh toán khi nhận hàng (COD)"
  }

  if (providerId === "pp_stripe_stripe") {
    return "Thẻ tín dụng hoặc ghi nợ"
  }

  if (providerId === "pp_vietqr") {
    return "Chuyển khoản VietQR"
  }

  if (providerId === "pp_demo_bank") {
    return "Thanh toán thẻ ngân hàng"
  }

  return paymentInfoMap[providerId]?.title || providerId
}

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: HttpTypes.StoreCart
  availablePaymentMethods: { id: string }[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // card providers (Stripe-like) confirm details inline; the lupus backend only ships the manual provider
  const [paymentComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeSession?.provider_id ?? ""
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  const setPaymentMethod = async (method: string) => {
    setError(null)
    setSelectedPaymentMethod(method)
    if (isStripeLike(method)) {
      await initiatePaymentSession(cart, {
        provider_id: method,
      })
    }
  }

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards && ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 && cart?.total === 0
  )

  const paymentReady =
    (activeSession && (cart?.shipping_methods?.length ?? 0) !== 0) || paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const shouldInputPaymentDetails =
        isStripeLike(selectedPaymentMethod) && !activeSession

      const checkActiveSession =
        activeSession?.provider_id === selectedPaymentMethod

      if (!checkActiveSession) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
      }

      if (!shouldInputPaymentDetails) {
        return router.push(
          pathname + "?" + createQueryString("step", "review"),
          {
            scroll: false,
          }
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="rounded-2xl border border-brand-gold/35 bg-brand-paper p-5 shadow-book sm:p-7">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "font-editorial flex flex-row text-3xl-regular gap-x-2 items-baseline text-brand-ink",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && !paymentReady,
            }
          )}
        >
          Thanh toán
          {!isOpen && paymentReady && <CheckCircleSolid className="text-brand-forest" />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={handleEdit}
              className="font-medium text-brand-clay hover:text-brand-clay-dark"
              data-testid="edit-payment-button"
            >
              Chỉnh sửa
            </button>
          </Text>
        )}
      </div>
      <div>
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard && availablePaymentMethods.length > 0 && (
            <>
              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(value: string) => setPaymentMethod(value)}
              >
                {availablePaymentMethods.map((paymentMethod) => (
                  <div key={paymentMethod.id}>
                    <PaymentContainer
                      paymentInfoMap={paymentInfoMap}
                      paymentProviderId={paymentMethod.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                    />
                  </div>
                ))}
              </RadioGroup>
            </>
          )}

          {!paidByGiftcard && !availablePaymentMethods?.length && (
            <div className="rounded-xl border border-brand-gold/40 bg-brand-cream/70 p-4 text-sm leading-6 text-brand-ink/70" role="status">
              Chưa có phương thức thanh toán cho khu vực này. Vui lòng kiểm tra cấu hình thanh toán trong trang quản trị.
            </div>
          )}

          {paidByGiftcard && (
            <div className="flex flex-col w-full sm:w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Phương thức thanh toán
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Thẻ quà tặng
              </Text>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="payment-method-error-message"
          />

          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              (isStripeLike(selectedPaymentMethod) && !paymentComplete) ||
              (!selectedPaymentMethod && !paidByGiftcard)
            }
            data-testid="submit-payment-button"
          >
            {!activeSession && isStripeLike(selectedPaymentMethod)
              ? "Nhập thông tin thanh toán"
              : "Tiếp tục kiểm tra đơn"}
          </Button>
        </div>

        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="flex items-start gap-x-1 w-full">
              <div className="flex flex-col w-full sm:w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Phương thức thanh toán
                </Text>
                <Text
                  className="txt-medium text-ui-fg-subtle"
                  data-testid="payment-method-summary"
                >
                  {getPaymentTitle(activeSession?.provider_id)}
                </Text>
              </div>
              <div className="flex flex-col w-full sm:w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Chi tiết thanh toán
                </Text>
                <div
                  className="flex gap-2 txt-medium text-ui-fg-subtle items-center"
                  data-testid="payment-details-summary"
                >
                  <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                    {paymentInfoMap[selectedPaymentMethod]?.icon || (
                      <CreditCard />
                    )}
                  </Container>
                  <Text>
                    {activeSession.provider_id === "pp_demo_bank"
                      ? "Nhập thông tin thẻ ở bước kiểm tra đơn"
                      : "Sẽ được xác nhận ở bước tiếp theo"}
                  </Text>
                </div>
              </div>
            </div>
          ) : paidByGiftcard ? (
            <div className="flex flex-col w-full sm:w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Phương thức thanh toán
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Thẻ quà tặng
              </Text>
            </div>
          ) : null}
        </div>
      </div>
      <Divider className="mt-8 border-brand-gold/30" />
    </div>
  )
}

export default Payment
