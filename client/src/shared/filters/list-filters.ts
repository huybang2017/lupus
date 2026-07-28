// Framework-free filter plumbing shared by the data-table filter bar: URL
// round-tripping, chip labels and client-side row predicates.
//
// Deliberately no React here: the exact same functions run during URL parsing,
// inside react-query keys and against row objects, so keeping them pure is what
// guarantees a filter means one thing in all three places.

export type FilterType =
  | "text"
  | "select"
  | "multiselect"
  | "boolean"
  | "date"
  | "number";

export interface FilterOption {
  value: string;
  label?: string;
}

export interface FilterDef {
  /** Stable key. Also the base query-param name on the server. */
  key: string;
  label: string;
  type: FilterType;
  /** Choices for select / multiselect. */
  options?: FilterOption[];
  /** Client-side mode only: read this filter's value off a row. */
  accessor?: (row: any) => unknown;
  placeholder?: string;
  /** Allow picking several values (only meaningful for type "select"). */
  multiple?: boolean;
  /** For type "number": which side of the range. */
  side?: "from" | "to";
  /** Sort/direction hint shown in the chip, optional. */
  help?: string;
  /** Remote option loader. Presence switches the editor to async mode. */
  loadOptions?: (
    search: string,
    signal?: AbortSignal,
  ) => Promise<FilterOption[]>;
}

export interface DateRangeValue {
  from?: string;
  to?: string;
}

export interface NumberRangeValue {
  from?: number | string;
  to?: number | string;
}

export type FilterValue =
  | string
  | string[]
  | DateRangeValue
  | NumberRangeValue
  | boolean
  | undefined;

export interface ActiveFilter {
  key: string;
  value: FilterValue;
}

/** Internal range shape both range value types collapse into. */
interface AnyRange {
  from?: string | number;
  to?: string | number;
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

function isMulti(def: FilterDef): boolean {
  return def.type === "multiselect" || def.multiple === true;
}

function isRange(def: FilterDef): boolean {
  return def.type === "date" || def.type === "number";
}

/** True when a filter has a usable (non-empty) value. */
export function hasFilterValue(value: FilterValue): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return !isBlank(value);
  if (Array.isArray(value)) return value.some((v) => !isBlank(v));
  if (typeof value === "object") return !isBlank(value.from) || !isBlank(value.to);
  return false;
}

function toArray(value: FilterValue): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v !== "");
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

function toScalar(value: FilterValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  return undefined;
}

function toRange(value: FilterValue): AnyRange {
  if (value === undefined || value === null || typeof value !== "object") return {};
  if (Array.isArray(value)) return {};
  return value;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return String(value) === "true" || String(value) === "1";
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for a cell that may be a Date or an ISO/date string. */
function dayOf(cell: unknown): string {
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "" : localDay(cell);
  }
  if (cell === undefined || cell === null) return "";
  const match = String(cell).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

/** Comparable string for a row cell; Dates collapse to their local day. */
function cellKey(cell: unknown): string {
  if (cell === undefined || cell === null) return "";
  if (cell instanceof Date) return dayOf(cell);
  return String(cell);
}

/**
 * Read active filters out of URLSearchParams.
 * Unknown keys and empty values are dropped. Range params use the
 * `<key>_from` / `<key>_to` suffix; multiselect values are repeated params.
 */
export function parseFilters(
  params: URLSearchParams,
  defs: FilterDef[],
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const def of defs) {
    if (isMulti(def)) {
      const raw = params.getAll(def.key).filter((v) => v !== "");
      if (raw.length > 0) out.push({ key: def.key, value: raw });
      continue;
    }
    if (isRange(def)) {
      const from = params.get(`${def.key}_from`) ?? undefined;
      const to = params.get(`${def.key}_to`) ?? undefined;
      const range: AnyRange = { from, to };
      if (hasFilterValue(range)) out.push({ key: def.key, value: range });
      continue;
    }
    if (def.type === "boolean") {
      const raw = params.get(def.key);
      if (raw === "true" || raw === "false") {
        out.push({ key: def.key, value: raw === "true" });
      }
      continue;
    }
    const raw = params.get(def.key);
    if (raw !== null && raw.trim() !== "") out.push({ key: def.key, value: raw });
  }
  return out;
}

function appendValue(
  params: URLSearchParams,
  def: FilterDef,
  value: FilterValue,
): void {
  if (isMulti(def)) {
    for (const v of toArray(value)) params.append(def.key, v);
    return;
  }
  if (isRange(def)) {
    const range = toRange(value);
    if (!isBlank(range.from)) params.set(`${def.key}_from`, String(range.from));
    if (!isBlank(range.to)) params.set(`${def.key}_to`, String(range.to));
    return;
  }
  if (def.type === "boolean") {
    if (typeof value === "boolean") params.set(def.key, value ? "true" : "false");
    else {
      const raw = toScalar(value);
      if (raw === "true" || raw === "false") params.set(def.key, raw);
    }
    return;
  }
  const scalar = toScalar(value);
  if (!isBlank(scalar)) params.set(def.key, String(scalar));
}

/** Inverse of parseFilters. Never emits empty or unknown params. */
export function serializeFilters(
  active: ActiveFilter[],
  defs: FilterDef[],
): URLSearchParams {
  const params = new URLSearchParams();
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const entry of active) {
    if (!hasFilterValue(entry.value)) continue;
    const def = byKey.get(entry.key);
    if (!def) continue;
    appendValue(params, def, entry.value);
  }
  return params;
}

/** Compact query string for useResourceList (includes a leading "?" or ""). */
export function filterQueryString(
  active: ActiveFilter[],
  defs: FilterDef[],
): string {
  const qs = serializeFilters(active, defs).toString();
  return qs === "" ? "" : `?${qs}`;
}

