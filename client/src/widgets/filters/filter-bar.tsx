import type { CSSProperties, JSX, ReactNode } from "react";
import type {
  ActiveFilter,
  FilterDef,
  FilterValue,
} from "@/shared/filters/list-filters";
import { FilterChip } from "@/widgets/filters/filter-chip";
import { FilterMenu } from "@/widgets/filters/filter-menu";

/**
 * The slice of filter state a bar actually renders. Both drivers satisfy it:
 * useListFilters (URL-backed, server-side) and useLocalFilters (in-memory
 * client-side), so the same bar serves every table in the app.
 */
export interface FilterBarFilters {
  active: ActiveFilter[];
  count: number;
  isActive: (key: string) => boolean;
  setValue: (def: FilterDef, value: FilterValue) => void;
  toggle: (def: FilterDef) => void;
  remove: (key: string) => void;
  clear: () => void;
}

interface FilterBarProps {
  defs: FilterDef[];
  filters: FilterBarFilters;
  /** Rendered between the menu and the chips (e.g. a search box). */
  children?: ReactNode;
  style?: CSSProperties;
}

// Toolbar row: menu, optional extra controls, then one chip per applied filter.
// A resource with no filterable field renders nothing at all rather than a dead
// "Add filter" button.

export function FilterBar({
  defs,
  filters,
  children,
  style,
}: FilterBarProps): JSX.Element | null {
  if (defs.length === 0) return null;

  const applied = defs.filter((def) => filters.isActive(def.key));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <FilterMenu
        defs={defs}
        active={filters.active}
        onToggle={filters.toggle}
        onClear={filters.clear}
      />
      {children}
      {applied.length > 0 ? (
        <div className="filter-chips">
          {applied.map((def) => (
            <FilterChip
              key={def.key}
              def={def}
              value={filters.active.find((f) => f.key === def.key)?.value}
              onChange={(value) => filters.setValue(def, value)}
              onRemove={() => filters.remove(def.key)}
            />
          ))}
        </div>
      ) : null}
      {filters.count > 0 ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={filters.clear}
          style={{ padding: "4px 10px", fontSize: 12, color: "var(--fg-subtle)" }}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}