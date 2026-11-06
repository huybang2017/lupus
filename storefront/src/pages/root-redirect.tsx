import { Navigate, useLocation } from "react-router-dom"
import { DEFAULT_REGION } from "@/shared/api/config"
import { loadRegionMap } from "@/entities/regions"
import { useAsync } from "@/shared/hooks/use-async"
import { useEffect } from "react"

const REGION_RETRY_DELAY_MS = 1_500

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
  const { data: map, error, loading, reload } = useAsync(() => loadRegionMap(), [])

  useEffect(() => {
    if (!error) return

    const retryTimer = window.setTimeout(reload, REGION_RETRY_DELAY_MS)
    return () => window.clearTimeout(retryTimer)
  }, [error, reload])

  if (loading) {
    return <FullPageMessage>Đang mở tủ sách...</FullPageMessage>
  }
  if (error || !map) {
    return <FullPageMessage>Máy chủ đang khởi động, Lupus Books sẽ tự kết nối lại...</FullPageMessage>
  }
  const country = defaultCountry(map)
  if (!country) {
    return <FullPageMessage>Cửa hàng chưa được thiết lập khu vực bán hàng.</FullPageMessage>
  }
  return <Navigate to={`/${country}${location.pathname === "/" ? "" : location.pathname}${location.search}`} replace />
}
