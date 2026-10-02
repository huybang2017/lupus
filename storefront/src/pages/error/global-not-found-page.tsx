import { Link } from "react-router-dom"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { ArrowUpRightMini } from "@/widgets/common/icons"
import { Text } from "@/widgets/common/ui"

/** Not found outside any country (the starter's app/not-found.tsx) */
export function GlobalNotFoundPage() {
  usePageTitle("404", "Something went wrong")

  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">Page not found</h1>
      <p className="text-small-regular text-ui-fg-base">The page you tried to access does not exist.</p>
      <Link className="flex gap-x-1 items-center group" to="/">
        <Text className="text-ui-fg-interactive">Go to frontpage</Text>
        <ArrowUpRightMini className="group-hover:rotate-45 ease-in-out duration-150" color="var(--fg-interactive)" />
      </Link>
    </div>
  )
}