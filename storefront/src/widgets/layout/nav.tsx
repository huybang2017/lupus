import { useAsync } from "@/shared/hooks/use-async"
import { listLocales } from "@/entities/locales"
import { getLocale } from "@/entities/locales"
import { listRegions } from "@/entities/regions"
import { listCategories } from "@/entities/categories"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import CartButton from "@/widgets/layout/cart-button"
import SideMenu from "@/widgets/layout/side-menu"
import BrandMark from "@/widgets/common/brand-mark"
import { UserRound } from "lucide-react"

export default function Nav() {
  const { data } = useAsync(
    () => Promise.all([listRegions().catch(() => []), listLocales(), listCategories().catch(() => [])]),
    []
  )
  const [regions, locales, categories] = data ?? [[], null, []]
  const currentLocale = getLocale()
  const rootCategory = categories?.find((category) => category.handle === "books")
  const navCategories = (rootCategory?.category_children ?? categories ?? [])
    .filter((category) => category.handle !== "books")
    .slice(0, 3)

  return (
    <div className="sticky top-0 inset-x-0 z-50 group shadow-[0_1px_0_rgba(31,41,36,0.08)]">
      <div className="bg-brand-forest px-4 py-2 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-brand-cream sm:text-xs">
        Sách chọn lọc · Đóng gói cẩn thận · Hỗ trợ tận tâm
      </div>
      <header className="relative h-[4.5rem] mx-auto bg-brand-paper/95 backdrop-blur-xl">
        <nav className="content-container flex items-center justify-between w-full h-full text-sm text-brand-ink">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} categories={navCategories} />
            </div>
            <div className="ml-7 hidden items-center gap-6 lg:flex">
              <LocalizedClientLink className="font-medium transition-colors hover:text-brand-clay" href="/store">
                Tất cả sách
              </LocalizedClientLink>
              {navCategories.slice(0, 2).map((category) => (
                <LocalizedClientLink
                  key={category.id}
                  className="font-medium transition-colors hover:text-brand-clay"
                  href={`/categories/${category.handle}`}
                >
                  {category.name}
                </LocalizedClientLink>
              ))}
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink href="/" className="rounded-full" data-testid="nav-store-link">
              <BrandMark compact />
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-3 sm:gap-x-5 h-full flex-1 basis-0 justify-end">
            <div className="hidden md:flex items-center h-full">
              <LocalizedClientLink
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-medium transition-colors hover:bg-brand-mist hover:text-brand-forest"
                href="/account"
                data-testid="nav-account-link"
              >
                <UserRound size={17} aria-hidden="true" />
                Tài khoản
              </LocalizedClientLink>
            </div>
            <CartButton />
          </div>
        </nav>
      </header>
    </div>
  )
}
