import { useEffect, useRef, useState } from "react";
import type { FilterDef, FilterOption } from "@/shared/filters/list-filters";

// Option source for a filter value editor.
//
// Two modes, one hook: a def without `loadOptions` is static data and must never
// trigger a fetch (its options are already on the def), while a def with one is
// a remote list that has to be debounced, aborted and race-guarded.
//
// No react-query on purpose. The list is a lookup, not a cached resource: it is
// refetched per keystroke, its result is worthless the moment the popover
// closes, and a cache would happily show a stale customer to someone who just
// created another one.

const DEBOUNCE_MS = 250;

export interface UseFilterOptionsResult {
  options: FilterOption[];
  loading: boolean;
  error: string | null;
}

export function useFilterOptions(
  def: FilterDef | undefined,
  search: string,
): UseFilterOptionsResult {
  const [options, setOptions] = useState<FilterOption[]>(def?.options ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `loadOptions` is usually an inline arrow in resources.tsx, so its identity
  // changes every render; the def key is what actually decides when to refetch.
  const loader = def?.loadOptions;
  const defKey = def?.key;
  const staticOptions = def?.options;
  const loadRef = useRef(loader);
  loadRef.current = loader;
  const optionsRef = useRef(staticOptions);
  optionsRef.current = staticOptions;

  // Bumping this invalidates whatever response is still in the air.
  const runId = useRef(0);
  // Which def the visible options belong to, so a swap clears them instantly.
  const shownFor = useRef(defKey);

  useEffect(() => {
    const current = ++runId.current;
    const load = loadRef.current;

    if (!load) {
      // Static def: the options are data on the def, nothing to fetch.
      setOptions(optionsRef.current ?? []);
      setLoading(false);
      setError(null);
      shownFor.current = defKey;
      return;
    }

    // Switching defs (a customer picker under a sales-channel chip) must not
    // leave the previous def's rows on screen for one debounce window.
    if (shownFor.current !== defKey) {
      setOptions([]);
      shownFor.current = defKey;
    }
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      load(search, controller.signal)
        .then((next) => {
          if (controller.signal.aborted || current !== runId.current) return;
          setOptions(Array.isArray(next) ? next : []);
          setLoading(false);
        })
        .catch((e) => {
          // An abort is the expected outcome of typing one more character.
          if (controller.signal.aborted || current !== runId.current) return;
          setOptions([]);
          setLoading(false);
          setError(e instanceof Error ? e.message : String(e));
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [defKey, search]);

  return { options, loading, error };
}
