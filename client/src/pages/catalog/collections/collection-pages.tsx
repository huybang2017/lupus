import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TableBulkBar, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { FormDrawer, TextField, toggleInList } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { ProductsPickerPage } from "@/pages/resource/products-picker-page";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

const LIST = "/r/collections";

// Lupus "Edit Collection": title and handle.
export function EditCollectionDrawer({ collection, onClose, onSaved }: { collection: any; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState<string>(collection.title ?? "");
  const [handle, setHandle] = useState<string>(collection.handle ?? "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titleError = title.trim() === "" ? REQUIRED : undefined;
  const handleError = handle.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (titleError || handleError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/collections/${collection.id}`, { method: "POST", body: { title: title.trim(), handle: handle.trim() } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Collection" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Title" value={title} onChange={setTitle} error={show ? titleError : undefined} />
      <TextField label="Handle" hint="The handle is the URL slug of the collection." value={handle} onChange={setHandle} error={show ? handleError : undefined} />
    </FormDrawer>
  );
}

// Lupus collection detail: general, its products (search, add, remove), metadata.
export function CollectionDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [collection, setCollection] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "metadata">(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const products = useServerList<any>("/admin/products", { page, limit: 10, q, params: { collection_id: id } });

  function load() {
    api<{ collection: any }>(`/admin/collections/${id}`)
      .then((d) => {
        setCollection(d.collection);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the collection ${collection.title}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: collection.title,
    });
    if (!ok) return;
    try {
      await api(`/admin/collections/${id}`, { method: "DELETE" });
      navigate(LIST, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(ids: string[], title?: string) {
    const ok = await confirm({
      title: "Are you sure?",
      description: title
        ? `You are about to remove the product ${title} from the collection. This action cannot be undone.`
        : `You are about to remove ${ids.length} ${ids.length === 1 ? "product" : "products"} from the collection. This action cannot be undone.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await api(`/admin/collections/${id}/products`, { method: "POST", body: { remove: ids } });
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
          Collections
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{collection?.title ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!collection && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {collection ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={collection.title}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setDrawer("edit") },
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            }
          >
            <KV rows={[["Handle", <span key="h" className="mono">/{collection.handle}</span>]]} />
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

          <MetadataSection metadata={collection.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={collection} />
        </div>
      ) : null}
      {collection && drawer === "edit" ? <EditCollectionDrawer collection={collection} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {collection && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={collection.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (metadata) => {
            await api(`/admin/collections/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}

export function CollectionAddProductsPage() {
  const { id = "" } = useParams<{ id: string }>();
  return (
    <ProductsPickerPage
      back={`${LIST}/${id}`}
      belongsParam="collection_id"
      belongsId={id}
      onSave={(ids) => api(`/admin/collections/${id}/products`, { method: "POST", body: { add: ids } })}
    />
  );
}
