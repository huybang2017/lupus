import { useCustomer } from "@/entities/customer"
import { listOrders } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import Overview from "@/widgets/account/overview"

export function AccountOverviewPage() {
  const { customer } = useCustomer()
  usePageTitle("Tài khoản", "Tổng quan hoạt động tài khoản của bạn.")

  const { data: orders } = useAsync(() => listOrders().catch(() => null), [customer?.id])

  if (!customer) {
    return notFound()
  }

  return <Overview customer={customer} orders={orders ?? null} />
}
