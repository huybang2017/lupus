
import { isDemoBank, isManual, isVietQR } from "@/shared/constants"
import { placeOrder } from "@/entities/cart"
import { listDemoBanks, type DemoBank } from "@/entities/payment"
import { convertToLocale } from "@/shared/formatting/money"
import { HttpTypes } from "@/shared/types/http"
import { Button } from "@/widgets/common/ui"
import { CheckCircle2, CreditCard, Landmark, LoaderCircle, ShieldCheck } from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import ErrorMessage from "@/widgets/checkout/error-message"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  const paymentSession = cart.payment_collection?.payment_sessions?.[0]

  switch (true) {
    case isManual(paymentSession?.provider_id):
      return (
        <PlaceOrderButton notReady={notReady} data-testid={dataTestId} />
      )
    case isVietQR(paymentSession?.provider_id):
      return (
        <PlaceOrderButton
          notReady={notReady}
          data-testid={dataTestId}
          label="Đặt hàng và nhận mã QR"
        />
      )
    case isDemoBank(paymentSession?.provider_id):
      return (
        <DemoBankPaymentButton
          cart={cart}
          notReady={notReady}
          data-testid={dataTestId}
        />
      )
    default:
      return <Button disabled>Chọn phương thức thanh toán</Button>
  }
}

const bankBrand: Record<string, { mark: string; className: string; logo: string }> = {
  MB: { mark: "MB", className: "text-[#164194]", logo: "https://api.vietqr.io/img/MB.png" },
  VCB: { mark: "VIETCOMBANK", className: "text-[#087b50]", logo: "https://api.vietqr.io/img/VCB.png" },
  BIDV: { mark: "BIDV", className: "text-[#005a9c]", logo: "https://api.vietqr.io/img/BIDV.png" },
  TCB: { mark: "TECHCOMBANK", className: "text-[#d71920]", logo: "https://api.vietqr.io/img/TCB.png" },
}

