import { useEffect } from "react"

export function useLiveOrderRefresh(reload: () => void, intervalMs = 5000) {
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") reload()
    }
    const timer = window.setInterval(refreshWhenVisible, intervalMs)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [intervalMs, reload])
}

