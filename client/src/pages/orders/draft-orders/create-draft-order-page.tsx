import { useEffect, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { COUNTRIES } from "@/shared/i18n/countries";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextField,
  ToggleField,
  requiredText,
  useFormState,
} from "@/widgets/form";
import type { CheckOption } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

interface Addr {
  country_code: string;
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  postal_code: string;
  province: string;
  phone: string;
}

const EMPTY_ADDR: Addr = {
  country_code: "",
  first_name: "",
  last_name: "",
  company: "",
  address_1: "",
  address_2: "",
  city: "",
  postal_code: "",
  province: "",
  phone: "",
};

const REQUIRED_ADDR_KEYS: (keyof Addr)[] = [
  "country_code",
  "first_name",
  "last_name",
  "address_1",
  "city",
  "postal_code",
];

function addrComplete(a: Addr): boolean {
  return REQUIRED_ADDR_KEYS.every((k) => a[k].trim() !== "");
}

function cleanAddr(a: Addr): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(a) as (keyof Addr)[]) {
    const v = a[k].trim();
    if (v !== "") out[k] = v;
  }
  return out;
}

function savedLabel(a: any, index: number): string {
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const label = [name, a.address_1, a.city].filter(Boolean).join(", ");
  return label || `Saved address ${index + 1}`;
}

