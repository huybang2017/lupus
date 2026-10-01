import { useCart } from "@/entities/cart"
import { useCustomer } from "@/entities/customer"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import CheckoutForm from "@/widgets/checkout/checkout-form"
import CheckoutSummary from "@/widgets/checkout/checkout-summary"

export function CheckoutPage() {
  const { cart, loaded } = useCart()
  const { customer } = useCustomer()
  usePageTitle("Checkout")

  if (!loaded) {
    return null
  }
  if (!cart) {
    return notFound()
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <CheckoutForm cart={cart} customer={customer} />
      <CheckoutSummary cart={cart} />
    </div>
  )
}