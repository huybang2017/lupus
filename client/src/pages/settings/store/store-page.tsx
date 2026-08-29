import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/shared/api/client";
import { listAll } from "@/shared/api/list-all";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TableBulkBar, TablePager, TableSearch, TableToolbar, useTablePaging, useTableSearch } from "@/widgets/table";
import { FormDrawer, SelectField, TextField } from "@/widgets/form";
import { StatusCell } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { JsonSection, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

const subtle = { color: "var(--fg-subtle)", fontSize: 13 } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "14px 24px", borderTop: "1px solid var(--card-border)", fontSize: 13, alignItems: "center" }}>
      <span style={{ fontWeight: 600, color: "var(--fg-subtle)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

const chip = (to: string, text: string) => (
  <Link to={to} className="badge" style={{ textDecoration: "none", color: "inherit" }}>
    {text}
  </Link>
);

/** Options of a list endpoint, plus the currently chosen record when it falls outside the first page. */
function useOptions(path: string, selectedId: string | null | undefined, label: (r: any) => string) {
  const { items } = useServerList<any>(path, { page: 1, limit: 100 });
  const [extra, setExtra] = useState<any | null>(null);
  useEffect(() => {
    if (!selectedId || items.some((i) => i.id === selectedId)) {
      setExtra(null);
      return;
    }
    api<any>(`${path}/${selectedId}`).then((d) => setExtra(Object.values(d)[0])).catch(() => undefined);
  }, [selectedId, items, path]);
  const all = extra && !items.some((i) => i.id === extra.id) ? [extra, ...items] : items;
  return all.map((r) => ({ value: r.id as string, label: label(r) }));
}

// Lupus "Edit store": name and the four defaults.
function EditStoreDrawer({ store, onClose, onSaved }: { store: any; onClose: () => void; onSaved: () => void }) {
  const defaultCurrency = (store.supported_currencies ?? []).find((c: any) => c.is_default)?.currency_code ?? "";
  const [name, setName] = useState<string>(store.name ?? "");
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [region, setRegion] = useState<string>(store.default_region_id ?? "");
  const [channel, setChannel] = useState<string>(store.default_sales_channel_id ?? "");
  const [location, setLocation] = useState<string>(store.default_location_id ?? "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const regions = useOptions("/admin/regions", store.default_region_id, (r) => r.name ?? r.id);
  const channels = useOptions("/admin/sales-channels", store.default_sales_channel_id, (r) => r.name ?? r.id);
  const locations = useOptions("/admin/stock-locations", store.default_location_id, (r) => r.name ?? r.id);
  const nameError = name.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (nameError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/stores/${store.id}`, {
        method: "POST",
        body: {
          name: name.trim(),
          supported_currencies: (store.supported_currencies ?? []).map((c: any) => ({ currency_code: c.currency_code, is_default: c.currency_code === currency })),
          default_region_id: region || null,
          default_sales_channel_id: channel || null,
          default_location_id: location || null,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Store" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
      <SelectField
        label="Default currency"
        value={currency}
        onChange={setCurrency}
        options={(store.supported_currencies ?? []).map((c: any) => ({ value: c.currency_code, label: `${String(c.currency_code).toUpperCase()}${c.currency?.name ? ` - ${c.currency.name}` : ""}` }))}
        allowClear={false}
      />
      <SelectField label="Default region" value={region} onChange={setRegion} options={regions} placeholder="Select region" searchable />
      <SelectField label="Default sales channel" value={channel} onChange={setChannel} options={channels} placeholder="Select sales channel" searchable />
      <SelectField label="Default location" value={location} onChange={setLocation} options={locations} placeholder="Select location" searchable />
    </FormDrawer>
  );
}

// Lupus "Add currencies": every currency, those already supported shown checked and locked.
function AddCurrenciesDrawer({ store, onClose, onSaved }: { store: any; onClose: () => void; onSaved: () => void }) {
  const existing: string[] = (store.supported_currencies ?? []).map((c: any) => c.currency_code);
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const search = useTableSearch(all, (c: any, needle: string) => !needle || `${c.name} ${c.code}`.toLowerCase().includes(needle));
  const paging = useTablePaging(search.filtered, { limit: 10 });

  useEffect(() => {
    listAll<any>("/admin/currencies")
      .then(setAll)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (picked.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const keep = (store.supported_currencies ?? []).map((c: any) => ({ currency_code: c.currency_code, is_default: c.is_default }));
      await api(`/admin/stores/${store.id}`, {
        method: "POST",
        body: { supported_currencies: [...keep, ...picked.map((currency_code) => ({ currency_code, is_default: false }))] },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Add currencies" subtitle="Choose the currencies prices can be set in." onClose={onClose} onSubmit={save} busy={busy} error={err} submitLabel="Save">
      <div style={{ margin: "0 -24px" }}>
        <TableToolbar
          right={<TableSearch value={search.draft} onChange={search.setDraft} onSubmit={() => { search.submit(); paging.setPage(1); }} width={220} placeholder="Search" />}
        />
        <DataTable
          columns={[
            { key: "code", label: "Code", render: (c: any) => String(c.code).toUpperCase() },
            { key: "name", label: "Name", render: (c: any) => c.name },
          ]}
          rows={paging.pageRows}
          rowKey={(c: any) => c.code}
          loading={loading}
          selectable
          selected={[...existing, ...picked]}
          rowDisabled={(c: any) => existing.includes(c.code)}
          onToggleRow={(code) => setPicked((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]))}
          onToggleAll={(checked) => setPicked((s) => (checked ? [...new Set([...s, ...paging.pageRows.map((c: any) => c.code).filter((c: string) => !existing.includes(c))])] : s.filter((c) => !paging.pageRows.some((r: any) => r.code === c))))}
          emptyTitle="No results found"
        />
        <TablePager page={paging.page} limit={paging.limit} count={search.filtered.length} onPage={paging.setPage} />
      </div>
    </FormDrawer>
