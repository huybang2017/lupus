import { Routes, Route, Navigate } from "react-router-dom"
import { ProtectedRoute } from "@/providers/protected-route"
import { Shell, SettingsShell } from "@/widgets/shell/shell"
import { InviteAcceptPage, LoginPage, RegisterPage, ResetPasswordPage } from "@/pages/auth/auth-screens"
import { DashboardPage } from "@/pages/dashboard/dashboard-page"
import { ResourceListPage } from "@/pages/resource/resource-list-page"
import { ResourceDetailPage } from "@/pages/resource/resource-detail-page"
import { OrganizeCategoriesPage } from "@/pages/catalog/categories/organize-categories-page"
import { CreateCategoryPage } from "@/pages/catalog/categories/create-category-page"
import { CategoryAddProductsPage } from "@/pages/catalog/categories/category-add-products-page"
import { CreateCollectionPage } from "@/pages/catalog/collections/create-collection-page"
import { CollectionAddProductsPage } from "@/pages/catalog/collections/collection-pages"
import { CreateProductOptionPage } from "@/pages/catalog/product-options/create-product-option-page"
import { CreateDraftOrderPage } from "@/pages/orders/draft-orders/create-draft-order-page"
import { CreateProductPage } from "@/pages/catalog/products/create-product-page"
import { VariantDetailPage } from "@/pages/catalog/products/variant-detail-page"
import { CreateInventoryPage } from "@/pages/catalog/inventory/create-inventory-page"
import { CreateReservationPage } from "@/pages/catalog/reservations/create-reservation-page"
import { CreateCustomerPage } from "@/pages/customers/create-customer-page"
import { CustomerCreateAddressPage } from "@/pages/customers/customer-create-address-page"
import { CustomerAddGroupsPage } from "@/pages/customers/customer-add-groups-page"
import { CreateCustomerGroupPage } from "@/pages/customers/customer-groups/create-customer-group-page"
import { CreatePromotionPage } from "@/pages/promotions/create-promotion-page"
import { CreateCampaignPage } from "@/pages/promotions/campaigns/create-campaign-page"
import { CreatePriceListPage } from "@/pages/pricing/price-lists/create-price-list-page"
import { LocationsListPage } from "@/pages/fulfillment/locations/locations-list-page"
import { StorePage } from "@/pages/settings/store/store-page"
import { CreateRegionPage, RegionsListPage } from "@/pages/settings/regions/region-pages"
import { InviteUserPage } from "@/pages/settings/users/invite-user-page"
import { CreateLocationPage } from "@/pages/fulfillment/locations/create-location-page"
import { CreateShippingOptionPage, ShippingOptionPricingPage } from "@/pages/fulfillment/shipping-options/shipping-option-pages"
import { CreateShippingOptionTypePage, CreateShippingProfilePage } from "@/pages/fulfillment/shipping-config/shipping-config-pages"
import { PriceListPricesAddPage, PriceListPricesEditPage } from "@/pages/pricing/price-lists/price-list-prices-pages"
import { CreateTaxRegionPage } from "@/pages/settings/tax/create-tax-region-page"
import { TaxRegionsListPage } from "@/pages/settings/tax/tax-pages"
import { CreateTaxRatePage } from "@/pages/settings/tax/create-tax-rate-page"
import { CreateSalesChannelPage } from "@/pages/settings/sales-channels/create-sales-channel-page"
import { SalesChannelAddProductsPage } from "@/pages/settings/sales-channels/sales-channel-detail-page"
import { CreateRefundReasonPage, CreateReturnReasonPage } from "@/pages/settings/reasons/reason-pages"
import { CreateTaxonomyPage } from "@/pages/catalog/taxonomy/taxonomy-pages"
import { ApiKeyDetailPage, ApiKeySalesChannelsPage, ApiKeysListPage, CreateApiKeyPage } from "@/pages/settings/api-keys/api-key-pages"
import { CreateRolePage } from "@/pages/settings/rbac/create-role-page"
import { CreatePaymentCollectionPage } from "@/pages/settings/payments/create-payment-collection-page"
import { CustomerGroupAddCustomersPage } from "@/pages/customers/customer-groups/customer-group-add-customers-page"
import { SettingsRoutes } from "@/app/router/settings-routes"

