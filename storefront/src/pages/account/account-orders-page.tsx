import { listOrders } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import OrderOverview from "@/widgets/account/order-overview"
import TransferRequestForm from "@/widgets/account/transfer-request-form"
import Divider from "@/widgets/common/divider"

export function AccountOrdersPage() {
  usePageTitle("Orders", "Overview of your previous orders.")
  const { data: orders, error, loading } = useAsync(() => listOrders(), [])

  if (loading) {
    return null
  }
  if (error || !orders) {
    return notFound()
  }

  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Orders</h1>
        <p className="text-base-regular">
          View your previous orders and their status. You can also create returns or exchanges for your orders if needed.
        </p>
      </div>
      <div>
        <OrderOverview orders={orders} />
        <Divider className="mb-8 mt-8" />
        <TransferRequestForm />
      </div>
    </div>
  )
}