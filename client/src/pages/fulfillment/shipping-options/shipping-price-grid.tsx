import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Drawer } from "@/widgets/ui/primitives";
import { usePriceCurrencies } from "@/shared/hooks/use-price-currencies";

// Prices of a flat-rate shipping option, the way Lupus edits them: one row, one column per
// currency and per region. A cell holds the plain price; the tier button opens "conditional
// prices" - other prices that apply when the cart item total is within a range.

export interface Cond {
  amount: string;
  gte: string;
  lte: string;
}
export interface PriceState {
  currency: Record<string, string>;
  region: Record<string, string>;
  condCurrency: Record<string, Cond[]>;
  condRegion: Record<string, Cond[]>;
  /** Prices with rules the dashboard cannot manage (eq / gt / lt): carried through untouched. */
  custom: any[];
}
export const emptyPrices = (): PriceState => ({ currency: {}, region: {}, condCurrency: {}, condRegion: {}, custom: [] });

const whole = (v: string) => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= 0;
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function condError(list: Cond[] | undefined): string | undefined {
  const seen = new Set<string>();
  for (const c of list ?? []) {
    if (c.amount.trim() === "") return "Shipping option price is required";
    if (!whole(c.amount)) return "Shipping option price must be a whole number of 0 or more";
    if (c.gte.trim() === "" && c.lte.trim() === "") return "At least one of minimum or maximum cart item total must be provided";
    if ((c.gte.trim() !== "" && !whole(c.gte)) || (c.lte.trim() !== "" && !whole(c.lte))) return "Cart item totals must be whole numbers of 0 or more";
    if (c.gte.trim() !== "" && c.lte.trim() !== "" && Number(c.gte) > Number(c.lte)) return "Minimum cart item total must be less than or equal to maximum cart item total";
    const key = `${c.gte.trim()}|${c.lte.trim()}`;
    if (seen.has(key)) return "Conditions must be unique across all price rules";
    seen.add(key);
  }
  return undefined;
}

/** First problem in the whole state (blocks Save). */
export function priceStateError(s: PriceState): string | undefined {
  for (const v of [...Object.values(s.currency), ...Object.values(s.region)]) {
    if (v.trim() !== "" && !whole(v)) return "Prices must be whole numbers of 0 or more";
  }
  for (const list of [...Object.values(s.condCurrency), ...Object.values(s.condRegion)]) {
    const e = condError(list);
    if (e) return e;
  }
  return undefined;
}

export function pricesToPayload(s: PriceState) {
  const out: any[] = [];
  const rules = (c: Cond) => [
    ...(c.gte.trim() !== "" ? [{ attribute: "item_total", operator: "gte", value: num(c.gte) }] : []),
    ...(c.lte.trim() !== "" ? [{ attribute: "item_total", operator: "lte", value: num(c.lte) }] : []),
  ];
  for (const [code, v] of Object.entries(s.currency)) if (v.trim() !== "") out.push({ currency_code: code, amount: Number(v) });
  for (const [id, v] of Object.entries(s.region)) if (v.trim() !== "") out.push({ region_id: id, amount: Number(v) });
  for (const [code, list] of Object.entries(s.condCurrency)) for (const c of list) out.push({ currency_code: code, amount: Number(c.amount), rules: rules(c) });
  for (const [id, list] of Object.entries(s.condRegion)) for (const c of list) out.push({ region_id: id, amount: Number(c.amount), rules: rules(c) });
  return [...out, ...s.custom];
}

/** An option's stored prices -> the grid model. */
export function pricesFromOption(prices: any[]): PriceState {
  const s = emptyPrices();
  for (const p of prices ?? []) {
    const rules: any[] = p.rules ?? [];
    const key = p.region_id ?? String(p.currency_code).toLowerCase();
    const bucket = p.region_id ? "region" : "currency";
    if (rules.length === 0) {
      s[bucket][key] = String(p.amount);
      continue;
    }
    if (rules.every((r) => r.attribute === "item_total" && (r.operator === "gte" || r.operator === "lte"))) {
      const cond: Cond = {
        amount: String(p.amount),
        gte: String(rules.find((r) => r.operator === "gte")?.value ?? ""),
        lte: String(rules.find((r) => r.operator === "lte")?.value ?? ""),
      };
      const cb = p.region_id ? s.condRegion : s.condCurrency;
      (cb[key] ??= []).push(cond);
      continue;
    }
    s.custom.push({ ...(p.region_id ? { region_id: p.region_id } : { currency_code: p.currency_code }), amount: Number(p.amount), rules });
  }
  return s;
}

