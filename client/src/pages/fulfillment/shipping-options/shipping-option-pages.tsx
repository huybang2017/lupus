import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FormActions, FormDrawer, FormGrid, FormSection, RadioGroupField, SelectField, TextField, ToggleField } from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { REQUIRED, formatProvider } from "@/pages/fulfillment/locations/location-utils";
import { ShippingPriceGrid, emptyPrices, priceStateError, pricesFromOption, pricesToPayload, type PriceState } from "@/pages/fulfillment/shipping-options/shipping-price-grid";

const detailLink = (locationId: string) => `/settings/stock-locations/${locationId}`;

interface Details {
  price_type: "flat" | "calculated";
  name: string;
  shipping_profile_id: string;
  shipping_option_type_id: string;
  provider_id: string;
  fulfillment_option_id: string;
  enabled_in_store: boolean;
}

function detailErrors(d: Details, needsOption: boolean) {
  return {
    name: d.name.trim() === "" ? REQUIRED : undefined,
    shipping_profile_id: d.shipping_profile_id === "" ? REQUIRED : undefined,
    shipping_option_type_id: d.shipping_option_type_id === "" ? REQUIRED : undefined,
    provider_id: d.provider_id === "" ? REQUIRED : undefined,
    fulfillment_option_id: needsOption && d.fulfillment_option_id === "" ? REQUIRED : undefined,
  };
}

