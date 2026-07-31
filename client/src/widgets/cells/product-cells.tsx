import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TableColumn } from "@/widgets/table";

// Cell renderers for the Products list (Lupus: Product / Collection / Sales channels /
// Variants / Status columns).

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  published: { label: "Published", color: "#22c55e" },
  draft: { label: "Draft", color: "#9ca3af" },
  proposed: { label: "Proposed", color: "#f59e0b" },
  rejected: { label: "Rejected", color: "#ef4444" },
};

export function StatusDot({ status }: { status?: string }): ReactNode {
  const s = STATUS_STYLE[String(status ?? "")] ?? {
    label: String(status ?? "-"),
    color: "#9ca3af",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

export function ProductTitleCell({ row, to }: { row: any; to: string }): ReactNode {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        color: "var(--fg-base)",
        textDecoration: "none",
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 32,
          height: 40,
          borderRadius: 4,
          overflow: "hidden",
          flexShrink: 0,
          background: "var(--hover-bg)",
          border: "1px solid var(--card-border)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--fg-muted)",
          fontSize: 12,
        }}
      >
        {row.thumbnail ? (
          <img src={row.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          "▣"
        )}
      </span>
      <span>{row.title}</span>
    </Link>
  );
}

export function SalesChannelsCell({ row }: { row: any }): ReactNode {
  const list: { name: string }[] = row.sales_channels ?? [];
  if (list.length === 0) return <span style={{ color: "var(--fg-muted)" }}>-</span>;
  const rest = list.length - 1;
  return (
    <span title={list.map((c) => c.name).join(", ")}>
      {list[0].name}
      {rest > 0 ? <span style={{ color: "var(--fg-subtle)" }}> +{rest} more</span> : null}
    </span>
  );
}

export function VariantsCell({ row }: { row: any }): ReactNode {
  const n = (row.variants ?? []).length;
  return n === 0 ? (
    <span style={{ color: "var(--fg-muted)" }}>-</span>
  ) : (
    <span>
      {n} {n === 1 ? "variant" : "variants"}
    </span>
  );
}

export function CollectionCell({ row }: { row: any }): ReactNode {
  return row.collection?.title ? (
    <span>{row.collection.title}</span>
  ) : (
    <span style={{ color: "var(--fg-muted)" }}>-</span>
  );
}

/** Product / Collection / Sales Channels / Variants / Status — the table Lupus shows in category pickers. */
export const PRODUCT_TABLE_COLS: TableColumn[] = [
  { key: "product", label: "Product", render: (p: any) => <ProductTitleCell row={p} to={`/r/products/${p.id}`} /> },
  { key: "collection", label: "Collection", render: (p: any) => <CollectionCell row={p} /> },
  { key: "sales_channels", label: "Sales Channels", render: (p: any) => <SalesChannelsCell row={p} /> },
  { key: "variants", label: "Variants", render: (p: any) => <VariantsCell row={p} /> },
  { key: "status", label: "Status", render: (p: any) => <StatusDot status={p.status} /> },
];
