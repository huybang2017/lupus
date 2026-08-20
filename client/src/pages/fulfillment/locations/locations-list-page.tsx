import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert } from "@/widgets/ui/primitives";
import { DataTable, TablePager, TableSearch } from "@/widgets/table";
import { StatusCell } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { EditLocationDrawer } from "@/pages/fulfillment/locations/location-drawers";
import { formatAddress, summarize } from "@/pages/fulfillment/locations/location-utils";

const PAGE = 20;

const dash = <span style={{ color: "var(--fg-muted)" }}>-</span>;

function ConfigRow({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid var(--card-border)",
        borderRadius: 8,
        textDecoration: "none",
        color: "var(--fg-base)",
      }}
    >
      <span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--fg-subtle)" }}>{hint}</span>
      </span>
      <span aria-hidden style={{ color: "var(--fg-muted)" }}>
        ›
      </span>
    </Link>
  );
}

// Lupus "Locations & Shipping": the stock location table plus the Shipping Configuration card
// (shipping profiles / shipping option types) beside it.
export function LocationsListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error, reload } = useServerList<any>("/admin/stock-locations", { page, limit: PAGE, q });

  async function remove(row: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the stock location "${row.name}". This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: row.name,
    });
    if (!ok) return;
    setErr(null);
    try {
      await api(`/admin/stock-locations/${row.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const enabled = (row: any, type: string) => (
    <StatusCell color={(row.fulfillment_sets ?? []).some((f: any) => f.type === type) ? "green" : "grey"}>
      {(row.fulfillment_sets ?? []).some((f: any) => f.type === type) ? "Enabled" : "Disabled"}
    </StatusCell>
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>Settings › Locations</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Locations & Shipping</h1>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>
                Manage your store&apos;s stock locations and shipping options.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TableSearch
                value={draft}
                onChange={setDraft}
                onSubmit={() => {
                  setQ(draft.trim());
                  setPage(1);
                }}
                width={200}
                placeholder="Search"
              />
              <button className="btn btn-primary" onClick={() => navigate("/settings/stock-locations/create")}>
                Create
              </button>
            </div>
          </div>
          {err ? (
            <div style={{ padding: "0 20px 12px" }}>
              <Alert>{err}</Alert>
            </div>
          ) : null}
          <DataTable
            columns={[
              {
                key: "name",
                label: "Name",
                render: (r: any) => (
                  <Link to={`/settings/stock-locations/${r.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                    {r.name}
                  </Link>
                ),
              },
              { key: "address", label: "Address", render: (r: any) => formatAddress(r.address) || dash },
              { key: "shipping", label: "Shipping", render: (r: any) => enabled(r, "shipping") },
              { key: "pickup", label: "Pickup", render: (r: any) => enabled(r, "pickup") },
              {
                key: "channels",
                label: "Connected sales channels",
                render: (r: any) =>
                  (r.sales_channels ?? []).length > 0 ? summarize(r.sales_channels.map((c: any) => c.name)) : dash,
              },
            ]}
            rows={items}
            loading={loading}
            error={error}
            rowActions={(r: any) => [
              { label: "Edit", onClick: () => setEditing(r) },
              { label: "Delete", danger: true, onClick: () => void remove(r) },
            ]}
            emptyTitle={q ? "No results found" : "No records"}
            emptyHint={q ? "No locations found matching the filters" : "No locations found"}
          />
          <TablePager page={page} limit={PAGE} count={count} onPage={setPage} />
        </section>

        <section className="card" style={{ padding: "20px 24px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>Shipping Configuration</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ConfigRow to="/settings/shipping-profiles" title="Shipping Profiles" hint="Group products by shipping requirements" />
            <ConfigRow to="/settings/shipping-option-types" title="Shipping Option Types" hint="Group shipping options by types" />
          </div>
        </section>
      </div>

      {editing ? (
        <EditLocationDrawer
          location={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
