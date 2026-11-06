import { ArrowUpRightMini } from "@/widgets/common/icons"
import { Text } from "@/widgets/common/ui"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
type InteractiveLinkProps = {
  href: string
  children?: React.ReactNode
  onClick?: () => void
}

const InteractiveLink = ({
  href,
  children,
  onClick,
  ...props
}: InteractiveLinkProps) => {
  return (
    <LocalizedClientLink
      className="group flex items-center gap-x-1"
      href={href}
      onClick={onClick}
      {...props}
    >
      <Text className="text-brand-clay transition-colors group-hover:text-brand-clay-dark">{children}</Text>
      <ArrowUpRightMini
        className="group-hover:rotate-45 ease-in-out duration-150"
        color="currentColor"
      />
    </LocalizedClientLink>
  )
}

export default InteractiveLink
