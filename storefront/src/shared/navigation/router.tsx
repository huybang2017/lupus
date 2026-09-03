import { useMemo } from "react"
import { useLocation, useNavigate, useParams as useRouterParams, useSearchParams as useRouterSearchParams } from "react-router-dom"
import { createStore } from "@/shared/store/create-store"

// Stand-ins for next/navigation so the ported components keep their calls unchanged.

/** Bumped by router.refresh(); data hooks include it in their dependencies and re-fetch. */
export const refreshStore = createStore(0)

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useRouterParams() as T
}

export function usePathname(): string {
  return useLocation().pathname
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams()
  return params
}

export function useRouter() {
  const navigate = useNavigate()
  return useMemo(
    () => ({
      push: (to: string, _options?: { scroll?: boolean }) => navigate(to),
      replace: (to: string, _options?: { scroll?: boolean }) => navigate(to, { replace: true }),
      back: () => navigate(-1),
      refresh: () => refreshStore.set((n) => n + 1),
    }),
    [navigate]
  )
}

/** Thrown by notFound(); NotFoundBoundary turns it into the 404 page (Next's notFound() does the same). */
export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND")
    this.name = "NotFoundError"
  }
}

export function notFound(): never {
  throw new NotFoundError()
}
