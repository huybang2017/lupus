import type { ReactNode } from "react";
import { priceListStatus, type StatusColor } from "@/shared/pricing/price-list";

const DOT: Record<StatusColor, string> = {
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f59e0b",
  grey: "#9ca3af",
};

/** Lupus's StatusCell: a coloured square and the label, plain text in a table. */
export function StatusCell({ color, children }: { color: StatusColor; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: DOT[color], flexShrink: 0 }} />
      {children}
    </span>
  );
}

/** Lupus's StatusBadge: the same dot inside a pill (detail page headers). */
export function StatusBadge({ color, children }: { color: StatusColor; children: ReactNode }) {
  return (
    <span className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: DOT[color], flexShrink: 0 }} />
      {children}
    </span>
  );
}

export function PriceListStatusCell({ row }: { row: any }) {
  const { color, text } = priceListStatus(row);
  return <StatusCell color={color}>{text}</StatusCell>;
}

/** "Price Overrides" column: the number of price rows, or a dash when there are none. */
export function PriceCountCell({ row }: { row: any }) {
  const n = Number(row.price_count ?? 0);
  return <span>{n > 0 ? n : <span style={{ color: "var(--fg-muted)" }}>-</span>}</span>;
}
