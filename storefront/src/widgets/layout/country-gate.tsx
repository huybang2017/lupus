import { Navigate, Outlet, useLocation, useParams } from "react-router-dom"
import { DEFAULT_REGION } from "@/shared/api/config"
import { loadRegionMap } from "@/entities/regions"
import { RegionContext } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"

function defaultCountry(map: Map<string, unknown>): string | undefined {
    if (map.has(DEFAULT_REGION)) {
        console.log(DEFAULT_REGION)
        return DEFAULT_REGION
  }
  return map.keys().next().value
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center min-h-[calc(100vh-64px)] text-base-regular text-ui-fg-base">{children}</div>
}

/** Resolves the region of the first URL segment; an unknown country is redirected under the default one. */
export function CountryGate() {
  const { countryCode = "" } = useParams()
  const location = useLocation()
  const { data: map, error, loading } = useAsync(() => loadRegionMap(), [])

  if (loading) {
    return <FullPageMessage>Loading...</FullPageMessage>
  }
  if (error || !map) {
    return <FullPageMessage>Could not load the store. Please try again.</FullPageMessage>
  }

  const region = map.get(countryCode.toLowerCase())
  if (!region) {
    const country = defaultCountry(map)
    if (!country) {
      return <FullPageMessage>This store has no regions yet.</FullPageMessage>
    }
    return <Navigate to={`/${country}${location.pathname}${location.search}`} replace />
  }

  return (
    <RegionContext.Provider value={{ countryCode: countryCode.toLowerCase(), region }}>
      <Outlet />
    </RegionContext.Provider>
  )
}