export function CreateDraftOrderPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [regions, setRegions] = useState<CheckOption[]>([]);
  const [channels, setChannels] = useState<CheckOption[]>([]);
  const [customers, setCustomers] = useState<CheckOption[]>([]);
  const [customersRaw, setCustomersRaw] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [shipPick, setShipPick] = useState("");
  const [billPick, setBillPick] = useState("");

  const {
    values,
    set,
    error: serverErr,
    setError: setServerErr,
    busy,
    setBusy,
    validate,
    fieldErrors,
    dirty,
  } = useFormState({
    regionId: "",
    channelId: "",
    customerId: "",
    email: "",
    ship: { ...EMPTY_ADDR },
    bill: { ...EMPTY_ADDR },
    sameAsShipping: true,
  });

  const regionId = values.regionId;
  const channelId = values.channelId;
  const customerId = values.customerId;
  const email = values.email;
  const ship = values.ship;
  const bill = values.bill;
  const sameAsShipping = values.sameAsShipping;
  const setCustomerId = (v: string) => set("customerId", v);
  const setEmail = (v: string) => set("email", v);
  const setShip = (v: Addr) => set("ship", v);
  const setBill = (v: Addr) => set("bill", v);
  const setSameAsShipping = (v: boolean) => {
    set("sameAsShipping", v)
    setBill({ ...EMPTY_ADDR })
    setBillPick("")
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [rg, ch, cu] = await Promise.all([
          api("/admin/regions?limit=100&offset=0").catch(() => null),
          api("/admin/sales-channels?limit=100&offset=0").catch(() => null),
          api("/admin/customers?limit=100&offset=0").catch(() => null),
        ]);
        if (!alive) return;
        if (rg)
          setRegions(
            parseList(rg, 100).items.map((r: any) => ({
              id: r.id,
              label: r.name ?? r.id,
              sub: r.currency_code,
            })),
          );
        if (ch)
          setChannels(
            parseList(ch, 100).items.map((c: any) => ({
              id: c.id,
              label: c.name ?? c.id,
            })),
          );
        if (cu) {
          const rows = parseList(cu, 100).items;
          setCustomersRaw(rows);
          setCustomers(
            rows.map((c: any) => {
              const name = [c.first_name, c.last_name]
                .filter(Boolean)
                .join(" ");
              return {
                id: c.id,
                label: name ? `${name} (${c.email})` : c.email,
                sub: c.email,
              };
            }),
          );
        }
      } catch (e) {
        if (alive) setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!customerId) {
      setSavedAddresses([]);
      setShipPick("");
      setBillPick("");
      return;
    }
    let alive = true;
    api(`/admin/customers/${customerId}/addresses`)
      .then((d: any) => {
        if (!alive) return;
        const rows = Array.isArray(d?.addresses)
          ? d.addresses
          : parseList(d, 100).items;
        setSavedAddresses(rows);
      })
      .catch(() => {
        if (alive) setSavedAddresses([]);
      });
    return () => {
      alive = false;
    };
  }, [customerId]);

  function pickCustomer(id: string) {
    setCustomerId(id);
    if (!id) {
      setEmail("");
      setShipPick("");
      setBillPick("");
      return;
    }
    const c = customersRaw.find((x: any) => x.id === id);
    if (c?.email) setEmail(String(c.email));
  }

  function fillFromSaved(kind: "ship" | "bill", addressId: string) {
    if (kind === "ship") setShipPick(addressId);
    else setBillPick(addressId);
    if (!addressId) return;
    const found = savedAddresses.find((x: any) => x.id === addressId);
    if (!found) return;
    const next: Addr = { ...EMPTY_ADDR };
    for (const k of Object.keys(next) as (keyof Addr)[]) {
      const v = found[k];
      next[k] = v === null || v === undefined ? "" : String(v);
    }
    const cust = customersRaw.find((x: any) => x.id === customerId);
    if (!next.first_name.trim() && cust?.first_name)
      next.first_name = String(cust.first_name);
    if (!next.last_name.trim() && cust?.last_name)
      next.last_name = String(cust.last_name);
    if (kind === "ship") setShip(next);
    else setBill(next);
  }

  async function handleDismiss() {
    if (dirty) {
      const ok = await confirm({
        title: "Unsaved changes",
        description:
          "You have unsaved changes. Are you sure you want to leave this form?",
        variant: "primary",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
    }
    navigate("/r/draft-orders");
  }

  async function save() {
    setServerErr(null);
    if (
      !validate({
        regionId: (v) => requiredText(v, "Required"),
        channelId: (v) => requiredText(v, "Required"),
        email: (v, all) =>
          all.customerId || `${v}`.trim()
            ? undefined
            : "Either a customer or email must be provided",
        ship: (v) =>
          addrComplete(v as Addr) ? undefined : "Shipping address is required",
        bill: (v, all) =>
          all.sameAsShipping || addrComplete(v as Addr)
            ? undefined
            : "Billing address is required",
      })
    )
      return;
    setBusy(true);
    try {
      const body: Record<string, any> = {
        region_id: regionId,
        sales_channel_id: channelId,
        shipping_address: cleanAddr(ship),
        billing_address: sameAsShipping ? cleanAddr(ship) : cleanAddr(bill),
      };
      if (customerId) body.customer_id = customerId;
      else body.email = email.trim();
      const res = await api<{ draft_order: any }>("/admin/draft-orders", {
        method: "POST",
        body,
      });
      navigate(`/r/draft-orders/${res.draft_order.id}`);
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onFormKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  const divider = (
    <div
      aria-hidden="true"
      style={{ borderTop: "1px dashed var(--card-border)", margin: "20px 0" }}
    />
  );

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo="/r/draft-orders"
      footer={
        <FormActions
          onCancel={() => {
            void handleDismiss();
          }}
          onSubmit={() => {
            void save();
          }}
          submitLabel="Save"
          busy={busy}
        />
      }
    >
      <form
        onKeyDown={onFormKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Create Draft Order
        </div>
        {loadErr ? <Alert>{loadErr}</Alert> : null}
        {serverErr ? <Alert>{serverErr}</Alert> : null}
        {loading ? (
          <div
            style={{ display: "flex", justifyContent: "center", padding: 48 }}
          >
            <Spinner size={22} />
          </div>
        ) : (
          <>
            <SelectField
              label="Region"
              layout="split"
              hint="Choose region"
              required
              error={fieldErrors.regionId}
              value={regionId}
              onChange={(v) => set("regionId", v)}
              options={regions.map((o) => ({
                value: o.id,
                label: o.label,
                sub: o.sub,
              }))}
              placeholder="Select region"
              searchable
            />
            {divider}
            <SelectField
              label="Sales Channel"
              layout="split"
              hint="Choose sales channel"
              required
              error={fieldErrors.channelId}
              value={channelId}
              onChange={(v) => set("channelId", v)}
              options={channels.map((o) => ({
                value: o.id,
                label: o.label,
                sub: o.sub,
              }))}
              placeholder="Select sales channel"
              searchable
            />
            {divider}
            <SelectField
              label="Customer"
              layout="split"
              optional
              hint="Choose an existing customer"
              value={customerId}
              onChange={pickCustomer}
              options={customers.map((o) => ({
                value: o.id,
                label: o.label,
                sub: o.sub,
              }))}
              placeholder="Select customer"
              searchable
            />
            {divider}
            <TextField
              label="Email"
              layout="split"
              hint={
                customerId
                  ? "You cannot change the email when a customer is selected"
                  : "Input a email to associate with the order"
              }
              type="email"
              placeholder="john@doe.com"
              value={email}
              onChange={setEmail}
              disabled={!!customerId}
              error={fieldErrors.email}
            />
            {divider}
            <FormSection
              title="Shipping address"
              layout="split"
              subtitle="Address used for shipping"
            >
              {customerId ? (
                <>
                  <SelectField
                    label="Saved addresses"
                    optional
                    hint="Choose one of the customers saved addresses."
                    value={shipPick}
                    onChange={(v) => fillFromSaved("ship", v)}
                    options={savedAddresses.map((a: any, i: number) => ({
                      value: a.id,
                      label: savedLabel(a, i),
                      sub: a.country_code
                        ? String(a.country_code).toUpperCase()
                        : undefined,
                    }))}
                    placeholder="Select shipping address"
                    searchable
                  />
                  {divider}
                </>
              ) : null}
              <AddrStack addr={ship} onChange={setShip} error={fieldErrors.ship} />
            </FormSection>
            {divider}
            <FormSection
              title="Billing address"
              layout="split"
              subtitle="Address used for billing"
            >
              <ToggleField
                title="Same as shipping address"
                hint="Use the same address for billing and shipping"
                checked={sameAsShipping}
                onChange={setSameAsShipping}
              />
              {sameAsShipping ? null : (
                <>
                  {customerId ? (
                    <>
                      <SelectField
                        label="Saved addresses"
                        optional
                        hint="Choose one of the customers saved addresses."
                        value={billPick}
                        onChange={(v) => fillFromSaved("bill", v)}
                        options={savedAddresses.map((a: any, i: number) => ({
                          value: a.id,
                          label: savedLabel(a, i),
                          sub: a.country_code
                            ? String(a.country_code).toUpperCase()
                            : undefined,
                        }))}
                        placeholder="Select billing address"
                        searchable
                      />
                      {divider}
                    </>
                  ) : null}
                  <AddrStack addr={bill} onChange={setBill} error={fieldErrors.bill} />
                </>
              )}
            </FormSection>
          </>
        )}
      </form>
    </WizardShell>
  );
}

function AddrStack({
  addr,
  onChange,
  error,
}: {
  addr: Addr;
  onChange: (a: Addr) => void;
  error?: string;
}) {
  const set = (k: keyof Addr, v: string) => onChange({ ...addr, [k]: v });
  return (
    <>
      <SelectField
        label="Country"
        value={addr.country_code}
        onChange={(v) => set("country_code", v)}
        options={COUNTRIES.map((c) => ({ value: c.id, label: c.label }))}
        placeholder="Select country"
        searchable
        error={error}
      />
      <FormGrid cols={2}>
        <TextField
          label="First name"
          value={addr.first_name}
          onChange={(v) => set("first_name", v)}
        />
        <TextField
          label="Last name"
          value={addr.last_name}
          onChange={(v) => set("last_name", v)}
        />
      </FormGrid>
      <TextField
        label="Company"
        optional
        value={addr.company}
        onChange={(v) => set("company", v)}
      />
      <TextField
        label="Address"
        value={addr.address_1}
        onChange={(v) => set("address_1", v)}
      />
      <TextField
        label="Apartment, suite, etc."
        optional
        value={addr.address_2}
        onChange={(v) => set("address_2", v)}
      />
      <FormGrid cols={2}>
        <TextField
          label="Postal code"
          value={addr.postal_code}
          onChange={(v) => set("postal_code", v)}
        />
        <TextField
          label="City"
          value={addr.city}
          onChange={(v) => set("city", v)}
        />
      </FormGrid>
      <TextField
        label="Province / State"
        optional
        value={addr.province}
        onChange={(v) => set("province", v)}
      />
      <TextField
        label="Phone"
        optional
        value={addr.phone}
        onChange={(v) => set("phone", v)}
      />
    </>
  );
}
