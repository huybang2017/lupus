import { z } from "zod"
import { pool } from "../../db"

// Shared list-query helper for every GET /admin/* list endpoint.
//
// Why this exists: the compat routers each grew their own hand-rolled paging +
// filter block, and several of them parse `req.query` through a strict zod
// object, so an unrelated query param (a dashboard-supplied filter we do not
// know yet) turns into a 400. This module reads `req.query` permissively:
// unknown params are ignored (and reported through `unknown` for debugging),
// user values are always bound as params, and columns come only from the
// caller's spec.
//
// Design rules baked in here, so callers cannot misuse it:
// - No user value is ever interpolated into SQL. Only column names and
//   operators are literal, and both come from the FilterSpec / allowlist.
// - LIKE metacharacters in a searched value are escaped and the pattern is
//   used with ESCAPE '\', so `q=%` can never become a full-table scan.
// - ILIKE over a nullable column wraps it in COALESCE(col, '').
// - ORDER BY is allowlisted; an unknown sort key falls back to the caller's
//   default instead of reaching the SQL string.
// - Paging never throws: bad numbers degrade to the defaults (limit 50, max
//   100, offset 0).
// - `where`/`params` from buildFilters are numbered from $1, so a caller that
//   needs to append LIMIT/OFFSET just pushes two more params.

/** Default and ceiling for `limit` when the caller does not override them. */
export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100

/** Query keys consumed by the helper itself; never reported as unknown. */
const RESERVED_KEYS = ["limit", "offset", "q", "order", "fields", "expand"]

export interface FilterSpec {
  /** Query param name, e.g. "status". */
  key: string
  /** SQL column, optionally table-qualified: "o.status". Defaults to `key`. */
  column?: string
  /**
   * How the param is applied:
   *  "eq"       -> col = $n           (single value)
   *  "in"       -> col = ANY($n)     (repeatable param, also accepts comma list)
   *  "ilike"    -> col ILIKE $n      (value is wrapped in %...%)
   *  "ilike_any"-> (col1 ILIKE $n OR col2 ILIKE $n ...) via `columns`
   *  "gte"      -> col >= $n         (from the `<key>_from` param)
   *  "lte"      -> col <= $n         (from the `<key>_to` param)
   *  "bool"     -> col = $n::boolean (accepts true/false/1/0/yes/no/on/off)
   *  "num_gte"  -> col >= $n::numeric (from `<key>_from`)
   *  "num_lte"  -> col <= $n::numeric (from `<key>_to`)
   */
  op: "eq" | "in" | "ilike" | "ilike_any" | "gte" | "lte" | "bool" | "num_gte" | "num_lte"
  /** Multiple columns for "ilike_any", joined with OR. */
  columns?: string[]
  /** Whitelist of accepted values (case-insensitive). Values outside are ignored (not an error). */
  values?: string[]
  /** Coerce a raw string before binding (e.g. lowercase a country code). */
  coerce?: (raw: string) => string
  /** Strip SQL LIKE metacharacters from the value before wrapping in %. Default true for ilike*. */
  escapeLike?: boolean
}

export interface ListQuery {
  /** SQL fragment including the WHERE keyword, e.g. `WHERE a = 1 AND b = $1`. Empty when no filters applied. */
  where: string
  /** Bind values in the exact order they appear in `where`. */
  params: unknown[]
  /** Parsed paging: limit (1..100, default 50) and offset (>=0, default 0). */
  limit: number
  offset: number
  /** `q` param if provided and non-blank, else "". */
  q: string
  /** Sanitized ORDER BY fragment WITHOUT the "ORDER BY" keyword, e.g. "created_at DESC". "" when unsorted. */
  order: string
  /** Keys that were present in the query but are not in the spec (useful for debugging/tests). */
  unknown: string[]
}

/** Optional, permissive zod view of the params the helper understands. Never required by routes. */
export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
    q: z.string().optional(),
    order: z.string().optional(),
    fields: z.string().optional(),
    expand: z.string().optional(),
  })
  .passthrough()

function asRecord(query: unknown): Record<string, unknown> {
  if (query && typeof query === "object" && !Array.isArray(query)) {
    return query as Record<string, unknown>
  }
  return {}
}

