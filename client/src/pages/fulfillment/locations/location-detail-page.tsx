import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { countryName } from "@/shared/i18n/country-options";
import { Alert, EmptyState, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { StatusBadge } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { DetailSection, JsonSection, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { EditShippingOptionDrawer } from "@/pages/fulfillment/shipping-options/shipping-option-pages";
import { EditLocationDrawer, ManageAreasDrawer, ProvidersDrawer, SalesChannelsDrawer, ServiceZoneDrawer } from "@/pages/fulfillment/locations/location-drawers";
import { formatAddress, formatProvider, summarize } from "@/pages/fulfillment/locations/location-utils";

type FsType = "shipping" | "pickup";

const subtle = { color: "var(--fg-subtle)", fontSize: 13 } as const;

function countryNames(zone: any): string[] {
  return (zone.geo_zones ?? [])
    .filter((g: any) => g.type === "country")
    .map((g: any) => countryName(g.country_code) ?? g.country_code)
    .sort((a: string, b: string) => a.localeCompare(b));
}

function OptionRow({
  option,
  base,
  onEdit,
  onChanged,
  setErr,
}: {
  option: any;
  base: string;
  onEdit: () => void;
  onChanged: () => void;
  setErr: (e: string) => void;
}) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the shipping option "${option.name}". This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: option.name,
    });
    if (!ok) return;
    try {
      await api(`/admin/shipping-options/${option.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  const store = option.enabled_in_store !== false;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px" }}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
        {option.name} - {option.shipping_profile?.name ?? "-"} ({formatProvider(option.provider_id)})
      </div>
      <span className="badge" style={{ fontSize: 11, color: store ? undefined : "#a855f7" }}>
        {store ? "Store" : "Admin"}
      </span>
      <RowMenu
        items={[
          { label: "Edit option", onClick: onEdit },
          ...(option.price_type === "calculated"
            ? []
            : [{ label: "Edit prices", onClick: () => navigate(`${base}/shipping-option/${option.id}/pricing`) }]),
          { label: "Delete", danger: true, onClick: () => void del() },
        ]}
      />
    </div>
  );
}

function OptionGroup({
  title,
  options,
  createTo,
  ...rest
}: {
  title: string;
  options: any[];
  createTo: string;
  base: string;
  isPickup: boolean;
  onEdit: (o: any) => void;
  onChanged: () => void;
  setErr: (e: string) => void;
}) {
  return (
    <div style={{ padding: "12px 24px", borderTop: "1px dashed var(--card-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: options.length ? 10 : 0 }}>
        <span style={{ ...subtle, fontWeight: 600 }}>{title}</span>
        <Link to={createTo} style={{ fontSize: 13, color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
          Create option
        </Link>
      </div>
      {options.length > 0 ? (
        <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, background: "var(--hover-bg)" }}>
          {options.map((o, i) => (
            <div key={o.id} style={{ borderTop: i ? "1px solid var(--card-border)" : undefined }}>
              <OptionRow option={o} base={rest.base} onEdit={() => rest.onEdit(o)} onChanged={rest.onChanged} setErr={rest.setErr} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ServiceZone({
  zone,
  locationId,
  setId,
  type,
  onEditZone,
  onAreas,
  onEditOption,
  onChanged,
  setErr,
}: {
  zone: any;
  locationId: string;
  setId: string;
  type: FsType;
  onEditZone: () => void;
  onAreas: () => void;
  onEditOption: (o: any) => void;
  onChanged: () => void;
  setErr: (e: string) => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(true);
  const options: any[] = zone.shipping_options ?? [];
  const shipping = options.filter((o) => !o.is_return);
  const returns = options.filter((o) => o.is_return);
  const base = `/settings/stock-locations/${locationId}/fulfillment-set/${setId}/service-zone/${zone.id}`;
  const countries = countryNames(zone);

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the service zone "${zone.name}". This action cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api(`/admin/fulfillment-sets/${setId}/service-zones/${zone.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px" }}>
        <span aria-hidden style={{ width: 28, height: 28, borderRadius: 6, background: "var(--hover-bg)", border: "1px solid var(--card-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
          ◍
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{zone.name}</div>
          <div style={{ ...subtle, fontSize: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span>{countries.length ? summarize(countries) : "No areas"}</span>
            <span>·</span>
            <span>{type === "pickup" ? count(shipping.length, "pickup option", "pickup options") : count(shipping.length, "shipping option", "shipping options")}</span>
            <span>·</span>
            <span>{count(returns.length, "return option", "return options")}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => setOpen((o) => !o)}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}
        >
          ▾
        </button>
        <RowMenu
          items={[
            { label: "Edit", onClick: onEditZone },
            { label: "Manage areas", onClick: onAreas },
            { label: "Delete", danger: true, onClick: () => void del() },
          ]}
        />
      </div>
      {open ? (
        <>
          <OptionGroup
            title={type === "pickup" ? "Pickup options" : "Shipping options"}
            options={shipping}
            createTo={`${base}/shipping-option/create`}
            base={base}
            isPickup={type === "pickup"}
            onEdit={onEditOption}
            onChanged={onChanged}
            setErr={setErr}
          />
          <OptionGroup
            title="Return options"
            options={returns}
            createTo={`${base}/shipping-option/create?is_return`}
            base={base}
            isPickup={type === "pickup"}
            onEdit={onEditOption}
            onChanged={onChanged}
            setErr={setErr}
          />
        </>
      ) : null}
    </div>
  );
}

function FulfillmentSet({
  location,
  type,
  set,
  onChanged,
  setErr,
  openDrawer,
}: {
  location: any;
  type: FsType;
  set?: any;
  onChanged: () => void;
  setErr: (e: string) => void;
  openDrawer: (d: Drawer) => void;
}) {
  const confirm = useConfirm();
  async function enable() {
    try {
      await api(`/admin/stock-locations/${location.id}/fulfillment-sets`, {
        method: "POST",
        body: { name: `${location.name} ${type === "pickup" ? "pick up" : type}`, type },
      });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function disable() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `Are you sure that you want to disable "${set.name}"? This will delete all associated service zones and shipping options, and cannot be undone.`,
      confirmLabel: "Disable",
    });
    if (!ok) return;
    try {
      await api(`/admin/fulfillment-sets/${set.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  const zones: any[] = set?.service_zones ?? [];
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{type === "pickup" ? "Pickup" : "Shipping"}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StatusBadge color={set ? "green" : "grey"}>{set ? "Enabled" : "Disabled"}</StatusBadge>
          <RowMenu
            items={
              set
                ? [
                    { label: "Create service zone", onClick: () => openDrawer({ kind: "zone-create", setId: set.id, type }) },
                    { label: "Disable", danger: true, onClick: () => void disable() },
                  ]
                : [{ label: "Enable", onClick: () => void enable() }]
            }
          />
        </div>
      </div>
      {set && zones.length === 0 ? (
        <div style={{ borderTop: "1px solid var(--card-border)", padding: "20px 24px", textAlign: "center" }}>
          <EmptyState title="No records" hint="There are no service zones to add shipping options to." />
          <button className="btn btn-secondary" onClick={() => openDrawer({ kind: "zone-create", setId: set.id, type })}>
            Create service zone
          </button>
        </div>
      ) : null}
      {zones.map((z) => (
        <div key={z.id} style={{ borderTop: "1px solid var(--card-border)" }}>
          <ServiceZone
            zone={z}
            locationId={location.id}
            setId={set.id}
            type={type}
            onEditZone={() => openDrawer({ kind: "zone-edit", setId: set.id, zone: z, type })}
            onAreas={() => openDrawer({ kind: "areas", setId: set.id, zone: z })}
            onEditOption={(o) => openDrawer({ kind: "option", option: o, type })}
            onChanged={onChanged}
            setErr={setErr}
          />
        </div>
      ))}
    </section>
  );
}

type Drawer =
  | { kind: "edit" | "channels" | "providers" | "metadata" }
  | { kind: "zone-create"; setId: string; type: FsType }
  | { kind: "zone-edit"; setId: string; zone: any; type: FsType }
  | { kind: "areas"; setId: string; zone: any }
  | { kind: "option"; option: any; type: FsType };

// Lupus stock location detail: general, Pickup and Shipping fulfillment sets (service zones with
// their shipping / return options), and the connected sales channels and fulfillment providers.
export function LocationDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [loc, setLoc] = useState<any>(null);
  const [totalChannels, setTotalChannels] = useState<number | null>(null);
  const [totalProviders, setTotalProviders] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);

  function load() {
    api<{ stock_location: any }>(`/admin/stock-locations/${id}`)
      .then((d) => {
        setLoc(d.stock_location);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api<any>("/admin/sales-channels?limit=1&offset=0").then((d) => setTotalChannels(d.count ?? null)).catch(() => undefined);
    api<any>("/admin/fulfillment-providers").then((d) => setTotalProviders(d.count ?? null)).catch(() => undefined);
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the stock location "${loc.name}". This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: loc.name,
    });
    if (!ok) return;
    try {
      await api(`/admin/stock-locations/${id}`, { method: "DELETE" });
      navigate("/settings/stock-locations", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const saved = () => {
    setDrawer(null);
    load();
  };
  const setOf = (type: FsType) => (loc?.fulfillment_sets ?? []).find((s: any) => s.type === type);
  const channels: string[] = (loc?.sales_channels ?? []).map((c: any) => c.name);
  const providers: string[] = (loc?.fulfillment_providers ?? []).map((p: any) => formatProvider(p.id));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to="/settings/stock-locations" style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Locations
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{loc?.name ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!loc && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {loc ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <section className="card" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{loc.name}</h1>
                <div style={subtle}>{formatAddress(loc.address) || "-"}</div>
              </div>
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setDrawer({ kind: "edit" }) },
                  { label: "View inventory", onClick: () => navigate(`/r/inventory-items?location_id=${id}`) },
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            </section>

            <FulfillmentSet location={loc} type="pickup" set={setOf("pickup")} onChanged={load} setErr={setErr} openDrawer={setDrawer} />
            <FulfillmentSet location={loc} type="shipping" set={setOf("shipping")} onChanged={load} setErr={setErr} openDrawer={setDrawer} />

            <MetadataSection metadata={loc.metadata} onEdit={() => setDrawer({ kind: "metadata" })} />
            <JsonSection data={loc} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <DetailSection
              title="Sales Channels"
              action={<RowMenu items={[{ label: "Connect sales channels", onClick: () => setDrawer({ kind: "channels" }) }]} />}
            >
              {channels.length > 0 ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{summarize(channels, 3)}</div>
                  <div style={{ ...subtle, fontSize: 12, marginTop: 4 }}>
                    Connected to {channels.length}
                    {totalChannels != null ? ` of ${totalChannels}` : ""} sales channels
                  </div>
                </>
              ) : (
                <EmptyState title="No records" hint="The location is not connected to any sales channels." />
              )}
            </DetailSection>

            <DetailSection
              title="Fulfillment Providers"
              action={<RowMenu items={[{ label: "Connect Providers", onClick: () => setDrawer({ kind: "providers" }) }]} />}
            >
              {providers.length > 0 ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{summarize(providers, 3)}</div>
                  <div style={{ ...subtle, fontSize: 12, marginTop: 4 }}>
                    Connected to {providers.length}
                    {totalProviders != null ? ` of ${totalProviders}` : ""} fulfillment providers
                  </div>
                </>
              ) : (
                <EmptyState title="No records" hint="This Stock Location is not connected to any fulfillment providers." />
              )}
            </DetailSection>
          </div>
        </div>
      ) : null}

      {loc && drawer?.kind === "edit" ? <EditLocationDrawer location={loc} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {loc && drawer?.kind === "channels" ? <SalesChannelsDrawer location={loc} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {loc && drawer?.kind === "providers" ? <ProvidersDrawer location={loc} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {loc && drawer?.kind === "metadata" ? (
        <MetadataDrawer
          metadata={loc.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (metadata) => {
            await api(`/admin/stock-locations/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
      {loc && drawer?.kind === "zone-create" ? (
        <ServiceZoneDrawer mode="create" location={loc} setId={drawer.setId} type={drawer.type} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {loc && drawer?.kind === "zone-edit" ? (
        <ServiceZoneDrawer mode="edit" location={loc} setId={drawer.setId} zone={drawer.zone} type={drawer.type} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {loc && drawer?.kind === "areas" ? <ManageAreasDrawer setId={drawer.setId} zone={drawer.zone} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {loc && drawer?.kind === "option" ? (
        <EditShippingOptionDrawer option={drawer.option} locationId={id} isPickup={drawer.type === "pickup"} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
    </div>
  );
}
