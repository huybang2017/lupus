import { retrieveOrderVietQr, type OrderVietQr } from "@/entities/payment"
import { convertToLocale } from "@/shared/formatting/money"
import { Check, CheckCircle2, Clock3, Copy, Landmark, LoaderCircle, QrCode, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

type VietQrPaymentProps = {
  orderId: string
}

function remainingLabel(expiresAt: string, now: number) {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now)
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/45 bg-white/65 px-3 py-1.5 text-xs font-semibold text-brand-forest transition hover:border-brand-forest/45 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest/25"
      aria-label={`Sao chép ${label}`}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? "Đã sao chép" : "Sao chép"}
    </button>
  )
}

export default function VietQrPayment({ orderId }: VietQrPaymentProps) {
  const [details, setDetails] = useState<OrderVietQr | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const next = await retrieveOrderVietQr(orderId)
      setDetails(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải mã VietQR.")
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!details || ["captured", "paid", "refunded"].includes(details.payment_status)) return
    const timer = window.setInterval(() => void load(true), 8000)
    return () => window.clearInterval(timer)
  }, [details, load])

  const isPaid = details ? ["captured", "paid"].includes(details.payment_status) : false
  const isExpired = details ? now > new Date(details.expires_at).getTime() : false
  const amount = useMemo(
    () => details ? convertToLocale({ amount: details.amount, currency_code: details.currency_code }) : "",
    [details]
  )

  if (loading) {
    return (
      <section className="rounded-2xl border border-brand-gold/40 bg-brand-cream/55 p-6" aria-live="polite">
        <div className="flex items-center gap-3 text-sm font-semibold text-brand-forest">
          <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
          Đang chuẩn bị mã thanh toán VietQR…
        </div>
      </section>
    )
  }

  if (error || !details) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800" role="alert">
        <p>{error ?? "Không thể tải mã VietQR."}</p>
        <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 font-semibold underline underline-offset-4">
          <RefreshCw size={15} aria-hidden="true" /> Thử lại
        </button>
      </section>
    )
  }

  if (isPaid) {
    return (
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm" aria-live="polite">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-serif text-2xl font-semibold text-emerald-900">Đã xác nhận thanh toán</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900/70">
              Cửa hàng đã ghi nhận khoản chuyển {amount}. Đơn sách đang được chuyển sang bước chuẩn bị giao hàng.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-gold/50 bg-[linear-gradient(135deg,rgba(255,255,255,.72),rgba(242,237,222,.82))] shadow-book" aria-labelledby="vietqr-title">
      <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full border border-brand-gold/25" aria-hidden="true" />
      <div className="border-b border-brand-gold/35 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-brand-forest text-brand-paper">
              <QrCode size={21} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-clay">Thanh toán chuyển khoản</p>
              <h2 id="vietqr-title" className="mt-1 font-serif text-2xl font-semibold text-brand-forest">Quét mã VietQR cho đơn sách</h2>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">
            <Clock3 size={14} aria-hidden="true" /> Chờ thanh toán
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(220px,280px)_1fr] md:items-start">
        <div className="mx-auto w-full max-w-[280px]">
          <div className="rounded-2xl border border-brand-sand bg-white p-4 shadow-[0_12px_30px_rgba(46,76,62,.1)]">
            <img src={details.qr_data_url} alt={`Mã VietQR thanh toán ${amount}`} className="aspect-square h-auto w-full" />
          </div>
          <div className={`mt-3 rounded-xl px-3 py-2.5 text-center text-xs font-semibold ${isExpired ? "bg-amber-100 text-amber-900" : "bg-brand-mist text-brand-forest"}`}>
            {isExpired ? "Đã quá thời gian thanh toán khuyến nghị" : `Nên hoàn tất trong ${remainingLabel(details.expires_at, now)}`}
          </div>
        </div>

        <div className="min-w-0">
          <div className="rounded-2xl border border-brand-gold/35 bg-brand-paper/75 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-clay">
              <Landmark size={16} aria-hidden="true" /> Thông tin nhận tiền
            </div>
            <dl className="mt-4 divide-y divide-brand-gold/25">
              <div className="py-3 first:pt-0">
                <dt className="text-xs text-brand-ink/55">Số tiền</dt>
                <dd className="mt-1 font-serif text-3xl font-semibold text-brand-forest">{amount}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <dt className="text-xs text-brand-ink/55">Ngân hàng</dt>
                  <dd className="mt-1 truncate font-semibold text-brand-ink">{details.bank_name}</dd>
                </div>
                <span className="shrink-0 rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-semibold text-brand-forest">BIN {details.bank_bin}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <dt className="text-xs text-brand-ink/55">Số tài khoản</dt>
                  <dd className="mt-1 break-all font-semibold tracking-wide text-brand-ink">{details.account_number}</dd>
                </div>
                <CopyValue value={details.account_number} label="số tài khoản" />
              </div>
              <div className="py-3">
                <dt className="text-xs text-brand-ink/55">Chủ tài khoản</dt>
                <dd className="mt-1 font-semibold text-brand-ink">{details.account_name}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                <div className="min-w-0">
                  <dt className="text-xs text-brand-ink/55">Nội dung chuyển khoản</dt>
                  <dd className="mt-1 break-all font-bold tracking-[0.08em] text-brand-clay">{details.reference}</dd>
                </div>
                <CopyValue value={details.reference} label="nội dung chuyển khoản" />
              </div>
            </dl>
          </div>

          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${isExpired ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-gold/35 bg-white/55 text-brand-ink/70"}`}>
            {isExpired
              ? "Bạn vẫn có thể quét mã, nhưng hãy kiểm tra lại trạng thái đơn trước khi chuyển khoản để tránh thanh toán trùng."
              : "Vui lòng giữ nguyên số tiền và nội dung chuyển khoản. Cửa hàng sẽ kiểm tra tài khoản ngân hàng và xác nhận thanh toán trên hệ thống."}
          </div>
        </div>
      </div>
    </section>
  )
}

