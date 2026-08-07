import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from "react";
import { Popover } from "@/widgets/ui/popover";
import { Spinner } from "@/widgets/ui/primitives";

const MIN_CONTENT_WIDTH = 260;

export interface MultiSelectOption {
  value: string;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  emptyText?: string;
  disabled?: boolean;
  /** Max width of the closed trigger. */
  width?: number | string;
  /** Loading state: show a spinner row instead of results. */
  loading?: boolean;
  /**
   * Controlled search text. Supplying this (with onSearchChange) hands ownership
   * of the search box to the caller, which is what a remote list needs: it has
   * to see the raw term to debounce a server request. Omit both and the box
   * keeps its own state exactly as before.
   */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  style?: CSSProperties;
  "aria-label"?: string;
}

function matchesOption(o: MultiSelectOption, needle: string): boolean {
  if (!needle) return true;
  return `${o.label} ${o.sub ?? ""} ${o.value}`.toLowerCase().includes(needle);
}

export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  searchable = true,
  emptyText = "No results",
  disabled,
  width,
  loading,
  searchValue,
  onSearchChange,
  style,
  "aria-label": ariaLabel,
}: MultiSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const query = searchValue ?? localQuery;
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((o) => matchesOption(o, needle));
  }, [options, query]);

  // The list can shrink while open (search, remote paging), so clamp instead of
  // letting the highlight point past the end.
  const active = shown.length === 0 ? -1 : Math.min(highlight, shown.length - 1);

  useEffect(() => {
    if (!open) return;
    optionRefs.current.get(active)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const contentWidth =
    triggerEl && triggerEl.offsetWidth > MIN_CONTENT_WIDTH
      ? triggerEl.offsetWidth
      : MIN_CONTENT_WIDTH;

  function setOpenState(next: boolean) {
    setOpen(next);
    if (!next) {
      setLocalQuery("");
      onSearchChange?.("");
    }
  }

  function setQuery(value: string) {
    if (onSearchChange) onSearchChange(value);
    else setLocalQuery(value);
  }

  function toggleValue(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }

  function moveHighlight(delta: number) {
    if (shown.length === 0) return;
    setHighlight((prev) => {
      const from = Math.min(prev, shown.length - 1);
      for (let step = 1; step <= shown.length; step++) {
        const next = (from + delta * step + shown.length) % shown.length;
        if (!shown[next]?.disabled) return next;
      }
      return from;
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
      return;
    }
    const isSpace = e.key === " ";
    // Space has to type a space in the search box.
    if (!isSpace && e.key !== "Enter") return;
    const option = shown[active];
    if (!option || option.disabled) return;
    // preventDefault also suppresses the browser's own button activation, so a
    // focused option is not toggled twice.
    e.preventDefault();
    toggleValue(option.value);
  }

  const selected = values.length > 0;
  const first =
    values.length === 1 ? options.find((o) => o.value === values[0]) : undefined;
  const triggerText = !selected
    ? placeholder
    : values.length === 1
      ? (first?.label ?? values[0])
      : `${values.length} selected`;

  return (
    <Popover
      open={open}
      onOpenChange={setOpenState}
      width={contentWidth}
      aria-label={ariaLabel ?? placeholder}
      style={{
        padding: 0,
        overflow: "hidden",
        maxHeight: "var(--radix-popper-available-height)",
        ...style,
      }}
      trigger={({ ref }) => (
        <button
          type="button"
          ref={ref}
          className="input ui-select-trigger"
          disabled={disabled}
          style={width ? { maxWidth: width } : undefined}
        >
          <span
            className="ui-select-value"
            data-placeholder={selected ? undefined : ""}
          >
            {values.length > 1 ? (
              <span className="ui-ms-trigger-count">{triggerText}</span>
            ) : (
              triggerText
            )}
          </span>
          <span className="ui-select-chevron">
            <ChevronDown size={15} />
          </span>
        </button>
      )}
    >
      {/* Escape / outside-click dismissal and focus restoration are Radix's job. */}
      <div
        onKeyDown={onKeyDown}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {searchable ? (
          <div className="ui-ms-search">
            <input
              ref={searchRef}
              value={query}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-label="Filter options"
              aria-activedescendant={
                active >= 0 ? `${listId}-option-${active}` : undefined
              }
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
            />
          </div>
        ) : null}
        <div
          id={listId}
          className="ui-ms-list"
          role="listbox"
          aria-multiselectable="true"
          style={{ flex: "1 1 auto", minHeight: 0 }}
        >
          {loading ? (
            <div className="ui-ms-empty" style={{ minHeight: 48 }}>
              <Spinner size={18} />
            </div>
          ) : (
            <>
              {shown.map((o, idx) => {
                const isSelected = values.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    id={`${listId}-option-${idx}`}
                    aria-selected={isSelected}
                    disabled={o.disabled}
                    className="ui-ms-option"
                    data-highlighted={idx === active ? "" : undefined}
                    data-selected={isSelected ? "" : undefined}
                    ref={(node) => {
                      if (node) optionRefs.current.set(idx, node);
                      else optionRefs.current.delete(idx);
                    }}
                    onMouseMove={() => setHighlight(idx)}
                    onClick={() => toggleValue(o.value)}
                  >
                    <span
                      className="ui-ms-check"
                      data-checked={isSelected ? "" : undefined}
                      aria-hidden="true"
                    >
                      {isSelected ? <Check size={11} strokeWidth={3} /> : null}
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
                      {o.label}
                      {o.sub ? (
                        <span className="ui-select-sub"> ({o.sub})</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {shown.length === 0 ? (
                <div className="ui-ms-empty">{emptyText}</div>
              ) : null}
            </>
          )}
        </div>
        {selected ? (
          <div className="ui-ms-footer">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "4px 10px", fontSize: 12, fontWeight: 500 }}
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>
    </Popover>
  );
}