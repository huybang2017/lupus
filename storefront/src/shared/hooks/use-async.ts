import { DependencyList, useCallback, useEffect, useRef, useState } from "react"
import { refreshStore } from "@/shared/navigation/router"

export type AsyncState<T> = {
  data: T | undefined
  error: unknown
  /** True until the first result (or error) arrives; stays false while a later reload runs. */
  loading: boolean
  reload: () => void
}

/**
 * Runs an async loader whenever the dependencies (or router.refresh()) change. The previous data stays
 * visible while the next load runs, and a stale response never overwrites a newer one.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; done: boolean }>({ data: undefined, error: undefined, done: false })
  const [tick, setTick] = useState(0)
  const refresh = refreshStore.use()
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let cancelled = false
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) {
          setState({ data, error: undefined, done: true })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState((prev) => ({ data: prev.data, error, done: true }))
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, refresh])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data: state.data, error: state.error, loading: !state.done, reload }
}
