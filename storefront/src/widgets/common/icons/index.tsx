import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronsUpDown,
  CreditCard as CreditCardIcon,
  Github as GithubIcon,
  Loader as LoaderIcon,
  LogOut,
  Plus as PlusIcon,
  SquarePen,
  Trash2,
  X,
} from "lucide-react"
import React from "react"

// Inline icons from lucide-react, matching the icon set the starter uses. Same call shape ({ color, size, ...svg props },
// 15px by default) so the ported components render them unchanged.
type IconProps = { color?: string; size?: number | string } & React.SVGAttributes<SVGElement>

type LucideLike = React.ComponentType<Omit<React.SVGAttributes<SVGElement>, "size"> & { size?: number | string; color?: string; strokeWidth?: number }>

function stroke(Icon: LucideLike) {
  const Wrapped = ({ color = "currentColor", size = 15, ...props }: IconProps) => <Icon size={size as number} color={color} strokeWidth={1.5} {...(props as object)} />
  return Wrapped
}

export const ArrowRightMini = stroke(ArrowRight as LucideLike)
export const ArrowUpRightMini = stroke(ArrowUpRight as LucideLike)
export const ArrowRightOnRectangle = stroke(LogOut as LucideLike)
export const XMark = stroke(X as LucideLike)
export const ChevronDownMini = stroke(ChevronDown as LucideLike)
export const ChevronUpDown = stroke(ChevronsUpDown as LucideLike)
export const CreditCard = stroke(CreditCardIcon as LucideLike)
export const Github = stroke(GithubIcon as LucideLike)
export const Loader = stroke(LoaderIcon as LucideLike)
export const Spinner = stroke(LoaderIcon as LucideLike)
export const Plus = stroke(PlusIcon as LucideLike)
export const PencilSquare = stroke(SquarePen as LucideLike)
export const Trash = stroke(Trash2 as LucideLike)

function solid(path: string, viewBox = "0 0 20 20") {
  const Wrapped = ({ color = "currentColor", size = 20, ...props }: IconProps) => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d={path} fill={color} />
    </svg>
  )
  return Wrapped
}

export const CheckCircleSolid = solid(
  "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
)
export const CheckCircleMiniSolid = CheckCircleSolid
export const XCircleSolid = solid(
  "M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
)
export const ExclamationCircleSolid = solid(
  "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
)
export const EllipseMiniSolid = solid("M10 13a3 3 0 100-6 3 3 0 000 6z")
