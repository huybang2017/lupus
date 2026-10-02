import { usePageTitle } from "@/shared/hooks/use-page-title"
import InteractiveLink from "@/widgets/common/interactive-link"

/** Not found inside a country (the starter's (main)/not-found.tsx) */
export function NotFoundPage() {
  usePageTitle("404", "Something went wrong")

  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">Page not found</h1>
      <p className="text-small-regular text-ui-fg-base">The page you tried to access does not exist.</p>
      <InteractiveLink href="/">Go to frontpage</InteractiveLink>
    </div>
  )
}