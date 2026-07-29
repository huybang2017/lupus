// Price list helpers shared by the list, create, detail and price-editing pages.
// Mirrors Lupus's `getPriceListStatus` and the way its price grid reads/writes prices.

export type StatusColor = "green" | "red" | "orange" | "grey";

export interface PriceListLike {
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

/** Scheduled and expired both beat draft, exactly like Lupus's status pill. */
export function priceListStatus(l: PriceListLike, now = new Date()): { color: StatusColor; text: string } {
  const scheduled = l.starts_at ? new Date(l.starts_at) > now : false;
  const expired = l.ends_at ? new Date(l.ends_at) < now : false;
  if (scheduled) return { color: "orange", text: "Scheduled" };
  if (expired) return { color: "red", text: "Expired" };
  if (l.status === "draft") return { color: "grey", text: "Draft" };
  return { color: "green", text: "Active" };
}

/** One price row of a variant in one currency. Empty min/max means "no limit". */
export interface Tier {
  id?: string;
  amount: string;
  min: string;
  max: string;
}
/** variant id -> currency code (lower case) -> tiers */
export type PriceMap = Record<string, Record<string, Tier[]>>;

export const blankTier = (): Tier => ({ amount: "", min: "", max: "" });

/** The tier the grid cell edits: the one without a quantity range (created on demand). */
export function baseIndex(tiers: Tier[] | undefined): number {
  return (tiers ?? []).findIndex((t) => t.min.trim() === "" && t.max.trim() === "");
}

export function baseAmount(tiers: Tier[] | undefined): string {
  const i = baseIndex(tiers);
  return i >= 0 ? tiers![i].amount : "";
}

export function setBaseAmount(tiers: Tier[] | undefined, amount: string): Tier[] {
  const list = [...(tiers ?? [])];
  const i = baseIndex(list);
  if (i >= 0) list[i] = { ...list[i], amount };
  else list.unshift({ ...blankTier(), amount });
  // a cleared base cell with nothing else behind it leaves no row at all
  return list.filter((t) => t.amount.trim() !== "" || t.min.trim() !== "" || t.max.trim() !== "" || t.id);
}

/** Existing price rows (`GET /admin/price-lists/:id`) -> the grid's editable model. */
export function tiersFromPrices(prices: any[]): PriceMap {
  const map: PriceMap = {};
  for (const p of prices ?? []) {
    const cur = String(p.currency_code ?? "").toLowerCase();
    ((map[p.variant_id] ??= {})[cur] ??= []).push({
      id: p.id,
      amount: p.amount == null ? "" : String(p.amount),
      min: p.min_quantity == null ? "" : String(p.min_quantity),
      max: p.max_quantity == null ? "" : String(p.max_quantity),
    });
  }
  return map;
}

const whole = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 0;
const positive = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 1;

/** Validation message for one variant+currency cell, or undefined when it is fine. */
export function tiersError(tiers: Tier[] | undefined): string | undefined {
  const seen = new Set<string>();
  for (const t of tiers ?? []) {
    const hasRange = t.min.trim() !== "" || t.max.trim() !== "";
    if (t.amount.trim() === "") {
      if (hasRange) return "Enter an amount for every price tier";
      continue;
    }
    if (!whole(t.amount)) return "Amount must be a whole number of 0 or more";
    if (t.min.trim() !== "" && !positive(t.min)) return "Minimum quantity must be a whole number of at least 1";
    if (t.max.trim() !== "" && !positive(t.max)) return "Maximum quantity must be a whole number of at least 1";
    if (t.min.trim() !== "" && t.max.trim() !== "" && Number(t.min) > Number(t.max)) {
      return "Minimum quantity cannot be greater than the maximum quantity";
    }
    const key = `${t.min.trim()}|${t.max.trim()}`;
    if (seen.has(key)) return "Two price tiers cannot cover the same quantity range";
    seen.add(key);
  }
  return undefined;
}

/** First error in the whole map (used to block Save). */
export function priceMapError(map: PriceMap): string | undefined {
  for (const byCur of Object.values(map)) {
    for (const tiers of Object.values(byCur)) {
      const e = tiersError(tiers);
      if (e) return e;
    }
  }
  return undefined;
}

export interface PricePayload {
  variant_id: string;
  currency_code: string;
  amount: number;
  rules?: { min_quantity?: string; max_quantity?: string };
}

/** Rows with an amount become prices; a range goes under `rules` like Lupus's payload. */
export function pricesFromMap(map: PriceMap, variantIds?: string[]): PricePayload[] {
  const out: PricePayload[] = [];
  for (const [variant_id, byCur] of Object.entries(map)) {
    if (variantIds && !variantIds.includes(variant_id)) continue;
    for (const [currency_code, tiers] of Object.entries(byCur)) {
      for (const t of tiers) {
        if (t.amount.trim() === "") continue;
        const rules: PricePayload["rules"] = {};
        if (t.min.trim() !== "") rules.min_quantity = t.min.trim();
        if (t.max.trim() !== "") rules.max_quantity = t.max.trim();
        out.push({
          variant_id,
          currency_code,
          amount: Math.round(Number(t.amount)),
          ...(Object.keys(rules).length ? { rules } : {}),
        });
      }
    }
  }
  return out;
}

/** Create / update / delete sets that turn `before` into `after` (Lupus's `sortPrices`). */
export function diffPrices(before: PriceMap, after: PriceMap) {
  const toDelete: string[] = [];
  const toUpdate: any[] = [];
  const toCreate: any[] = [];
  const kept = new Set<string>();
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  for (const [variant_id, byCur] of Object.entries(after)) {
    for (const [currency_code, tiers] of Object.entries(byCur)) {
      for (const t of tiers) {
        if (t.amount.trim() === "") continue;
        if (t.id) {
          kept.add(t.id);
          const was = (before[variant_id]?.[currency_code] ?? []).find((x) => x.id === t.id);
          if (!was || was.amount !== t.amount || was.min !== t.min || was.max !== t.max) {
            toUpdate.push({
              id: t.id,
              amount: Math.round(Number(t.amount)),
              min_quantity: num(t.min),
              max_quantity: num(t.max),
            });
          }
        } else {
          toCreate.push({
            variant_id,
            currency_code,
            amount: Math.round(Number(t.amount)),
            min_quantity: num(t.min),
            max_quantity: num(t.max),
          });
        }
      }
    }
  }
  for (const byCur of Object.values(before)) {
    for (const tiers of Object.values(byCur)) {
      for (const t of tiers) if (t.id && !kept.has(t.id)) toDelete.push(t.id);
    }
  }
  return { toDelete, toUpdate, toCreate };
}
