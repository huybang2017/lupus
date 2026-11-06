import { useCart } from "@/entities/cart"
import { useCustomer } from "@/entities/customer"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import CartTemplate from "@/widgets/cart/cart-template"
import { PageLoading } from "@/widgets/common/page-state"

export function CartPage() {
  const { cart, loaded } = useCart()
  const { customer } = useCustomer()
  usePageTitle("Giỏ sách", "Xem và cập nhật những cuốn sách trong giỏ hàng của bạn.")

  if (!loaded) {
    return <PageLoading message="Đang kiểm tra giỏ sách…" />
  }

  return <CartTemplate cart={cart} customer={customer} />
}
