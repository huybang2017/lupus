import type { JSX, KeyboardEvent, ReactNode } from "react";
import {
  type DateRangeValue,
  type FilterDef,
  type FilterValue,
  type NumberRangeValue,
} from "@/shared/filters/list-filters";
import { DateRangeField, dateRangePresets } from "@/widgets/ui/date-range-field";
import { MultiSelect } from "@/widgets/ui/multi-select";
import { Select, type SelectOption } from "@/widgets/ui/select";
import { AsyncFilterSelect } from "@/widgets/filters/async-filter-select";

// The editor for one applied filter. It only ever renders inside the chip's
// popover, so every control here fills that panel and no keystroke may reach the
// page-level shortcuts.

interface FilterValueInputProps {
  def: FilterDef;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

const BOOLEAN_OPTIONS: SelectOption[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

// The popover is portalled to <body>, so a keystroke in one of these controls
// still reaches the page's window-level shortcuts unless it is stopped here.
function stopKeys(e: KeyboardEvent): void {
  e.stopPropagation();
}

/** Fill-the-panel wrapper: a percentage width needs a block-level parent. */
function Editor(props: {
  children: ReactNode;
  row?: boolean;
}): JSX.Element {
  const cls = props.row
    ? "filter-editor filter-editor--row"
    : "filter-editor";
  return (
    <span className={cls} onKeyDown={stopKeys}>
      {props.children}
    </span>
  );
}

function asRange(value: FilterValue): { from?: string; to?: string } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const range = value as DateRangeValue;
    return { from: range.from, to: range.to };
  }
  return {};
}

function asNumberRange(value: FilterValue): NumberRangeValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as NumberRangeValue;
  }
  return {};
}

function scalarText(value: FilterValue): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : "";
  return "";
}

function booleanText(value: FilterValue): string {
  if (value === undefined || value === null || value === "") return "";
  return String(value) === "true" ? "true" : "false";
}

/**
 * The list form of a filter value. A single-valued select is still edited by a
 * multi-select control (that is what AsyncFilterSelect renders), so a scalar in
 * the URL has to be wrapped rather than dropped - otherwise the chip would come
 * back empty on every reload.
 */
function asValues(value: FilterValue): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

export function FilterValueInput({
  def,
  value,
  onChange,
}: FilterValueInputProps): JSX.Element | null {
  const isMulti = def.type === "multiselect" || def.multiple === true;

  if (def.type === "text") {
    return (
      <input
        className="input"
        aria-label={`Filter ${def.label}`}
        placeholder={def.placeholder ?? `Filter ${def.label}`}
        // A text filter commits live; there is no Apply button in the popover.
        value={scalarText(value)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopKeys}
      />
    );
  }

  // `multiselect` is its own FilterType, and a "select" opts in via `multiple`;
  // @/shared/filters/list-filters treats both the same way so the URL shape
  // never diverges.
  if (
    (def.type === "select" || def.type === "multiselect") &&
    (isMulti || def.loadOptions)
  ) {
    // Remote options get their own editor even when only one value is allowed:
    // the rows come from an endpoint, not from the def, so the static branches
    // below would render an empty, unusable control.
    if (def.loadOptions) {
      return (
        <AsyncFilterSelect
          def={def}
          value={asValues(value)}
          onChange={(next) => onChange(next)}
        />
      );
    }
    if (!def.options) return null;
    const values = Array.isArray(value) ? value.map(String) : [];
    return (
      <Editor>
        <MultiSelect
          values={values}
          onChange={(next) => onChange(next)}
          options={def.options.map((o) => ({
            value: o.value,
            label: o.label ?? o.value,
          }))}
          placeholder={def.placeholder ?? `Filter ${def.label}`}
          searchable={def.options.length > 12}
          width="100%"
          aria-label={`Filter ${def.label}`}
        />
      </Editor>
    );
  }

  if (def.type === "select") {
    if (!def.options) return null;
    return (
      <Editor>
        <Select
          value={scalarText(value)}
          onChange={onChange}
          options={def.options.map((o) => ({
            value: o.value,
            label: o.label ?? o.value,
          }))}
          placeholder={def.placeholder ?? `Filter ${def.label}`}
          // The chip's X owns removal; a clear row here would be a dead end.
          allowClear={false}
          searchable={def.options.length > 12}
          aria-label={`Filter ${def.label}`}
        />
      </Editor>
    );
  }

  if (def.type === "boolean") {
    return (
      <Editor>
        <Select
          value={booleanText(value)}
          onChange={onChange}
          options={BOOLEAN_OPTIONS}
          allowClear={false}
          placeholder={def.placeholder ?? `Filter ${def.label}`}
          aria-label={`Filter ${def.label}`}
        />
      </Editor>
    );
  }

  if (def.type === "date") {
    const range = asRange(value);
    return (
      <Editor>
        <DateRangeField
          value={range}
          onChange={(next) => onChange(next)}
          presets={dateRangePresets()}
          width="100%"
          aria-label={`Filter ${def.label}`}
        />
      </Editor>
    );
  }

  if (def.type === "number") {
    const range = asNumberRange(value);
    const showFrom = def.side !== "to";
    const showTo = def.side !== "from";
    const field = (side: "from" | "to", label: string) => (
      <input
        key={side}
        type="number"
        className="input"
        aria-label={`${label} ${def.label}`}
        placeholder={label}
        value={range[side] ?? ""}
        onChange={(e) =>
          onChange({
            ...range,
            [side]: e.target.value === "" ? undefined : e.target.value,
          })
        }
        onKeyDown={stopKeys}
      />
    );
    return (
      <Editor row>
        {showFrom ? field("from", "Min") : null}
        {showTo ? field("to", "Max") : null}
      </Editor>
    );
  }

  return null;
}