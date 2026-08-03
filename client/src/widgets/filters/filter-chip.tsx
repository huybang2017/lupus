import { ChevronDown, X } from "lucide-react";
import type { JSX } from "react";
import {
  filterValueText,
  hasFilterValue,
  type FilterDef,
  type FilterValue,
} from "@/shared/filters/list-filters";
import { Popover } from "@/widgets/ui/popover";
import { FilterValueInput } from "@/widgets/filters/filter-value-input";

// One applied filter, Lupus-style: the pill is a label (plus the chosen value),
// clicking it opens the editor, and the x removes the filter.
//
// The pill must stay clickable even before a value exists. An earlier version
// swapped the editor for inert hint text in that state, so turning a filter on
// showed a control that could never be used.

interface FilterChipProps {
  def: FilterDef;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  onRemove: () => void;
}

/** Radix portals the nested Select / MultiSelect list out of this panel. */
function isNestedPopperTarget(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  return target?.closest?.("[data-radix-popper-content-wrapper]") != null;
}

function panelWidth(def: FilterDef): number {
  if (def.type === "date") return 320;
  if (def.type === "number") return 240;
  return 260;
}

export function FilterChip({
  def,
  value,
  onChange,
  onRemove,
}: FilterChipProps): JSX.Element {
  const pending = !hasFilterValue(value);
  const text = pending ? "" : filterValueText(def, value);
  const faceLabel = pending ? def.label : `${def.label}: ${text}`;
  const removeLabel = `Remove ${def.label} filter`;

  return (
    <div className="filter-chip" data-pending={pending ? "" : undefined}>
      <Popover
        align="start"
        side="bottom"
        sideOffset={4}
        width={panelWidth(def)}
        aria-label={faceLabel}
        // A nested Select/MultiSelect list lives outside this DOM subtree, so
        // Radix would read the click as "outside" and unmount the editor before
        // the option registers. Keep the panel up while one of those is open.
        onPointerDownOutside={(event) => {
          if (isNestedPopperTarget(event)) event.preventDefault();
        }}
        trigger={({ ref }) => (
          <button
            type="button"
            ref={ref}
            className="filter-chip-face"
            data-pending={pending ? "" : undefined}
            aria-label={faceLabel}
          >
            <span className="filter-chip-label">{def.label}</span>
            {pending ? null : (
              <>
                <span aria-hidden="true">: </span>
                <span className="filter-chip-value">{text}</span>
              </>
            )}
            <span className="ui-select-chevron" aria-hidden="true">
              <ChevronDown size={13} />
            </span>
          </button>
        )}
      >
        <div className="filter-chip-panel" data-context="popover">
          <FilterValueInput def={def} value={value} onChange={onChange} />
        </div>
      </Popover>
      <button
        type="button"
        className="filter-chip-remove"
        aria-label={removeLabel}
        title={removeLabel}
        onClick={(e) => {
          // The chip lives inside a toolbar row that may itself be clickable.
          e.stopPropagation();
          onRemove();
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}