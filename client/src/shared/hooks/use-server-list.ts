import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";

/**
 * One page of a Lupus-shaped list endpoint (`{ <key>: rows, count }`), re-fetched when the
 * query changes. Pickers use this so a store with thousands of rows is paged on the
 * server instead of being cut off at the first hundred.
 */
export function useServerList<T = any>(
  path: string,
  query: { page: number; limit: number; q?: string; params?: Record<string, string | undefined> },
) {
  const [items, setItems] = useState<T[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const [tick, setTick] = useState(0);

  const extra = JSON.stringify(query.params ?? {});
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    const qs = new URLSearchParams({
      limit: String(query.limit),
      offset: String((query.page - 1) * query.limit),
    });
    if (query.q) qs.set("q", query.q);
    for (const [k, v] of Object.entries(JSON.parse(extra) as Record<string, string | undefined>)) {
      if (v !== undefined && v !== "") qs.set(k, v);
    }
    api(`${path}?${qs.toString()}`)
      .then((d) => {
        if (mine !== seq.current) return;
        const l = parseList<T>(d, query.limit);
        setItems(l.items);
        setCount(l.count);
        setError(null);
      })
      .catch((e) => {
        if (mine !== seq.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setItems([]);
        setCount(0);
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [path, query.page, query.limit, query.q, extra, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { items, count, loading, error, reload };
}
