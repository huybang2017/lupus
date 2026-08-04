import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  clearFilters,
  emptyFilterValue,
  hasFilterValue,
  parseFilters,
  removeFilter,
  serializeFilters,
  setFilterValue,
  toggleFilter,
  type ActiveFilter,
  type FilterDef,
  type FilterValue,
} from "@/shared/filters/list-filters";

// URL is the single source of truth for applied filters: it makes a filtered
// list shareable, survives a reload and re-renders the page on Back. The hook
// is a thin writer around that, so no filter state lives in React.

export interface UseListFiltersResult {
  active: ActiveFilter[];
  count: number;
  isActive: (key: string) => boolean;
  /** Turn a filter on with an empty value (used by the "Add filter" menu). */
  add: (def: FilterDef) => void;
  /** Set/replace/remove a value. An empty value removes the filter entirely. */
  setValue: (def: FilterDef, value: FilterValue) => void;
  /** Turn a filter on if off, off if on. */
  toggle: (def: FilterDef) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Raw setter so a page can also read/clear `q` and reset `page` at the same time. */
  commit: (next: ActiveFilter[]) => void;
}

export function useListFilters(defs: FilterDef[]): UseListFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // Resources build `defs` inline, so the array identity changes every render.
  // The callbacks below must not re-subscribe to it, hence the ref.
  const defsRef = useRef(defs);
  defsRef.current = defs;
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;

  const defSignature = useMemo(() => defs.map((d) => d.key).join("|"), [defs]);

  const parsed = useMemo(
    () => parseFilters(searchParams, defsRef.current),
    [searchParams, defSignature],
  );

  // parseFilters drops empty values, so a filter the user just switched on has
  // nothing in the URL to represent it. Keeping those few entries here is what
  // lets the chip render its "pick a value" state instead of vanishing.
  const [pending, setPendingState] = useState<ActiveFilter[]>([]);

  const active = useMemo(() => {
    const out = [...parsed];
    for (const entry of pending) {
      if (!out.some((f) => f.key === entry.key)) out.push(entry);
    }
    return out;
  }, [parsed, pending]);

  const activeRef = useRef(active);
  activeRef.current = active;

  const commit = useCallback((next: ActiveFilter[]) => {
    const live = defsRef.current;
    const params = new URLSearchParams(paramsRef.current);
    // Own every param a def may have written, range suffixes included, so a
    // removed filter cannot leave `status_from=...` behind.
    for (const def of live) {
      params.delete(def.key);
      params.delete(`${def.key}_from`);
      params.delete(`${def.key}_to`);
    }
    serializeFilters(next, live).forEach((value, key) => params.append(key, value));

    // Filtering changes the result set, so page 3 of the old set is meaningless.
    const page = params.get("page");
    if (page !== null && page !== "1") params.set("page", "1");
    else params.delete("page");

    setPendingState(next.filter((f) => !hasFilterValue(f.value)));
    // Push, not replace: Back walks filter history the way Lupus's does.
    setSearchParams(params, { replace: false });
  }, []);

  const lastSignature = useRef(defSignature);
  useEffect(() => {
    if (lastSignature.current === defSignature) return;
    // A different resource is a different filter set. Drop the stale chips but
    // leave the URL alone: the navigation itself is the page's business.
    lastSignature.current = defSignature;
    setPendingState([]);
  }, [defSignature]);

  const isActive = useCallback(
    (key: string) => active.some((f) => f.key === key),
    [active],
  );

  const add = useCallback(
    (def: FilterDef) => {
      const rest = activeRef.current.filter((f) => f.key !== def.key);
      commit([...rest, { key: def.key, value: emptyFilterValue(def) }]);
    },
    [commit],
  );

  const setValue = useCallback(
    (def: FilterDef, value: FilterValue) => {
      commit(setFilterValue(activeRef.current, def, value));
    },
    [commit],
  );

  const toggle = useCallback(
    (def: FilterDef) => {
      commit(toggleFilter(activeRef.current, def));
    },
    [commit],
  );

  const remove = useCallback(
    (key: string) => {
      commit(removeFilter(activeRef.current, key));
    },
    [commit],
  );

  const clear = useCallback(() => {
    commit(clearFilters());
  }, [commit]);

  return {
    active,
    count: active.length,
    isActive,
    add,
    setValue,
    toggle,
    remove,
    clear,
    commit,
  };
}