import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const listRegions = async () =>
  apiFetch<{ regions: HttpTypes.StoreRegion[] }>("/store/regions", { cacheMs: 60_000 }).then(({ regions }) => regions)

export const retrieveRegion = async (id: string) =>
  apiFetch<{ region: HttpTypes.StoreRegion }>(`/store/regions/${id}`, { cacheMs: 60_000 }).then(({ region }) => region)

const regionMap = new Map<string, HttpTypes.StoreRegion>()
let loaded: Promise<Map<string, HttpTypes.StoreRegion>> | null = null

/** Country code -> region map, built once from GET /store/regions (the starter's middleware does the same). */
export function loadRegionMap(force = false): Promise<Map<string, HttpTypes.StoreRegion>> {
  if (!loaded || force) {
    loaded = listRegions()
      .then((regions) => {
        regionMap.clear()
        regions.forEach((region) => {
          region.countries?.forEach((c) => {
            if (c?.iso_2 && !regionMap.has(c.iso_2)) {
              regionMap.set(c.iso_2, region)
            }
          })
        })
        return regionMap
      })
      .catch((e) => {
        loaded = null
        throw e
      })
  }
  return loaded
}

export const getRegion = async (countryCode: string): Promise<HttpTypes.StoreRegion | undefined> => {
  const map = await loadRegionMap()
  return countryCode ? map.get(countryCode) : map.get("us")
}
