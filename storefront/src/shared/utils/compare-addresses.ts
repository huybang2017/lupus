const FIELDS = ["first_name", "last_name", "address_1", "company", "postal_code", "city", "country_code", "province", "phone"] as const

type Address = Record<string, unknown>

const normalize = (value: unknown) =>
  typeof value === "string" ? value.trim() : value ?? ""

// The API can return an optional field as null, undefined, or an empty string.
// They all mean the same thing to a shopper and must not open a second address form.
export default function compareAddresses(address1: object, address2: object) {
  return FIELDS.every(
    (field) =>
      normalize((address1 as Address)[field]) ===
      normalize((address2 as Address)[field])
  )
}