function ConditionalDrawer({
  title,
  list,
  onSave,
  onClose,
}: {
  title: string;
  list: Cond[];
  onSave: (list: Cond[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Cond[]>(list);
  const [show, setShow] = useState(false);
  const err = condError(rows);
  const set = (i: number, patch: Partial<Cond>) => setRows((s) => s.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  return (
    <Drawer
      title={title}
      subtitle="Manage the conditional prices for this shipping option based on the cart item total."
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
              onSave(rows);
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ border: "1px solid var(--card-border)", borderRadius: 12, padding: 12, background: "var(--hover-bg)", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-subtle)" }}>
              <span>
                {r.gte.trim() !== "" && r.lte.trim() !== ""
                  ? `If Cart item total is between ${r.gte} and ${r.lte}`
                  : r.gte.trim() !== ""
                    ? `If Cart item total ≥ ${r.gte}`
                    : r.lte.trim() !== ""
                      ? `If Cart item total ≤ ${r.lte}`
                      : "Cart item total"}
              </span>
              <button
                type="button"
                aria-label="Remove price"
                onClick={() => setRows((s) => s.filter((_, x) => x !== i))}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)" }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(
                [
                  ["amount", "Shipping option price"],
                  ["gte", "Minimum cart item total"],
                  ["lte", "Maximum cart item total"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} style={{ fontSize: 12, color: "var(--fg-subtle)", display: "grid", gap: 4 }}>
                  {label}
                  <input className="input" type="number" min={0} step={1} value={r[k]} onChange={(e) => set(i, { [k]: e.target.value })} />
                </label>
              ))}
            </div>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => setRows((s) => [...s, { amount: "", gte: "", lte: "" }])}>
            Add price
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

export function useRegions(): { regions: { id: string; name: string; currency_code: string }[]; loading: boolean } {
  const [regions, setRegions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api("/admin/regions?limit=100&offset=0")
      .then((d) => alive && setRegions(parseList(d, 100).items))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { regions, loading };
}

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

export function ShippingPriceGrid({
  name,
  value,
  onChange,
  showErrors,
  prefillZero,
}: {
  name: string;
  value: PriceState;
  onChange: (next: PriceState) => void;
  showErrors?: boolean;
  /** Pickup options are free by default: every empty cell starts at 0. */
  prefillZero?: boolean;
}) {
  const { currencies, loading: lc } = usePriceCurrencies();
  const { regions, loading: lr } = useRegions();
  const [editing, setEditing] = useState<null | { kind: "currency" | "region"; key: string; label: string }>(null);

  useEffect(() => {
    if (!prefillZero || lc || lr) return;
    const next = { ...value, currency: { ...value.currency }, region: { ...value.region } };
    for (const c of currencies) if (next.currency[c.toLowerCase()] === undefined) next.currency[c.toLowerCase()] = "0";
    for (const r of regions) if (next.region[r.id] === undefined) next.region[r.id] = "0";
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillZero, lc, lr, currencies.length, regions.length]);

  if (lc || lr) return <div style={{ padding: 24, fontSize: 13, color: "var(--fg-subtle)" }}>Loading…</div>;

  const columns: { kind: "currency" | "region"; key: string; head: string }[] = [
    ...currencies.map((c) => ({ kind: "currency" as const, key: c.toLowerCase(), head: `Price ${c}` })),
    ...regions.map((r) => ({ kind: "region" as const, key: r.id, head: `Price ${r.name} (${String(r.currency_code).toUpperCase()})` })),
  ];
  const template = `minmax(200px, 1.2fr) ${columns.map(() => "minmax(170px, 1fr)").join(" ")}`;
  const bad = showErrors ? priceStateError(value) : undefined;

  const read = (kind: "currency" | "region", key: string) => value[kind][key] ?? "";
  const conds = (kind: "currency" | "region", key: string) => (kind === "currency" ? value.condCurrency[key] : value.condRegion[key]) ?? [];

  return (
    <div>
      {bad ? (
        <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: "#ef4444" }}>
          {bad}
        </div>
      ) : null}
      <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, overflow: "auto" }}>
        <div style={{ minWidth: 200 + columns.length * 170 }}>
          <div style={{ display: "grid", gridTemplateColumns: template, background: "var(--hover-bg)", fontSize: 12, fontWeight: 600, color: "var(--fg-subtle)" }}>
            <div style={{ padding: "8px 12px" }}>Name</div>
            {columns.map((c) => (
              <div key={`${c.kind}-${c.key}`} style={{ padding: "8px 12px", borderLeft: "1px solid var(--card-border)" }}>
                {c.head}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: template, borderTop: "1px solid var(--card-border)", fontSize: 13 }}>
            <div style={{ padding: "9px 12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
              {name || "-"}
            </div>
            {columns.map((c) => {
              const n = conds(c.kind, c.key).length;
              const v = read(c.kind, c.key);
              const invalid = v.trim() !== "" && !whole(v);
              return (
                <div
                  key={`${c.kind}-${c.key}`}
                  style={{ borderLeft: "1px solid var(--card-border)", display: "flex", alignItems: "center", background: invalid ? "rgba(239,68,68,0.12)" : "transparent" }}
                >
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    aria-label={c.head}
                    aria-invalid={invalid}
                    value={v}
                    onChange={(e) => onChange({ ...value, [c.kind]: { ...value[c.kind], [c.key]: e.target.value } })}
                    style={cellInput}
                  />
                  <button
                    type="button"
                    title="Manage conditional prices"
                    aria-label={`Conditional prices for ${c.head}`}
                    onClick={() => setEditing({ kind: c.kind, key: c.key, label: c.head })}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: n > 0 ? "var(--fg-interactive)" : "var(--fg-muted)", fontSize: 12, padding: "0 10px", whiteSpace: "nowrap" }}
                  >
                    {n > 0 ? `+${n}` : "▤"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {editing ? (
        <ConditionalDrawer
          title={`Conditional Prices for ${name || "option"} · ${editing.label}`}
          list={conds(editing.kind, editing.key)}
          onClose={() => setEditing(null)}
          onSave={(list) => {
            const field = editing.kind === "currency" ? "condCurrency" : "condRegion";
            onChange({ ...value, [field]: { ...value[field], [editing.key]: list } });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
