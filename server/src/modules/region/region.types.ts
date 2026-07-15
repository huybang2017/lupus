// Port of Lupus region models (packages/modules/region/src/models/region.ts, country.ts).
export interface RegionDTO {
  id: string
  name: string
  currency_code: string
  automatic_taxes: boolean
  countries: { iso_2: string }[]
  created_at: string
  updated_at: string
}

export interface CreateRegionInput {
  name: string
  currency_code: string
  countries?: string[]
  automatic_taxes?: boolean
}
