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
              key: "countries",
              label: "Countries",
              render: (r: any) => ((r.countries ?? []).length ? summarize((r.countries as any[]).map((c) => c.display_name).sort((a, b) => a.localeCompare(b))) : dash),
            },
            {
              key: "payment_providers",
              label: "Payment providers",
              render: (r: any) => ((r.payment_providers ?? []).length ? summarize((r.payment_providers as any[]).map((p) => formatProvider(p.id))) : dash),
            },
          ]}
          rows={items}
          loading={loading}
          error={error}
          sort={order}
          onSort={(next) => { setOrder(next); setPage(1); }}
          rowActions={(r: any) => [
            { label: "Edit", onClick: () => setEditing(r) },
            { label: "Delete", danger: true, onClick: () => void remove(r) },
          ]}
          emptyTitle={q ? "No results" : "No regions"}
          emptyHint={q ? "No regions match the current filter criteria." : "Create a region for the areas that you sell in."}
        />
        <TablePager page={page} limit={20} count={count} onPage={setPage} />
      </section>
      {editing ? <EditRegionDrawer region={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ create

// Lupus "Create Region".
export function CreateRegionPage() {
  const navigate = useNavigate();
  const currencies = useCurrencyOptions();
  const providers = useProviders();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [auto, setAuto] = useState(true);
  const [inclusive, setInclusive] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameError = name.trim() === "" ? REQUIRED : undefined;
  const currencyError = currency === "" ? "Select a currency" : undefined;
  const providerError = picked.length === 0 ? "Select at least one payment provider" : undefined;
  const dirty = name.trim() !== "" || currency !== "" || countries.length > 0 || picked.length > 0 || inclusive || !auto;
  const leave = useLeaveGuard(dirty, LIST, busy);

  async function save() {
    if (nameError || currencyError || providerError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ region: { id: string } }>("/admin/regions", {
        method: "POST",
        body: { name: name.trim(), currency_code: currency, automatic_taxes: auto, is_tax_inclusive: inclusive, countries, payment_providers: picked },
      });
      navigate(`${LIST}/${res.region.id}`);
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
      closeTo={LIST}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title="Create Region" subtitle="Manage tax rates and providers for a set of countries.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
          <SelectField label="Currency" value={currency} onChange={setCurrency} options={currencies} placeholder="Select" searchable allowClear={false} error={show ? currencyError : undefined} />
        </div>
        <ToggleField title="Automatic Taxes" hint="When enabled, taxes will only be calculated at checkout based on the shipping address." checked={auto} onChange={setAuto} switchSide="right" />
        <ToggleField title="Tax inclusive pricing" hint="When enabled, prices in the region will be tax inclusive." checked={inclusive} onChange={setInclusive} switchSide="right" />
        <hr style={{ border: 0, borderTop: "1px solid var(--card-border)", margin: "4px 0" }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Countries</div>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 10 }}>Add the countries included in this region.</div>
          {countries.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {countries.map((c) => (
                <span key={c} className="badge badge-gray">
                  {countryName(c)}
                  <button aria-label={`Remove ${countryName(c)}`} onClick={() => setCountries((s) => s.filter((x) => x !== c))} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", marginLeft: 4 }}>
                    ✕
                  </button>
                </span>
              ))}
              <button className="btn" style={{ background: "transparent", color: "var(--fg-muted)" }} onClick={() => setCountries([])}>
                Clear all
              </button>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPicker(true)}>
              Add countries
            </button>
          </div>
        </div>
        <hr style={{ border: 0, borderTop: "1px solid var(--card-border)", margin: "4px 0" }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Providers</div>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 10 }}>Add which payment providers are available in this region.</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Payment Providers</div>
          <CheckListField options={providers} checked={picked} onToggle={(id) => setPicked((s) => toggleInList(s, id))} emptyHint="No payment providers" />
          {show && providerError ? (
            <div role="alert" style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>
              {providerError}
            </div>
          ) : null}
        </div>
      </FormSection>
      {picker ? (
        <CountryPickerDrawer
          title="Add countries"
          initial={countries}
          onClose={() => setPicker(false)}
          onSave={(codes) => {
            setCountries(codes);
            setPicker(false);
          }}
        />
      ) : null}
    </WizardShell>
  );
}

// ------------------------------------------------------------------ edit

