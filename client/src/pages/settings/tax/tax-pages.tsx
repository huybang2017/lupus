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
interface Picked {
  id: string;
  label: string;
}

function EntityPicker({ title, path, listKey, labelOf, value, onChange }: { title: string; path: string; listKey: string; labelOf: (row: any) => string; value: Picked[]; onChange: (v: Picked[]) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api<Record<string, any>>(`${path}?limit=10&offset=0${text ? `&q=${encodeURIComponent(text)}` : ""}`)
        .then((d) => setRows(d[listKey] ?? []))
        .catch(() => setRows([]));
    }, 200);
    return () => window.clearTimeout(timer.current);
  }, [open, text, path, listKey]);

  const picked = new Set(value.map((v) => v.id));
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {value.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {value.map((v) => (
            <span key={v.id} className="badge badge-gray">
              {v.label}
              <button type="button" aria-label={`Remove ${v.label}`} onClick={() => onChange(value.filter((x) => x.id !== v.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", marginLeft: 4 }}>
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input className="input" placeholder={`Search ${title.toLowerCase()}`} value={text} onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} />
      {open ? (
        <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
          {rows.filter((r) => !picked.has(r.id)).length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: "var(--fg-subtle)" }}>No results</div>
          ) : (
            rows
              .filter((r) => !picked.has(r.id))
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onChange([...value, { id: r.id, label: labelOf(r) }]);
                    setText("");
                  }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 10px", fontSize: 13, cursor: "pointer" }}
                >
                  {labelOf(r)}
                </button>
              ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const TARGETS = [
  { reference: "product", title: "Products", path: "/admin/products", listKey: "products", labelOf: (r: any) => r.title as string },
  { reference: "product_type", title: "Product Types", path: "/admin/product-types", listKey: "product_types", labelOf: (r: any) => r.value as string },
  { reference: "shipping_option", title: "Shipping Options", path: "/admin/shipping-options", listKey: "shipping_options", labelOf: (r: any) => r.name as string },
] as const;

// Names for the ids a rate's rules point at.
function useTargetNames(rules: { reference: string; reference_id: string }[]) {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = rules.map((r) => `${r.reference}:${r.reference_id}`).join(",");
  useEffect(() => {
    let live = true;
    for (const t of TARGETS) {
      const ids = rules.filter((r) => r.reference === t.reference).map((r) => r.reference_id);
      if (ids.length === 0) continue;
      const qs = ids.map((i) => `id=${encodeURIComponent(i)}`).join("&");
      api<Record<string, any>>(`${t.path}?limit=100&${qs}`)
        .then((d) => {
          if (!live) return;
          setNames((cur) => ({ ...cur, ...Object.fromEntries((d[t.listKey] ?? []).map((row: any) => [`${t.reference}:${row.id}`, t.labelOf(row)])) }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return names;
}

// Create / edit a rate: the region's default rate, or an override with the things it applies to.
function RateDrawer({ region, rate, mode, onClose, onSaved }: { region: any; rate?: any; mode: "default" | "override"; onClose: () => void; onSaved: () => void }) {
  const editing = !!rate;
  const [name, setName] = useState<string>(rate?.name ?? "");
  const [code, setCode] = useState<string>(rate?.code ?? "");
  const [pct, setPct] = useState<string>(rate?.rate === undefined || rate?.rate === null ? "" : String(rate.rate));
  const [combinable, setCombinable] = useState<boolean>(!!rate?.is_combinable);
  const names = useTargetNames(rate?.rules ?? []);
  const [picked, setPicked] = useState<Record<string, Picked[]>>(() =>
    Object.fromEntries(TARGETS.map((t) => [t.reference, (rate?.rules ?? []).filter((r: any) => r.reference === t.reference).map((r: any) => ({ id: r.reference_id, label: r.reference_id }))])),
  );
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // swap ids for names once they have loaded
  const labelled = (ref: string) => picked[ref].map((p) => ({ ...p, label: names[`${ref}:${p.id}`] ?? p.label }));
  const nameError = name.trim() === "" ? REQUIRED : undefined;
  const codeError = code.trim() === "" ? REQUIRED : undefined;
  const rateError = pct.trim() === "" ? REQUIRED : Number.isFinite(Number(pct)) && Number(pct) >= 0 && Number(pct) <= 100 ? undefined : "Enter a percentage between 0 and 100";
  const ruleCount = TARGETS.reduce((n, t) => n + picked[t.reference].length, 0);
  const rulesError = mode === "override" && ruleCount === 0 ? "Pick at least one product, product type or shipping option" : undefined;

  async function save() {
    if (nameError || codeError || rateError || rulesError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    const rules = mode === "override" ? TARGETS.flatMap((t) => picked[t.reference].map((p) => ({ reference: t.reference, reference_id: p.id }))) : undefined;
    try {
      if (editing) {
        await api(`/admin/tax-rates/${rate.id}`, { method: "POST", body: { name: name.trim(), code: code.trim(), rate: Number(pct), is_combinable: combinable, ...(rules ? { rules } : {}) } });
      } else {
        await api("/admin/tax-rates", {
          method: "POST",
          body: { tax_region_id: region.id, name: name.trim(), code: code.trim(), rate: Number(pct), is_default: mode === "default", is_combinable: combinable, ...(rules ? { rules } : {}) },
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const title = mode === "default" ? (editing ? "Edit Default Tax Rate" : "Create Default Tax Rate") : editing ? "Edit Tax Override" : "Create Tax Override";
  return (
    <FormDrawer title={title} onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
      <TextField label="Rate (%)" value={pct} onChange={setPct} error={show ? rateError : undefined} />
      <TextField label="Code" value={code} onChange={setCode} error={show ? codeError : undefined} />
      {mode === "override" ? (
        <>
          <ToggleField title="Combinable" hint="A combinable rate is added to the default rate instead of replacing it." checked={combinable} onChange={setCombinable} switchSide="right" />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Applies to</div>
          {TARGETS.map((t) => (
            <EntityPicker key={t.reference} title={t.title} path={t.path} listKey={t.listKey} labelOf={t.labelOf} value={labelled(t.reference)} onChange={(v) => setPicked((cur) => ({ ...cur, [t.reference]: v }))} />
          ))}
          {show && rulesError ? (
            <div role="alert" style={{ fontSize: 12, color: "#ef4444" }}>
              {rulesError}
            </div>
          ) : null}
        </>
      ) : null}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------ detail

function OverrideCard({ rate, onEdit, onDelete }: { rate: any; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const names = useTargetNames(open ? rate.rules : []);
  const groups = TARGETS.map((t) => ({ ...t, rules: (rate.rules ?? []).filter((r: any) => r.reference === t.reference) })).filter((g) => g.rules.length > 0);
  return (
    <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px" }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontSize: 13 }}>
          <span style={{ color: "var(--fg-muted)" }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 600 }}>{rate.name}</span>
          <span style={{ color: "var(--fg-subtle)" }}>{rate.code}</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span>{fmtRate(rate.rate)}</span>
          <span style={{ color: "var(--fg-subtle)" }}>{(rate.rules ?? []).length} {(rate.rules ?? []).length === 1 ? "target" : "targets"}</span>
          {rate.is_combinable ? <span className="badge badge-gray">Combinable</span> : null}
          <RowMenu items={[{ label: "Edit", onClick: onEdit }, { label: "Delete", danger: true, onClick: onDelete }]} />
        </div>
      </div>
      {open ? (
        <div style={{ borderTop: "1px solid var(--card-border)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          {groups.map((g) => (
            <div key={g.reference} style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 130, color: "var(--fg-subtle)", flexShrink: 0 }}>{g.title}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.rules.map((r: any) => (
                  <span key={r.id} className="badge badge-gray">
                    {names[`${r.reference}:${r.reference_id}`] ?? r.reference_id}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Lupus tax region detail: general (default rate, provider), provinces, tax overrides.
export function TaxRegionDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [region, setRegion] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | { kind: "edit" } | { kind: "province" } | { kind: "default"; rate?: any } | { kind: "override"; rate?: any }>(null);

  function load() {
    api<{ tax_region: any }>(`/admin/tax-regions/${id}`)
      .then((d) => {
        setRegion(d.tax_region);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = region ? defaultRateOf(region) : null;
  const overrides: any[] = useMemo(() => (region?.tax_rates ?? []).filter((t: any) => !t.is_default), [region]);
  const isProvince = !!region?.parent_id;

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setErr(null);
    try {
      await fn();
      after ? after() : load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteRegion() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the tax region ${regionName(region)}${isProvince ? "" : " and its provinces"}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: regionName(region),
    });
    if (ok) await run(() => api(`/admin/tax-regions/${id}`, { method: "DELETE" }), () => navigate(isProvince ? `${LIST}/${region.parent_id}` : LIST, { replace: true }));
  }

  async function deleteRate(rate: any) {
    const ok = await confirm({ title: "Are you sure?", description: `You are about to delete the tax rate ${rate.name}. This action cannot be undone.`, confirmLabel: "Delete" });
    if (ok) await run(() => api(`/admin/tax-rates/${rate.id}`, { method: "DELETE" }));
  }

  const saved = () => {
    setDrawer(null);
    load();
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to={LIST} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Tax Regions
        </Link>
        {isProvince && region.parent ? (
          <>
            <span style={{ color: "var(--fg-muted)" }}>›</span>
            <Link to={`${LIST}/${region.parent_id}`} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
              {regionName(region.parent)}
            </Link>
          </>
        ) : null}
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{region ? regionName(region) : id}</span>
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
            title={regionName(region)}
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!def ? <StatusBadge color="orange">No default rate</StatusBadge> : null}
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setDrawer({ kind: "edit" }) },
                    def ? { label: "Edit default rate", onClick: () => setDrawer({ kind: "default", rate: def }) } : { label: "Create default rate", onClick: () => setDrawer({ kind: "default" }) },
                    { label: "Delete", danger: true, onClick: () => void deleteRegion() },
                  ]}
                />
              </div>
            }
          >
            <KV
              rows={[
                ["Default tax rate", def ? `${def.name} · ${def.code} · ${fmtRate(def.rate)}` : dash],
                ["Tax provider", region.provider_id],
              ]}
            />
          </DetailSection>

          {!isProvince ? (
            <section className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Provinces</h2>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>Sub-regions of {regionName(region)} with their own tax rates.</p>
                </div>
                <button className="btn btn-secondary" onClick={() => setDrawer({ kind: "province" })}>
                  Create
                </button>
              </div>
              <DataTable
                columns={[
                  {
                    key: "province",
                    label: "Province",
                    render: (c: any) => (
                      <Link to={`${LIST}/${c.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                        {regionName(c)}
                      </Link>
                    ),
                  },
                  { key: "rate", label: "Default rate", render: (c: any) => (defaultRateOf(c) ? `${defaultRateOf(c).name} · ${fmtRate(defaultRateOf(c).rate)}` : <StatusBadge color="orange">No default rate</StatusBadge>) },
                ]}
                rows={region.children}
                emptyTitle="No provinces"
                emptyHint="Without provinces, the country's rates apply everywhere in it."
              />
            </section>
          ) : null}

          <section className="card" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Tax Overrides</h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>Rates that apply to specific products, product types or shipping options instead of the default.</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setDrawer({ kind: "override" })}>
                Create
              </button>
            </div>
            {overrides.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>No tax overrides yet.</div>
            ) : (
              overrides.map((rate) => <OverrideCard key={rate.id} rate={rate} onEdit={() => setDrawer({ kind: "override", rate })} onDelete={() => void deleteRate(rate)} />)
            )}
          </section>

          <JsonSection data={region} />
        </div>
      ) : null}

      {region && drawer?.kind === "edit" ? <EditTaxRegionDrawer region={region} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {region && drawer?.kind === "province" ? <ProvinceDrawer parent={region} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {region && drawer?.kind === "default" ? <RateDrawer region={region} rate={drawer.rate} mode="default" onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {region && drawer?.kind === "override" ? <RateDrawer region={region} rate={drawer.rate} mode="override" onClose={() => setDrawer(null)} onSaved={saved} /> : null}
    </div>
  );
}
