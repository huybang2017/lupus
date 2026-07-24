// List-response normalization for the lupus backend.
//
// List endpoints speak Lupus pagination shape:
//   { <plural_key>: rows, count, offset, limit }
// Older admin endpoints may return { items: [...] } or a bare array.
// Every consumer must go through parseList() so a missing/renamed key can
// never crash a table again (see: items.map is not a function).

export interface ParsedList<T = any> {
  items: T[];
  /** Total count when the server reports one, otherwise null (unknown). */
  count: number | null;
  offset: number;
  limit: number;
}

/**
 * Max page size the backend accepts. Shared list endpoints validate
 * `limit: min(1).max(100)` — requesting more returns HTTP 400, so every
 * picker/dropdown fetch in the app must use this, never a larger number.
 */
export const LIST_LIMIT = 100;

const COUNT_KEYS = ["count", "total", "total_count", "totalCount"];

export function parseList<T = any>(
  data: any,
  fallbackLimit = 20,
): ParsedList<T> {
  if (Array.isArray(data)) {
    return {
      items: data,
      count: null,
      offset: 0,
      limit: Math.max(data.length, fallbackLimit),
    };
  }
  const obj = (data ?? {}) as Record<string, any>;
  let items: T[] = [];
  if (Array.isArray(obj.items)) {
    items = obj.items;
  } else {
    const nested = Object.values(obj).find((v) => Array.isArray(v)) as
      T[] | undefined;
    items = nested ?? [];
  }
  let count: number | null = null;
  for (const k of COUNT_KEYS) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      count = v;
      break;
    }
  }
  const offset = typeof obj.offset === "number" ? obj.offset : 0;
  const limit =
    typeof obj.limit === "number" && obj.limit > 0 ? obj.limit : fallbackLimit;
  return { items, count, offset, limit };
}

/** Legacy helper kept for call sites that only need the rows. */
export function toArray(data: any): any[] {
  return parseList(data).items;
}
