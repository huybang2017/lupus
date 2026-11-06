import { listCartShippingMethods } from "@/entities/fulfillment"
import { listCartPaymentMethods } from "@/entities/payment"
import { useAsync } from "@/shared/hooks/use-async"
import { HttpTypes } from "@/shared/types/http"
import Addresses from "@/widgets/checkout/addresses"
import Payment from "@/widgets/checkout/payment"
import Review from "@/widgets/checkout/review"
import Shipping from "@/widgets/checkout/shipping"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"

export default function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  // Options depend on the address and what is in the cart (the starter re-fetches them when the cart cache tag changes)
  const optionsKey = cart
    ? [cart.id, cart.region?.id, cart.shipping_address?.country_code, cart.shipping_address?.postal_code, cart.subtotal, cart.items?.length].join("|")
    : ""

  const { data, error, loading, reload } = useAsync(async () => {
    if (!cart) {
      return null
    }
    const [shippingMethods, paymentMethods] = await Promise.all([listCartShippingMethods(cart.id), listCartPaymentMethods(cart.region?.id ?? "")])
    return { shippingMethods, paymentMethods }
  }, [optionsKey])

  if (!cart) {
    return null
  }

  if (loading) {
    return <PageLoading compact message="Đang tìm phương thức giao hàng và thanh toán…" />
  }

  if (error) {
    return (
      <PageLoadError
        compact
        title="Chưa thể chuẩn bị thanh toán"
        description="Không thể tải phương thức giao hàng hoặc thanh toán. Vui lòng kiểm tra cấu hình cửa hàng rồi thử lại."
        onRetry={reload}
      />
    )
  }

  if (!data || !data.shippingMethods || !data.paymentMethods) {
    return (
      <PageLoadError
        compact
        title="Thiếu cấu hình thanh toán"
        description="Cửa hàng chưa có đủ phương thức giao hàng hoặc thanh toán cho khu vực này."
      />
    )
  }

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} />

      <Shipping cart={cart} availableShippingMethods={data.shippingMethods} />

      <Payment cart={cart} availablePaymentMethods={data.paymentMethods} />

      <Review cart={cart} />
    </div>
  )
}
