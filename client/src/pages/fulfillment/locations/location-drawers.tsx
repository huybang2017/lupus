import { useMemo, useState } from "react";
import { api } from "@/shared/api/client";
import { COUNTRY_OPTIONS } from "@/shared/i18n/country-options";
import { useServerList } from "@/shared/hooks/use-server-list";
import { DataTable, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { FormDrawer, FormGrid, SelectField, TextField } from "@/widgets/form";
import { REQUIRED, formatProvider, type Address } from "@/pages/fulfillment/locations/location-utils";

export interface AddressState {
  address_1: string;
  address_2: string;
  postal_code: string;
  city: string;
  country_code: string;
  province: string;
  company: string;
  phone: string;
}

export const blankAddress = (a?: Address | null): AddressState => ({
  address_1: a?.address_1 ?? "",
  address_2: a?.address_2 ?? "",
  postal_code: a?.postal_code ?? "",
  city: a?.city ?? "",
  country_code: a?.country_code ?? "",
  province: a?.province ?? "",
  company: a?.company ?? "",
  phone: a?.phone ?? "",
});

export function addressErrors(name: string, a: AddressState) {
  return {
    name: name.trim() === "" ? REQUIRED : undefined,
    address_1: a.address_1.trim() === "" ? REQUIRED : undefined,
    country_code: a.country_code === "" ? "Too small: expected string to have >=2 characters" : undefined,
  };
}

/** Name + address fields in Lupus's order: address / apartment, postal code / city, country / state, company / phone. */
export function AddressFields({
  name,
  onName,
  value,
  onChange,
  errors,
}: {
  name: string;
  onName: (v: string) => void;
  value: AddressState;
  onChange: (next: AddressState) => void;
  errors?: ReturnType<typeof addressErrors>;
}) {
  const set = (k: keyof AddressState) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <TextField label="Name" value={name} onChange={onName} error={errors?.name} />
      <FormGrid cols={2} gap={12}>
        <TextField label="Address" value={value.address_1} onChange={set("address_1")} error={errors?.address_1} />
        <TextField label="Apartment, suite, etc." optional value={value.address_2} onChange={set("address_2")} />
        <TextField label="Postal Code" optional value={value.postal_code} onChange={set("postal_code")} />
        <TextField label="City" optional value={value.city} onChange={set("city")} />
        <SelectField
          label="Country"
          value={value.country_code}
          onChange={set("country_code")}
          options={COUNTRY_OPTIONS}
          placeholder="Select country"
          searchable
          allowClear={false}
          error={errors?.country_code}
        />
        <TextField label="State" optional value={value.province} onChange={set("province")} />
        <TextField label="Company" optional value={value.company} onChange={set("company")} />
        <TextField label="Phone" optional value={value.phone} onChange={set("phone")} />
      </FormGrid>
    </>
  );
}

export function addressPayload(a: AddressState) {
  return {
    address_1: a.address_1.trim(),
    address_2: a.address_2.trim() || null,
    postal_code: a.postal_code.trim() || null,
    city: a.city.trim() || null,
    country_code: a.country_code,
    province: a.province.trim() || null,
    company: a.company.trim() || null,
    phone: a.phone.trim() || null,
  };
}