/** True when `active` contains a non-empty entry for `key`. */
export function isFilterActive(active: ActiveFilter[], key: string): boolean {
  return active.some((f) => f.key === key && hasFilterValue(f.value));
}

/** Add or replace one filter value. Undefined / empty values REMOVE the entry. */
export function setFilterValue(
  active: ActiveFilter[],
  def: FilterDef,
  value: FilterValue,
): ActiveFilter[] {
  if (!hasFilterValue(value)) return removeFilter(active, def.key);
  return [...removeFilter(active, def.key), { key: def.key, value }];
}

/** Toggle a filter on/off (used by the "Add filter" menu). */
export function toggleFilter(
  active: ActiveFilter[],
  def: FilterDef,
): ActiveFilter[] {
  if (isFilterActive(active, def.key)) return removeFilter(active, def.key);
  return [...active, { key: def.key, value: emptyFilterValue(def) }];
}

export function removeFilter(
  active: ActiveFilter[],
  key: string,
): ActiveFilter[] {
  return active.filter((f) => f.key !== key);
}

export function clearFilters(): ActiveFilter[] {
  return [];
}

/** Default/empty value for a def, used when a filter is first turned on. */
export function emptyFilterValue(def: FilterDef): FilterValue {
  if (isMulti(def)) return [];
  if (isRange(def)) return {};
  if (def.type === "boolean") return false;
  return "";
}

/**
 * Just the value half of a filter, e.g. "pending" / "2 selected" /
 * "after 2026-01-01". Empty string when nothing usable is set. The chip renders
 * this next to its own label, so it must never repeat the label or the
 * "Label: " prefix.
 */
export function filterValueText(def: FilterDef, value: FilterValue): string {
  const labels = new Map<string, string>(
    (def.options ?? []).map((o): [string, string] => [o.value, o.label ?? o.value]),
  );
  const labelOf = (v: string) => labels.get(v) ?? v;

  let body: string;
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== "");
    body =
      items.length === 0
        ? ""
        : items.length <= 2
          ? items.map(labelOf).join(" or ")
          : `${items.length} selected`;
  } else if (typeof value === "boolean") {
    body = value ? "Yes" : "No";
  } else if (value && typeof value === "object") {
    const range = toRange(value);
    const parts: string[] = [];
    const isNumber = def.type === "number";
    if (!isBlank(range.from)) parts.push(`${isNumber ? "at least" : "after"} ${range.from}`);
    if (!isBlank(range.to)) parts.push(`${isNumber ? "at most" : "before"} ${range.to}`);
    body = parts.join(" and ");
  } else {
    // Scalar values still go through the option labels: "pending" reads as
    // "Pending" in the chip, and types without options pass through untouched.
    body = labelOf(toScalar(value) ?? "");
  }

  return body;
}

/**
 * Human-readable chip text, e.g. "Status: pending" / "Created at: after
 * 2026-01-01". Falls back to the bare label when the filter has no value yet,
 * which is what a freshly toggled-on chip shows.
 */
export function formatFilterValue(def: FilterDef, value: FilterValue): string {
  const text = filterValueText(def, value);
  return text === "" ? def.label : `${def.label}: ${text}`;
}

function matchCell(
  def: FilterDef,
  cell: unknown,
  value: FilterValue,
): boolean {
  switch (def.type) {
    case "text": {
      const needle = (toScalar(value) ?? "").trim().toLowerCase();
      if (needle === "") return true;
      return cellKey(cell).toLowerCase().includes(needle);
    }
    case "select": {
      const wanted = Array.isArray(value)
        ? value.map((v) => String(v))
        : [toScalar(value) ?? ""];
      return wanted.includes(cellKey(cell));
    }
    case "multiselect": {
      return toArray(value).includes(cellKey(cell));
    }
    case "boolean": {
      return toBoolean(cell) === toBoolean(value);
    }
    case "date": {
      const day = dayOf(cell);
      // Unreadable cell: keep the row rather than hiding it behind a filter.
      if (day === "") return true;
      const range = toRange(value);
      const from = isBlank(range.from) ? undefined : String(range.from);
      const to = isBlank(range.to) ? undefined : String(range.to);
      if (from !== undefined && day < from) return false;
      if (to !== undefined && day > to) return false;
      return true;
    }
    case "number": {
      const n = toNumber(cell);
      if (n === undefined) return true;
      const range = toRange(value);
      const from = toNumber(range.from);
      const to = toNumber(range.to);
      if (from !== undefined && n < from) return false;
      if (to !== undefined && n > to) return false;
      return true;
    }
    default:
      return true;
  }
}

/**
 * Client-side predicate. Returns true when the row passes every active filter.
 * Missing accessor or unreadable value => the filter is skipped (no crash).
 */
export function matchesFilters<T>(
  row: T,
  active: ActiveFilter[],
  defs: FilterDef[],
): boolean {
  if (active.length === 0) return true;
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const entry of active) {
    if (!hasFilterValue(entry.value)) continue;
    const def = byKey.get(entry.key);
    if (!def || typeof def.accessor !== "function") continue;
    let cell: unknown;
    try {
      cell = def.accessor(row);
    } catch {
      continue;
    }
    if (!matchCell(def, cell, entry.value)) return false;
  }
  return true;
}

/** Stable, order-independent signature for react-query keys. */
export function filterSignature(
  active: ActiveFilter[],
  defs: FilterDef[],
): string {
  const entries = Array.from(serializeFilters(active, defs).entries());
  entries.sort(([ak, av], [bk, bv]) =>
    ak === bk ? (av === bv ? 0 : av < bv ? -1 : 1) : ak < bk ? -1 : 1,
  );
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}