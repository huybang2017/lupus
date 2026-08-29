import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { countryName } from "@/shared/i18n/country-options";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, EmptyState, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TablePager } from "@/widgets/table";
import { FormDrawer, SelectField, TextField, ToggleField } from "@/widgets/form";
import { StatusBadge } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { DetailSection, JsonSection, KV } from "@/widgets/detail/detail-section";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

const LIST = "/settings/tax-regions";
const dash = <span style={{ color: "var(--fg-muted)" }}>-</span>;

const regionName = (r: any) => (r.province_code ? String(r.province_code).toUpperCase() : (countryName(r.country_code) ?? String(r.country_code).toUpperCase()));
const fmtRate = (rate: number | null | undefined) => (rate === null || rate === undefined ? "-" : `${rate}%`);
const defaultRateOf = (r: any) => (r.tax_rates ?? []).find((t: any) => t.is_default);

function useProviderOptions() {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ tax_providers: { id: string }[] }>("/admin/tax-providers")
      .then((d) => setOpts(d.tax_providers.map((p) => ({ value: p.id, label: p.id }))))
      .catch(() => setOpts([{ value: "system", label: "system" }]));
  }, []);
  return opts;
}

// ------------------------------------------------------------------ list

// Lupus "Tax Regions": the countries you collect tax in, one card each.
export function TaxRegionsListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [rateFor, setRateFor] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error, reload } = useServerList<any>("/admin/tax-regions", { page, limit: 20, params: { parent_id: "null", order: "country_code" } });

  async function remove(r: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the tax region ${regionName(r)}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: regionName(r),
    });
    if (!ok) return;
    try {
      await api(`/admin/tax-regions/${r.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>Settings › Tax Regions</div>
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px" }}>
          <div style={{ maxWidth: 620 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tax Regions</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>Manage the tax rates of each country and province you sell to.</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate(`${LIST}/create`)}>
            Create
          </button>
        </div>
        {err ? (
          <div style={{ padding: "0 20px 12px" }}>
            <Alert>{err}</Alert>
          </div>
        ) : null}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Spinner size={22} />
          </div>
        ) : error ? (
          <div style={{ padding: "0 20px 16px" }}>
            <Alert>{error}</Alert>
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No tax regions" hint="Create a tax region for a country to start collecting tax." />
        ) : (
          <div>
            {items.map((r) => {
              const def = defaultRateOf(r);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span className="badge badge-gray" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {String(r.country_code).toUpperCase()}
                    </span>
                    <Link to={`${LIST}/${r.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                      {regionName(r)}
                    </Link>
                    {!def ? <StatusBadge color="orange">No default rate</StatusBadge> : <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>{def.name} · {fmtRate(def.rate)}</span>}
                  </div>
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setEditing(r) },
                      ...(def ? [] : [{ label: "Create default rate", onClick: () => setRateFor(r) }]),
                      { label: "Delete", danger: true, onClick: () => void remove(r) },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        )}
        <TablePager page={page} limit={20} count={count} onPage={setPage} />
      </section>
      {editing ? <EditTaxRegionDrawer region={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
      {rateFor ? <RateDrawer region={rateFor} mode="default" onClose={() => setRateFor(null)} onSaved={() => { setRateFor(null); reload(); }} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ drawers

export function EditTaxRegionDrawer({ region, onClose, onSaved }: { region: any; onClose: () => void; onSaved: () => void }) {
  const providers = useProviderOptions();
  const [provider, setProvider] = useState<string>(region.provider_id ?? "system");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/tax-regions/${region.id}`, { method: "POST", body: { provider_id: provider } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Tax Region" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <SelectField label="Tax provider" value={provider} onChange={setProvider} options={providers} allowClear={false} />
    </FormDrawer>
  );
}

function ProvinceDrawer({ parent, onClose, onSaved }: { parent: any; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const codeError = code.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (codeError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/admin/tax-regions", { method: "POST", body: { country_code: parent.country_code, province_code: code.trim(), parent_id: parent.id } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Create Province" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField
        label="Province code"
        hint={`The ISO 3166-2 code of the province in ${regionName(parent)}, for example ${String(parent.country_code)}-ab.`}
        value={code}
        onChange={setCode}
        error={show ? codeError : undefined}
      />
    </FormDrawer>
  );
}

// Searchable multi-select over one of the catalog lists (products, product types, shipping options).
