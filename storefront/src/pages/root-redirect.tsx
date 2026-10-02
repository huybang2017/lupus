import { Navigate, useLocation } from "react-router-dom"
import { DEFAULT_REGION } from "@/shared/api/config"
import { loadRegionMap } from "@/entities/regions"
import { useAsync } from "@/shared/hooks/use-async"

function defaultCountry(map: Map<string, unknown>): string | undefined {
  if (map.has(DEFAULT_REGION)) {
    return DEFAULT_REGION
  }
  return map.keys().next().value
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center min-h-[calc(100vh-64px)] text-base-regular text-ui-fg-base">{children}</div>
}

/** "/" goes to the default country, like the starter's middleware. */
export function RootRedirect() {
  const location = useLocation()
  const { data: map, error, loading } = useAsync(() => loadRegionMap(), [])

  if (loading) {
    return <FullPageMessage>Loading...</FullPageMessage>
  }
  if (error || !map) {
    return <FullPageMessage>Could not load the store. Please try again.</FullPageMessage>
  }
  const country = defaultCountry(map)
  if (!country) {
    return <FullPageMessage>This store has no regions yet.</FullPageMessage>
  }
  return <Navigate to={`/${country}${location.pathname === "/" ? "" : location.pathname}${location.search}`} replace />
}