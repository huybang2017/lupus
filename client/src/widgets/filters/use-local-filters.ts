import { useCallback, useMemo, useState } from "react";
import {
  clearFilters,
  isFilterActive as isEntryActive,
  matchesFilters,
  removeFilter as withoutKey,
  setFilterValue as withValue,
  toggleFilter as toggled,
  type ActiveFilter,
  type FilterDef,
  type FilterValue,
} from "@/shared/filters/list-filters";

// Local (client-side) filtering for the tables that hold their whole result set
// in memory: a category's products, a customer group's members, a price list's
// overrides. Same defs, same chips and the same `matchesFilters` predicate as the
// server-backed lists, but the state lives in React instead of the URL - these
// pages are scoped to one parent record, so a filter URL would only be noise.

export interface UseLocalFiltersResult<T> {
  /** `rows` after every active filter has been applied. */
  rows: T[];
  active: ActiveFilter[];
  count: number;
  isActive: (key: string) => boolean;
  setValue: (def: FilterDef, value: FilterValue) => void;
  toggle: (def: FilterDef) => void;
  remove: (key: string) => void;
  clear: () => void;
  defs: FilterDef[];
}

export function useLocalFilters<T>(
  rows: T[],
  defs: FilterDef[],
): UseLocalFiltersResult<T> {
  const [active, setActive] = useState<ActiveFilter[]>([]);

  // Defs are module-level constants on every call site, so this is stable and
  // the predicate below does not need a ref indirection.
  const filtered = useMemo(
    () => (active.length === 0 ? rows : rows.filter((r) => matchesFilters(r, active, defs))),
    [rows, active, defs],
  );

  const isActive = useCallback(
    (key: string) => isEntryActive(active, key),
    [active],
  );
  const setValue = useCallback((def: FilterDef, value: FilterValue) => {
    setActive((prev) => withValue(prev, def, value));
  }, []);
  const toggle = useCallback((def: FilterDef) => {
    setActive((prev) => toggled(prev, def));
  }, []);
  const remove = useCallback((key: string) => {
    setActive((prev) => withoutKey(prev, key));
  }, []);
  const clear = useCallback(() => {
    setActive(clearFilters());
  }, []);

  return {
    rows: filtered,
    active,
    count: active.length,
    isActive,
    setValue,
    toggle,
    remove,
    clear,
    defs,
  };
}
