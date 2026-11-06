import { listCollections } from "@/entities/collections"
import { listCategories } from "@/entities/categories"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import FeaturedProducts from "@/widgets/home/featured-products"
import Hero from "@/widgets/home/hero"
import CategoryShowcase from "@/widgets/home/category-showcase"
import { BookHeart, Quote } from "lucide-react"

export function HomePage() {
  const { region } = useCountryRegion()
  usePageTitle("Lupus Books — Nhà sách trực tuyến", "Sách chọn lọc cho những ngày muốn đọc chậm và sống sâu.")

  const { data } = useAsync(
    () => Promise.all([listCollections().then(({ collections }) => collections), listCategories().catch(() => [])]),
    []
  )
  const [collections, allCategories] = data ?? [[], []]
  const rootCategory = allCategories.find((category) => category.handle === "books")
  const categories = rootCategory?.category_children ?? allCategories.filter((category) => !category.parent_category)

  return (
    <>
      <Hero />
      <div className="border-y border-brand-sand/70 bg-brand-paper">
        <div className="content-container grid grid-cols-1 divide-y divide-brand-sand/70 py-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {["Tuyển chọn có gu", "Đóng gói cẩn thận", "Hỗ trợ tận tâm"].map((item, index) => (
            <div key={item} className="flex items-center justify-center gap-3 px-4 py-4 text-sm font-medium text-brand-forest">
              {index === 0 ? <BookHeart size={17} aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-brand-clay" aria-hidden="true" />}
              {item}
            </div>
          ))}
        </div>
      </div>
      <CategoryShowcase categories={categories} />
      <div className="bg-brand-paper py-4 lg:py-10">
        <ul className="flex flex-col">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
      <section className="content-container py-20 lg:py-28">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand-clay px-6 py-14 text-center text-white shadow-editorial sm:px-12 lg:py-20">
          <Quote className="absolute -right-3 -top-8 h-36 w-36 text-white/10" strokeWidth={1} aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-cream/75">Lời nhắn từ Lupus Books</p>
          <blockquote className="mx-auto mt-5 max-w-3xl font-display text-3xl font-semibold leading-snug sm:text-4xl">
            “Chúng mình không chỉ bán sách. Chúng mình giúp bạn tìm đúng cuốn sách cho đúng chặng đường.”
          </blockquote>
        </div>
      </section>
    </>
  )
}
