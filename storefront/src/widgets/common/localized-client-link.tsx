import { useParams } from "@/shared/navigation/router"
import React from "react"
import { Link } from "react-router-dom"

/**
 * Use this component to create a `<Link />` that persists the current country code in the url,
 * without having to explicitly pass it as a prop.
 */
const LocalizedClientLink = ({
  children,
  href,
  ...props
}: {
  children?: React.ReactNode
  href: string
  className?: string
  onClick?: () => void
  passHref?: true
  [x: string]: unknown
}) => {
  const { countryCode } = useParams()
  const { passHref: _passHref, ...rest } = props

  return (
    <Link to={`/${countryCode}${href}`} {...rest}>
      {children}
    </Link>
  )
}

export default LocalizedClientLink
