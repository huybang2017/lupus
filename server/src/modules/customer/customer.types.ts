// Port of Lupus customer DTOs (packages/modules/customer/src/models/customer.ts).
export interface CustomerDTO {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  has_account: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CreateCustomerInput {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  phone?: string
}

export interface CustomerAddressDTO {
  id: string
  customer_id: string
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  city?: string | null
  country_code?: string | null
  postal_code?: string | null
  phone?: string | null
}
