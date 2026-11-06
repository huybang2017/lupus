import { Link } from "react-router-dom"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { ArrowUpRightMini } from "@/widgets/common/icons"
import { Text } from "@/widgets/common/ui"

/** Not found outside any country (the starter's app/not-found.tsx) */
export function GlobalNotFoundPage() {
  usePageTitle("404", "Không tìm thấy trang")

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-5 bg-brand-cream px-6 text-center text-brand-ink">
      <span className="font-serif text-7xl font-semibold text-brand-gold">404</span>
      <h1 className="font-serif text-3xl font-semibold">Trang này đã rời khỏi kệ sách</h1>
      <p className="max-w-md text-base-regular text-brand-ink/70">Đường dẫn bạn vừa mở không tồn tại hoặc đã được chuyển sang vị trí khác.</p>
      <Link className="group flex items-center gap-x-1 rounded-full bg-brand-forest px-5 py-3 text-brand-paper" to="/">
        <Text>Về trang chủ</Text>
        <ArrowUpRightMini className="group-hover:rotate-45 ease-in-out duration-150" color="var(--fg-interactive)" />
      </Link>
    </div>
  )
}