function firstRaw(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function trimmedOrNull(value: unknown): string | null {
  const raw = firstRaw(value)
  if (raw === undefined || raw === null) {
    return null
  }
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim()
  return s.length > 0 ? s : null
}

/** Lupus range filters arrive as `created_at[$gte]=...`, which express parses into `{ $gte: ... }`. */
function operatorValue(value: unknown, operator: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return trimmedOrNull((value as Record<string, unknown>)[operator])
}

function parsePagingWith(query: unknown, defaultLimit: number, maxLimit: number): { limit: number; offset: number } {
  const rec = asRecord(query)
  const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const raw = firstRaw(value)
    if (raw === undefined || raw === null) {
      return fallback
    }
    const n = typeof raw === "number" ? raw : String(raw).trim() === "" ? Number.NaN : Number(String(raw).trim())
    if (!Number.isFinite(n)) {
      return fallback
    }
    return Math.min(Math.max(Math.trunc(n), min), max)
  }
  return {
    limit: clamp(rec.limit, defaultLimit, 1, maxLimit),
    offset: clamp(rec.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  }
}

/** Parse + validate paging. limit is clamped to 1..100. Never throws for bad numbers. */
export function parsePaging(query: unknown): { limit: number; offset: number } {
  return parsePagingWith(query, DEFAULT_LIMIT, MAX_LIMIT)
}

/** Split a repeatable/comma-joined query param into trimmed non-empty values. */
export function queryList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return []
  }
  const raw = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const entry of raw) {
    if (entry === undefined || entry === null || typeof entry === "object") {
      continue
    }
    for (const part of String(entry).split(",")) {
      const trimmed = part.trim()
      if (trimmed.length > 0) {
        out.push(trimmed)
      }
    }
  }
  return out
}

/** Escape `%`, `_` and `\` so a user query cannot turn into a wildcard scan. */
export function escapeLike(raw: string): string {
  return String(raw).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function likeParam(value: string, escape: boolean): string {
  return `%${escape ? escapeLike(value) : value}%`
}

function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase()
  if (v === "true" || v === "1" || v === "yes" || v === "on") {
    return true
  }
  if (v === "false" || v === "0" || v === "no" || v === "off") {
    return false
  }
  return null
}

function allowed(spec: FilterSpec, value: string): boolean {
  if (!spec.values) {
    return true
  }
  const wanted = value.toLowerCase()
  return spec.values.some((v) => String(v).toLowerCase() === wanted)
}

function applyCoerce(spec: FilterSpec, value: string): string {
  return spec.coerce ? spec.coerce(value) : value
}

function likeClause(column: string, paramIndex: number, escape: boolean): string {
  return `${column} ILIKE $${paramIndex} ESCAPE '\\'`
}

function conditionFor(
  spec: FilterSpec,
  query: Record<string, unknown>,
  nextIndex: number
): { sql: string; params: unknown[] } | null {
  const column = spec.column ?? spec.key
  switch (spec.op) {
    case "eq": {
      // Lupus sends multi-select filters as repeated params (status[]=a&status[]=b); one value stays `=`.
      const many = Array.isArray(query[spec.key])
        ? (query[spec.key] as unknown[]).map((v) => (v === undefined || v === null || typeof v === "object" ? "" : String(v).trim())).filter((v) => v.length > 0)
        : []
      if (many.length > 1) {
        const values = many.map((v) => applyCoerce(spec, v)).filter((v) => allowed(spec, v))
        if (values.length === 0) {
          return null
        }
        return { sql: `${column} = ANY($${nextIndex})`, params: [values] }
      }
      const raw = trimmedOrNull(query[spec.key])
      if (raw === null) {
        return null
      }
      const value = applyCoerce(spec, raw)
      if (!allowed(spec, value)) {
        return null
      }
      return { sql: `${column} = $${nextIndex}`, params: [value] }
    }
    case "in": {
      const raw = queryList(query[spec.key]).filter((v) => allowed(spec, v))
      if (raw.length === 0) {
        return null
      }
      const values = raw.map((v) => applyCoerce(spec, v))
      return { sql: `${column} = ANY($${nextIndex})`, params: [values] }
    }
    case "ilike": {
      const raw = trimmedOrNull(query[spec.key])
      if (raw === null) {
        return null
