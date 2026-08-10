import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ToggleField } from "@/widgets/form";

export function CardToggle(props: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--field-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: 8,
      }}
    >
      <ToggleField {...props} />
    </div>
  );
}

export interface ChannelRow {
  id: string;
  name: string;
  description?: string | null;
  is_disabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

const PAGE_SIZE = 10;

function fmtDate(v?: string): string {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--field-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: 8,
  color: "var(--fg-subtle)",
  cursor: "pointer",
  fontSize: 14,
};

// Full-screen picker (Lupus's stacked focus modal): searchable, paginated table with
// row checkboxes; the selection is staged and only applied on Save.
export function SalesChannelPicker(props: {
  rows: ChannelRow[];
  selected: string[];
  onCancel: () => void;
  onSave: (ids: string[]) => void;
}) {
  const { rows, selected, onCancel, onSave } = props;
  const [staged, setStaged] = useState<string[]>(selected);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (status === "enabled" && r.is_disabled) return false;
      if (status === "disabled" && !r.is_disabled) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.description ?? "").toLowerCase().includes(needle)
      );
    });
    if (sortDir) {
      list = [...list].sort((a, b) =>
        sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
      );
    }
    return list;
  }, [rows, q, status, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const allVisible = visible.length > 0 && visible.every((r) => staged.includes(r.id));
  const someVisible = visible.some((r) => staged.includes(r.id));

  const toggle = (id: string) =>
    setStaged((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setStaged((s) =>
      allVisible
        ? s.filter((id) => !visible.some((r) => r.id === id))
        : [...new Set([...s, ...visible.map((r) => r.id)])],
    );

  const th: React.CSSProperties = {
    padding: "0 16px",
    height: 48,
    textAlign: "left",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--fg-subtle)",
  };
  const td: React.CSSProperties = {
    padding: "0 16px",
    height: 48,
    fontSize: 13,
    color: "var(--fg-base)",
    borderTop: "1px solid var(--card-border)",
  };

  return createPortal(
    <div
      data-stacked-modal
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,.55)",
        padding: 8,
        display: "flex",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 20px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            title="Close (esc)"
            style={{ ...iconBtn, border: "none", background: "none" }}
          >
            ✕
          </button>
          <span className="kbd">esc</span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            padding: "16px 24px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <div ref={filterRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Filter"
              style={{ ...iconBtn, color: status !== "all" ? "var(--fg-interactive)" : undefined }}
              onClick={() => setFilterOpen((o) => !o)}
            >
              ⛉
            </button>
            {filterOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 5,
                  minWidth: 200,
                  padding: 12,
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  fontSize: 13,
                  boxShadow: "0 10px 30px rgba(0,0,0,.35)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Status</div>
                {(["all", "enabled", "disabled"] as const).map((s) => (
                  <label key={s} className="checkrow" style={{ textTransform: "capitalize" }}>
                    <input
                      type="radio"
                      name="sc-status"
                      checked={status === s}
                      onChange={() => {
                        setStatus(s);
                        setPage(0);
                      }}
                    />
                    {s}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Sort by name"
            title={sortDir ? `Name ${sortDir === "asc" ? "A-Z" : "Z-A"}` : "Sort"}
            style={{ ...iconBtn, color: sortDir ? "var(--fg-interactive)" : undefined }}
            onClick={() => setSortDir((d) => (d === null ? "asc" : d === "asc" ? "desc" : null))}
          >
            ⇅
          </button>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fg-muted)",
                pointerEvents: "none",
              }}
            >
              ⌕
            </span>
            <input
              className="input"
              placeholder="Search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              style={{ width: 220, height: 32, paddingLeft: 30 }}
              autoFocus
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 56 }}>
                  <input
                    type="checkbox"
                    checked={allVisible}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisible && !allVisible;
                    }}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th style={th}>Name</th>
                <th style={th}>Description</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={staged.includes(r.id)}
                      onChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${r.name}`}
                    />
                  </td>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, color: "var(--fg-subtle)" }}>{r.description || "-"}</td>
                  <td style={td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 2,
                          background: r.is_disabled ? "#9ca3af" : "#22c55e",
                        }}
                      />
                      {r.is_disabled ? "Disabled" : "Enabled"}
                    </span>
                  </td>
                  <td style={td}>{fmtDate(r.created_at)}</td>
                  <td style={td}>{fmtDate(r.updated_at)}</td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--fg-muted)", height: 120 }}>
                    No sales channels found
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 24px",
            borderTop: "1px solid var(--card-border)",
            fontSize: 13,
            color: "var(--fg-subtle)",
          }}
        >
          <span>
            {filtered.length === 0 ? 0 : cur * PAGE_SIZE + 1} —{" "}
            {Math.min((cur + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} results
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
            <span>
              {cur + 1} of {pages} pages
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={cur === 0}
              onClick={() => setPage(cur - 1)}
            >
              Prev
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={cur >= pages - 1}
              onClick={() => setPage(cur + 1)}
            >
              Next
            </button>
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 24px",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(staged)}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SalesChannelsField(props: {
  rows: ChannelRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { rows, selected, onChange } = props;
  const [open, setOpen] = useState(false);
  const label = (id: string) => rows.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-base)" }}>
            Sales channels{" "}
            <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>(Optional)</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 2 }}>
            This product will only be available in the default sales channel if left untouched.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setOpen(true)}
        >
          Add
        </button>
      </div>

      {selected.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 14 }}>
          {selected.map((id) => (
            <span
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-base)",
                background: "var(--field-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: 6,
              }}
            >
              {label(id)}
              <button
                type="button"
                aria-label={`Remove ${label(id)}`}
                onClick={() => onChange(selected.filter((x) => x !== id))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-subtle)", padding: 0 }}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-subtle)", fontSize: 13 }}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {open ? (
        <SalesChannelPicker
          rows={rows}
          selected={selected}
          onCancel={() => setOpen(false)}
          onSave={(ids) => {
            onChange(ids);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
