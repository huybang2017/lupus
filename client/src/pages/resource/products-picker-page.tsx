import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert } from "@/widgets/ui/primitives";
import { DataTable, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { FormActions, toggleInList } from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

// Lupus's "Add products" focus modal (sales channels, collections, ...): the whole catalog, server
// paged and searchable. Products that already belong are checked and locked; `belongsParam` is the
// /admin/products filter that tells which of the visible ones those are.
export function ProductsPickerPage({
  back,
  belongsParam,
  belongsId,
  onSave,
}: {
  back: string;
  belongsParam: string;
  belongsId: string;
  onSave: (productIds: string[]) => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error } = useServerList<any>("/admin/products", { page, limit: 50, q });

  const pageIds = items.map((p: any) => p.id).join(",");
  useEffect(() => {
    if (!pageIds) return;
    const ids = pageIds.split(",").map((pid) => `id=${encodeURIComponent(pid)}`).join("&");
    api<{ products: any[] }>(`/admin/products?${belongsParam}=${encodeURIComponent(belongsId)}&limit=100&${ids}`)
      .then((d) => setExisting((s) => [...new Set([...s, ...d.products.map((p) => p.id)])]))
      .catch(() => undefined);
  }, [pageIds, belongsParam, belongsId]);

  const selectable = items.map((p: any) => p.id).filter((pid: string) => !existing.includes(pid));

  async function save() {
    if (picked.length === 0) {
      navigate(back);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave(picked);
      navigate(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <WizardShell tabs={[]} tab="" onTab={() => {}} closeTo={back} wide footer={<FormActions onCancel={() => navigate(back)} onSubmit={save} submitLabel="Save" busy={busy} />}>
      {err ? <Alert>{err}</Alert> : null}
      <TableToolbar right={<TableSearch value={draft} onChange={setDraft} onSubmit={() => { setQ(draft.trim()); setPage(1); }} width={220} placeholder="Search" />} />
      <DataTable
        columns={PRODUCT_TABLE_COLS}
        rows={items}
        loading={loading}
        error={error}
        selectable
        selected={[...existing, ...picked]}
        rowDisabled={(p: any) => existing.includes(p.id)}
        onToggleRow={(pid) => setPicked((s) => toggleInList(s, pid))}
        onToggleAll={(checked) => setPicked((s) => (checked ? [...new Set([...s, ...selectable])] : s.filter((x) => !selectable.includes(x))))}
        emptyTitle={q ? "No results found" : "No records"}
        emptyHint={q ? "No products match your search." : "There are no records to show"}
      />
      <TablePager page={page} limit={50} count={count} onPage={setPage} />
    </WizardShell>
  );
}
