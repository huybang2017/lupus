
import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import useToggleState from "@/shared/hooks/use-toggle-state"
import { ArrowRightMini, XMark } from "@/widgets/common/icons"
import { HttpTypes } from "@/shared/types/http"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { Text, clx } from "@/widgets/common/ui"
import { Fragment } from "react"
import CountrySelect from "@/widgets/layout/country-select"
import LanguageSelect from "@/widgets/layout/language-select"
import { Locale } from "@/entities/locales"
import BrandMark from "@/widgets/common/brand-mark"
import { BookMarked, Home, LibraryBig, ShoppingBag, UserRound } from "lucide-react"

const SideMenuItems = [
  { name: "Trang chủ", href: "/", testId: "home-link", icon: Home },
  { name: "Tất cả sách", href: "/store", testId: "store-link", icon: LibraryBig },
  { name: "Tài khoản", href: "/account", testId: "account-link", icon: UserRound },
  { name: "Giỏ sách", href: "/cart", testId: "cart-link", icon: ShoppingBag },
]

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
  categories?: HttpTypes.StoreProductCategory[]
}

const SideMenu = ({ regions, locales, currentLocale, categories = [] }: SideMenuProps) => {
  const countryToggleState = useToggleState()
  const languageToggleState = useToggleState()

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  className="relative h-full flex items-center gap-2 rounded-full px-2 font-medium text-brand-ink transition-colors hover:text-brand-clay"
                  aria-label="Mở danh mục"
                >
                  <BookMarked size={18} aria-hidden="true" />
                  <span className="hidden sm:inline">Danh mục</span>
                </Popover.Button>
              </div>

              {open && (
                <div
                  className="fixed inset-0 z-[50] bg-black/0 pointer-events-auto"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="opacity-0"
                enterTo="opacity-100 backdrop-blur-2xl"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 backdrop-blur-2xl"
                leaveTo="opacity-0"
              >
                <PopoverPanel className="flex flex-col fixed w-[calc(100%-1rem)] sm:w-[420px] h-[calc(100vh-1rem)] z-[51] left-2 top-2 text-sm text-brand-cream backdrop-blur-2xl">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex flex-col h-full overflow-y-auto bg-brand-forest/95 rounded-[1.5rem] justify-between p-6 shadow-2xl"
                  >
                    <div className="flex items-center justify-between" id="xmark">
                      <BrandMark inverse compact />
                      <button
                        data-testid="close-menu-button"
                        onClick={close}
                        aria-label="Đóng danh mục"
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/20 transition-colors hover:bg-white/10"
                      >
                        <XMark />
                      </button>
                    </div>
                    <div className="my-12">
                      <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-gold">Khám phá</p>
                      <ul className="flex flex-col gap-2 items-start justify-start">
                      {SideMenuItems.map(({ name, href, testId, icon: Icon }) => {
                        return (
                          <li key={testId} className="w-full">
                            <LocalizedClientLink
                              href={href}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-display text-2xl transition-colors hover:bg-white/10 hover:text-brand-gold"
                              onClick={close}
                              data-testid={testId}
                            >
                              <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                              {name}
                            </LocalizedClientLink>
                          </li>
                        )
                      })}
                      </ul>
                      {!!categories.length && (
                        <div className="mt-8 border-t border-white/15 pt-6">
                          <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-gold">Thể loại nổi bật</p>
                          <div className="flex flex-wrap gap-2">
                            {categories.slice(0, 5).map((category) => (
                              <LocalizedClientLink
                                key={category.id}
                                href={`/categories/${category.handle}`}
                                onClick={close}
                                className="rounded-full border border-white/20 px-3 py-1.5 text-xs transition-colors hover:border-brand-gold hover:text-brand-gold"
                              >
                                {category.name}
                              </LocalizedClientLink>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-y-6">
                      {!!locales?.length && (
                        <div
                          className="flex justify-between"
                          onMouseEnter={languageToggleState.open}
                          onMouseLeave={languageToggleState.close}
                        >
                          <LanguageSelect
                            toggleState={languageToggleState}
                            locales={locales}
                            currentLocale={currentLocale}
                          />
                          <ArrowRightMini
                            className={clx(
                              "transition-transform duration-150",
                              languageToggleState.state ? "-rotate-90" : ""
                            )}
                          />
                        </div>
                      )}
                      <div
                        className="flex justify-between"
                        onMouseEnter={countryToggleState.open}
                        onMouseLeave={countryToggleState.close}
                      >
                        {regions && (
                          <CountrySelect
                            toggleState={countryToggleState}
                            regions={regions}
                          />
                        )}
                        <ArrowRightMini
                          className={clx(
                            "transition-transform duration-150",
                            countryToggleState.state ? "-rotate-90" : ""
                          )}
                        />
                      </div>
                      <Text className="flex justify-between txt-compact-small">
                        © {new Date().getFullYear()} Lupus Books. Mỗi trang sách, một hành trình.
                      </Text>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
