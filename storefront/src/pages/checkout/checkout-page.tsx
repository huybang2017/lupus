import { useCart } from "@/entities/cart"
import { useCustomer } from "@/entities/customer"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import CheckoutForm from "@/widgets/checkout/checkout-form"
import CheckoutSummary from "@/widgets/checkout/checkout-summary"
import { PageLoading } from "@/widgets/common/page-state"

export function CheckoutPage() {
  const { cart, loaded } = useCart()
  const { customer } = useCustomer()
  usePageTitle("Thanh toán", "Hoàn tất địa chỉ, giao hàng và thanh toán cho đơn sách của bạn.")

  if (!loaded) {
    return <PageLoading message="Đang chuẩn bị trang thanh toán…" />
  }
  if (!cart) {
    return notFound()
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-brand-cream/60 content-container gap-y-8 small:grid-cols-[1fr_416px] small:gap-x-12 medium:gap-x-20 py-8 small:py-12">
      <CheckoutForm cart={cart} customer={customer} />
      <CheckoutSummary cart={cart} />
    </div>
  )
}
