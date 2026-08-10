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
