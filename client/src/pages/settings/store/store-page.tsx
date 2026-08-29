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
  );
}

// Lupus Store settings: details, supported currencies (default, tax inclusive pricing), metadata.
export function StorePage() {
  const confirm = useConfirm();
  const [store, setStore] = useState<any>(null);
  const [region, setRegion] = useState<any>(null);
  const [channel, setChannel] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "currencies" | "metadata">(null);
  const [selected, setSelected] = useState<string[]>([]);

  function load() {
    api<{ store: any }>("/admin/store")
      .then((d) => {
        setStore(d.store);
        setErr(null);
        const get = (path: string, id: string | null, set: (v: any) => void) =>
          id ? api<any>(`${path}/${id}`).then((r) => set(Object.values(r)[0])).catch(() => set(null)) : set(null);
        get("/admin/regions", d.store.default_region_id, setRegion);
        get("/admin/sales-channels", d.store.default_sales_channel_id, setChannel);
        get("/admin/stock-locations", d.store.default_location_id, setLocation);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, []);

  const currencies: any[] = useMemo(
    () =>
      (store?.supported_currencies ?? []).map((c: any) => ({ ...c, code: c.currency_code, name: c.currency?.name ?? c.currency_code })),
    [store],
  );
  const search = useTableSearch(currencies, (c: any, needle: string) => !needle || `${c.name} ${c.code}`.toLowerCase().includes(needle));
  const paging = useTablePaging(search.filtered, { limit: 10 });
  const defaultCode = currencies.find((c) => c.is_default)?.code;

  async function save(body: any, done?: () => void) {
    try {
      await api(`/admin/stores/${store.id}`, { method: "POST", body });
      done?.();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  const asInput = (list: any[]) => list.map((c) => ({ currency_code: c.code, is_default: c.is_default }));

  async function remove(codes: string[], single?: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to remove ${codes.length} ${codes.length === 1 ? "currency" : "currencies"} from your store. Ensure that you have removed all prices using the ${codes.length === 1 ? "currency" : "currencies"} before proceeding.`,
      confirmLabel: "Remove",
      ...(single ? { verifyText: single.name } : {}),
    });
    if (!ok) return;
    await save({ supported_currencies: asInput(currencies.filter((c) => !codes.includes(c.code))) }, () => setSelected([]));
  }

  function toggleTax(c: any) {
    void save({ supported_currencies: currencies.map((x) => ({ currency_code: x.code, is_default: x.is_default, ...(x.code === c.code ? { is_tax_inclusive: !c.is_tax_inclusive } : {}) })) });
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>Settings › Store</div>
      {err ? <Alert>{err}</Alert> : null}
      {!store && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {store ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Store</h1>
                <p style={{ margin: "2px 0 0", ...subtle }}>Manage your store&apos;s details</p>
              </div>
              <RowMenu items={[{ label: "Edit", onClick: () => setDrawer("edit") }]} />
            </div>
            <Row label="Name">{store.name}</Row>
            <Row label="Default currency">
              {defaultCode ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="badge badge-gray">{String(defaultCode).toUpperCase()}</span>
                  {currencies.find((c) => c.is_default)?.name}
                </span>
              ) : (
                "-"
              )}
            </Row>
            <Row label="Default region">{region ? chip(`/settings/regions/${region.id}`, region.name) : "-"}</Row>
            <Row label="Default sales channel">{channel ? chip(`/settings/sales-channels/${channel.id}`, channel.name) : "-"}</Row>
            <Row label="Default location">{location ? chip(`/settings/stock-locations/${location.id}`, location.name) : "-"}</Row>
          </section>

          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Currencies</h2>
              <RowMenu items={[{ label: "Add", onClick: () => setDrawer("currencies") }]} />
            </div>
            <TableToolbar
              style={{ padding: "0 24px 12px", borderBottom: "none" }}
              right={<TableSearch value={search.draft} onChange={search.setDraft} onSubmit={() => { search.submit(); paging.setPage(1); }} width={220} placeholder="Search" />}
            />
            {selected.length > 0 ? (
              <TableBulkBar count={selected.length}>
                <button className="btn btn-secondary" disabled={selected.includes(defaultCode)} onClick={() => void remove(selected)}>
                  Remove
                </button>
              </TableBulkBar>
            ) : null}
            <DataTable
              columns={[
                { key: "code", label: "Code", render: (c: any) => String(c.code).toUpperCase() },
                { key: "name", label: "Name", render: (c: any) => c.name },
                {
                  key: "tax",
                  label: "Tax inclusive pricing",
                  render: (c: any) => <StatusCell color={c.is_tax_inclusive ? "green" : "grey"}>{c.is_tax_inclusive ? "True" : "False"}</StatusCell>,
                },
              ]}
              rows={paging.pageRows}
              rowKey={(c: any) => c.code}
              selectable
              selected={selected}
              onToggleRow={(code) => setSelected((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]))}
              onToggleAll={(checked) => setSelected(checked ? paging.pageRows.map((c: any) => c.code) : [])}
              rowActions={(c: any) => [
                { label: c.is_tax_inclusive ? "Disable tax inclusive pricing" : "Enable tax inclusive pricing", onClick: () => toggleTax(c) },
                ...(c.code === defaultCode ? [] : [{ label: "Remove", danger: true, onClick: () => void remove([c.code], c) }]),
              ]}
              emptyTitle={search.draft ? "No results found" : "No records"}
              emptyHint={search.draft ? "No currencies match your search." : "There are no records to show"}
            />
            <TablePager page={paging.page} limit={paging.limit} count={search.filtered.length} onPage={paging.setPage} />
          </section>

          <MetadataSection metadata={store.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={store} />
        </div>
      ) : null}

      {store && drawer === "edit" ? (
        <EditStoreDrawer store={store} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(); }} />
      ) : null}
      {store && drawer === "currencies" ? (
        <AddCurrenciesDrawer store={store} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(); }} />
      ) : null}
      {store && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={store.metadata}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); load(); }}
          save={async (metadata) => {
            await api(`/admin/stores/${store.id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}
