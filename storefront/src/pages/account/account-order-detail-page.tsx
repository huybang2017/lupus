import { useParams } from "react-router-dom"
import { retrieveOrder } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import OrderDetailsTemplate from "@/widgets/order/order-details-template"

export function AccountOrderDetailPage() {
  const { id = "" } = useParams()
  const { data: order, loading } = useAsync(() => retrieveOrder(id).catch(() => null), [id])
  usePageTitle(order ? `Order #${order.display_id}` : undefined, "View your order")

  if (loading) {
    return null
  }
  if (!order) {
    return notFound()
  }

  return <OrderDetailsTemplate order={order} />
}