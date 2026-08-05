import { useEffect, useRef, useState } from "react";
import { api } from "@/shared/api/client";

export interface RemoteOption {
  value: string;
  label: string;
}

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 4px 2px 9px",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: "18px",
  color: "var(--fg-base)",
  background: "var(--hover-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: 6,
} as const;

// Searchable select whose options come from an endpoint returning
// { values: [{ value, label }], count } (Lupus's rule-value-options shape).
// `multiple` shows chips; single mode shows the chosen label and closes on pick.
export function RemoteSelect(props: {
  path: string;
  multiple: boolean;
  value: string[];
  labels: Record<string, string>;
  onChange: (values: string[], labels: Record<string, string>) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Extra query string appended to every request (e.g. a fixed filter). */
  query?: string;
}) {
  const { path, multiple, value, labels, onChange, placeholder, disabled, invalid, query } = props;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<RemoteOption[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function fetchPage(offset: number, q: string) {
    setLoading(true);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const url = `${path}${sep}limit=30&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ""}${query ? `&${query}` : ""}`;
      const d: any = await api(url);
      const values: RemoteOption[] = d?.values ?? [];
      setOptions((cur) => (offset === 0 ? values : [...cur, ...values]));
      setCount(Number(d?.count ?? values.length));
    } catch {
      if (offset === 0) setOptions([]);
    } finally {
      setLoading(false);
    }
  }

  // reload when opened, and (debounced) while typing
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void fetchPage(0, text.trim()), text ? 200 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, path, query]);

  function pick(o: RemoteOption) {
    const nextLabels = { ...labels, [o.value]: o.label };
    if (multiple) {
      onChange(value.includes(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value], nextLabels);
      setText("");
    } else {
      onChange([o.value], nextLabels);
      setText("");
      setOpen(false);
    }
  }

  const label = (v: string) => labels[v] ?? v;
  const border = invalid ? "#ef4444" : open ? "var(--fg-interactive)" : "var(--field-border)";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          (ref.current?.querySelector("input") as HTMLInputElement | null)?.focus();
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          minHeight: 36,
          padding: "3px 28px 3px 8px",
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.55 : 1,
          background: "var(--field-bg)",
          border: `1px solid ${border}`,
          borderRadius: 8,
        }}
      >
        {multiple
          ? value.map((v) => (
              <span key={v} style={chipStyle}>
                {label(v)}
                <button
                  type="button"
                  aria-label={`Remove ${label(v)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((x) => x !== v), labels);
                  }}
                  style={{ width: 16, height: 16, fontSize: 10, border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-subtle)", padding: 0 }}
                >
                  ✕
                </button>
              </span>
            ))
          : value[0] && !open
            ? <span style={{ fontSize: 13, color: "var(--fg-base)", padding: "0 4px" }}>{label(value[0])}</span>
            : null}
        <input
          value={text}
          disabled={disabled}
          placeholder={value.length === 0 || (!multiple && open) ? placeholder : ""}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && text === "" && multiple && value.length > 0) onChange(value.slice(0, -1), labels);
            if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          style={{
            flex: 1,
            minWidth: 70,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg-base)",
            fontSize: 13,
            padding: "4px 4px",
          }}
        />
      </div>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--fg-muted)", pointerEvents: "none" }}>⌄</span>
      {open && !disabled ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 30,
            left: 0,
            right: 0,
            top: "calc(100% + 6px)",
            maxHeight: 260,
            overflowY: "auto",
            padding: 4,
            background: "var(--card-bg, var(--field-bg))",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "8px 10px", color: "var(--fg-muted)" }}>{loading ? "Loading…" : "No results"}</div>
          ) : null}
          {options.map((o) => {
            const on = value.includes(o.value);
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={on}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", cursor: "pointer", borderRadius: 6, color: "var(--fg-base)", background: on ? "var(--hover-bg)" : "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = on ? "var(--hover-bg)" : "transparent")}
              >
                <span>{o.label}</span>
                {on ? <span style={{ color: "var(--fg-interactive)" }}>✓</span> : null}
              </div>
            );
          })}
          {options.length > 0 && options.length < count ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                void fetchPage(options.length, text.trim());
              }}
              style={{ width: "100%", padding: "8px 10px", border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-subtle)", fontSize: 12 }}
            >
              {loading ? "Loading…" : `Load more (${count - options.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
