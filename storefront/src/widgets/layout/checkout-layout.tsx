import { Outlet, useLocation } from "react-router-dom"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import NotFoundBoundary from "@/widgets/common/not-found-boundary"
import ChevronDown from "@/widgets/common/icons/chevron-down"
import { NotFoundPage } from "@/pages/error/not-found-page"
import BrandMark from "@/widgets/common/brand-mark"

export function CheckoutLayout() {
  const location = useLocation()

  return (
    <div className="relative min-h-screen w-full bg-brand-cream">
      <div className="h-[4.5rem] border-b border-brand-sand bg-brand-paper">
        <nav className="flex h-full items-center content-container justify-between">
          <LocalizedClientLink
            href="/cart"
            className="flex flex-1 basis-0 items-center gap-x-2 text-xs font-semibold text-brand-ink/60 transition-colors hover:text-brand-forest"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90" size={16} />
            <span className="mt-px hidden sm:block">Quay lại giỏ sách</span>
            <span className="mt-px block sm:hidden">Quay lại</span>
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/"
            className="rounded-full"
            data-testid="store-link"
          >
            <BrandMark compact />
          </LocalizedClientLink>
          <div className="flex-1 basis-0" />
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">
        <NotFoundBoundary key={location.pathname} fallback={<NotFoundPage />}>
          <Outlet />
        </NotFoundBoundary>
      </div>
    </div>
  )
}
