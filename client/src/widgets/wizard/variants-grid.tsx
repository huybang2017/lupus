import { useEffect, useRef, useState } from "react";

export interface VariantEdit {
  title?: string;
  sku: string;
  manage: boolean;
  backorder: boolean;
  prices: Record<string, string>;
}

export const emptyVariantEdit: VariantEdit = {
  sku: "",
  manage: false,
  backorder: false,
  prices: {},
};

export interface GridRow {
  key: string;
  label: string;
  defaultTitle: string;
}

type ColId = "title" | "sku" | "manage" | "backorder" | `price:${string}`;

function currencySymbol(code: string): string {
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: code })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? code;
  } catch {
    return code;
  }
}

function Popover(props: {
  label: React.ReactNode;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen((o) => !o)}>
        {props.label}
      </button>
      {open ? (
        <div
          role="dialog"
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 6px)",
            [props.align === "right" ? "right" : "left"]: 0,
            minWidth: 240,
            padding: 12,
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

// Spreadsheet-style editor for the Variants step (Lupus's create-product data grid):
// one row per variant, editable cells, keyboard navigation, column visibility.
export function VariantsGrid(props: {
  rows: GridRow[];
  labelHeader: string | null;
  edits: Record<string, VariantEdit>;
  onEdit: (key: string, patch: Partial<VariantEdit>) => void;
  currencies: string[];
}) {
  const { rows, labelHeader, edits, onEdit, currencies } = props;
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const allCols: { id: ColId; label: string }[] = [
    { id: "title", label: "Title" },
    { id: "sku", label: "SKU" },
    { id: "manage", label: "Managed inventory" },
    { id: "backorder", label: "Allow backorder" },
    ...currencies.map((c) => ({ id: `price:${c}` as ColId, label: `Price ${c}` })),
  ];
  const cols = allCols.filter((c) => !hidden[c.id]);
  const get = (k: string) => edits[k] ?? emptyVariantEdit;

  function onKeyDown(e: React.KeyboardEvent<HTMLTableElement>) {
    const t = e.target as HTMLElement;
    const r = t.getAttribute("data-r");
    const c = t.getAttribute("data-c");
    if (r === null || c === null) return;
    const delta = e.key === "ArrowDown" || e.key === "Enter" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    const next = e.currentTarget.querySelector<HTMLElement>(
      `[data-r="${Number(r) + delta}"][data-c="${c}"]`,
    );
    if (next) {
      e.preventDefault();
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== "checkbox") next.select();
    }
  }

  const th: React.CSSProperties = {
    padding: "0 16px",
    height: 44,
    textAlign: "left",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--fg-subtle)",
    whiteSpace: "nowrap",
    background: "var(--card-bg)",
    position: "sticky",
    top: 0,
    zIndex: 2,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px" }}>
        <Popover label="☰ View">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Columns</div>
          {allCols.map((c) => (
            <label key={c.id} className="checkrow">
              <input
                type="checkbox"
                checked={!hidden[c.id]}
                onChange={() => setHidden((h) => ({ ...h, [c.id]: !h[c.id] }))}
              />
              {c.label}
            </label>
          ))}
        </Popover>
        <Popover label="Shortcuts" align="right">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Keyboard shortcuts</div>
          {[
            ["↑ / ↓", "Move to the cell above / below"],
            ["Enter", "Move to the cell below"],
            ["Tab", "Move to the next cell"],
            ["Space", "Toggle a checkbox"],
          ].map(([k, d]) => (
            <div
              key={k}
              style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "3px 0" }}
            >
              <span style={{ color: "var(--fg-subtle)" }}>{d}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </Popover>
      </div>

      <div style={{ overflowX: "auto", borderTop: "1px solid var(--card-border)" }}>
        <table className="vgrid" onKeyDown={onKeyDown}>
          <thead>
            <tr>
              {labelHeader ? (
                <th style={{ ...th, left: 0, zIndex: 3, minWidth: 150 }}>{labelHeader}</th>
              ) : null}
              {cols.map((c) => (
                <th
                  key={c.id}
                  style={{ ...th, minWidth: c.id === "manage" || c.id === "backorder" ? 140 : 150 }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const e = get(row.key);
              return (
                <tr key={row.key}>
                  {labelHeader ? (
                    <td className="vgrid-label" style={{ position: "sticky", left: 0 }}>
                      {row.label}
                    </td>
                  ) : null}
                  {cols.map((c) => {
                    if (c.id === "manage" || c.id === "backorder") {
                      const field = c.id === "manage" ? "manage" : "backorder";
                      return (
                        <td key={c.id} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            data-r={r}
                            data-c={c.id}
                            checked={e[field]}
                            onChange={(ev) => onEdit(row.key, { [field]: ev.target.checked })}
                            aria-label={`${c.label} for ${row.label || row.defaultTitle}`}
                          />
                        </td>
                      );
                    }
                    if (c.id === "title") {
                      return (
                        <td key={c.id}>
                          <input
                            data-r={r}
                            data-c={c.id}
                            value={e.title ?? row.defaultTitle}
                            onChange={(ev) => onEdit(row.key, { title: ev.target.value })}
                          />
                        </td>
                      );
                    }
                    if (c.id === "sku") {
                      return (
                        <td key={c.id}>
                          <input
                            data-r={r}
                            data-c={c.id}
                            value={e.sku}
                            onChange={(ev) => onEdit(row.key, { sku: ev.target.value })}
                          />
                        </td>
                      );
                    }
                    const cur = c.id.slice("price:".length);
                    return (
                      <td key={c.id} style={{ position: "relative" }}>
                        <span className="vgrid-sym">{currencySymbol(cur)}</span>
                        <input
                          type="number"
                          min={0}
                          data-r={r}
                          data-c={c.id}
                          style={{ paddingLeft: 36, textAlign: "right" }}
                          value={e.prices[cur] ?? ""}
                          onChange={(ev) =>
                            onEdit(row.key, { prices: { ...e.prices, [cur]: ev.target.value } })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
