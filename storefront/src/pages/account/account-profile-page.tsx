import { useCustomer } from "@/entities/customer"
import { listRegions } from "@/entities/regions"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import ProfileBillingAddress from "@/widgets/account/profile-billing-address"
import ProfileEmail from "@/widgets/account/profile-email"
import ProfileName from "@/widgets/account/profile-name"
import ProfilePhone from "@/widgets/account/profile-phone"

function ProfileDivider() {
  return <div className="w-full h-px bg-gray-200" />
}

export function AccountProfilePage() {
  const { customer } = useCustomer()
  usePageTitle("Profile", "View and edit your Lupus Store profile.")
  const { data: regions } = useAsync(() => listRegions(), [])

  if (!customer) {
    return notFound()
  }
  if (!regions) {
    return null
  }

  return (
    <div className="w-full" data-testid="profile-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Profile</h1>
        <p className="text-base-regular">
          View and update your profile information, including your name, email, and phone number. You can also update your billing address, or
          change your password.
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