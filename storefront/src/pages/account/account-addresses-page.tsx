import { useCustomer } from "@/entities/customer"
import { useCountryRegion } from "@/providers/region-provider"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import AddressBook from "@/widgets/account/address-book"

export function AccountAddressesPage() {
  const { customer } = useCustomer()
  const { region } = useCountryRegion()
  usePageTitle("Addresses", "View your addresses")

  if (!customer) {
    return notFound()
  }

  return (
    <div className="w-full" data-testid="addresses-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Shipping Addresses</h1>
        <p className="text-base-regular">
          View and update your shipping addresses, you can add as many as you like. Saving your addresses will make them available during checkout.
        </p>
      </div>
      <AddressBook customer={customer} region={region} />
    </div>
  )
}