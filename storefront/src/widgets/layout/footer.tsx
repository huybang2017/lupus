import { listCategories } from "@/entities/categories"
import { useAsync } from "@/shared/hooks/use-async"
import { listCollections } from "@/entities/collections"
import { Text, clx } from "@/widgets/common/ui"

import LocalizedClientLink from "@/widgets/common/localized-client-link"
import BrandMark from "@/widgets/common/brand-mark"

export default function Footer() {
  const { data } = useAsync(() => Promise.all([listCollections().catch(() => ({ collections: [] })), listCategories().catch(() => [])]), [])
  const collections = data?.[0].collections
  const productCategories = data?.[1]

  return (
    <footer className="mt-20 w-full bg-brand-forest text-brand-cream">
      <div className="content-container flex flex-col w-full">
        <div className="grid gap-12 py-16 md:grid-cols-[1.2fr_2fr] lg:py-20">
          <div className="max-w-md">
            <LocalizedClientLink
              href="/"
              className="inline-flex rounded-full"
            >
              <BrandMark inverse />
            </LocalizedClientLink>
            <p className="mt-6 font-display text-2xl leading-relaxed text-brand-cream/90">
              Một cuốn sách đúng lúc có thể mở ra cả một chân trời mới.
            </p>
            <div className="mt-7 max-w-sm text-sm leading-7 text-brand-cream/65">
              <p>Nhà sách trực tuyến dành cho những người muốn đọc chậm, chọn kỹ và tìm đúng cuốn sách cho mình.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm md:grid-cols-3 md:gap-x-16">
            {productCategories && productCategories?.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">
                  Thể loại
                </span>
                <ul
                  className="grid grid-cols-1 gap-2"
                  data-testid="footer-categories"
                >
                  {productCategories?.slice(0, 6).map((c) => {
                    if (c.parent_category) {
                      return
                    }

                    const children =
                      c.category_children?.map((child) => ({
                        name: child.name,
                        handle: child.handle,
                        id: child.id,
                      })) || null

                    return (
                      <li
                        className="flex flex-col gap-2 text-brand-cream/65"
                        key={c.id}
                      >
                        <LocalizedClientLink
                          className={clx(
                            "transition-colors hover:text-white",
                            children && "font-semibold text-brand-cream/90"
                          )}
                          href={`/categories/${c.handle}`}
                          data-testid="category-link"
                        >
                          {c.name}
                        </LocalizedClientLink>
                        {children && (
                          <ul className="grid grid-cols-1 ml-3 gap-2 border-l border-white/15 pl-3">
                            {children &&
                              children.map((child) => (
                                <li key={child.id}>
                                  <LocalizedClientLink
                                    className="transition-colors hover:text-white"
                                    href={`/categories/${child.handle}`}
                                    data-testid="category-link"
                                  >
                                    {child.name}
                                  </LocalizedClientLink>
                                </li>
                              ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {collections && collections.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">
                  Tuyển tập
                </span>
                <ul
                  className={clx(
                    "grid grid-cols-1 gap-2 text-brand-cream/65",
                    {
                      "grid-cols-2": (collections?.length || 0) > 3,
                    }
                  )}
                >
                  {collections?.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="transition-colors hover:text-white"
                        href={`/collections/${c.handle}`}
                      >
                        {c.title}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-y-2">
              <span className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">Đồng hành cùng bạn</span>
              <ul className="grid grid-cols-1 gap-y-2 text-brand-cream/65">
                <li>
                  <span>Giao hàng toàn quốc</span>
                </li>
                <li>
                  <span>Hỗ trợ khi sách lỗi hoặc sai đơn</span>
                </li>
                <li>
                  <span>Sách chọn lọc chính hãng</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex w-full border-t border-white/10 py-7 justify-between text-brand-cream/50">
          <Text className="text-xs">
            © {new Date().getFullYear()} Lupus Books. Tất cả quyền được bảo lưu.
          </Text>
        </div>
      </div>
    </footer>
  )
}
