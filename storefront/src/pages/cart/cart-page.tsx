import { useCart } from "@/entities/cart"
import { useCustomer } from "@/entities/customer"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import CartTemplate from "@/widgets/cart/cart-template"

export function CartPage() {
  const { cart, loaded } = useCart()
  const { customer } = useCustomer()
  usePageTitle("Cart", "View your cart")

  if (!loaded) {
    return null
  }

  return <CartTemplate cart={cart} customer={customer} />
}