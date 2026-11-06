import { Container, clx } from "@/widgets/common/ui"
import React from "react"

import PlaceholderImage from "@/widgets/common/icons/placeholder-image"

type ThumbnailProps = {
  thumbnail?: string | null
  images?: { url?: string }[] | null
  size?: "small" | "medium" | "large" | "full" | "square"
  isFeatured?: boolean
  className?: string
  alt?: string
  "data-testid"?: string
}

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  size = "small",
  isFeatured: _isFeatured,
  className,
  alt = "Bìa sách",
  "data-testid": dataTestid,
}) => {
  const initialImage = thumbnail || images?.[0]?.url

  return (
    <Container
      className={clx(
        "relative w-full overflow-hidden border border-brand-sand/70 bg-[#F1ECE1] p-4 shadow-book transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-book-hover",
        className,
        {
          "aspect-[2/3]": size !== "square",
          "aspect-[1/1]": size === "square",
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
      <ImageOrPlaceholder image={initialImage} size={size} alt={alt} />
    </Container>
  )
}

const ImageOrPlaceholder = ({
  image,
  size,
  alt,
}: Pick<ThumbnailProps, "size" | "alt"> & { image?: string }) => {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    setFailed(false)
  }, [image])

  return image && !failed ? (
    <img
      src={image}
      alt={alt}
      className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain object-center drop-shadow-[0_14px_14px_rgba(31,41,36,0.18)]"
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="w-full h-full absolute inset-0 flex items-center justify-center">
      <PlaceholderImage size={size === "small" ? 16 : 24} />
    </div>
  )
}

export default Thumbnail
