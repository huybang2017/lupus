import { useCustomer } from "@/entities/customer"
import { useCountryRegion } from "@/providers/region-provider"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import AddressBook from "@/widgets/account/address-book"

export function AccountAddressesPage() {
  const { customer } = useCustomer()
  const { region } = useCountryRegion()
  usePageTitle("Sổ địa chỉ", "Xem và quản lý địa chỉ giao hàng của bạn")

  if (!customer) {
    return notFound()
  }

  return (
    <div className="w-full text-brand-ink" data-testid="addresses-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-3 border-b border-brand-gold/40 pb-6">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-clay">Tài khoản của bạn</span>
        <h1 className="font-serif text-3xl font-semibold">Địa chỉ giao hàng</h1>
        <p className="max-w-2xl text-base-regular text-brand-ink/70">
          Xem, cập nhật hoặc thêm địa chỉ giao hàng. Địa chỉ đã lưu sẽ giúp bạn hoàn tất đơn sách nhanh hơn khi thanh toán.
        </p>
      </div>
      <AddressBook customer={customer} region={region} />
    </div>
  )
}
