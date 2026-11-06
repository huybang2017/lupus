import { HttpTypes } from "@/shared/types/http"
import { Container } from "@/widgets/common/ui"
import PlaceholderImage from "@/widgets/common/icons/placeholder-image"
import { useEffect, useMemo, useState } from "react"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  productTitle: string
}

const ImageGallery = ({ images, productTitle }: ImageGalleryProps) => {
  const uniqueImages = useMemo(() => {
    const seen = new Set<string>()
    return images.filter((image) => {
      const key = image.url
        .trim()
        .toLowerCase()
        .replace(/-[sml]\.jpg(?=\?|$)/, "-{size}.jpg")
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [images])
  const [activeId, setActiveId] = useState<string | undefined>(uniqueImages[0]?.id)

  useEffect(() => {
    if (!uniqueImages.some((image) => image.id === activeId)) {
      setActiveId(uniqueImages[0]?.id)
    }
  }, [activeId, uniqueImages])

  const activeImage = uniqueImages.find((image) => image.id === activeId) ?? uniqueImages[0]

  return (
    <div className="relative w-full">
      <Container
        className="relative mx-auto aspect-[2/3] w-full max-w-[620px] overflow-hidden border border-brand-sand/70 bg-[#EEE8DA] p-6 shadow-book"
        id={activeImage?.id}
      >
        <GalleryImage url={activeImage?.url} eager alt={`Bìa sách ${productTitle}`} />
      </Container>

      {uniqueImages.length > 1 && (
        <div className="mt-4 flex flex-wrap justify-center gap-3" aria-label="Các ảnh khác của sách">
          {uniqueImages.map((image, index) => (
            <button
              type="button"
              key={image.id}
              onClick={() => setActiveId(image.id)}
              className={`relative h-24 w-20 overflow-hidden rounded-xl border bg-brand-paper p-2 transition-all ${
                image.id === activeImage?.id
                  ? "border-brand-forest ring-2 ring-brand-forest/15"
                  : "border-brand-sand hover:border-brand-moss"
              }`}
              aria-label={`Xem ảnh ${index + 1} của ${productTitle}`}
              aria-pressed={image.id === activeImage?.id}
            >
              <img src={image.url} alt="" className="h-full w-full object-contain" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryImage({ url, eager, alt }: { url?: string; eager: boolean; alt: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [url])

  if (!url || failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-brand-ink/65" role="img" aria-label={`${alt} chưa có ảnh`}>
        <PlaceholderImage size={32} />
        <span className="text-xs font-medium">Ảnh bìa đang được cập nhật</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      loading={eager ? "eager" : "lazy"}
      className="absolute inset-6 h-[calc(100%-3rem)] w-[calc(100%-3rem)] rounded-md object-contain drop-shadow-[0_18px_18px_rgba(31,41,36,0.2)]"
      alt={alt}
      onError={() => setFailed(true)}
    />
  )
}

export default ImageGallery
