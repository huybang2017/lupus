import { BookOpen } from "lucide-react"
import { clx } from "@/widgets/common/ui"

type BrandMarkProps = {
  inverse?: boolean
  compact?: boolean
  className?: string
}

export default function BrandMark({ inverse = false, compact = false, className }: BrandMarkProps) {
  return (
    <span
      className={clx(
        "inline-flex items-center gap-2.5 text-brand-forest",
        inverse && "text-brand-cream",
        className
      )}
      aria-label="Lupus Books"
    >
      <span
        className={clx(
          "grid place-items-center rounded-full border",
          compact ? "h-8 w-8" : "h-10 w-10",
          inverse ? "border-brand-cream/30 bg-white/10" : "border-brand-forest/15 bg-brand-mist"
        )}
      >
        <BookOpen size={compact ? 16 : 19} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className={clx("font-display font-semibold tracking-[-0.03em]", compact ? "text-lg" : "text-2xl")}>Lupus</span>
        <span className={clx("font-sans font-semibold uppercase tracking-[0.18em]", compact ? "text-[8px]" : "text-[9px]")}>Books</span>
      </span>
    </span>
  )
}