const BankLogo = ({ code, compact = false }: { code: string; compact?: boolean }) => {
  const brand = bankBrand[code]
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border border-black/5 bg-white px-2 shadow-sm ${
        compact ? "h-11 w-[104px]" : "h-14 w-32"
      }`}
      aria-hidden="true"
    >
      {brand && !imageFailed ? (
        <img
          src={brand.logo}
          alt=""
          className="max-h-8 w-full object-contain"
          loading="eager"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={`font-sans text-[11px] font-black tracking-[-0.04em] ${brand?.className ?? "text-brand-forest"}`}>
          {brand?.mark ?? code}
        </span>
      )}
    </span>
  )
}

const DemoBankPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [banks, setBanks] = useState<DemoBank[]>([])
  const [bankCode, setBankCode] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [accountHolder, setAccountHolder] = useState("")
  const [expiry, setExpiry] = useState("")
  const [pin, setPin] = useState("")
  const [loadingBanks, setLoadingBanks] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listDemoBanks()
      .then(({ banks: nextBanks }) => {
        if (cancelled) return
        setBanks(nextBanks)
      })
      .catch((err) => {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : "Không thể tải danh sách ngân hàng.")
      })
      .finally(() => {
        if (!cancelled) setLoadingBanks(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedBank = useMemo(() => banks.find((bank) => bank.code === bankCode), [bankCode, banks])

  const handlePayment = async () => {
    setErrorMessage(null)
    const expiryMatch = expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/)
    if (
      !bankCode ||
      !/^\d{8,19}$/.test(accountNumber) ||
      accountHolder.trim().length < 2 ||
      !expiryMatch ||
      !/^\d{6}$/.test(pin)
    ) {
      setErrorMessage("Vui lòng nhập đầy đủ số thẻ, tên chủ thẻ, ngày hết hạn MM/YY và mã PIN gồm 6 số.")
      return
    }
    const expiryMonth = Number(expiryMatch[1])
    const expiryYear = 2000 + Number(expiryMatch[2])
    if (new Date(expiryYear, expiryMonth, 0).getTime() < Date.now()) {
      setErrorMessage("Thẻ đã hết hạn. Vui lòng kiểm tra lại ngày MM/YY.")
      return
    }
    setSubmitting(true)
    await placeOrder(undefined, {
      demo_bank: {
        bank_code: bankCode,
        account_number: accountNumber,
        account_holder: accountHolder.trim(),
        expiry_month: expiryMonth,
        expiry_year: expiryYear,
        pin,
      },
    })
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : String(err)))
      .finally(() => setSubmitting(false))
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-gold/45 bg-[linear-gradient(145deg,rgba(255,255,255,.86),rgba(233,239,232,.76))] shadow-book">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-gold/30 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-forest text-white">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-clay">Cổng thanh toán bảo mật</p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-brand-forest">Thanh toán thẻ ngân hàng</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-brand-ink/60">
              Chọn ngân hàng phát hành thẻ và nhập thông tin để hoàn tất thanh toán tức thì.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-brand-paper/80 px-4 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.14em] text-brand-ink/45">Cần thanh toán</p>
          <p className="mt-0.5 font-serif text-xl font-semibold text-brand-forest">
            {convertToLocale({ amount: cart.total, currency_code: cart.currency_code, locale: "vi-VN" })}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {loadingBanks ? (
          <div className="flex items-center gap-2 py-8 text-sm font-medium text-brand-forest">
            <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> Đang mở danh sách ngân hàng…
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="text-sm font-semibold text-brand-ink">Chọn ngân hàng phát hành thẻ</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {banks.map((bank) => {
                  const selected = bank.code === bankCode
                  return (
                    <button
                      key={bank.code}
                      type="button"
                      onClick={() => {
                        setBankCode(bank.code)
                        setAccountNumber("")
                        setAccountHolder("")
                        setExpiry("")
                        setPin("")
                        setErrorMessage(null)
                      }}
                      className={`relative flex min-h-[112px] flex-col items-center justify-center rounded-xl border px-3 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest/25 ${
                        selected
                          ? "border-brand-forest bg-brand-mist/90 text-brand-forest shadow-sm ring-1 ring-brand-forest/15"
                          : "border-brand-gold/40 bg-brand-paper text-brand-ink hover:-translate-y-0.5 hover:border-brand-forest/45 hover:shadow-sm"
                      }`}
                      aria-pressed={selected}
                    >
                      <BankLogo code={bank.code} compact />
                      <span className="mt-2 block text-xs font-semibold">{bank.name}</span>
                      {selected && <CheckCircle2 className="absolute right-2 top-2 text-brand-forest" size={16} aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {selectedBank && (
              <div className="rounded-2xl border border-brand-gold/35 bg-white/55 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-clay">Thông tin thẻ</p>
                    <p className="mt-1 text-sm font-semibold text-brand-ink">Thẻ do {selectedBank.name} phát hành</p>
                  </div>
                  <BankLogo code={selectedBank.code} compact />
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                 <label className="block">
                   <span className="text-xs font-medium text-brand-ink/65">Số thẻ / số tài khoản</span>
                   <input
                    value={accountNumber}
                    onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 19))}
                    inputMode="numeric"
                    autoComplete="off"
                     placeholder="Nhập số thẻ hoặc số tài khoản"
                    className="mt-1.5 h-12 w-full rounded-xl border border-brand-gold/45 bg-brand-paper px-4 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-forest focus:ring-4 focus:ring-brand-forest/10"
                  />
                 </label>
                 <label className="block">
                   <span className="text-xs font-medium text-brand-ink/65">Tên chủ thẻ</span>
                   <input
                     value={accountHolder}
                     onChange={(event) => setAccountHolder(event.target.value.toLocaleUpperCase("vi-VN").slice(0, 100))}
                     autoComplete="off"
                     placeholder="NGUYEN VAN A"
                     className="mt-1.5 h-12 w-full rounded-xl border border-brand-gold/45 bg-brand-paper px-4 text-sm font-semibold uppercase text-brand-ink outline-none transition focus:border-brand-forest focus:ring-4 focus:ring-brand-forest/10"
                   />
                 </label>
                 <label className="block">
                   <span className="text-xs font-medium text-brand-ink/65">Ngày hết hạn</span>
                   <input
                     value={expiry}
                     onChange={(event) => {
                       const digits = event.target.value.replace(/\D/g, "").slice(0, 4)
                       setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits)
                     }}
                     inputMode="numeric"
                     autoComplete="off"
                     placeholder="MM/YY"
                     className="mt-1.5 h-12 w-full rounded-xl border border-brand-gold/45 bg-brand-paper px-4 text-sm font-semibold tracking-[0.12em] text-brand-ink outline-none transition focus:border-brand-forest focus:ring-4 focus:ring-brand-forest/10"
                   />
                 </label>
                 <label className="block">
                   <span className="text-xs font-medium text-brand-ink/65">Mã PIN</span>
                   <input
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="off"
                     placeholder="••••••"
                    className="mt-1.5 h-12 w-full rounded-xl border border-brand-gold/45 bg-brand-paper px-4 text-sm font-semibold tracking-[0.22em] text-brand-ink outline-none transition focus:border-brand-forest focus:ring-4 focus:ring-brand-forest/10"
                  />
                 </label>
               </div>
                <div className="mt-4 flex items-center gap-2 text-xs leading-5 text-brand-ink/50">
                  <CreditCard size={15} aria-hidden="true" /> Thông tin được đối chiếu trước khi giao dịch được xác nhận.
                </div>
              </div>
            )}
          </>
        )}

        <ErrorMessage error={errorMessage} data-testid="demo-bank-payment-error-message" />

        <div className="flex flex-col gap-3 border-t border-brand-gold/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs leading-5 text-brand-ink/55">
            <ShieldCheck size={17} className="shrink-0 text-brand-forest" aria-hidden="true" />
            Thanh toán được xác nhận tự động và trạng thái đơn hàng được cập nhật ngay.
          </div>
          <Button
            disabled={
              notReady ||
              loadingBanks ||
              !bankCode ||
              !accountNumber ||
              !accountHolder.trim() ||
              expiry.length !== 5 ||
              pin.length !== 6
            }
            isLoading={submitting}
            onClick={handlePayment}
            size="large"
            data-testid={dataTestId ?? "submit-order-button"}
          >
            Thanh toán và đặt hàng
          </Button>
        </div>
      </div>
    </section>
  )
}

const PlaceOrderButton = ({
  notReady,
  label = "Đặt hàng",
  "data-testid": dataTestId,
}: {
  notReady: boolean
  label?: string
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const handlePayment = () => {
    setSubmitting(true)

    onPaymentCompleted()
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid={dataTestId ?? "submit-order-button"}
      >
        {label}
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

export default PaymentButton