// Lupus "Edit Region".
export function EditRegionDrawer({ region, onClose, onSaved }: { region: any; onClose: () => void; onSaved: () => void }) {
  const currencies = useCurrencyOptions();
  const providers = useProviders();
  const [name, setName] = useState<string>(region.name ?? "");
  const [currency, setCurrency] = useState<string>(String(region.currency_code ?? ""));
  const [auto, setAuto] = useState<boolean>(!!region.automatic_taxes);
  const [inclusive, setInclusive] = useState<boolean>(!!region.is_tax_inclusive);
  const [picked, setPicked] = useState<string[]>((region.payment_providers ?? []).map((p: any) => p.id));
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameError = name.trim() === "" ? REQUIRED : undefined;
  // the region's current currency stays selectable even if the store no longer lists it
  const options = currencies.some((c) => c.value === currency) || !currency ? currencies : [{ value: currency, label: currency.toUpperCase() }, ...currencies];

  async function save() {
    if (nameError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/regions/${region.id}`, {
        method: "POST",
        body: { name: name.trim(), currency_code: currency, automatic_taxes: auto, is_tax_inclusive: inclusive, payment_providers: picked },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Region" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
      <SelectField label="Currency" value={currency} onChange={setCurrency} options={options} searchable allowClear={false} />
      <ToggleField title="Automatic Taxes" hint="When enabled, taxes will only be calculated at checkout based on the shipping address." checked={auto} onChange={setAuto} switchSide="right" />
      <ToggleField title="Tax inclusive pricing" hint="When enabled, prices in the region will be tax inclusive." checked={inclusive} onChange={setInclusive} switchSide="right" />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Payment Providers</div>
        <CheckListField options={providers} checked={picked} onToggle={(id) => setPicked((s) => toggleInList(s, id))} emptyHint="No payment providers" />
      </div>
    </FormDrawer>
  );
}

// ------------------------------------------------------------------ detail

// Lupus region detail: general, countries (add / remove), metadata.
export function RegionDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [region, setRegion] = useState<any>(null);
  const [currencyName, setCurrencyName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "countries" | "metadata">(null);
  const [selected, setSelected] = useState<string[]>([]);

  function load() {
    api<{ region: any }>(`/admin/regions/${id}`)
      .then((d) => {
        setRegion(d.region);
        setErr(null);
        api<{ currency: { name: string } }>(`/admin/currencies/${d.region.currency_code}`).then((c) => setCurrencyName(c.currency.name)).catch(() => undefined);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const countries: any[] = useMemo(() => [...(region?.countries ?? [])].sort((a, b) => a.display_name.localeCompare(b.display_name)), [region]);
  const search = useTableSearch(countries, (c: any, needle: string) => !needle || `${c.display_name} ${c.iso_2}`.toLowerCase().includes(needle));
  const paging = useTablePaging(search.filtered, { limit: 10 });

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the region ${region.name}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: region.name,
    });
    if (!ok) return;
    try {
      await api(`/admin/regions/${id}`, { method: "DELETE" });
      navigate(LIST, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeCountries(codes: string[], single?: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: single
        ? `You are about to remove the country ${single.display_name} from the region. This action cannot be undone.`
        : `You are about to remove ${codes.length} ${codes.length === 1 ? "country" : "countries"} from the region. This action cannot be undone.`,
      confirmLabel: "Remove",
      verifyText: single ? single.display_name : "Remove",
    });
    if (!ok) return;
    try {
      await api(`/admin/regions/${id}`, { method: "POST", body: { countries: countries.filter((c) => !codes.includes(c.iso_2)).map((c) => c.iso_2) } });
      setSelected([]);
      load();
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
          Regions
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{region?.name ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!region && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {region ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={region.name}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setDrawer("edit") },
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            }
          >
            <KV
              rows={[
                [
                  "Currency",
                  <span key="c" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="badge badge-gray">{String(region.currency_code).toUpperCase()}</span>
                    {currencyName}
                  </span>,
                ],
                ["Automatic Taxes", region.automatic_taxes ? "True" : "False"],
                ["Tax inclusive pricing", region.is_tax_inclusive ? "True" : "False"],
                ["Payment Providers", (region.payment_providers ?? []).length ? summarize((region.payment_providers as any[]).map((p) => formatProvider(p.id)), 3) : "-"],
              ]}
            />
          </DetailSection>

          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Countries</h2>
              <RowMenu items={[{ label: "Add countries", onClick: () => setDrawer("countries") }]} />
            </div>
            <TableToolbar
              style={{ padding: "0 24px 12px", borderBottom: "none" }}
              right={<TableSearch value={search.draft} onChange={search.setDraft} onSubmit={() => { search.submit(); paging.setPage(1); }} width={220} placeholder="Search" />}
            />
            {selected.length > 0 ? (
              <TableBulkBar count={selected.length}>
                <button className="btn btn-secondary" onClick={() => void removeCountries(selected)}>
                  Remove
                </button>
              </TableBulkBar>
            ) : null}
            <DataTable
              columns={[
                { key: "name", label: "Name", render: (c: any) => c.display_name },
                { key: "iso_2", label: "Code", render: (c: any) => String(c.iso_2).toUpperCase() },
              ]}
              rows={paging.pageRows}
              rowKey={(c: any) => c.iso_2}
              selectable
              selected={selected}
              onToggleRow={(code) => setSelected((s) => toggleInList(s, code))}
              onToggleAll={(checked) => setSelected(checked ? paging.pageRows.map((c: any) => c.iso_2) : [])}
              rowActions={(c: any) => [{ label: "Remove", danger: true, onClick: () => void removeCountries([c.iso_2], c) }]}
              emptyTitle={search.draft ? "No results found" : "No records"}
              emptyHint={search.draft ? "No countries match your search." : "There are no records to show"}
            />
            <TablePager page={paging.page} limit={paging.limit} count={search.filtered.length} onPage={paging.setPage} />
          </section>

          <MetadataSection metadata={region.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={region} />
        </div>
      ) : null}

      {region && drawer === "edit" ? <EditRegionDrawer region={region} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {region && drawer === "countries" ? (
        <CountryPickerDrawer
          title="Add countries"
          selfId={id}
          initial={countries.map((c) => c.iso_2)}
          onClose={() => setDrawer(null)}
          onSave={async (codes) => {
            try {
              await api(`/admin/regions/${id}`, { method: "POST", body: { countries: codes } });
              saved();
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
              setDrawer(null);
            }
          }}
        />
      ) : null}
      {region && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={region.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (metadata) => {
            await api(`/admin/regions/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}
