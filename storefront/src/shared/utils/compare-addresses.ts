const FIELDS = ["first_name", "last_name", "address_1", "company", "postal_code", "city", "country_code", "province", "phone"] as const

type Address = Record<string, unknown>

// Same comparison as the starter (lodash isEqual over a pick of the address fields); a missing field
// and an empty one differ there too, so the shapes are compared as they are.
export default function compareAddresses(address1: object, address2: object) {
  return FIELDS.every((f) => (address1 as Address)[f] === (address2 as Address)[f])
}
