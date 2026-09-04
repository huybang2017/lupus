// Flat key -> value comparison (what lodash isEqual is used for with variant option maps)
export function isEqual(a: Record<string, unknown> | undefined | null, b: Record<string, unknown> | undefined | null): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b) {
    return false
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k])
}
