import { listOrders } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { notFound } from "@/shared/navigation/router"
import OrderOverview from "@/widgets/account/order-overview"
import TransferRequestForm from "@/widgets/account/transfer-request-form"
import Divider from "@/widgets/common/divider"
import { PageLoadError, PageLoading } from "@/widgets/common/page-state"
import { useLiveOrderRefresh } from "@/shared/hooks/use-live-order-refresh"

export function AccountOrdersPage() {
  usePageTitle("Đơn hàng", "Theo dõi và xem lại các đơn hàng của bạn.")
  const { data: orders, error, loading, reload } = useAsync(() => listOrders(), [])
  useLiveOrderRefresh(reload)

  if (loading) {
    return <PageLoading compact message="Đang tìm các đơn sách của bạn…" />
  }
  if (error && !orders) {
    return <PageLoadError compact title="Chưa thể tải đơn hàng" onRetry={reload} />
  }
  if (!orders) {
    return notFound()
  }

  return (
    <div className="w-full text-brand-ink" data-testid="orders-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-3 border-b border-brand-gold/40 pb-6">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-clay">Thư viện đơn hàng</span>
        <h1 className="font-serif text-3xl font-semibold">Đơn hàng của tôi</h1>
        <p className="max-w-2xl text-base-regular text-brand-ink/70">
          Xem lại những cuốn sách bạn đã đặt và theo dõi trạng thái của từng đơn hàng.
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
