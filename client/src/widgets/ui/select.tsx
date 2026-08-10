import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useState, type CSSProperties } from "react";

// Shared dropdown used app-wide instead of native <select> so every picker
// looks and behaves the same (themed listbox, optional search, keyboard nav).
// Fix a bug here once and all 25+ call sites get it.

export interface SelectOption {
  value: string;
  label: string;
  sub?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when nothing is selected; also the label of the clear row. */
  placeholder?: string;
  /** Show a clear row (resets to "") when a value is selected. Defaults to true. */
  allowClear?: boolean;
  disabled?: boolean;
  /** Show an inline search box on top of the list. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  style?: CSSProperties;
  className?: string;
  "aria-label"?: string;
}

function matches(o: SelectOption, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${o.label} ${o.sub ?? ""} ${o.value}`.toLowerCase().includes(needle);
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowClear = true,
  disabled,
  searchable,
  searchPlaceholder = "Search…",
  emptyText = "No results",
  style,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const shown = searchable ? options.filter((o) => matches(o, query)) : options;
  const selected = options.find((o) => o.value === value);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <SelectPrimitive.Trigger
        className={["input", "ui-select-trigger", className]
          .filter(Boolean)
          .join(" ")}
        style={style}
        aria-label={ariaLabel ?? placeholder}
      >
        {selected ? (
          <span className="ui-select-value">
            {selected.label}
            {selected.sub ? (
              <span className="ui-select-sub"> ({selected.sub})</span>
            ) : null}
          </span>
        ) : (
          <span className="ui-select-value" data-placeholder="">
            {placeholder}
          </span>
        )}
        <SelectPrimitive.Icon className="ui-select-chevron">
          <ChevronDown size={15} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={6}
        >
          {searchable ? (
            <div className="ui-select-search">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={searchPlaceholder}
                aria-label="Filter options"
              />
            </div>
          ) : null}
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {/* Radix forbids empty-string Item values, so clearing is a plain
                button row instead of a selectable item. */}
            {allowClear && value !== "" ? (
              <button
                type="button"
                className="ui-select-clear"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {placeholder}
              </button>
            ) : null}
            {shown.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="ui-select-item"
              >
                <span className="ui-select-item-text">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.sub ? (
                    <span className="ui-select-sub"> ({o.sub})</span>
                  ) : null}
                </span>
                <SelectPrimitive.ItemIndicator className="ui-select-check">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
            {shown.length === 0 ? (
              <div className="ui-select-empty">{emptyText}</div>
            ) : null}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