function NotFoundPage() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 64, fontWeight: 800, color: "var(--field-border)" }}>404</div>
      <p style={{ color: "var(--fg-subtle)", fontSize: 15 }}>Page not found.</p>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invite" element={<InviteAcceptPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          <Route path="r/categories/organize" element={<OrganizeCategoriesPage />} />
          <Route path="r/categories/create" element={<CreateCategoryPage />} />
          <Route path="r/categories/:id/products" element={<CategoryAddProductsPage />} />
          <Route path="r/collections/create" element={<CreateCollectionPage />} />
          <Route path="r/collections/:id/add-products" element={<CollectionAddProductsPage />} />
          <Route path="r/product-options/create" element={<CreateProductOptionPage />} />
          <Route path="r/draft-orders/create" element={<CreateDraftOrderPage />} />
          <Route path="r/products/create" element={<CreateProductPage />} />
          <Route path="r/products/:id/variants/:variantId" element={<VariantDetailPage />} />
          <Route path="r/inventory-items/create" element={<CreateInventoryPage />} />
          <Route path="r/reservations/create" element={<CreateReservationPage />} />
          <Route path="r/customers/create" element={<CreateCustomerPage />} />
          <Route path="r/customers/:id/create-address" element={<CustomerCreateAddressPage />} />
          <Route path="r/customers/:id/add-customer-groups" element={<CustomerAddGroupsPage />} />
          <Route path="r/customer-groups/create" element={<CreateCustomerGroupPage />} />
          <Route path="r/promotions/create" element={<CreatePromotionPage />} />
          <Route path="r/campaigns/create" element={<CreateCampaignPage />} />
          <Route path="r/price-lists/create" element={<CreatePriceListPage />} />
          <Route path="r/price-lists/:id/products/add" element={<PriceListPricesAddPage />} />
          <Route path="r/price-lists/:id/products/edit" element={<PriceListPricesEditPage />} />
          <Route path="r/customer-groups/:id/add-customers" element={<CustomerGroupAddCustomersPage />} />
          <Route path="r/:slug" element={<ResourceListPage />} />
          <Route path="r/:slug/:id" element={<ResourceDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route element={<SettingsShell />}>
          <Route path="settings/*" element={<SettingsRoutes />} />
          <Route path="settings/users/invite" element={<InviteUserPage />} />
          <Route path="settings/invites" element={<Navigate to="/settings/users/invite" replace />} />
          <Route path="settings/regions" element={<RegionsListPage />} />
          <Route path="settings/regions/create" element={<CreateRegionPage />} />
          <Route path="settings/stores" element={<StorePage />} />
          <Route path="settings/store" element={<StorePage />} />
          <Route path="settings/stock-locations" element={<LocationsListPage />} />
          <Route path="settings/stock-locations/create" element={<CreateLocationPage />} />
          <Route path="settings/stock-locations/:id/fulfillment-set/:setId/service-zone/:zoneId/shipping-option/create" element={<CreateShippingOptionPage />} />
          <Route path="settings/stock-locations/:id/fulfillment-set/:setId/service-zone/:zoneId/shipping-option/:optionId/pricing" element={<ShippingOptionPricingPage />} />
          <Route path="settings/shipping-profiles/create" element={<CreateShippingProfilePage />} />
          <Route path="settings/shipping-option-types/create" element={<CreateShippingOptionTypePage />} />
          <Route path="settings/tax-regions" element={<TaxRegionsListPage />} />
          <Route path="settings/tax-regions/create" element={<CreateTaxRegionPage />} />
          <Route path="settings/tax-rates/create" element={<CreateTaxRatePage />} />
          <Route path="settings/sales-channels/create" element={<CreateSalesChannelPage />} />
          <Route path="settings/sales-channels/:id/add-products" element={<SalesChannelAddProductsPage />} />
          <Route path="settings/return-reasons/create" element={<CreateReturnReasonPage />} />
          <Route path="settings/refund-reasons/create" element={<CreateRefundReasonPage />} />
          <Route path="settings/product-types/create" element={<CreateTaxonomyPage kind="type" />} />
          <Route path="settings/product-tags/create" element={<CreateTaxonomyPage kind="tag" />} />
          <Route path="settings/locations" element={<Navigate to="/settings/stock-locations" replace />} />
          <Route path="settings/publishable-api-keys" element={<ApiKeysListPage type="publishable" />} />
          <Route path="settings/publishable-api-keys/create" element={<CreateApiKeyPage type="publishable" />} />
          <Route path="settings/publishable-api-keys/:id" element={<ApiKeyDetailPage type="publishable" />} />
          <Route path="settings/secret-api-keys" element={<ApiKeysListPage type="secret" />} />
          <Route path="settings/secret-api-keys/create" element={<CreateApiKeyPage type="secret" />} />
          <Route path="settings/secret-api-keys/:id" element={<ApiKeyDetailPage type="secret" />} />
          <Route path="settings/publishable-api-keys/:id/sales-channels" element={<ApiKeySalesChannelsPage />} />
          <Route path="settings/api-keys" element={<Navigate to="/settings/publishable-api-keys" replace />} />
          <Route path="settings/rbac-roles/create" element={<CreateRolePage />} />
          <Route path="settings/payment-collections/create" element={<CreatePaymentCollectionPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
