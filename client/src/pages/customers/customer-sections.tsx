import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { listAll } from "@/shared/api/list-all";
import { Alert } from "@/widgets/ui/primitives";
import { DetailSection } from "@/widgets/detail/detail-section";
import {
  DataTable,
  TablePager,
  TableSearch,
  TableToolbar,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import type { TableColumn } from "@/widgets/table";
import { FilterBar, useLocalFilters } from "@/widgets/filters";
import { selectFilter, textFilter } from "@/widgets/filters/filter-defs";
import type { FilterDef } from "@/shared/filters/list-filters";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";

const PAGE_SIZE = 10;

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

const PAYMENT: Record<string, { label: string; color: string }> = {
  not_paid: { label: "Not paid", color: "#ef4444" },
  awaiting: { label: "Awaiting", color: "#f59e0b" },
  authorized: { label: "Authorized", color: "#f59e0b" },
  partially_authorized: { label: "Partially authorized", color: "#f59e0b" },
  captured: { label: "Captured", color: "#22c55e" },
  completed: { label: "Captured", color: "#22c55e" },
  partially_captured: { label: "Partially captured", color: "#22c55e" },
  refunded: { label: "Refunded", color: "#9ca3af" },
  partially_refunded: { label: "Partially refunded", color: "#9ca3af" },
  canceled: { label: "Canceled", color: "#9ca3af" },
  requires_action: { label: "Requires action", color: "#f59e0b" },
};
const FULFILLMENT: Record<string, { label: string; color: string }> = {
  not_fulfilled: { label: "Not fulfilled", color: "#ef4444" },
  fulfilled: { label: "Fulfilled", color: "#f59e0b" },
  shipped: { label: "Shipped", color: "#22c55e" },
  delivered: { label: "Delivered", color: "#22c55e" },
};

const statusDot = (map: Record<string, { label: string; color: string }>, key?: string | null) => {
  if (!key) return <span style={{ color: "var(--fg-muted)" }}>-</span>;
  const hit = map[key] ?? { label: key.replace(/_/g, " "), color: "#9ca3af" };
  return <Dot color={hit.color} label={hit.label} />;
};

const ORDER_FILTERS: FilterDef[] = [
  selectFilter(
    "payment_status",
    "Payment status",
    Object.entries(PAYMENT).map(([value, v]) => ({ value, label: v.label })),
    { accessor: (row: any) => row?.payment_status },
  ),
  selectFilter(
    "fulfillment_status",
    "Fulfillment status",
    Object.entries(FULFILLMENT).map(([value, v]) => ({ value, label: v.label })),
    { accessor: (row: any) => row?.fulfillment_status },
  ),
];

function sortRows<T>(rows: T[], sort: string, get: Record<string, (r: T) => number | string>): T[] {
  const key = sort.replace(/^-/, "");
  const fn = get[key];
  if (!fn) return rows;
  const dir = sort.startsWith("-") ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = fn(a);
    const y = fn(b);
    return x < y ? -dir : x > y ? dir : 0;
  });
}

