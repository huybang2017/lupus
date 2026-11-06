import { useParams } from "react-router-dom"
import { retrieveOrder } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import OrderDetailsTemplate from "@/widgets/order/order-details-template"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"
import { useLiveOrderRefresh } from "@/shared/hooks/use-live-order-refresh"

export function AccountOrderDetailPage() {
  const { id = "" } = useParams()
  const { data: order, error, loading, reload } = useAsync(() => retrieveOrder(id), [id])
  useLiveOrderRefresh(reload)
  usePageTitle(order ? `Đơn hàng #${order.display_id}` : undefined, "Xem chi tiết đơn hàng của bạn")

  if (loading) {
    return <PageLoading compact message="Đang mở chi tiết đơn hàng…" />
  }
  if (error && !order) {
    return <PageLoadError compact title="Chưa thể tải đơn hàng" onRetry={reload} />
  }
  if (!order) {
    return notFound()
  }

  return <OrderDetailsTemplate order={order} />
}