// Lupus "Edit Stock Location".
export function EditLocationDrawer({ location, onClose, onSaved }: { location: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState<string>(location.name ?? "");
  const [address, setAddress] = useState<AddressState>(blankAddress(location.address));
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errors = addressErrors(name, address);
  const invalid = !!(errors.name || errors.address_1 || errors.country_code);

  async function save() {
    if (invalid) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/stock-locations/${location.id}`, { method: "POST", body: { name: name.trim(), address: addressPayload(address) } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Stock Location" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <AddressFields name={name} onName={setName} value={address} onChange={setAddress} errors={show ? errors : undefined} />
    </FormDrawer>
  );
}

// Lupus "Sales Channels" of a location: tick the channels the location serves.
export function SalesChannelsDrawer({ location, onClose, onSaved }: { location: any; onClose: () => void; onSaved: () => void }) {
  const initial: string[] = (location.sales_channels ?? []).map((c: any) => c.id);
  const [picked, setPicked] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error } = useServerList<any>("/admin/sales-channels", { page, limit: 20, q });

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/stock-locations/${location.id}/sales-channels`, {
        method: "POST",
        body: { add: picked.filter((x) => !initial.includes(x)), remove: initial.filter((x) => !picked.includes(x)) },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Sales Channels"
      subtitle="Manage the sales channels that are connected to this location."
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
    >
      <div style={{ margin: "0 -24px" }}>
        <TableToolbar
          right={
            <TableSearch
              value={draft}
              onChange={setDraft}
              onSubmit={() => {
                setQ(draft.trim());
                setPage(1);
              }}
              width={220}
              placeholder="Search"
            />
          }
        />
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (c: any) => <span style={{ fontWeight: 600 }}>{c.name}</span> },
            { key: "description", label: "Description", render: (c: any) => c.description || "-" },
          ]}
          rows={items}
          loading={loading}
          error={error}
          selectable
          selected={picked}
          onToggleRow={(id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onToggleAll={(checked) => setPicked((s) => (checked ? [...new Set([...s, ...items.map((c) => c.id)])] : s.filter((id) => !items.some((c) => c.id === id))))}
          emptyTitle={q ? "No results found" : "No records"}
          emptyHint={q ? "No sales channels match your search." : "There are no records to show"}
        />
        <TablePager page={page} limit={20} count={count} onPage={setPage} />
      </div>
    </FormDrawer>
  );
}

// Lupus "Connected fulfillment providers".
export function ProvidersDrawer({ location, onClose, onSaved }: { location: any; onClose: () => void; onSaved: () => void }) {
  const initial: string[] = (location.fulfillment_providers ?? []).map((p: any) => p.id);
  const [picked, setPicked] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { items, loading, error } = useServerList<any>("/admin/fulfillment-providers", { page: 1, limit: 100 });

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/stock-locations/${location.id}/fulfillment-providers`, {
        method: "POST",
        body: { add: picked.filter((x) => !initial.includes(x)), remove: initial.filter((x) => !picked.includes(x)) },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Fulfillment Providers"
      subtitle="Choose the fulfillment providers that can be used by this location's shipping options."
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
    >
      <div style={{ margin: "0 -24px" }}>
        <DataTable
          columns={[{ key: "id", label: "ID", render: (p: any) => <span style={{ fontWeight: 600 }}>{formatProvider(p.id)}</span> }]}
          rows={items}
          loading={loading}
          error={error}
          selectable
          selected={picked}
          onToggleRow={(id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onToggleAll={(checked) => setPicked(checked ? items.map((p) => p.id) : [])}
          emptyTitle="No records"
        />
      </div>
    </FormDrawer>
  );
}

/** Lupus's area picker: the countries a service zone covers. */
export function AreaPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => COUNTRY_OPTIONS.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <div>
      <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 6 }}>
        {value.length} {value.length === 1 ? "area" : "areas"} selected
      </div>
      <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, maxHeight: "50vh", overflowY: "auto" }}>
        {shown.map((c) => (
          <label
            key={c.value}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--card-border)", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={value.includes(c.value)}
              onChange={() => onChange(value.includes(c.value) ? value.filter((x) => x !== c.value) : [...value, c.value])}
            />
            {c.label}
          </label>
        ))}
        {shown.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: "var(--fg-subtle)" }}>No results found</div> : null}
      </div>
    </div>
  );
}

// Lupus "Create Service Zone" (name + areas) and "Edit Service Zone" (name).
export function ServiceZoneDrawer({
  mode,
  location,
  setId,
  zone,
  type,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  location: any;
  setId: string;
  zone?: any;
  type: "shipping" | "pickup";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState<string>(zone?.name ?? "");
  const [countries, setCountries] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameError = name.trim() === "" ? REQUIRED : undefined;
  const areaError = mode === "create" && countries.length === 0 ? "Select at least one area" : undefined;

  async function save() {
    if (nameError || areaError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (mode === "create") {
        await api(`/admin/fulfillment-sets/${setId}/service-zones`, {
          method: "POST",
          body: { name: name.trim(), geo_zones: countries.map((country_code) => ({ type: "country", country_code })) },
        });
      } else {
        await api(`/admin/fulfillment-sets/${setId}/service-zones/${zone.id}`, { method: "POST", body: { name: name.trim() } });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title={mode === "create" ? `Create Service Zone for ${type === "pickup" ? "Pickup" : "Shipping"} from ${location.name}` : "Edit Service Zone"}
      subtitle={
        mode === "create"
          ? "A service zone is a collection of geographical zones or areas. It's used to restrict available shipping options to a defined set of locations."
          : undefined
      }
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
    >
      <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
      {mode === "create" ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Areas</div>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 8 }}>Select the geographical areas that the service zone covers.</div>
          <AreaPicker value={countries} onChange={setCountries} />
          {show && areaError ? (
            <div role="alert" style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>
              {areaError}
            </div>
          ) : null}
        </div>
      ) : null}
    </FormDrawer>
  );
}

// Lupus "Manage Areas for <zone>".
export function ManageAreasDrawer({ setId, zone, onClose, onSaved }: { setId: string; zone: any; onClose: () => void; onSaved: () => void }) {
  const others = (zone.geo_zones ?? []).filter((g: any) => g.type !== "country");
  const [countries, setCountries] = useState<string[]>(
    (zone.geo_zones ?? []).filter((g: any) => g.type === "country").map((g: any) => String(g.country_code).toLowerCase()),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/fulfillment-sets/${setId}/service-zones/${zone.id}`, {
        method: "POST",
        body: {
          geo_zones: [
            ...countries.map((country_code) => ({ type: "country", country_code })),
            // province / city / postal areas can only be managed through the API; keep them
            ...others.map((g: any) => ({
              type: g.type,
              country_code: g.country_code,
              province_code: g.province_code,
              city: g.city,
              postal_expression: g.postal_expression ? (typeof g.postal_expression === "string" ? JSON.parse(g.postal_expression) : g.postal_expression) : undefined,
            })),
          ],
        },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title={`Manage Areas for ${zone.name}`}
      subtitle="Select the geographical areas that the service zone covers."
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
    >
      <AreaPicker value={countries} onChange={setCountries} />
    </FormDrawer>
  );
}

