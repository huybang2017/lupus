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
