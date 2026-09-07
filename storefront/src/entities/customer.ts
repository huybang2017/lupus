import { apiFetch, errorMessage } from "@/shared/api/client"
import { redirect } from "@/shared/navigation/navigation"
import {
  getAuthToken,
  getCartId,
  getPendingCustomer,
  removeAuthToken,
  removeCartId,
  removePendingCustomer,
  setAuthToken,
  setPendingCustomer,
} from "@/shared/storage/storage"
import { createStore } from "@/shared/store/create-store"
import { HttpTypes } from "@/shared/types/http"
import { cartStore } from "@/entities/cart"

export type CustomerAuthState =
  | { state: "error"; error: string }
  | { state: "verification_required"; email: string }
  | { state: "success" }
  | null

// `loaded` is false until the first retrieveCustomer() finished, so the UI can tell "logged out" from "not known yet".
type CustomerState = { customer: HttpTypes.StoreCustomer | null; loaded: boolean }

export const customerStore = createStore<CustomerState>({ customer: null, loaded: false })

export const useCustomer = () => customerStore.use()

function publish(customer: HttpTypes.StoreCustomer | null) {
  customerStore.set({ customer, loaded: true })
}

export const retrieveCustomer = async (): Promise<HttpTypes.StoreCustomer | null> => {
  if (!getAuthToken()) {
    publish(null)
    return null
  }

  const customer = await apiFetch<{ customer: HttpTypes.StoreCustomer }>("/store/customers/me")
    .then(({ customer }) => customer)
    .catch(() => null)

  if (!customer) {
    // an expired or revoked token: act logged out
    removeAuthToken()
  }
  publish(customer)
  return customer
}

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const { customer } = await apiFetch<{ customer: HttpTypes.StoreCustomer }>("/store/customers/me", { method: "POST", body })
  await retrieveCustomer()
  return customer
}

export async function signup(_currentState: unknown, formData: FormData): Promise<CustomerAuthState> {
  const password = formData.get("password") as string
  const customerForm = {
    email: formData.get("email") as string,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    phone: formData.get("phone") as string,
  }

  try {
    await apiFetch("/auth/customer/emailpass/register", {
      method: "POST",
      auth: false,
      body: { email: customerForm.email, password, first_name: customerForm.first_name, last_name: customerForm.last_name },
    })
  } catch (error) {
    // An existing identity is handled like the starter does: the customer can still log in below.
    if (!(error instanceof Error) || !/already/i.test(error.message)) {
      return { state: "error", error: String(error instanceof Error ? error.message : error) }
    }
  }

  // The extra signup field (phone) is applied right after login
  setPendingCustomer(customerForm)

  return completeLogin(customerForm.email, password)
}

export async function login(_currentState: unknown, formData: FormData): Promise<CustomerAuthState> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  return completeLogin(email, password)
}

// Logs the customer in and reconciles the customer record.
async function completeLogin(email: string, password: string): Promise<CustomerAuthState> {
  let result: { token?: string; mfa_required?: boolean }

  try {
    result = await apiFetch<{ token?: string; mfa_required?: boolean }>("/auth/customer/emailpass", {
      method: "POST",
      auth: false,
      body: { email, password },
    })
  } catch (error) {
    return { state: "error", error: error instanceof Error ? error.message : String(error) }
  }

  if (result.mfa_required || !result.token) {
    return { state: "error", error: "Authentication requires additional steps that aren't supported." }
  }

  const token = result.token
  setAuthToken(token)

  // Fill in the profile fields collected at signup (the backend upserts the registered customer)
  const pending = getPendingCustomer()
  if (pending) {
    try {
      await apiFetch("/store/customers", {
        method: "POST",
        body: { email, first_name: pending.first_name, last_name: pending.last_name, phone: pending.phone || undefined },
      })
    } catch (error) {
      removeAuthToken()
      return { state: "error", error: error instanceof Error ? error.message : String(error) }
    }
    removePendingCustomer()
  }

  const customer = await retrieveCustomer()
  if (!customer) {
    return { state: "error", error: "Could not load the customer account." }
  }

  try {
    await transferCart()
  } catch (error) {
    return { state: "error", error: error instanceof Error ? error.message : String(error) }
  }

  return { state: "success" }
}

// Email verification is not part of the lupus backend's emailpass flow; the confirm call is kept for the same API.
export async function confirmEmailVerification(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch("/auth/verification/confirm", { method: "POST", auth: false, body: { code: token } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function signout(countryCode: string) {
  await apiFetch("/auth/session", { method: "DELETE" }).catch(() => undefined)

  removeAuthToken()
  removeCartId()
  publish(null)
  cartStore.set({ cart: null, loaded: true })

  redirect(`/${countryCode}/account`)
}

export async function transferCart() {
  const cartId = getCartId()

  if (!cartId) {
    return
  }

  const { cart } = await apiFetch<{ cart: HttpTypes.StoreCart }>(`/store/carts/${cartId}/customer`, { method: "POST", body: {} })
  cartStore.set({ cart, loaded: true })
}

type ActionResult = { success: boolean; error: string | null }

const addressFields = ["first_name", "last_name", "company", "address_1", "address_2", "city", "postal_code", "province", "country_code", "phone"] as const

function readAddress(formData: FormData): Record<string, string> {
  const address: Record<string, string> = {}
  for (const field of addressFields) {
    address[field] = (formData.get(field) as string) ?? ""
  }
  return address
}

export const addCustomerAddress = async (currentState: Record<string, unknown>, formData: FormData): Promise<ActionResult> => {
  const address = {
    ...readAddress(formData),
    is_default_billing: (currentState.isDefaultBilling as boolean) || false,
    is_default_shipping: (currentState.isDefaultShipping as boolean) || false,
  }

  return apiFetch("/store/customers/me/addresses", { method: "POST", body: address })
    .then(async () => {
      await retrieveCustomer()
      return { success: true, error: null }
    })
    .catch((err) => ({ success: false, error: String(err instanceof Error ? err.message : err) }))
}

export const deleteCustomerAddress = async (addressId: string): Promise<void> => {
  await apiFetch(`/store/customers/me/addresses/${addressId}`, { method: "DELETE" })
    .then(() => retrieveCustomer())
    .catch(() => undefined)
}

export const updateCustomerAddress = async (currentState: Record<string, unknown>, formData: FormData): Promise<ActionResult> => {
  const addressId = (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId) {
    return { success: false, error: "Address ID is required" }
  }

  const address = readAddress(formData)
  if (!address.phone) {
    delete address.phone
  }

  return apiFetch(`/store/customers/me/addresses/${addressId}`, { method: "POST", body: address })
    .then(async () => {
      await retrieveCustomer()
      return { success: true, error: null }
    })
    .catch((err) => ({ success: false, error: String(err instanceof Error ? err.message : err) }))
}

export { errorMessage }
