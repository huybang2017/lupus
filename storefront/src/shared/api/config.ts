// Runtime configuration. The Vite dev server proxies /store, /auth and /uploads to the backend, so the
// default API base is same-origin; set VITE_API_URL to talk to a backend on another origin.
export const API_BASE = import.meta.env.VITE_API_URL ?? ""

// Optional: when set, every request carries x-publishable-api-key (the backend scopes products and
// carts to the key's sales channels). The lupus backend also works without one.
export const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLISHABLE_KEY

// Country used when the URL has none and nothing else matches (see CountryRoute)
export const DEFAULT_REGION = (import.meta.env.VITE_DEFAULT_REGION ?? "dk").toLowerCase()
