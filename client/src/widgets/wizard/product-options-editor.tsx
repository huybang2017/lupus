import { useEffect, useRef, useState } from "react";

export interface OptionRow {
  name: string;
  values: string[];
}

export interface ExistingOption {
  title: string;
  values: string[];
}

const lower = (s: string) => s.trim().toLowerCase();

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--fg-base)",
};
const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--fg-subtle)",
  marginTop: 2,
  marginBottom: 10,
};

function Chip(props: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
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
      }}
    >
      {props.label}
      <button
        type="button"
        aria-label={`Remove ${props.label}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove();
        }}
        style={{
          width: 16,
          height: 16,
          lineHeight: "14px",
          fontSize: 10,
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          background: "transparent",
          color: "var(--fg-subtle)",
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-border)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        ✕
      </button>
    </span>
  );
}

// Chip multi-select with a searchable dropdown and inline "Create" — the same
// control Lupus uses for both "Product options" and each option's "Values".
export function MultiCombobox(props: {
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  allowCreate?: boolean;
}) {
  const { values, onChange, suggestions, placeholder, allowCreate = true } = props;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const taken = values.map(lower);
  const q = lower(text);
  const available = suggestions.filter((s) => !taken.includes(lower(s)));
  const matches = available.filter((s) => lower(s).includes(q));
  const exact = available.find((s) => lower(s) === q);
  const canCreate = allowCreate && q !== "" && !exact && !taken.includes(q);

  function add(v: string) {
    const t = v.trim();
    if (!t || taken.includes(lower(t))) return;
    onChange([...values, t]);
    setText("");
  }

  function commit(raw: string) {
    const t = raw.trim();
    if (!t) return;
    const hit = available.find((s) => lower(s) === lower(t));
    if (hit) add(hit);
    else if (allowCreate) add(t);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          minHeight: 40,
          padding: "5px 30px 5px 8px",
          cursor: "text",
          background: "var(--field-bg)",
          border: `1px solid ${focused ? "var(--fg-interactive)" : "var(--field-border)"}`,
          borderRadius: 8,
          boxShadow: focused ? "0 0 0 3px rgba(99,102,241,.15)" : "none",
          transition: "border-color .15s, box-shadow .15s",
        }}
        onClick={(e) => {
          (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus();
        }}
      >
        {values.map((v) => (
          <Chip key={v} label={v} onRemove={() => onChange(values.filter((x) => x !== v))} />
        ))}
        <input
          value={text}
          placeholder={values.length === 0 ? placeholder : ""}
          onFocus={() => {
            setOpen(true);
            setFocused(true);
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) {
              // add every comma-separated part in one update (a per-part onChange
              // would each start from the same stale `values` and drop all but one)
              const next = [...values];
              for (const part of v.split(",")) {
                const t = part.trim();
                if (!t) continue;
                const known = available.find((x) => lower(x) === lower(t));
                const hit = known ?? (allowCreate ? t : undefined);
                if (hit && !next.map(lower).includes(lower(hit))) next.push(hit);
              }
              onChange(next);
              setText("");
            } else {
              setText(v);
              setOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
            } else if (e.key === "Backspace" && text === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            } else if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          style={{
            flex: 1,
            minWidth: 90,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg-base)",
            fontSize: 14,
            padding: "4px 4px",
          }}
        />
      </div>
      <span
        style={{
          position: "absolute",
          right: 11,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 10,
          color: "var(--fg-muted)",
          pointerEvents: "none",
        }}
      >
        ⌄
      </span>
      {open && (matches.length > 0 || q !== "") ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            top: "calc(100% + 6px)",
            maxHeight: 240,
            overflowY: "auto",
            padding: 4,
            background: "var(--card-bg, var(--field-bg))",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          {matches.length === 0 && !canCreate ? (
            <div style={{ padding: "8px 10px", color: "var(--fg-muted)" }}>No results</div>
          ) : null}
          {matches.map((m) => (
            <div
              key={m}
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                add(m);
              }}
              style={{ padding: "8px 10px", cursor: "pointer", borderRadius: 6, color: "var(--fg-base)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {m}
            </div>
          ))}
          {canCreate ? (
            <div
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                add(text);
              }}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                borderRadius: 6,
                display: "flex",
                gap: 8,
                color: "var(--fg-base)",
                borderTop: matches.length ? "1px solid var(--card-border)" : "none",
                marginTop: matches.length ? 4 : 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>+</span>
              <span>Create "{text.trim()}"</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProductOptionsEditor(props: {
  options: OptionRow[];
  onChange: (o: OptionRow[]) => void;
  existing: ExistingOption[];
}) {
  const { options, onChange, existing } = props;

  // Picking an option that already exists pre-fills all of its known values
  // (Lupus behaviour); a brand-new option starts with no values.
  function setNames(names: string[]) {
    onChange(
      names.map((n) => {
        const kept = options.find((o) => o.name === n);
        if (kept) return kept;
        const known = existing.find((e) => lower(e.title) === lower(n));
        return { name: known?.title ?? n, values: known ? [...known.values] : [] };
      }),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={titleStyle}>Product options</div>
        <div style={hintStyle}>Define the options for the product, e.g. color, size, etc.</div>
        <MultiCombobox
          values={options.map((o) => o.name)}
          onChange={setNames}
          suggestions={existing.map((e) => e.title)}
          placeholder="Select or create options"
        />
      </div>

      {options.length > 0 ? (
        <div>
          <div style={titleStyle}>Values</div>
          <div style={hintStyle}>Select which values to use for each option</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {options.map((o, i) => {
              const known = existing.find((e) => lower(e.title) === lower(o.name));
              return (
                <div key={o.name}>
                  <div
                    style={{
                      ...titleStyle,
                      fontSize: 12,
                      marginBottom: 6,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{o.name}</span>
                    {o.values.length === 0 ? (
                      <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>
                        No values yet — this option is ignored until you add one
                      </span>
                    ) : null}
                  </div>
                  <MultiCombobox
                    values={o.values}
                    onChange={(v) =>
                      onChange(options.map((x, j) => (j === i ? { ...x, values: v } : x)))
                    }
                    suggestions={known?.values ?? []}
                    placeholder="Red, Blue, Green"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface RankedVariant {
  key: string;
  title: string;
  options: Record<string, string>;
}

export function VariantRanking(props: {
  variants: RankedVariant[];
  columns: string[];
  excluded: Record<string, boolean>;
  onToggle: (key: string) => void;
  onToggleAll: (include: boolean) => void;
  onMove: (fromKey: string, toKey: string) => void;
}) {
  const { variants, columns, excluded, onToggle, onToggleAll, onMove } = props;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const includedCount = variants.filter((v) => !excluded[v.key]).length;
  const allIncluded = variants.length > 0 && includedCount === variants.length;
  const grid = `20px 14px repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`;

  const cell: React.CSSProperties = { fontSize: 12, color: "var(--fg-base)" };

  return (
    <div>
      <div style={titleStyle}>Product variants</div>
      <div style={hintStyle}>This ranking will affect the variants' order in your storefront.</div>
      {variants.length === 0 ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "12px 14px",
            fontSize: 13,
            color: "var(--fg-base)",
            background: "var(--field-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 8,
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>ⓘ</span>
          <span style={{ fontWeight: 500 }}>Add options to create variants.</span>
        </div>
      ) : (
        <>
          <div
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--field-bg)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                alignItems: "center",
                gap: 14,
                padding: "11px 14px",
                ...cell,
                color: "var(--fg-subtle)",
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={allIncluded}
                ref={(el) => {
                  if (el) el.indeterminate = includedCount > 0 && !allIncluded;
                }}
                onChange={() => onToggleAll(!allIncluded)}
                aria-label="Select all variants"
              />
              <span />
              {columns.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            {variants.map((v) => {
              const off = !!excluded[v.key];
              const dropTarget = overKey === v.key && dragKey && dragKey !== v.key;
              return (
                <div
                  key={v.key}
                  draggable
                  onDragStart={() => setDragKey(v.key)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverKey(v.key);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  onDrop={() => {
                    if (dragKey && dragKey !== v.key) onMove(dragKey, v.key);
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: grid,
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 14px",
                    ...cell,
                    borderTop: "1px solid var(--card-border)",
                    boxShadow: dropTarget ? "inset 0 2px 0 var(--fg-interactive)" : "none",
                    opacity: dragKey === v.key ? 0.4 : off ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={() => onToggle(v.key)}
                    aria-label={`Include ${v.title}`}
                  />
                  <span
                    title="Drag to reorder"
                    style={{ cursor: "grab", color: "var(--fg-muted)", userSelect: "none", fontSize: 13 }}
                  >
                    ⠿
                  </span>
                  {columns.map((c) => (
                    <span key={c}>{v.options[c] ?? ""}</span>
                  ))}
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 16,
              padding: "12px 14px",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--fg-subtle)",
              background: "var(--field-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 8,
            }}
          >
            <span style={{ width: 2, borderRadius: 2, background: "var(--fg-muted)", flexShrink: 0 }} />
            <span>
              <strong style={{ color: "var(--fg-base)" }}>Tip:</strong> Variants left unchecked won't be
              created. You can always create and edit variants afterwards but this list fits the
              variations in your product options.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
