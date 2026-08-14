import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { FormActions, FormDrawer, FormSection, TextField } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

// Lupus Product Types and Product Tags share one shape: a unique value, the products that use it,
// metadata. The two kinds only differ in wording, paths and the product filter.
export type TaxonomyKind = "type" | "tag";

const KINDS = {
  type: {
    list: "/settings/product-types",
    api: "/admin/product-types",
    key: "product_type",
    plural: "Product Types",
    noun: "product type",
    title: "Product Type",
    filter: "type_id",
    createSubtitle: "Create a new product type to categorize your products.",
  },
  tag: {
    list: "/settings/product-tags",
    api: "/admin/product-tags",
    key: "product_tag",
    plural: "Product Tags",
    noun: "product tag",
    title: "Product Tag",
    filter: "tag_id",
    createSubtitle: "Create a new product tag to categorize your products.",
  },
} as const;

// ------------------------------------------------------------------ create

export function CreateTaxonomyPage({ kind }: { kind: TaxonomyKind }) {
  const k = KINDS[kind];
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valueError = value.trim() === "" ? REQUIRED : undefined;
  const leave = useLeaveGuard(value.trim() !== "", k.list, busy);

  async function save() {
    if (valueError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<Record<string, { id: string }>>(k.api, { method: "POST", body: { value: value.trim() } });
      navigate(`${k.list}/${res[k.key].id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo={k.list}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title={`Create ${k.title}`} subtitle={k.createSubtitle}>
        <TextField label="Value" value={value} onChange={setValue} error={show ? valueError : undefined} />
      </FormSection>
    </WizardShell>
  );
}

// ------------------------------------------------------------------ edit

export function EditTaxonomyDrawer({ kind, row, onClose, onSaved }: { kind: TaxonomyKind; row: any; onClose: () => void; onSaved: () => void }) {
  const k = KINDS[kind];
  const [value, setValue] = useState<string>(row.value ?? "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valueError = value.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (valueError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`${k.api}/${row.id}`, { method: "POST", body: { value: value.trim() } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title={`Edit ${k.title}`} onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Value" value={value} onChange={setValue} error={show ? valueError : undefined} />
    </FormDrawer>
  );
}

// ------------------------------------------------------------------ detail

// The products that carry this type / tag (Lupus filters /admin/products by type_id / tag_id).
function ProductsSection({ kind, id }: { kind: TaxonomyKind; id: string }) {
  const k = KINDS[kind];
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState("");
  const { items, count, loading, error } = useServerList<any>("/admin/products", { page, limit: 10, q, params: { [k.filter]: id, order: order || undefined } });
  const columns = PRODUCT_TABLE_COLS.map((c) => (c.key === "product" ? { ...c, sortKey: "title" } : c));

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 24px" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Products</h2>
      </div>
      <TableToolbar
        style={{ padding: "0 24px 12px", borderBottom: "none" }}
        right={<TableSearch value={draft} onChange={setDraft} onSubmit={() => { setQ(draft.trim()); setPage(1); }} width={220} placeholder="Search" />}
      />
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        error={error}
        sort={order}
        onSort={(next) => { setOrder(next); setPage(1); }}
        emptyTitle={q ? "No results found" : "No records"}
        emptyHint={q ? "Try adjusting your search." : "There are no records to show"}
      />
      <TablePager page={page} limit={10} count={count} onPage={setPage} />
    </section>
  );
}

export function TaxonomyDetailPage({ kind }: { kind: TaxonomyKind }) {
  const k = KINDS[kind];
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [row, setRow] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "metadata">(null);

  function load() {
    api<Record<string, any>>(`${k.api}/${id}`)
      .then((d) => {
        setRow(d[k.key]);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the ${k.noun} ${row.value}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: row.value,
    });
    if (!ok) return;
    try {
      await api(`${k.api}/${id}`, { method: "DELETE" });
      navigate(k.list, { replace: true });
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
        <Link to={k.list} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          {k.plural}
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{row?.value ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!row && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {row ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={row.value}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setDrawer("edit") },
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            }
          >
            <KV rows={[["Value", row.value]]} />
          </DetailSection>
          <ProductsSection kind={kind} id={id} />
          <MetadataSection metadata={row.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={row} />
        </div>
      ) : null}
      {row && drawer === "edit" ? <EditTaxonomyDrawer kind={kind} row={row} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {row && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={row.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (metadata) => {
            await api(`${k.api}/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}
