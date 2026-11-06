import { BookOpen } from "lucide-react"

type PageLoadingProps = {
  message?: string
  compact?: boolean
}

export function PageLoading({
  message = "Đang mở trang sách…",
  compact = false,
}: PageLoadingProps) {
  return (
    <div
      className={`content-container flex items-center justify-center px-6 ${compact ? "min-h-64 py-12" : "min-h-[55vh] py-20"}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-sm flex-col items-center text-center text-brand-ink">
        <span className="grid h-14 w-14 animate-pulse place-items-center rounded-full bg-brand-mist text-brand-forest motion-reduce:animate-none">
          <BookOpen size={24} aria-hidden="true" />
        </span>
        <p className="mt-5 font-editorial text-xl text-brand-forest">{message}</p>
        <p className="mt-2 text-sm text-brand-ink/55">Lupus Books đang chuẩn bị nội dung dành cho bạn.</p>
      </div>
    </div>
  )
}

type PageLoadErrorProps = {
  title?: string
  description?: string
  onRetry?: () => void
  compact?: boolean
}

export function PageLoadError({
  title = "Chưa thể tải nội dung",
  description = "Kết nối đang gián đoạn. Bạn vui lòng thử lại sau ít phút.",
  onRetry,
  compact = false,
}: PageLoadErrorProps) {
  return (
    <div
      className={`content-container flex items-center justify-center px-6 ${compact ? "min-h-64 py-12" : "min-h-[55vh] py-20"}`}
      role="alert"
    >
      <div className="max-w-lg rounded-2xl border border-brand-gold/40 bg-brand-paper p-7 text-center text-brand-ink shadow-book sm:p-10">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-clay">Lupus Books</span>
        <h1 className="mt-3 font-editorial text-3xl font-semibold text-brand-forest">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-brand-ink/65">{description}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-forest-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-clay"
          >
            Thử tải lại
          </button>
        )}
      </div>
    </div>
  )
}
