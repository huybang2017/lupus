import { useEffect, useState, type JSX, type KeyboardEvent } from "react";
import type { FilterDef } from "@/shared/filters/list-filters";
import { MultiSelect } from "@/widgets/ui/multi-select";
import { useFilterOptions } from "@/widgets/filters/use-filter-options";

// Multi-select whose options come from the server instead of the def.
//
// The shape of the interaction is identical to a static MultiSelect (same
// popover, same keyboard handling, same chip integration); the only difference
// is where the rows come from, which is why this is a wrapper rather than a new
// control. It stays multi even for a single-valued server param: the caller
// decides that by reading `def.multiple`.

export interface AsyncFilterSelectProps {
  def: FilterDef;
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function AsyncFilterSelect({
  def,
  value,
  onChange,
  placeholder,
}: AsyncFilterSelectProps): JSX.Element {
  const [search, setSearch] = useState("");
  const { options, loading, error } = useFilterOptions(def, search);

  // One chip is reused across defs when the toolbar re-renders in place, so a
  // stale term from the previous filter must not be sent to the new endpoint.
  useEffect(() => {
    setSearch("");
  }, [def.key]);

  function stopKeys(e: KeyboardEvent): void {
    e.stopPropagation();
  }

  // A single-valued select is still edited with this control, so picking a
  // second row has to replace the first. Otherwise the chip would show two
  // values while the query string only ever carries the first one.
  const multiple = def.type === "multiselect" || def.multiple === true;
  function commit(next: string[]): void {
    onChange(multiple ? next : next.slice(-1));
  }

  return (
    <span className="filter-editor" onKeyDown={stopKeys}>
      <MultiSelect
        values={value}
        onChange={commit}
        options={options.map((o) => ({
          value: o.value,
          label: o.label ?? o.value,
        }))}
        loading={loading}
        // A remote list is never a "pick from these 8" list, so the search box
        // is always on: it is the only way to reach row 400.
        searchable
        emptyText={error ?? "No results"}
        placeholder={placeholder ?? def.placeholder ?? `Filter ${def.label}`}
        width="100%"
        aria-label={`Filter ${def.label}`}
        searchValue={search}
        onSearchChange={setSearch}
      />
    </span>
  );
}
