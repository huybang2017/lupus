import { useCustomer } from "@/entities/customer"
import { listRegions } from "@/entities/regions"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import ProfileBillingAddress from "@/widgets/account/profile-billing-address"
import ProfileEmail from "@/widgets/account/profile-email"
import ProfileName from "@/widgets/account/profile-name"
import ProfilePhone from "@/widgets/account/profile-phone"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"

function ProfileDivider() {
  return <div className="h-px w-full bg-brand-gold/40" />
}

export function AccountProfilePage() {
  const { customer } = useCustomer()
  usePageTitle("Hồ sơ", "Xem và cập nhật hồ sơ Lupus Books của bạn.")
  const { data: regions, error, loading, reload } = useAsync(() => listRegions(), [])

  if (!customer) {
    return notFound()
  }
  if (loading) {
    return <PageLoading compact message="Đang tải hồ sơ độc giả…" />
  }
  if (error) {
    return <PageLoadError compact title="Chưa thể tải hồ sơ" onRetry={reload} />
  }
  if (!regions) {
    return notFound()
  }

  return (
    <div className="w-full text-brand-ink" data-testid="profile-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-3 border-b border-brand-gold/40 pb-6">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-clay">Thông tin độc giả</span>
        <h1 className="font-serif text-3xl font-semibold">Hồ sơ cá nhân</h1>
        <p className="max-w-2xl text-base-regular text-brand-ink/70">
          Xem và cập nhật họ tên, email, số điện thoại cùng địa chỉ thanh toán của bạn.
        </p>
      </div>
      <div className="flex flex-col gap-y-8 w-full">
        <ProfileName customer={customer} />
        <ProfileDivider />
        <ProfileEmail customer={customer} />
        <ProfileDivider />
        <ProfilePhone customer={customer} />
        <ProfileDivider />
        <ProfileBillingAddress customer={customer} regions={regions} />
      </div>
    </div>
  )
}
