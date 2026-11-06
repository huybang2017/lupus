import { Outlet } from "react-router-dom"
import { useCustomer } from "@/entities/customer"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import AccountLayout from "@/widgets/account/account-layout"
import LoginTemplate from "@/widgets/account/login-template"
import { PageLoading } from "@/widgets/common/page-state"

/** The starter's account/layout.tsx: the dashboard for a signed in customer, the login template otherwise. */
export function AccountPage() {
  const { customer, loaded } = useCustomer()

  if (!loaded) {
    return <PageLoading message="Đang mở tài khoản độc giả…" />
  }

  return <AccountLayout customer={customer}>{customer ? <Outlet /> : <SignInPage />}</AccountLayout>
}

function SignInPage() {
  usePageTitle("Đăng nhập", "Đăng nhập tài khoản Lupus Books của bạn.")
  return <LoginTemplate />
}
