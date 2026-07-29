import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { parseList, type ParsedList } from "@/shared/api/list";
import {
  filterQueryString,
  filterSignature,
  type ActiveFilter,
} from "@/shared/filters/list-filters";
import type { Resource } from "@/entities/resources";

export interface ListParams {
  page: number;
  limit: number;
  q: string;
  /** Applied filters. Serialized against the resource's own defs. */
  filters?: ActiveFilter[];
  /** Server sort, e.g. `title` or `-created_at`. */
  order?: string;
}

export function buildListPath(r: Resource, params: ListParams): string {
  const { page, limit, q } = params;
  const offset = Math.max(0, (page - 1) * limit);
  const parts: string[] = [];
  if (r.search && q) parts.push(`q=${encodeURIComponent(q)}`);
  parts.push(`limit=${limit}`, `offset=${offset}`);
  if (params.order) parts.push(`order=${encodeURIComponent(params.order)}`);
  // Appended last and already encoded by serializeFilters, so the wire format is
  // exactly what the list endpoints parse (repeated ids, `<key>_from/_to`).
  parts.push(
    filterQueryString(params.filters ?? [], r.filters ?? []).replace(/^\?/, ""),
  );
  const sep = r.listPath.includes("?") ? "&" : "?";
  return `${r.listPath}${sep}${parts.filter((p) => p !== "").join("&")}`;
}

/** Server-driven list fetch: rows + total count, crash-safe via parseList(). */
export function useResourceList(r: Resource, params: ListParams) {
  const path = buildListPath(r, params);
  // The signature is order-independent and stable across renders, so toggling two
  // chips in either order hits the same cache entry (and the raw array, whose
  // identity changes every render, would refetch forever).
  const signature = filterSignature(
    params.filters ?? [],
    r.filters ?? [],
  );
  return useQuery({
    queryKey: [
      "resource",
      r.slug,
      params.page,
      params.limit,
      params.q,
      signature,
      params.order ?? "",
    ],
    queryFn: async (): Promise<ParsedList> => {
      const data = await api(path);
      return parseList(data, params.limit);
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
