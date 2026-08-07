import { useCallback, useMemo, useRef, useState } from "react";

export function useTableSearch<T>(
  rows: T[],
  filter?: (row: T, query: string) => boolean,
) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const submit = useCallback(() => {
    setQuery(draft.trim());
  }, [draft]);

  const clear = useCallback(() => {
    setDraft("");
    setQuery("");
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const fn = filterRef.current;
    if (fn) return rows.filter((r) => fn(r, q));
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, query, filter]);

  return {
    draft,
    setDraft,
    query,
    submit,
    clear,
    filtered,
  };
}
