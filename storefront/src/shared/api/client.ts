import { API_BASE, PUBLISHABLE_KEY } from "@/shared/api/config"
import { getAuthToken, getStoredLocale } from "@/shared/storage/storage"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

type Query = Record<string, unknown>

export interface FetchOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT"
  query?: Query
  body?: unknown
  headers?: Record<string, string>
  /** Send the stored customer token (default true). */
  auth?: boolean
  /** Cache a GET response in memory for this many milliseconds. */
  cacheMs?: number
}

function toQueryString(query: Query | undefined): string {
  if (!query) {
    return ""
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, String(v))
      }
    } else {
      params.append(key, String(value))
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

const cache = new Map<string, { at: number; value: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

/** Same message shape as the starter's error helper: capitalised, ending with a period. */
export function errorMessage(message: string): string {
  const m = message.trim()
  return m ? m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".") : "Something went wrong."
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const method = opts.method ?? "GET"
  const url = `${API_BASE}${path}${toQueryString(opts.query)}`
  const token = opts.auth === false ? null : getAuthToken()
  const locale = getStoredLocale()
  const cacheKey = method === "GET" && opts.cacheMs ? `${token ?? ""}|${locale ?? ""}|${url}` : null

  if (cacheKey) {
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < (opts.cacheMs ?? 0)) {
      return hit.value as T
    }
    const pending = inflight.get(cacheKey)
    if (pending) {
      return pending as Promise<T>
    }
  }

  const run = (async () => {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}),
        ...(locale ? { "x-lupus-locale": locale } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      throw new ApiError(errorMessage(json?.message ?? res.statusText ?? "Request failed"), res.status)
    }
    return json as T
  })()

  if (!cacheKey) {
    return run
  }
  inflight.set(cacheKey, run)
  try {
    const value = await run
    cache.set(cacheKey, { at: Date.now(), value })
    return value
  } finally {
    inflight.delete(cacheKey)
  }
}

/** Drop cached GET responses (after the locale or region changes). */
export function clearApiCache() {
  cache.clear()
}