// Lupus customer "Orders" table: Order / Date / Sales Channel / Payment / Fulfillment /
// Order Total, with search, filters and sorting. The customer's orders come from the server
// (customer_id filter), not from a slice of the latest 100 orders.
export function CustomerOrdersSection({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState("-created_at");

  useEffect(() => {
    setLoading(true);
    listAll(`/admin/orders?customer_id=${encodeURIComponent(customerId)}`)
      .then(setOrders)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [customerId]);

  const { draft, setDraft, submit, filtered: searched } = useTableSearch(
    orders,
    (o: any, needle: string) =>
      !needle || `${o.display_id ?? ""} ${o.id ?? ""} ${o.email ?? ""}`.toLowerCase().includes(needle),
  );
  const filters = useLocalFilters(searched, ORDER_FILTERS);
  const sorted = useMemo(
    () =>
      sortRows(filters.rows, sort, {
        display_id: (o: any) => Number(o.display_id ?? 0),
        created_at: (o: any) => String(o.created_at ?? ""),
        total: (o: any) => Number(o.total ?? 0),
      }),
    [filters.rows, sort],
  );
  const { page, setPage, limit, pageRows } = useTablePaging(sorted, { limit: PAGE_SIZE, resetKey: customerId });

  const columns: TableColumn[] = [
    {
      key: "order",
      label: "Order",
      sortKey: "display_id",
      render: (o: any) => (
        <Link
          to={`/r/orders/${o.id}`}
          style={{ color: "var(--fg-base)", textDecoration: "none", fontWeight: 500 }}
        >
          #{o.display_id ?? o.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortKey: "created_at",
      render: (o: any) =>
        o.created_at
          ? new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "-",
    },
    { key: "channel", label: "Sales Channel", render: (o: any) => o.sales_channel_name ?? "-" },
    { key: "payment", label: "Payment", render: (o: any) => statusDot(PAYMENT, o.payment_status) },
    { key: "fulfillment", label: "Fulfillment", render: (o: any) => statusDot(FULFILLMENT, o.fulfillment_status) },
    {
      key: "total",
      label: "Order Total",
      sortKey: "total",
      align: "right",
      render: (o: any) =>
        o.total != null
          ? `${Number(o.total).toLocaleString()} ${String(o.currency_code ?? "").toUpperCase()}`.trim()
          : "-",
    },
  ];

  const filtering = !!draft || filters.count > 0;
  return (
    <DetailSection title="Orders">
      {err ? <Alert>{err}</Alert> : null}
      <TableToolbar
        left={<FilterBar defs={ORDER_FILTERS} filters={filters} />}
        right={
          <TableSearch
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              submit();
              setPage(1);
            }}
            width={220}
            placeholder="Search"
          />
        }
      />
      <DataTable
        columns={columns}
        rows={pageRows}
        loading={loading}
        sort={sort}
        onSort={(next) => setSort(next || "-created_at")}
        rowActions={(o: any) => [{ label: "View", onClick: () => navigate(`/r/orders/${o.id}`) }]}
        emptyTitle={filtering ? "No results found" : "No records"}
        emptyHint={filtering ? "No orders match your search or filters." : "There are no records to show"}
      />
      {sorted.length > 0 ? (
        <TablePager page={page} limit={limit} count={sorted.length} onPage={setPage} />
      ) : null}
    </DetailSection>
  );
}

const GROUP_FILTERS: FilterDef[] = [textFilter("name", "Name", { accessor: (row: any) => row?.name })];

// Lupus customer "Customer Groups" table: select column, Name, Customers (member count),
// row menu (Edit / Remove), and a bulk Remove for the ticked rows.
export function CustomerGroupsSection({
  customer,
  onChanged,
}: {
  customer: any;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups: any[] = customer.groups ?? [];
  const groupKey = groups.map((g) => g.id).join(",");

  useEffect(() => {
    listAll("/admin/customer-groups")
      .then((all: any[]) => {
        const m: Record<string, number> = {};
        for (const g of all) m[g.id] = Number(g.customers_count ?? 0);
        setCounts(m);
      })
      .catch(() => {});
    setSelected([]);
  }, [groupKey]);

  const { draft, setDraft, submit, filtered: searched } = useTableSearch(
    groups,
    (g: any, needle: string) => !needle || String(g.name ?? "").toLowerCase().includes(needle),
  );
  const filters = useLocalFilters(searched, GROUP_FILTERS);
  const sorted = useMemo(
    () =>
      sortRows(filters.rows, sort, {
        name: (g: any) => String(g.name ?? "").toLowerCase(),
        customers: (g: any) => counts[g.id] ?? 0,
      }),
    [filters.rows, sort, counts],
  );
  const { page, setPage, limit, pageRows } = useTablePaging(sorted, { limit: PAGE_SIZE, resetKey: customer.id });

  async function remove(ids: string[]) {
    const names = groups.filter((g) => ids.includes(g.id)).map((g) => g.name);
    const ok = await requestConfirm({
      title: "Are you sure?",
      description:
        ids.length === 1
          ? `You are about to remove the customer from the group ${names[0]}. This action cannot be undone.`
          : `You are about to remove the customer from the groups ${names.join(", ")}. This action cannot be undone.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/customers/${customer.id}/customer-groups`, {
        method: "POST",
        body: { remove: ids },
      });
      setSelected([]);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const columns: TableColumn[] = [
    {
      key: "name",
      label: "Name",
      sortKey: "name",
      render: (g: any) => (
        <Link
          to={`/r/customer-groups/${g.id}`}
          style={{ color: "var(--fg-base)", textDecoration: "none", fontWeight: 500 }}
        >
          {g.name}
        </Link>
      ),
    },
    {
      key: "customers",
      label: "Customers",
      sortKey: "customers",
      render: (g: any) => (counts[g.id] != null ? counts[g.id].toLocaleString() : "-"),
    },
  ];

  const filtering = !!draft || filters.count > 0;
  return (
    <DetailSection
      title="Customer Groups"
      action={
        <button
          className="btn btn-secondary"
          onClick={() => navigate(`/r/customers/${customer.id}/add-customer-groups`)}
        >
          Add
        </button>
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      <TableToolbar
        left={<FilterBar defs={GROUP_FILTERS} filters={filters} />}
        right={
          <TableSearch
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              submit();
              setPage(1);
            }}
            width={220}
            placeholder="Search"
          />
        }
      />
      {selected.length > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            borderBottom: "1px solid var(--card-border)",
            background: "var(--hover-bg)",
            fontSize: 13,
          }}
        >
          <span>{selected.length} selected</span>
          <button className="btn btn-danger" disabled={busy} onClick={() => void remove(selected)}>
            Remove
          </button>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={pageRows}
        selectable
        selected={selected}
        onToggleRow={(gid) => setSelected((s) => (s.includes(gid) ? s.filter((x) => x !== gid) : [...s, gid]))}
        onToggleAll={(checked) => {
          const ids = pageRows.map((g: any) => g.id);
          setSelected((s) => (checked ? [...new Set([...s, ...ids])] : s.filter((x) => !ids.includes(x))));
        }}
        sort={sort}
        onSort={setSort}
        rowActions={(g: any) => [
          { label: "Edit", onClick: () => navigate(`/r/customer-groups/${g.id}`) },
          { label: "Remove", danger: true, onClick: () => void remove([g.id]) },
        ]}
        emptyTitle={filtering ? "No results found" : "No records"}
        emptyHint={filtering ? "No groups match your search or filters." : "This customer doesn't belong to any group."}
      />
      {sorted.length > 0 ? (
        <TablePager page={page} limit={limit} count={sorted.length} onPage={setPage} />
      ) : null}
    </DetailSection>
  );
}
