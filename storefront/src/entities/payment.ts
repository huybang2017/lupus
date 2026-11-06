import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const listCartPaymentMethods = async (regionId: string) =>
  apiFetch<{ payment_providers: HttpTypes.StorePaymentProvider[] }>("/store/payment-providers", { query: { region_id: regionId } })
    .then(({ payment_providers }) => payment_providers.sort((a, b) => (a.id > b.id ? 1 : -1)))
    .catch(() => null)

export type OrderVietQr = {
  provider_id: "pp_vietqr"
  payment_status: string
  amount: number
  currency_code: string
  reference: string
  account_number: string
  account_name: string
  bank_bin: string
  bank_name: string
  qr_data_url: string
  expires_at: string
  is_expired: boolean
}

export const retrieveOrderVietQr = async (orderId: string) =>
  apiFetch<{ vietqr: OrderVietQr }>(`/store/orders/${orderId}/vietqr`).then(({ vietqr }) => vietqr)

export type DemoBankAccount = {
  account_number: string
  account_holder: string
  expiry_month: number
  expiry_year: number
  balance: number
  currency_code: string
}

export type DemoBank = {
  code: string
  name: string
  accounts: DemoBankAccount[]
}

export const listDemoBanks = async () =>
  apiFetch<{ banks: DemoBank[]; demo_pin: string }>("/store/demo-banks")
