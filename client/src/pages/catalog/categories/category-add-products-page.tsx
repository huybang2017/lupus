import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FormActions } from "@/widgets/form";
import {
  DataTable,
  TablePager,
  TableSearch,
  TableToolbar,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import { FilterBar, useLocalFilters } from "@/widgets/filters";
import { selectFilter, csvOptions, textFilter } from "@/widgets/filters/filter-defs";
import type { FilterDef } from "@/shared/filters/list-filters";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

const FILTERS: FilterDef[] = [
  textFilter("title", "Title", { accessor: (row: any) => row?.title }),
  selectFilter("status", "Status", csvOptions("draft,proposed,published,rejected"), {
    accessor: (row: any) => row?.status,
  }),
];

// Lupus "Add products to category": a full-screen picker (esc to close) with the product
// table. Products already in the category are shown checked and locked.
export function CategoryAddProductsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = `/r/categories/${id}`;
  const [all, setAll] = useState<any[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ product_category: any }>(`/admin/product-categories/${id}`)
      .then((d) => setExisting((d.product_category?.products ?? []).map((p: any) => p.id)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api("/admin/products?limit=100&offset=0")
      .then((d: any) => setAll(parseList(d, 100).items))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector(".confirm-back")) navigate(back);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, navigate]);

  const { draft, setDraft, submit, filtered: searched } = useTableSearch(
    all,
    (p: any, needle: string) => !needle || `${p.title ?? ""} ${p.handle ?? ""}`.toLowerCase().includes(needle),
  );
  const filters = useLocalFilters(searched, FILTERS);
  const { page: safePage, setPage, limit, pageRows } = useTablePaging(filters.rows);
  const selectableIds = pageRows.map((p: any) => p.id).filter((x: string) => !existing.includes(x));

  const selected = [...existing, ...picked];

  async function save() {
    if (picked.length === 0) {
      navigate(back);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/product-categories/${id}/products`, { method: "POST", body: { add: picked } });
      navigate(back);
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
      closeTo={back}
      wide
      footer={
        <FormActions onCancel={() => navigate(back)} onSubmit={save} submitLabel="Save" busy={busy} />
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : (
        <div>
          <TableToolbar
            left={<FilterBar defs={FILTERS} filters={filters} />}
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
            columns={PRODUCT_TABLE_COLS}
            rows={pageRows}
            selectable
            selected={selected}
            rowDisabled={(p: any) => existing.includes(p.id)}
            onToggleRow={(pid) => setPicked((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]))}
            onToggleAll={(checked) =>
              setPicked((s) => (checked ? [...new Set([...s, ...selectableIds])] : s.filter((x) => !selectableIds.includes(x))))
            }
            emptyTitle={draft || filters.count > 0 ? "No results found" : "No records"}
            emptyHint={draft || filters.count > 0 ? "No products match your filter criteria." : "There are no records to show"}
          />
          <TablePager page={safePage} limit={limit} count={filters.rows.length} onPage={setPage} />
        </div>
      )}
    </WizardShell>
  );
}
