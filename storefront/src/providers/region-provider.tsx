import { createContext, useContext } from "react"
import { HttpTypes } from "@/shared/types/http"

type RegionContextValue = {
  countryCode: string
  region: HttpTypes.StoreRegion
}

export const RegionContext = createContext<RegionContextValue | null>(null)

/** The region of the country in the URL (set by CountryGate). */
export function useCountryRegion(): RegionContextValue {
  const value = useContext(RegionContext)
  if (!value) {
    throw new Error("useCountryRegion must be used within a CountryGate")
  }
  return value
}
