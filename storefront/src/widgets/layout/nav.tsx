import { useAsync } from "@/shared/hooks/use-async"
import { listLocales } from "@/entities/locales"
import { getLocale } from "@/entities/locales"
import { listRegions } from "@/entities/regions"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import CartButton from "@/widgets/layout/cart-button"
import SideMenu from "@/widgets/layout/side-menu"

export default function Nav() {
  const { data } = useAsync(() => Promise.all([listRegions().catch(() => []), listLocales()]), [])
  const [regions, locales] = data ?? [[], null]
  const currentLocale = getLocale()

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto border-b duration-200 bg-white border-ui-border-base">
        <nav className="content-container txt-xsmall-plus text-ui-fg-subtle flex items-center justify-between w-full h-full text-small-regular">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink href="/" className="txt-compact-xlarge-plus hover:text-ui-fg-base uppercase" data-testid="nav-store-link">
              Lupus Store
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <div className="hidden small:flex items-center gap-x-6 h-full">
              <LocalizedClientLink className="hover:text-ui-fg-base" href="/account" data-testid="nav-account-link">
                Account
              </LocalizedClientLink>
            </div>
            <CartButton />
          </div>
        </nav>
      </header>
    </div>
  )
}
