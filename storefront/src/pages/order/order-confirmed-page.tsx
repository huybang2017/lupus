import { useParams } from "react-router-dom"
import { retrieveOrder } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import OrderCompletedTemplate from "@/widgets/order/order-completed-template"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"
import { useLiveOrderRefresh } from "@/shared/hooks/use-live-order-refresh"

export function OrderConfirmedPage() {
  const { id = "" } = useParams()
  usePageTitle("Đặt hàng thành công", "Đơn sách của bạn đã được ghi nhận")

  const { data: order, error, loading, reload } = useAsync(() => retrieveOrder(id), [id])
  useLiveOrderRefresh(reload)

  if (loading) {
    return <PageLoading message="Đang xác nhận đơn sách của bạn…" />
  }
  if (error && !order) {
    return <PageLoadError title="Chưa thể xác nhận đơn hàng" onRetry={reload} />
  }
  if (!order) {
    return notFound()
  }

  return <OrderCompletedTemplate order={order} />
}
