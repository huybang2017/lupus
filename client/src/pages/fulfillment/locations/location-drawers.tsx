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
