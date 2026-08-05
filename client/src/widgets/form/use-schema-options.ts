import { useCallback, useEffect, useRef, useState } from "react"
import type {
  FieldOption,
  FieldOptionsLoader,
  FieldOptionsResult,
  SchemaFieldDef,
} from "@/widgets/ui/surfaces"

export interface SchemaOptionsResult {
  optionsByKey: Record<string, FieldOption[]>
  loadingKeys: string[]
  errorKeys: Record<string, string>
  reload: (key: string) => void
}

interface LoaderEntry {
  loader: FieldOptionsLoader
  dependsOn: string[]
}

const FALLBACK_ERROR = "Failed to load options"

function signatureOf(dependsOn: string[], values: Record<string, unknown>): string {
  if (dependsOn.length === 0) return ""
  return dependsOn.map((k) => `${k}=${String(values[k] ?? "")}`).join("|")
}

function sameOptions(a: FieldOption[] | undefined, b: FieldOption[]): boolean {
  if (!a) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < b.length; i++) {
    if (a[i].value !== b[i].value) return false
    if (a[i].label !== b[i].label) return false
    if (a[i].sub !== b[i].sub) return false
  }
  return true
}

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined
}

function isStaleValue(current: unknown, list: FieldOption[]): boolean {
  if (list.length === 0) return false
  if (Array.isArray(current)) {
    if (current.length === 0) return false
    return !current.some((v) => list.some((o) => o.value === String(v)))
  }
  if (isBlank(current)) return false
  return !list.some((o) => o.value === String(current))
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return FALLBACK_ERROR
}

function asResult(raw: unknown): FieldOptionsResult {
  if (Array.isArray(raw)) return { options: raw as FieldOption[] }
  if (raw !== null && typeof raw === "object") {
    const candidate = raw as FieldOptionsResult
    if (Array.isArray(candidate.options)) return candidate
  }
  return { options: [] }
}

export function useSchemaOptions(
  fields: SchemaFieldDef[],
  values: Record<string, any>,
  onStaleValue?: (key: string) => void,
): SchemaOptionsResult {
  const valuesRef = useRef(values)
  valuesRef.current = values

  const staleRef = useRef(onStaleValue)
  staleRef.current = onStaleValue

  const loadersRef = useRef<Record<string, LoaderEntry>>({})
  const nextLoaders: Record<string, LoaderEntry> = {}
  for (const field of fields) {
    if (typeof field.loadOptions !== "function") continue
    nextLoaders[field.key] = { loader: field.loadOptions, dependsOn: field.dependsOn ?? [] }
  }
  loadersRef.current = nextLoaders

  const mountedRef = useRef(false)
  const tokensRef = useRef<Record<string, number>>({})
  const loadedRef = useRef<Record<string, string>>({})

  const [optionsByKey, setOptionsByKey] = useState<Record<string, FieldOption[]>>(() => {
    const seed: Record<string, FieldOption[]> = {}
    for (const field of fields) {
      if (typeof field.loadOptions === "function") continue
      if (Array.isArray(field.options)) continue
      seed[field.key] = []
    }
    return seed
  })
  const [loadingKeys, setLoadingKeys] = useState<string[]>([])
  const [errorKeys, setErrorKeys] = useState<Record<string, string>>({})

  const commit = useCallback((key: string, list: FieldOption[]) => {
    setOptionsByKey((prev) => (sameOptions(prev[key], list) ? prev : { ...prev, [key]: list }))
    setErrorKeys((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setLoadingKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev))
  }, [])

  const fail = useCallback((key: string, err: unknown) => {
    setErrorKeys((prev) =>
      prev[key] === errorMessage(err) ? prev : { ...prev, [key]: errorMessage(err) },
    )
    setLoadingKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev))
  }, [])

  const runLoad = useCallback(
    (key: string, force: boolean) => {
      if (!mountedRef.current) return
      const entry = loadersRef.current[key]
      if (!entry) return
      const current = valuesRef.current
      const sig = signatureOf(entry.dependsOn, current)
      if (!force && loadedRef.current[key] === sig) return
      loadedRef.current[key] = sig
      const token = (tokensRef.current[key] ?? 0) + 1
      tokensRef.current[key] = token
      const loader = entry.loader
      setLoadingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
      Promise.resolve()
        .then(() => loader(current))
        .then((raw) => {
          if (!mountedRef.current || tokensRef.current[key] !== token) return
          const result = asResult(raw)
          commit(key, result.options)
          if (result.degraded) fail(key, new Error(result.degraded))
          if (isStaleValue(valuesRef.current[key], result.options)) staleRef.current?.(key)
        })
        .catch((err) => {
          if (!mountedRef.current || tokensRef.current[key] !== token) return
          fail(key, err)
        })
    },
    [commit, fail],
  )

  let signature = ""
  for (const key of Object.keys(nextLoaders)) {
    if (signature !== "") signature += "&"
    signature += `${key}:${signatureOf(nextLoaders[key].dependsOn, valuesRef.current)}`
  }

  useEffect(() => {
    mountedRef.current = true
    for (const key of Object.keys(loadersRef.current)) runLoad(key, false)
  }, [signature, runLoad])

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const reload = useCallback((key: string) => runLoad(key, true), [runLoad])

  return { optionsByKey, loadingKeys, errorKeys, reload }
}
