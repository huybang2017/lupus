import { apiFetch } from "@/shared/api/client"
import { HttpTypes } from "@/shared/types/http"

export const retrieveOrder = async (id: string) => apiFetch<{ order: HttpTypes.StoreOrder }>(`/store/orders/${id}`).then(({ order }) => order)

export const listOrders = async (limit: number = 10, offset: number = 0, filters?: Record<string, unknown>) =>
  apiFetch<{ orders: HttpTypes.StoreOrder[] }>("/store/orders", {
    query: { limit, offset, order: "-created_at", ...filters },
  }).then(({ orders }) => orders)

type TransferState = {
  success: boolean
  error: string | null
  order: HttpTypes.StoreOrder | null
}

export const createTransferRequest = async (_state: TransferState, formData: FormData): Promise<TransferState> => {
  const id = formData.get("order_id") as string

  if (!id) {
    return { success: false, error: "Order ID is required", order: null }
  }

  return apiFetch<{ order: HttpTypes.StoreOrder }>(`/store/orders/${id}/transfer/request`, { method: "POST", body: {} })
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message as string, order: null }))
}

export const acceptTransferRequest = async (id: string, token: string) =>
  apiFetch<{ order: HttpTypes.StoreOrder }>(`/store/orders/${id}/transfer/accept`, { method: "POST", body: { token } })
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message as string, order: null }))

export const declineTransferRequest = async (id: string, token: string) =>
  apiFetch<{ order: HttpTypes.StoreOrder }>(`/store/orders/${id}/transfer/decline`, { method: "POST", body: { token } })
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message as string, order: null }))
