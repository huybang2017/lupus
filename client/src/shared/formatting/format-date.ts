// "Oct 3, 2026" - the date format Lupus shows in list columns. Dashes for a missing value.
export function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
