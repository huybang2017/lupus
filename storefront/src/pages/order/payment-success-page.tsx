import { retrieveOrder } from "@/entities/orders"
import { convertToLocale } from "@/shared/formatting/money"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { useRouter } from "@/shared/navigation/router"
import { Check, LockKeyhole, ReceiptText } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"

const REDIRECT_SECONDS = 3

export function PaymentSuccessPage() {
  const { id = "", countryCode = "vn" } = useParams()
  const router = useRouter()
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS)
  const { data: order } = useAsync(() => retrieveOrder(id), [id])
  usePageTitle("Thanh toán thành công", "Giao dịch của bạn đã được xác nhận")

  const confirmedPath = useMemo(() => `/${countryCode}/order/${id}/confirmed`, [countryCode, id])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    const timeout = window.setTimeout(() => router.replace(confirmedPath), REDIRECT_SECONDS * 1000)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [confirmedPath, router])

  return (
    <main className="relative grid min-h-[calc(100vh-4.5rem)] place-items-center overflow-hidden bg-brand-forest px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-28 -top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -left-10 -top-10 h-56 w-56 rounded-full border border-brand-gold/20" />
        <div className="absolute -bottom-44 -right-24 h-[32rem] w-[32rem] rounded-full bg-brand-moss/20 blur-2xl" />
        <div className="absolute right-[12%] top-[14%] h-2 w-2 rounded-full bg-brand-gold/70" />
        <div className="absolute left-[14%] top-[68%] h-1.5 w-1.5 rounded-full bg-white/45" />
      </div>

      <section
        className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/15 bg-brand-paper px-6 py-10 text-center shadow-[0_34px_90px_-35px_rgba(0,0,0,.75)] sm:px-12 sm:py-14"
        role="status"
        aria-live="polite"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-brand-sand/60">
          <span
            className="block h-full origin-left bg-brand-gold"
            style={{ animation: `payment-success-fill ${REDIRECT_SECONDS}s linear forwards` }}
          />
        </div>

        <div
          className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-brand-mist text-brand-forest shadow-[inset_0_0_0_1px_rgba(39,76,59,.12)]"
          style={{ animation: "payment-success-pop 620ms cubic-bezier(.2,.8,.2,1) both" }}
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-forest text-white shadow-lg">
            <Check size={34} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </div>

        <div style={{ animation: "payment-success-rise 520ms 180ms ease-out both" }}>
          <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-clay">Giao dịch đã được xác nhận</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-brand-forest sm:text-5xl">
            Thanh toán thành công
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-brand-ink/60 sm:text-base">
            Khoản thanh toán của bạn đã được ghi nhận. Lupus Books đang chuẩn bị trang thông tin đơn hàng.
          </p>

          {order && (
            <div className="mx-auto mt-7 grid max-w-md grid-cols-2 divide-x divide-brand-sand rounded-2xl border border-brand-sand bg-brand-cream/60 py-4 text-left">
              <div className="px-4 sm:px-5">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-ink/45">
                  <ReceiptText size={13} aria-hidden="true" /> Mã đơn
                </span>
                <p className="mt-1.5 font-semibold text-brand-forest">#{order.display_id}</p>
              </div>
              <div className="px-4 sm:px-5">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-ink/45">
                  <LockKeyhole size={13} aria-hidden="true" /> Đã thanh toán
                </span>
                <p className="mt-1.5 font-semibold text-brand-forest">
                  {convertToLocale({ amount: order.total, currency_code: order.currency_code, locale: "vi-VN" })}
                </p>
              </div>
            </div>
          )}

          <p className="mt-7 text-sm text-brand-ink/55">
            Tự động chuyển đến đơn hàng sau <strong className="text-brand-forest">{secondsLeft} giây</strong>
          </p>
          <button
            type="button"
            onClick={() => router.replace(confirmedPath)}
            className="mt-4 text-sm font-semibold text-brand-clay underline decoration-brand-clay/30 underline-offset-4 transition-colors hover:text-brand-clay-dark"
          >
            Xem đơn hàng ngay
          </button>
        </div>
      </section>
    </main>
  )
}
