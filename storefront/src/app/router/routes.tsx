import { Route, Routes } from "react-router-dom"
import { AccountAddressesPage } from "@/pages/account/account-addresses-page"
import { AccountOrderDetailPage } from "@/pages/account/account-order-detail-page"
import { AccountOrdersPage } from "@/pages/account/account-orders-page"
import { AccountOverviewPage } from "@/pages/account/account-overview-page"
import { AccountPage } from "@/pages/account/account-page"
import { AccountProfilePage } from "@/pages/account/account-profile-page"
import { CategoryPage } from "@/pages/catalog/category-page"
import { CollectionPage } from "@/pages/catalog/collection-page"
import { HomePage } from "@/pages/catalog/home-page"
import { ProductPage } from "@/pages/catalog/product-page"
import { StorePage } from "@/pages/catalog/store-page"
import { CartPage } from "@/pages/cart/cart-page"
import { CheckoutPage } from "@/pages/checkout/checkout-page"
import { GlobalNotFoundPage } from "@/pages/error/global-not-found-page"
import { NotFoundPage } from "@/pages/error/not-found-page"
import { OrderConfirmedPage } from "@/pages/order/order-confirmed-page"
import { TransferAcceptPage } from "@/pages/order/transfer-accept-page"
import { TransferDeclinePage } from "@/pages/order/transfer-decline-page"
import { TransferPage } from "@/pages/order/transfer-page"
import { RootRedirect } from "@/pages/root-redirect"
import { CheckoutLayout } from "@/widgets/layout/checkout-layout"
import { CountryGate } from "@/widgets/layout/country-gate"
import { MainLayout } from "@/widgets/layout/main-layout"
import { RootLayout } from "@/widgets/layout/root-layout"

// Route map of the Next.js starter ([countryCode]/(main) and [countryCode]/(checkout)) as react-router routes
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/:countryCode" element={<CountryGate />}>
          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="store" element={<StorePage />} />
            <Route path="products/:handle" element={<ProductPage />} />
            <Route path="collections/:handle" element={<CollectionPage />} />
            <Route path="categories/*" element={<CategoryPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="account" element={<AccountPage />}>
              <Route index element={<AccountOverviewPage />} />
              <Route path="profile" element={<AccountProfilePage />} />
              <Route path="addresses" element={<AccountAddressesPage />} />
              <Route path="orders" element={<AccountOrdersPage />} />
              <Route path="orders/details/:id" element={<AccountOrderDetailPage />} />
            </Route>
            <Route path="order/:id/confirmed" element={<OrderConfirmedPage />} />
            <Route path="order/:id/transfer/:token" element={<TransferPage />} />
            <Route path="order/:id/transfer/:token/accept" element={<TransferAcceptPage />} />
            <Route path="order/:id/transfer/:token/decline" element={<TransferDeclinePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route element={<CheckoutLayout />}>
            <Route path="checkout" element={<CheckoutPage />} />
          </Route>
        </Route>
        <Route path="*" element={<GlobalNotFoundPage />} />
      </Route>
    </Routes>
  )
}