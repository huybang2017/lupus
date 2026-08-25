import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { priceListStatus } from "@/shared/pricing/price-list";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TableBulkBar, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { StatusBadge } from "@/widgets/cells/status-pill";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { useConfirm } from "@/widgets/confirm";
import { EditConfigurationDrawer, EditPriceListDrawer } from "@/pages/pricing/price-lists/price-list-drawers";

const dateText = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "-";

const PAGE = 10;

// Lupus price list detail: general section, products section (with edit prices / add products),
// and the configuration card (customer groups + dates) beside them.
export function PriceListDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "configuration" | "metadata">(null);

  function load() {
    setErr(null);
    api<{ price_list: any }>(`/admin/price-lists/${id}`)
      .then((d) => setList(d.price_list))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the price list ${list?.title}. This action cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api(`/admin/price-lists/${id}`, { method: "DELETE" });
      navigate("/r/price-lists", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const status = list ? priceListStatus(list) : null;
  const groups: string[] = (list?.customer_groups ?? []).map((g: any) => g.name ?? g.id);
  const saved = () => {
    setDrawer(null);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Link to="/r/price-lists" style={{ color: "var(--fg-subtle)", textDecoration: "none", fontSize: 13 }}>
          Price Lists
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{list?.title ?? id}</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!list && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {list && status ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <DetailSection
              title={list.title}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge color={status.color}>{status.text}</StatusBadge>
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setDrawer("edit") },
                      { label: "Delete", danger: true, onClick: del },
                    ]}
                  />
                </div>
              }
            >
              <KV
                rows={[
                  ["Type", list.type === "sale" ? "Sale" : "Override"],
                  ["Description", list.description || "-"],
                  ["Price Overrides", list.price_count > 0 ? String(list.price_count) : "-"],
                ]}
              />
            </DetailSection>

            <ProductsSection listId={id} onChanged={load} />

            <MetadataSection metadata={list.metadata} onEdit={() => setDrawer("metadata")} />
            <JsonSection data={list} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <DetailSection
              title="Configuration"
              action={<RowMenu items={[{ label: "Edit", onClick: () => setDrawer("configuration") }]} />}
            >
              {groups.length > 0 ? (
                <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 10 }}>
                  Customer Groups · {groups[0]}
                  {groups.length > 1 ? ` + ${groups.length - 1} more` : ""}
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(
                  [
                    ["Start", list.starts_at, "var(--fg-muted)"],
                    ["End", list.ends_at, "#f59e0b"],
                  ] as const
                ).map(([label, at, color]) => (
                  <div key={label} className="card" style={{ padding: "10px 12px", borderLeft: `2px solid ${color}` }}>
                    <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{dateText(at)}</div>
                  </div>
                ))}
              </div>
            </DetailSection>
          </div>
        </div>
      ) : null}

      {list && drawer === "edit" ? <EditPriceListDrawer list={list} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {list && drawer === "configuration" ? (
        <EditConfigurationDrawer list={list} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {list && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={list.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (metadata) => {
            await api(`/admin/price-lists/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}

// Products that carry at least one override in this list; edit prices for one or several of them,
// or take them out of the list (their overrides are deleted).
function ProductsSection({ listId, onChanged }: { listId: string; onChanged: () => void }) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error, reload } = useServerList<any>("/admin/products", {
    page,
    limit: PAGE,
    q,
    params: { price_list_id: listId },
  });

  useEffect(() => {
    setSelected([]);
  }, [page, q, listId]);

  const editUrl = (ids: string[]) => `/r/price-lists/${listId}/products/edit?ids[]=${ids.join(",")}`;

  async function remove(ids: string[]) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to remove the prices of ${ids.length} ${ids.length === 1 ? "product" : "products"} from this price list. This action cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setErr(null);
    try {
      await api(`/admin/price-lists/${listId}/products`, { method: "POST", body: { remove: ids } });
      setSelected([]);
      reload();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Products</h2>
        <RowMenu
          items={[
            { label: "Add products", onClick: () => navigate(`/r/price-lists/${listId}/products/add`) },
            { label: "Edit prices", onClick: () => navigate(`/r/price-lists/${listId}/products/edit`) },
          ]}
        />
      </div>
      <TableToolbar
        style={{ padding: "0 24px 12px", borderBottom: "none" }}
        right={
          <TableSearch
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              setQ(draft.trim());
              setPage(1);
            }}
            width={220}
            placeholder="Search"
          />
        }
      />
      {err ? (
        <div style={{ padding: "0 24px 12px" }}>
          <Alert>{err}</Alert>
        </div>
      ) : null}
      {selected.length > 0 ? (
        <TableBulkBar count={selected.length}>
          <button className="btn btn-secondary" onClick={() => navigate(editUrl(selected))}>
            Edit
          </button>
          <button className="btn btn-secondary" onClick={() => void remove(selected)}>
            Delete
          </button>
        </TableBulkBar>
      ) : null}
      <DataTable
        columns={PRODUCT_TABLE_COLS}
        rows={items}
        loading={loading}
        error={error}
        selectable
        selected={selected}
        onToggleRow={(pid) => setSelected((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]))}
        onToggleAll={(checked) => setSelected(checked ? items.map((p) => p.id) : [])}
        rowActions={(p) => [
          { label: "Edit prices", onClick: () => navigate(editUrl([p.id])) },
          { label: "Remove", danger: true, onClick: () => void remove([p.id]) },
        ]}
        emptyTitle={q ? "No results found" : "No records"}
        emptyHint={q ? "No products match your search." : "There are no records to show"}
      />
      <TablePager page={page} limit={PAGE} count={count} onPage={setPage} />
    </section>
  );
}
