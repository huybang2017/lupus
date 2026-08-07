import { type CSSProperties, type JSX } from "react";
import type { DateRangeValue } from "@/shared/filters/list-filters";

// DateRangeValue lives in the pure filter module so URL parsing, chip labels
// and this field can never disagree on its shape.
export type { DateRangeValue };

export interface DateRangePreset {
  label: string;
  range: () => DateRangeValue;
}

export interface DateRangeFieldProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  presets?: DateRangePreset[];
  disabled?: boolean;
  style?: CSSProperties;
  width?: number | string;
  "aria-label"?: string;
}

/**
 * Local-time YYYY-MM-DD. toISOString() would convert to UTC first and silently
 * shift the day for anyone west of Greenwich.
 */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Lupus-style quick ranges, all resolved against the current date. */
export function dateRangePresets(): DateRangePreset[] {
  return [
    {
      label: "Today",
      range: () => {
        const now = new Date();
        const today = toISODate(now);
        return { from: today, to: today };
      },
    },
    {
      label: "Yesterday",
      range: () => {
        const day = toISODate(shiftDays(new Date(), -1));
        return { from: day, to: day };
      },
    },
    {
      label: "Last 7 days",
      range: () => {
        const now = new Date();
        return { from: toISODate(shiftDays(now, -6)), to: toISODate(now) };
      },
    },
    {
      label: "Last 30 days",
      range: () => {
        const now = new Date();
        return { from: toISODate(shiftDays(now, -29)), to: toISODate(now) };
      },
    },
    {
      label: "This month",
      range: () => {
        const now = new Date();
        return {
          from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
          to: toISODate(now),
        };
      },
    },
    {
      label: "Last month",
      range: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: toISODate(start), to: toISODate(end) };
      },
    },
    {
      label: "Year to date",
      range: () => {
        const now = new Date();
        return {
          from: toISODate(new Date(now.getFullYear(), 0, 1)),
          to: toISODate(now),
        };
      },
    },
  ];
}

// Array form so the comparison ignores key order.
function signature(value: DateRangeValue): string {
  return JSON.stringify([value.from ?? "", value.to ?? ""]);
}

export function DateRangeField({
  value,
  onChange,
  presets = dateRangePresets(),
  disabled,
  style,
  width,
  "aria-label": ariaLabel,
}: DateRangeFieldProps): JSX.Element {
  // Presets are re-resolved every render on purpose: resolving them once at
  // mount would let a long-lived tab drift across midnight.

  const setFrom = (from: string) =>
    onChange({ ...value, from: from || undefined });
  const setTo = (to: string) => onChange({ ...value, to: to || undefined });

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Date range"}
      style={{ width, ...style }}
    >
      {presets.length > 0 ? (
        <div className="ui-date-presets">
          {presets.map((p) => {
            const range = p.range();
            const isOn = signature(range) === signature(value);
            return (
              <button
                key={p.label}
                type="button"
                className="btn btn-secondary"
                aria-pressed={isOn}
                disabled={disabled}
                style={
                  isOn
                    ? {
                        borderColor: "var(--fg-interactive)",
                        color: "var(--fg-interactive)",
                      }
                    : undefined
                }
                onClick={() => onChange(isOn ? {} : range)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="ui-date-inputs">
        {/* No max-width: `.ui-date-inputs > *` already shares the row, so a cap
            would leave a dead sliver beside the inputs. */}
        <input
          type="date"
          className="input"
          aria-label="From"
          value={value.from ?? ""}
          disabled={disabled}
          max={value.to ?? undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="date"
          className="input"
          aria-label="To"
          value={value.to ?? ""}
          disabled={disabled}
          min={value.from ?? undefined}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
    </div>
  );
}