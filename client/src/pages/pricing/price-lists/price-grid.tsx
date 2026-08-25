import { useState } from "react";
import { Drawer } from "@/widgets/ui/primitives";
import {
  baseAmount,
  blankTier,
  setBaseAmount,
  tiersError,
  type PriceMap,
  type Tier,
} from "@/shared/pricing/price-list";

const cellInput = {
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  background: "transparent",
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--fg-base)",
  outline: "none",
} as const;

/** Lupus's quantity pricing: several price tiers for one variant in one currency. */
function QuantityPriceDrawer({
  title,
  subtitle,
  tiers,
  onSave,
  onClose,
}: {
  title: string;
  subtitle: string;
  tiers: Tier[];
  onSave: (tiers: Tier[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Tier[]>(tiers.length ? tiers : [blankTier()]);
  const [show, setShow] = useState(false);
  const err = tiersError(rows);
  const set = (i: number, patch: Partial<Tier>) => setRows((s) => s.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  return (
    <Drawer
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (err) {
                setShow(true);
                return;
              }
              onSave(rows.filter((r) => r.amount.trim() !== "" || r.id));
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 8,
              background: "var(--hover-bg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
              <span>{r.min.trim() === "" && r.max.trim() === "" ? "Price" : "Price tier"}</span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove price tier"
                  onClick={() => setRows((s) => s.filter((_, x) => x !== i))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)" }}
                >
                  ✕
                </button>
              ) : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(
                [
                  ["amount", "Amount", "0"],
                  ["min", "Min. quantity", "No minimum"],
                  ["max", "Max. quantity", "No maximum"],
                ] as const
              ).map(([k, label, ph]) => (
                <label key={k} style={{ fontSize: 12, color: "var(--fg-subtle)", display: "grid", gap: 4 }}>
                  {label}
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={1}
                    placeholder={ph}
                    value={r[k]}
                    onChange={(e) => set(i, { [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => setRows((s) => [...s, blankTier()])}>
            Add price tier
          </button>
        </div>
        {show && err ? (
          <div role="alert" style={{ fontSize: 12, color: "#ef4444" }}>
            {err}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

/**
 * Lupus's price grid: products with their variants as sub rows, one editable column per
 * currency. A cell edits the variant's plain price; the tier button opens quantity pricing.
 */
export function PriceGrid({
  products,
  currencies,
  value,
  onChange,
  showErrors,
}: {
  products: any[];
  currencies: string[];
  value: PriceMap;
  onChange: (next: PriceMap) => void;
  showErrors?: boolean;
}) {
  const [editing, setEditing] = useState<{ variant: any; currency: string } | null>(null);
  const cols = `minmax(220px, 1.4fr) ${currencies.map(() => "minmax(150px, 1fr)").join(" ")}`;

  function put(variantId: string, cur: string, tiers: Tier[]) {
    const next: PriceMap = { ...value, [variantId]: { ...(value[variantId] ?? {}), [cur]: tiers } };
    onChange(next);
  }

  return (
    <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, overflow: "auto" }}>
      <div style={{ minWidth: 220 + currencies.length * 150 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            background: "var(--hover-bg)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--fg-subtle)",
            position: "sticky",
            top: 0,
          }}
        >
          <div style={{ padding: "8px 12px" }}>Title</div>
          {currencies.map((c) => (
            <div key={c} style={{ padding: "8px 12px", borderLeft: "1px solid var(--card-border)" }}>
              Price {c}
            </div>
          ))}
        </div>
        {products.map((p) => (
          <div key={p.id}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                borderTop: "1px solid var(--card-border)",
                background: "var(--hover-bg)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <div style={{ padding: "9px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.title}>
                {p.title}
              </div>
              {currencies.map((c) => (
                <div key={c} style={{ borderLeft: "1px solid var(--card-border)" }} />
              ))}
            </div>
            {(p.variants ?? []).map((v: any) => (
              <div
                key={v.id}
                style={{ display: "grid", gridTemplateColumns: cols, borderTop: "1px solid var(--card-border)", fontSize: 13 }}
              >
                <div
                  title={v.title ?? v.sku ?? v.id}
                  style={{ padding: "9px 12px 9px 28px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {v.title ?? v.sku ?? v.id}
                </div>
                {currencies.map((c) => {
                  const cur = c.toLowerCase();
                  const tiers = value[v.id]?.[cur];
                  const extra = (tiers ?? []).filter((t) => t.amount.trim() !== "").length - (baseAmount(tiers) !== "" ? 1 : 0);
                  const err = showErrors ? tiersError(tiers) : undefined;
                  return (
                    <div
                      key={c}
                      title={err}
                      style={{
                        borderLeft: "1px solid var(--card-border)",
                        display: "flex",
                        alignItems: "center",
                        background: err ? "rgba(239,68,68,0.12)" : "transparent",
                      }}
                    >
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0"
                        aria-label={`${v.title ?? v.id} price ${c}`}
                        aria-invalid={!!err}
                        value={baseAmount(tiers)}
                        onChange={(e) => put(v.id, cur, setBaseAmount(tiers, e.target.value))}
                        style={cellInput}
                      />
                      <button
                        type="button"
                        title="Quantity pricing"
                        aria-label={`Quantity pricing for ${v.title ?? v.id} ${c}`}
                        onClick={() => setEditing({ variant: v, currency: cur })}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: extra > 0 ? "var(--fg-interactive)" : "var(--fg-muted)",
                          fontSize: 12,
                          padding: "0 10px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {extra > 0 ? `+${extra}` : "▤"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {editing ? (
        <QuantityPriceDrawer
          title="Quantity pricing"
          subtitle={`${editing.variant.title ?? editing.variant.sku ?? editing.variant.id} · ${editing.currency.toUpperCase()}`}
          tiers={value[editing.variant.id]?.[editing.currency] ?? []}
          onClose={() => setEditing(null)}
          onSave={(tiers) => {
            put(editing.variant.id, editing.currency, tiers);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
