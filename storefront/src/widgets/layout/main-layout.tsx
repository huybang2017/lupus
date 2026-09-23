import { Outlet, useLocation } from "react-router-dom"
import { listCartOptions, useCart } from "@/entities/cart"
import { useCustomer } from "@/entities/customer"
import { useAsync } from "@/shared/hooks/use-async"
import CartMismatchBanner from "@/widgets/layout/cart-mismatch-banner"
import Footer from "@/widgets/layout/footer"
import Nav from "@/widgets/layout/nav"
import NotFoundBoundary from "@/widgets/common/not-found-boundary"
import FreeShippingPriceNudge from "@/widgets/shipping/free-shipping-price-nudge"
import { NotFoundPage } from "@/pages/error/not-found-page"

export function MainLayout() {
  const { cart } = useCart()
  const { customer } = useCustomer()
  const location = useLocation()

  // Shipping options feed the free-shipping nudge; they depend on the cart contents and address
  const key = cart ? [cart.id, cart.subtotal, cart.shipping_address?.country_code, cart.items?.length].join("|") : ""
  const { data: shippingOptions } = useAsync(
    () => (cart ? listCartOptions().then(({ shipping_options }) => shipping_options).catch(() => []) : Promise.resolve([])),
    [key]
  )

  return (
    <>
      <Nav />
      {customer && cart && <CartMismatchBanner customer={customer} cart={cart} />}

      {cart && <FreeShippingPriceNudge variant="popup" cart={cart} shippingOptions={shippingOptions ?? []} />}
      <NotFoundBoundary key={location.pathname} fallback={<NotFoundPage />}>
        <Outlet />
      </NotFoundBoundary>
      <Footer />
    </>
  )
}