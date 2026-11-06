import { usePageTitle } from "@/shared/hooks/use-page-title"
import InteractiveLink from "@/widgets/common/interactive-link"

/** Not found inside a country (the starter's (main)/not-found.tsx) */
export function NotFoundPage() {
  usePageTitle("404", "Không tìm thấy trang")

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-5 bg-brand-cream px-6 text-center text-brand-ink">
      <span className="font-serif text-7xl font-semibold text-brand-gold">404</span>
      <h1 className="font-serif text-3xl font-semibold">Trang này đã rời khỏi kệ sách</h1>
      <p className="max-w-md text-base-regular text-brand-ink/70">Đường dẫn bạn vừa mở không tồn tại hoặc đã được chuyển sang vị trí khác.</p>
      <InteractiveLink href="/">Về trang chủ</InteractiveLink>
    </div>
  )
}
