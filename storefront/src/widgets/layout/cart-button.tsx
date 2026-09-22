import { useCart } from "@/entities/cart"
import CartDropdown from "@/widgets/layout/cart-dropdown"

export default function CartButton() {
  const { cart } = useCart()

  return <CartDropdown cart={cart} />
}
