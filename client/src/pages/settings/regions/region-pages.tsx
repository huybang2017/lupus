import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { COUNTRY_OPTIONS, countryName } from "@/shared/i18n/country-options";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, Drawer, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TableBulkBar, TablePager, TableSearch, TableToolbar, useTablePaging, useTableSearch } from "@/widgets/table";
import { CheckListField, FormActions, FormDrawer, FormSection, SelectField, TextField, ToggleField, toggleInList } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { REQUIRED, formatProvider, summarize } from "@/pages/fulfillment/locations/location-utils";

const LIST = "/settings/regions";
const dash = <span style={{ color: "var(--fg-muted)" }}>-</span>;

interface Assigned {
  iso_2: string;
  region_id: string;
  region_name: string;
}

function useAssigned() {
  const [assigned, setAssigned] = useState<Assigned[]>([]);
  useEffect(() => {
    api<{ countries: Assigned[] }>("/admin/regions/assigned-countries").then((d) => setAssigned(d.countries)).catch(() => undefined);
  }, []);
  return assigned;
}

function useCurrencyOptions() {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ store: any }>("/admin/store")
      .then((d) =>
        setOpts(
          (d.store.supported_currencies ?? []).map((c: any) => ({
            value: c.currency_code,
            label: `${String(c.currency_code).toUpperCase()}${c.currency?.name ? ` - ${c.currency.name}` : ""}`,
          })),
        ),
      )
      .catch(() => undefined);
  }, []);
  return opts;
}

function useProviders() {
  const { items } = useServerList<any>("/admin/payments/payment-providers", { page: 1, limit: 100 });
  return items.map((p) => ({ id: p.id as string, label: formatProvider(p.id) }));
}

// Lupus's "Add countries" picker: every country, those in another region are locked.
function CountryPickerDrawer({
  initial,
  selfId,
  title,
  onSave,
  onClose,
}: {
  initial: string[];
  selfId?: string;
  title: string;
  onSave: (codes: string[]) => void;
  onClose: () => void;
}) {
  const assigned = useAssigned();
  const [picked, setPicked] = useState<string[]>(initial);
  const rows = COUNTRY_OPTIONS.map((c) => ({ iso_2: c.value, name: c.label }));
  const search = useTableSearch(rows, (c: any, needle: string) => !needle || `${c.name} ${c.iso_2}`.toLowerCase().includes(needle));
  const paging = useTablePaging(search.filtered, { limit: 50 });
  const taken = (code: string) => assigned.find((a) => a.iso_2 === code && a.region_id !== selfId);

  return (
    <Drawer
      title={title}
      onClose={onClose}
      style={{ width: "min(720px, 100vw)", maxWidth: "min(720px, 100vw)" }}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(picked)}>
            Save
          </button>
        </>
      }
    >
      <div style={{ margin: "-20px -24px 0" }}>
        <TableToolbar
          right={<TableSearch value={search.draft} onChange={search.setDraft} onSubmit={() => { search.submit(); paging.setPage(1); }} width={220} placeholder="Search" autoFocus />}
        />
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (c: any) => c.name },
            { key: "iso_2", label: "Code", render: (c: any) => String(c.iso_2).toUpperCase() },
            { key: "region", label: "Region", render: (c: any) => taken(c.iso_2)?.region_name ?? dash },
          ]}
          rows={paging.pageRows}
          rowKey={(c: any) => c.iso_2}
          selectable
          selected={picked}
          rowDisabled={(c: any) => !!taken(c.iso_2)}
          onToggleRow={(code) => setPicked((s) => toggleInList(s, code))}
          onToggleAll={(checked) =>
            setPicked((s) => {
              const free = paging.pageRows.map((c: any) => c.iso_2).filter((c: string) => !taken(c));
              return checked ? [...new Set([...s, ...free])] : s.filter((c) => !free.includes(c));
            })
          }
          emptyTitle="No results found"
        />
        <TablePager page={paging.page} limit={paging.limit} count={search.filtered.length} onPage={paging.setPage} />
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------ list

// Lupus "Regions": name, countries and payment providers.
export function RegionsListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error, reload } = useServerList<any>("/admin/regions", { page, limit: 20, q, params: { order: order || undefined } });

  async function remove(r: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the region ${r.name}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: r.name,
    });
    if (!ok) return;
    try {
      await api(`/admin/regions/${r.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>Settings › Regions</div>
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px" }}>
          <div style={{ maxWidth: 620 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Regions</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>
              A region is an area that you sell products in. It can cover multiple countries, and has different tax rates, providers, and currency.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TableSearch value={draft} onChange={setDraft} onSubmit={() => { setQ(draft.trim()); setPage(1); }} width={200} placeholder="Search" />
            <button className="btn btn-primary" onClick={() => navigate(`${LIST}/create`)}>
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
              sortKey: "name",
              render: (r: any) => (
                <Link to={`${LIST}/${r.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                  {r.name}
                </Link>
              ),
            },
            {
