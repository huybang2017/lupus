import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const listCartPaymentMethods = async (regionId: string) =>
  apiFetch<{ payment_providers: HttpTypes.StorePaymentProvider[] }>("/store/payment-providers", { query: { region_id: regionId } })
    .then(({ payment_providers }) => payment_providers.sort((a, b) => (a.id > b.id ? 1 : -1)))
    .catch(() => null)
