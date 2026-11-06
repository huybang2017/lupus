import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { ArrowRight, BookOpen, ShieldCheck, Truck } from "lucide-react"

const featuredCovers = [
  {
    src: "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg",
    alt: "Bìa sách Dune",
    className: "left-4 top-16 rotate-[-8deg] sm:left-10",
  },
  {
    src: "https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg",
    alt: "Bìa sách Sapiens",
    className: "left-1/2 top-2 z-20 -translate-x-1/2 rotate-[2deg]",
  },
  {
    src: "https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg",
    alt: "Bìa sách The Little Prince",
    className: "right-4 top-20 rotate-[9deg] sm:right-10",
  },
]

const Hero = () => {
  return (
    <section className="relative overflow-hidden bg-brand-cream">
      <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-brand-gold/20 blur-3xl" aria-hidden="true" />
      <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-brand-moss/15 blur-3xl" aria-hidden="true" />
      <div className="content-container grid min-h-[680px] items-center gap-12 py-16 lg:grid-cols-[1.03fr_0.97fr] lg:py-20">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-sand bg-brand-paper px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest shadow-sm">
            <BookOpen size={15} aria-hidden="true" />
            Sách hay, được chọn bằng sự tử tế
          </div>
          <h1 className="font-display text-[clamp(3rem,7vw,6.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-brand-forest-dark">
            Đọc điều hay.
            <span className="block italic text-brand-clay">Sống điều mới.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-brand-ink/65 sm:text-lg">
            Từ những tác phẩm kinh điển đến tri thức đương đại, Lupus Books chọn lọc những cuốn sách đáng để bạn dành thời gian.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <LocalizedClientLink
              href="/store"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-clay px-6 py-3 text-sm font-semibold text-white shadow-book transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-brand-clay-dark hover:shadow-book-hover"
            >
              Khám phá tủ sách
              <ArrowRight size={17} aria-hidden="true" />
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/store?sortBy=created_at"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand-forest/25 bg-brand-paper/70 px-6 py-3 text-sm font-semibold text-brand-forest transition-colors hover:border-brand-forest hover:bg-brand-paper"
            >
              Sách mới lên kệ
            </LocalizedClientLink>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs font-medium text-brand-ink/60 sm:text-sm">
            <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-brand-clay" aria-hidden="true" />Sách chính hãng</span>
            <span className="inline-flex items-center gap-2"><Truck size={16} className="text-brand-clay" aria-hidden="true" />Giao hàng toàn quốc</span>
          </div>
        </div>

        <div className="relative mx-auto h-[460px] w-full max-w-[580px] sm:h-[560px]" aria-label="Những đầu sách nổi bật">
          <div className="absolute inset-x-6 bottom-8 top-12 rounded-[2.5rem] bg-brand-forest shadow-editorial sm:inset-x-10" aria-hidden="true" />
          <div className="absolute inset-x-14 bottom-1 h-12 rounded-[50%] bg-brand-ink/25 blur-xl" aria-hidden="true" />
          {featuredCovers.map((cover, index) => (
            <div
              key={cover.src}
              className={`absolute w-[42%] max-w-[220px] overflow-hidden rounded-md border-[6px] border-brand-paper bg-brand-paper shadow-2xl transition-transform duration-500 hover:z-30 hover:rotate-0 hover:scale-105 sm:border-[8px] ${cover.className}`}
              role="img"
              aria-label={cover.alt}
            >
              <div className="absolute inset-0 grid aspect-[2/3] place-items-center bg-brand-mist text-brand-forest" aria-hidden="true">
                <BookOpen size={32} strokeWidth={1.5} />
              </div>
              <img
                src={cover.src}
                alt=""
                width={440}
                height={660}
                className="relative z-10 aspect-[2/3] h-auto w-full object-cover"
                loading={index === 1 ? "eager" : "lazy"}
                fetchPriority={index === 1 ? "high" : "auto"}
                onError={(event) => {
                  event.currentTarget.style.display = "none"
                }}
              />
            </div>
          ))}
          <div className="absolute bottom-0 left-1/2 z-30 w-[78%] -translate-x-1/2 rounded-2xl border border-brand-sand bg-brand-paper/95 p-4 text-center shadow-editorial backdrop-blur sm:w-[68%]">
            <p className="font-display text-lg font-semibold text-brand-forest">Mỗi tuần một tuyển chọn mới</p>
            <p className="mt-1 text-xs text-brand-ink/55">Dành cho người đọc tò mò và luôn muốn đi xa hơn.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
