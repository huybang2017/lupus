import { Check, Plus } from "lucide-react";
import { useMemo, useState, type JSX } from "react";
import type { ActiveFilter, FilterDef } from "@/shared/filters/list-filters";
import { Popover } from "@/widgets/ui/popover";

interface FilterMenuProps {
  defs: FilterDef[];
  active: ActiveFilter[];
  onToggle: (def: FilterDef) => void;
  onClear: () => void;
}

// The "Add filter" checklist. Toggling must not close the popover: picking
// three status values in a row is the normal case, and re-opening the menu
// three times is what makes Lupus's version feel slow.

function matches(def: FilterDef, needle: string): boolean {
  if (!needle) return true;
  return `${def.label} ${def.key}`.toLowerCase().includes(needle);
}

export function FilterMenu({
  defs,
  active,
  onToggle,
  onClear,
}: FilterMenuProps): JSX.Element {
  const [query, setQuery] = useState("");
  const activeKeys = useMemo(
    () => new Set(active.map((f) => f.key)),
    [active],
  );
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return defs.filter((def) => matches(def, needle));
  }, [defs, query]);

  return (
    <Popover
      align="start"
      width={280}
      aria-label="Add filter"
      // padding 0 lets the search and the footer own the panel edges.
      style={{ padding: 0 }}
      trigger={({ ref }) => (
        <button type="button" ref={ref} className="btn btn-secondary">
          <Plus size={14} />
          Add filter
        </button>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          className="ui-ms-search"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: "var(--card-bg)",
          }}
        >
          <input
            value={query}
            placeholder="Search filters"
            aria-label="Search filters"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="ui-ms-list">
          {shown.map((def) => {
            const isActive = activeKeys.has(def.key);
            return (
              <button
                key={def.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isActive}
                className="filter-menu-item"
                onClick={() => onToggle(def)}
              >
                <span
                  className="ui-ms-check"
                  data-checked={isActive ? "" : undefined}
                  aria-hidden="true"
                >
                  {isActive ? <Check size={11} strokeWidth={3} /> : null}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {def.label}
                </span>
                {def.help ? (
                  <span className="filter-menu-hint">{def.help}</span>
                ) : null}
              </button>
            );
          })}
          {shown.length === 0 ? (
            <div className="filter-menu-empty">No filters</div>
          ) : null}
        </div>
        <div className="ui-ms-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={active.length === 0}
            onClick={onClear}
            style={{ padding: "4px 10px", fontSize: 12, fontWeight: 500 }}
          >
            Clear all
          </button>
        </div>
      </div>
    </Popover>
  );
}