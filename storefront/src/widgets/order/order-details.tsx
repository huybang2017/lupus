import { HttpTypes } from "@/shared/types/http"
import { Text } from "@/widgets/common/ui"
import { Check, CreditCard, PackageCheck, RotateCcw, TriangleAlert } from "lucide-react"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const statusLabels: Record<string, string> = {
  pending: "Chờ xử lý",
  completed: "Hoàn tất",
  canceled: "Đã hủy",
  requires_action: "Cần xử lý",
  not_fulfilled: "Chưa giao",
  partially_fulfilled: "Đang chuẩn bị một phần",
  fulfilled: "Đang chuẩn bị",
  shipped: "Đang giao",
  partially_shipped: "Đang giao một phần",
  delivered: "Đã giao",
  returned: "Đã hoàn trả",
  partially_returned: "Đã hoàn trả một phần",
  not_paid: "Chưa thanh toán",
  awaiting: "Đang chờ thanh toán",
  authorized: "Đã xác nhận",
  partially_authorized: "Đã xác nhận một phần",
  captured: "Đã thanh toán",
  partially_captured: "Đã thanh toán một phần",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  partially_refunded: "Đã hoàn tiền một phần",
}

const formatStatus = (status: string) => {
  if (statusLabels[status]) return statusLabels[status]
  const formatted = status.split("_").join(" ")
  return formatted.slice(0, 1).toUpperCase() + formatted.slice(1)
}

type StatusProgressProps = {
  title: string
  status: string
  steps: string[]
  current: number
  kind: "fulfillment" | "payment"
  exceptional?: "warning" | "danger"
}

function StatusProgress({ title, status, steps, current, kind, exceptional }: StatusProgressProps) {
  const Icon = exceptional ? (exceptional === "danger" ? TriangleAlert : RotateCcw) : kind === "payment" ? CreditCard : PackageCheck
  const isComplete = !exceptional && current === steps.length - 1

  return (
    <section className="rounded-2xl border border-brand-sand/80 bg-white/55 p-4 sm:p-5" aria-label={`${title}: ${formatStatus(status)}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-forest">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-mist text-brand-forest">
            <Icon size={17} aria-hidden="true" />
          </span>
          {title}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            exceptional === "danger"
              ? "bg-rose-100 text-rose-700"
              : exceptional === "warning"
              ? "bg-amber-100 text-amber-800"
              : isComplete
              ? "bg-emerald-100 text-emerald-800"
              : "bg-brand-gold/25 text-brand-forest"
          }`}
          data-testid={kind === "payment" ? "order-payment-status" : "order-status"}
        >
          {formatStatus(status)}
        </span>
      </div>

      {exceptional ? (
        <p className="mt-4 text-sm text-brand-ink/65">
          {exceptional === "danger"
            ? "Đơn hàng không tiếp tục theo tiến trình thông thường."
            : "Đơn hàng đã phát sinh bước hoàn trả hoặc hoàn tiền."}
        </p>
      ) : (
        <ol className="mt-5 flex items-start" aria-label={`Tiến trình ${title.toLowerCase()}`}>
          {steps.map((step, index) => {
            const reached = index <= current
            const active = index === current
            return (
              <li key={step} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
                {index < steps.length - 1 && (
                  <span
                    className={`absolute left-1/2 top-3 h-px w-full ${index < current ? "bg-brand-forest" : "bg-brand-sand"}`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] transition-colors ${
                    reached
                      ? "border-brand-forest bg-brand-forest text-white"
                      : "border-brand-sand bg-brand-paper text-brand-ink/35"
                  } ${active ? "ring-4 ring-brand-forest/10" : ""}`}
                  aria-current={active ? "step" : undefined}
                >
                  {index < current || isComplete ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                <span className={`mt-2 max-w-[7rem] text-[11px] leading-4 sm:text-xs ${reached ? "font-semibold text-brand-forest" : "text-brand-ink/45"}`}>
                  {step}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const fulfillmentStatus = order.fulfillment_status ?? "not_fulfilled"
  const paymentStatus = order.payment_status ?? "not_paid"
  const fulfillmentStep = ["delivered"].includes(fulfillmentStatus)
    ? 3
    : ["shipped", "partially_shipped"].includes(fulfillmentStatus)
    ? 2
    : ["fulfilled", "partially_fulfilled"].includes(fulfillmentStatus)
    ? 1
    : 0
  const paymentStep = ["captured", "partially_captured", "paid", "completed"].includes(paymentStatus)
    ? 2
    : ["authorized", "partially_authorized"].includes(paymentStatus)
    ? 1
    : 0
  const fulfillmentExceptional = ["returned", "partially_returned"].includes(fulfillmentStatus)
    ? "warning" as const
    : order.status === "canceled"
    ? "danger" as const
    : undefined
  const paymentExceptional = ["refunded", "partially_refunded"].includes(paymentStatus) ? "warning" as const : undefined

  return (
    <div className="text-brand-ink">
      <Text>
        Chi tiết xác nhận đơn hàng đã được gửi đến{" "}
        <span
          className="text-ui-fg-medium-plus font-semibold"
          data-testid="order-email"
        >
          {order.email}
        </span>
        .
      </Text>
      <Text className="mt-2">
        Ngày đặt:{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString("vi-VN")}
        </span>
      </Text>
      <Text className="mt-2 font-semibold text-brand-clay">
        Mã đơn hàng: <span data-testid="order-id">{order.display_id}</span>
      </Text>

      {showStatus && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-brand-ink/55" aria-live="polite">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-forest/40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-forest" />
            </span>
            Trạng thái được tự động cập nhật
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatusProgress
              title="Tiến trình giao hàng"
              status={fulfillmentStatus}
              steps={["Đã tiếp nhận", "Đang chuẩn bị", "Đang giao", "Đã giao"]}
              current={fulfillmentStep}
              kind="fulfillment"
              exceptional={fulfillmentExceptional}
            />
            <StatusProgress
              title="Tiến trình thanh toán"
              status={paymentStatus}
              steps={["Chờ thanh toán", "Đã xác nhận", "Hoàn tất"]}
              current={paymentStep}
              kind="payment"
              exceptional={paymentExceptional}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderDetails
