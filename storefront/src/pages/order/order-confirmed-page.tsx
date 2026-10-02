import { useParams } from "react-router-dom"
import { retrieveOrder } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import OrderCompletedTemplate from "@/widgets/order/order-completed-template"

export function OrderConfirmedPage() {
  const { id = "" } = useParams()
  usePageTitle("Order Confirmed", "You purchase was successful")

  const { data: order, loading } = useAsync(() => retrieveOrder(id).catch(() => null), [id])

  if (loading) {
    return null
  }
  if (!order) {
    return notFound()
  }

  return <OrderCompletedTemplate order={order} />
}