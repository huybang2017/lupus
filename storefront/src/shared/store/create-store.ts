import { useSyncExternalStore } from "react"

/** Minimal external store: the SPA stand-in for the starter's revalidateTag + server re-render. */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()

  // Xóa useCallback đi. Bản thân các hàm này đã có reference ổn định (stable identities)
  // vì createStore chỉ được gọi 1 lần khi khởi tạo store.
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  const getSnapshot = () => state

  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === "function" ? (next as (prev: T) => T)(state) : next
      listeners.forEach((l) => l())
    },
    subscribe,
    // Hàm use() đóng vai trò như một Custom Hook (gọi bên trong Component) nên hợp lệ
    use: () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  }
}