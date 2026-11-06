import { HttpTypes } from "@/shared/types/http"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { ArrowUpRight, BookOpen, Code2, Compass, FlaskConical, Sparkles } from "lucide-react"

const iconByHandle = {
  fiction: BookOpen,
  mystery: Compass,
  "non-fiction": FlaskConical,
  programming: Code2,
  children: Sparkles,
}

const colorByIndex = [
  "bg-[#E8DFC9]",
  "bg-[#DDE8DF]",
  "bg-[#EEDBD1]",
  "bg-[#DCE4EA]",
]

export default function CategoryShowcase({ categories }: { categories: HttpTypes.StoreProductCategory[] }) {
  if (!categories.length) return null

  return (
    <section className="content-container py-16 lg:py-24" aria-labelledby="category-heading">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Tìm cuốn sách dành cho bạn</p>
          <h2 id="category-heading" className="mt-3 font-display text-3xl font-semibold tracking-tight text-brand-forest sm:text-4xl">
            Khám phá theo thể loại
          </h2>
        </div>
        <LocalizedClientLink href="/store" className="hidden items-center gap-2 text-sm font-semibold text-brand-clay hover:text-brand-clay-dark sm:flex">
          Xem toàn bộ <ArrowUpRight size={16} aria-hidden="true" />
        </LocalizedClientLink>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categories.slice(0, 4).map((category, index) => {
          const Icon = iconByHandle[category.handle as keyof typeof iconByHandle] ?? BookOpen

          return (
            <LocalizedClientLink
              key={category.id}
              href={`/categories/${category.handle}`}
              className={`${colorByIndex[index % colorByIndex.length]} group flex min-h-44 flex-col justify-between rounded-[1.5rem] p-5 transition-transform duration-300 hover:-translate-y-1`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-paper/70 text-brand-forest">
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span className="flex items-end justify-between gap-4">
                <span>
                  <span className="block font-display text-2xl font-semibold text-brand-forest">{category.name}</span>
                  <span className="mt-1 block text-xs text-brand-ink/55">Mở tủ sách</span>
                </span>
                <ArrowUpRight size={20} className="text-brand-forest transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </span>
            </LocalizedClientLink>
          )
        })}
      </div>
    </section>
  )
}