/** The option fields Lupus shares between its create form and its edit drawer. */
function DetailsFields({
  value,
  onChange,
  errors,
  locationId,
  isPickup,
  isReturn,
  withFulfillmentOption,
  onOptions,
}: {
  value: Details;
  onChange: (d: Details) => void;
  errors?: ReturnType<typeof detailErrors>;
  locationId: string;
  isPickup: boolean;
  isReturn: boolean;
  withFulfillmentOption: boolean;
  onOptions?: (options: any[]) => void;
}) {
  const set = (patch: Partial<Details>) => onChange({ ...value, ...patch });
  const profiles = useServerList<any>("/admin/shipping-profiles", { page: 1, limit: 100 });
  const types = useServerList<any>("/admin/shipping-option-types", { page: 1, limit: 100 });
  const providers = useServerList<any>("/admin/fulfillment-providers", { page: 1, limit: 100, params: { stock_location_id: locationId } });
  const [options, setOptions] = useState<any[]>([]);

  useEffect(() => {
    if (!withFulfillmentOption || !value.provider_id) {
      setOptions([]);
      onOptions?.([]);
      return;
    }
    let alive = true;
    api(`/admin/fulfillment-providers/${encodeURIComponent(value.provider_id)}/options`)
      .then((d: any) => {
        if (!alive) return;
        const list = (d.fulfillment_options ?? []).filter((o: any) => !!o.is_return === isReturn);
        setOptions(list);
        onOptions?.(d.fulfillment_options ?? []);
      })
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.provider_id, withFulfillmentOption, isReturn]);

  return (
    <>
      {!isPickup ? (
        <RadioGroupField
          label="Price type"
          value={value.price_type}
          onChange={(v) => set({ price_type: v as Details["price_type"] })}
          cols={2}
          options={[
            { id: "flat", label: "Fixed", hint: "The shipping option's price is fixed and does not change based on the order's contents." },
            { id: "calculated", label: "Calculated", hint: "The shipping option's price is calculated by the fulfillment provider during checkout." },
          ]}
        />
      ) : null}
      <FormGrid cols={2} gap={12}>
        <TextField label="Name" value={value.name} onChange={(v) => set({ name: v })} error={errors?.name} />
        <SelectField
          label="Shipping profile"
          value={value.shipping_profile_id}
          onChange={(v) => set({ shipping_profile_id: v })}
          options={profiles.items.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Select"
          searchable
          allowClear={false}
          error={errors?.shipping_profile_id}
        />
        <SelectField
          label="Shipping option type"
          value={value.shipping_option_type_id}
          onChange={(v) => set({ shipping_option_type_id: v })}
          options={types.items.map((t) => ({ value: t.id, label: t.label }))}
          placeholder="Select"
          searchable
          allowClear={false}
          error={errors?.shipping_option_type_id}
        />
      </FormGrid>
      <FormGrid cols={2} gap={12}>
        <SelectField
          label="Fulfillment provider"
          hint={providers.items.length === 0 && !providers.loading ? "Connect a fulfillment provider to this location first." : undefined}
          value={value.provider_id}
          onChange={(v) => set({ provider_id: v, fulfillment_option_id: "" })}
          options={providers.items.map((p) => ({ value: p.id, label: formatProvider(p.id) }))}
          placeholder="Select"
          searchable
          allowClear={false}
          disabled={providers.items.length === 0}
          error={errors?.provider_id}
        />
        {withFulfillmentOption ? (
          <SelectField
            label="Fulfillment option"
            value={value.fulfillment_option_id}
            onChange={(v) => set({ fulfillment_option_id: v })}
            options={options.map((o) => ({ value: o.id, label: o.name || o.id }))}
            placeholder="Select"
            allowClear={false}
            disabled={!value.provider_id}
            error={errors?.fulfillment_option_id}
          />
        ) : null}
      </FormGrid>
      <hr style={{ border: 0, borderTop: "1px solid var(--card-border)", margin: "4px 0" }} />
      <ToggleField
        title="Enable in store"
        hint="Whether customers can use this option during checkout."
        checked={value.enabled_in_store}
        onChange={(v) => set({ enabled_in_store: v })}
        switchSide="right"
      />
    </>
  );
}

const blankDetails = (): Details => ({
  price_type: "flat",
  name: "",
  shipping_profile_id: "",
  shipping_option_type_id: "",
  provider_id: "",
  fulfillment_option_id: "",
  enabled_in_store: true,
});

// Lupus "Create Shipping Option" / "Create Pickup Option" / "Create a Return Option": Details tab
// and, for a fixed price, a Prices tab. Moving on validates the details first.
export function CreateShippingOptionPage() {
  const { id = "", setId = "", zoneId = "" } = useParams<{ id: string; setId: string; zoneId: string }>();
  const [search] = useSearchParams();
  const isReturn = search.has("is_return");
  const navigate = useNavigate();
  const back = detailLink(id);
  const [zone, setZone] = useState<any>(null);
  const [setType, setSetType] = useState<"shipping" | "pickup">("shipping");
  const [tab, setTab] = useState("details");
  const [d, setD] = useState<Details>(blankDetails());
  const [fulfillmentOptions, setFulfillmentOptions] = useState<any[]>([]);
  const [prices, setPrices] = useState<PriceState>(emptyPrices());
  const [showDetails, setShowDetails] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ service_zone: any }>(`/admin/fulfillment-sets/${setId}/service-zones/${zoneId}`)
      .then((r) => setZone(r.service_zone))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api<{ stock_location: any }>(`/admin/stock-locations/${id}`)
      .then((r) => {
        const set = (r.stock_location.fulfillment_sets ?? []).find((s: any) => s.id === setId);
        if (set) setSetType(set.type);
      })
      .catch(() => undefined);
  }, [id, setId, zoneId]);

  const isPickup = setType === "pickup";
  const calculated = d.price_type === "calculated" && !isPickup;
  const errors = detailErrors(d, true);
  const detailsOk = !Object.values(errors).some(Boolean);
  const dirty = d.name.trim() !== "" || d.shipping_profile_id !== "" || d.provider_id !== "" || Object.keys(prices.currency).length > 0;
  const leave = useLeaveGuard(dirty, back, busy);
  const kind = isReturn ? "returns" : isPickup ? "pickup" : "shipping";
  const heading = { returns: "Create a Return Option", pickup: "Create Pickup Option", shipping: "Create Shipping Option" }[kind] + (zone ? ` for ${zone.name}` : "");
  const hint = {
    returns: "Create a new return option to define how products are returned to this location.",
    pickup: "Create a new pickup option to define how products are picked up from this location.",
    shipping: "Create a new shipping option to define how products are shipped from this location.",
  }[kind];

  function goTo(target: string) {
    if (target === "prices" && !detailsOk) {
      setShowDetails(true);
      setTab("details");
      return;
    }
    setTab(target);
  }

  async function save() {
    setErr(null);
    if (!detailsOk) {
      setShowDetails(true);
      setTab("details");
      return;
    }
    const problem = calculated ? undefined : priceStateError(prices);
    if (problem) {
      setShowPrices(true);
      setTab("prices");
      return;
    }
    setBusy(true);
    try {
      const option = fulfillmentOptions.find((o) => o.id === d.fulfillment_option_id);
      await api("/admin/shipping-options", {
        method: "POST",
        body: {
          name: d.name.trim(),
          price_type: isPickup ? "flat" : d.price_type,
          service_zone_id: zoneId,
          shipping_profile_id: d.shipping_profile_id,
          provider_id: d.provider_id,
          prices: calculated ? [] : pricesToPayload(prices),
          data: option ?? undefined,
          rules: [
            { attribute: "is_return", operator: "eq", value: isReturn ? "true" : "false" },
            { attribute: "enabled_in_store", operator: "eq", value: d.enabled_in_store ? "true" : "false" },
          ],
          type_id: d.shipping_option_type_id,
        },
      });
      navigate(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const tabs = [{ id: "details", label: "Details" }, ...(calculated ? [] : [{ id: "prices", label: "Prices" }])];
  const onPrices = tab === "prices" && !calculated;

  return (
    <WizardShell
      tabs={tabs}
      tab={calculated ? "details" : tab}
      onTab={goTo}
      closeTo={back}
      onRequestClose={() => void leave()}
      wide={onPrices}
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={onPrices || calculated ? save : () => goTo("prices")}
          submitLabel={onPrices || calculated ? "Save" : "Continue"}
          busy={busy}
        />
      }
    >
      {err ? (
        <div style={{ padding: onPrices ? "16px 24px 0" : 0 }}>
          <Alert>{err}</Alert>
        </div>
      ) : null}
      {!zone && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {zone && !onPrices ? (
        <FormSection title={heading} subtitle={hint}>
          <DetailsFields
            value={d}
            onChange={setD}
            errors={showDetails ? errors : undefined}
            locationId={id}
            isPickup={isPickup}
            isReturn={isReturn}
            withFulfillmentOption
            onOptions={setFulfillmentOptions}
          />
        </FormSection>
      ) : null}
      {zone && onPrices ? (
        <div style={{ padding: "20px 24px 72px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg-subtle)" }}>
            Amounts are in the smallest currency unit (e.g. cents). Leave a column empty to not offer the option in that currency or region.
          </p>
          <ShippingPriceGrid name={d.name} value={prices} onChange={setPrices} showErrors={showPrices} prefillZero={isPickup} />
        </div>
      ) : null}
    </WizardShell>
  );
}

// Lupus "Edit Shipping Option" drawer.
export function EditShippingOptionDrawer({
  option,
  locationId,
  isPickup,
  onClose,
  onSaved,
}: {
  option: any;
  locationId: string;
  isPickup: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Details>({
    price_type: option.price_type,
    name: option.name ?? "",
    shipping_profile_id: option.shipping_profile?.id ?? "",
    shipping_option_type_id: option.type?.id ?? "",
    provider_id: option.provider_id ?? "",
    fulfillment_option_id: option.data?.id ?? "",
    enabled_in_store: option.enabled_in_store !== false,
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errors = detailErrors(d, false);
  const invalid = Object.values(errors).some(Boolean);

  async function save() {
    if (invalid) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/shipping-options/${option.id}`, {
        method: "POST",
        body: {
          name: d.name.trim(),
          price_type: isPickup ? "flat" : d.price_type,
          shipping_profile_id: d.shipping_profile_id,
          provider_id: d.provider_id,
          type_id: d.shipping_option_type_id,
          rules: [{ attribute: "enabled_in_store", operator: "eq", value: d.enabled_in_store ? "true" : "false" }],
        },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Shipping Option" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <DetailsFields
        value={d}
        onChange={setD}
        errors={show ? errors : undefined}
        locationId={locationId}
        isPickup={isPickup}
        isReturn={!!option.is_return}
        withFulfillmentOption={false}
      />
    </FormDrawer>
  );
}

// Lupus "Edit prices" of one shipping option.
export function ShippingOptionPricingPage() {
  const { id = "", optionId = "" } = useParams<{ id: string; optionId: string }>();
  const navigate = useNavigate();
  const back = detailLink(id);
  const [option, setOption] = useState<any>(null);
  const [before, setBefore] = useState("");
  const [prices, setPrices] = useState<PriceState>(emptyPrices());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ shipping_option: any }>(`/admin/shipping-options/${optionId}`)
      .then((r) => {
        setOption(r.shipping_option);
        const s = pricesFromOption(r.shipping_option.prices);
        setPrices(s);
        setBefore(JSON.stringify(s));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [optionId]);

  const leave = useLeaveGuard(JSON.stringify(prices) !== before, back, busy);

  async function save() {
    if (priceStateError(prices)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/shipping-options/${optionId}`, { method: "POST", body: { prices: pricesToPayload(prices) } });
      navigate(back);
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
      closeTo={back}
      onRequestClose={() => void leave()}
      wide
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} disabled={!option} />}
    >
      <div style={{ padding: "20px 24px 72px" }}>
        {err ? <Alert>{err}</Alert> : null}
        {!option && !err ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner size={22} />
          </div>
        ) : null}
        {option ? (
          <>
            <h1 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Edit prices</h1>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg-subtle)" }}>
              Amounts are in the smallest currency unit (e.g. cents). Leave a column empty to not offer the option in that currency or region.
            </p>
            <ShippingPriceGrid name={option.name} value={prices} onChange={setPrices} showErrors={showErrors} />
          </>
        ) : null}
      </div>
    </WizardShell>
  );
}
