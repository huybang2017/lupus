import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TableBulkBar, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { FormActions, FormDrawer, TextAreaField, TextField, ToggleField, toggleInList } from "@/widgets/form";
import { StatusBadge } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { ProductsPickerPage } from "@/pages/resource/products-picker-page";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

const LIST = "/settings/sales-channels";

// Lupus sales channel detail: general (status), the products it publishes (search, bulk remove,
// add), metadata.
export function SalesChannelDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<any>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "metadata">(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const products = useServerList<any>("/admin/products", { page, limit: 10, q, params: { sales_channel_id: id } });

  function load() {
    api<{ sales_channel: any }>(`/admin/sales-channels/${id}`)
      .then((d) => {
        setChannel(d.sales_channel);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api<{ store: any }>("/admin/store")
      .then((d) => setIsDefault(d.store?.default_sales_channel_id === id))
      .catch(() => undefined);
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the sales channel ${channel.name}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: channel.name,
    });
    if (!ok) return;
    try {
      await api(`/admin/sales-channels/${id}`, { method: "DELETE" });
      navigate(LIST, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(ids: string[], title?: string) {
    const ok = await confirm({
      title: "Are you sure?",
      description: title
        ? `You are about to remove the product ${title} from the sales channel. This action cannot be undone.`
        : `You are about to remove ${ids.length} ${ids.length === 1 ? "product" : "products"} from the sales channel. This action cannot be undone.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await api(`/admin/sales-channels/${id}/products`, { method: "POST", body: { remove: ids } });
      setSelected([]);
      products.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const saved = () => {
    setDrawer(null);
    load();
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to={LIST} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Sales Channels
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{channel?.name ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!channel && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {channel ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={channel.name}
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge color={channel.is_disabled ? "grey" : "green"}>{channel.is_disabled ? "Disabled" : "Enabled"}</StatusBadge>
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setDrawer("edit") },
                    { label: "Delete", danger: true, disabled: isDefault, hint: "Cannot delete the default sales channel", onClick: () => void del() },
                  ]}
                />
              </div>
            }
          >
            <KV rows={[["Description", channel.description || "-"]]} />
          </DetailSection>

          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Products</h2>
              <RowMenu items={[{ label: "Add", onClick: () => navigate(`${LIST}/${id}/add-products`) }]} />
            </div>
            <TableToolbar
              style={{ padding: "0 24px 12px", borderBottom: "none" }}
              right={<TableSearch value={draft} onChange={setDraft} onSubmit={() => { setQ(draft.trim()); setPage(1); }} width={220} placeholder="Search" />}
            />
            {selected.length > 0 ? (
              <TableBulkBar count={selected.length}>
                <button className="btn btn-secondary" onClick={() => void remove(selected)}>
                  Remove
                </button>
              </TableBulkBar>
            ) : null}
            <DataTable
              columns={PRODUCT_TABLE_COLS}
              rows={products.items}
              loading={products.loading}
              error={products.error}
              selectable
              selected={selected}
              onToggleRow={(pid) => setSelected((s) => toggleInList(s, pid))}
              onToggleAll={(checked) => setSelected(checked ? products.items.map((p: any) => p.id) : [])}
              rowActions={(p: any) => [{ label: "Remove", danger: true, onClick: () => void remove([p.id], p.title) }]}
              emptyTitle={q ? "No results found" : "No records"}
              emptyHint={q ? "No products match your search." : "There are no records to show"}
            />
            <TablePager page={page} limit={10} count={products.count} onPage={setPage} />
          </section>

          <MetadataSection metadata={channel.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={channel} />
        </div>
      ) : null}

      {channel && drawer === "edit" ? <EditSalesChannelDrawer channel={channel} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {channel && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={channel.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (metadata) => {
            await api(`/admin/sales-channels/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}

// Lupus "Edit Sales Channel": name, description and whether the channel is enabled.
export function EditSalesChannelDrawer({ channel, onClose, onSaved }: { channel: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState<string>(channel.name ?? "");
  const [description, setDescription] = useState<string>(channel.description ?? "");
  const [enabled, setEnabled] = useState(!channel.is_disabled);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameError = name.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (nameError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/sales-channels/${channel.id}`, {
        method: "POST",
        body: { name: name.trim(), description: description.trim() || null, is_disabled: !enabled },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Sales Channel" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
      <TextAreaField label="Description" optional rows={3} value={description} onChange={setDescription} />
      <ToggleField title="Enabled" hint="Disabled sales channels are not available for new orders." checked={enabled} onChange={setEnabled} switchSide="right" />
    </FormDrawer>
  );
}

// Lupus "Add products to sales channel": the shared products picker, products already published here locked.
export function SalesChannelAddProductsPage() {
  const { id = "" } = useParams<{ id: string }>();
  return (
    <ProductsPickerPage
      back={`${LIST}/${id}`}
      belongsParam="sales_channel_id"
      belongsId={id}
      onSave={(ids) => api(`/admin/sales-channels/${id}/products`, { method: "POST", body: { add: ids } })}
    />
  );
}
