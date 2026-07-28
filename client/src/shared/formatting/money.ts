// Amounts are stored in minor units (cents); Lupus lists show them with the currency symbol.
export function fmtMoney(v: unknown, currency?: string | null): string {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const code = String(currency || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${code}`;
  }
}
