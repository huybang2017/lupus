// Server actions in the starter call redirect(); in the SPA a bridge component registers the router's
// navigate function here so data-layer code can do the same.
let navigator: ((to: string, opts?: { replace?: boolean }) => void) | null = null

export function registerNavigator(fn: ((to: string, opts?: { replace?: boolean }) => void) | null) {
  navigator = fn
}

export function redirect(to: string, opts?: { replace?: boolean }) {
  if (navigator) {
    navigator(to, opts)
  } else {
    window.location.assign(to)
  }
}
