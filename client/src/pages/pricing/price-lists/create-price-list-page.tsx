import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { toISO } from "@/shared/utils/form-utils";
import { priceMapError, pricesFromMap, type PriceMap } from "@/shared/pricing/price-list";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  DateTimeField,
  FormActions,
  FormGrid,
  FormSection,
  RadioGroupField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { CustomerAvailabilityField, type Group } from "@/pages/pricing/price-lists/customer-availability";
import { ProductPicker, type PickedProducts } from "@/pages/pricing/price-lists/product-picker";
import { PriceGrid } from "@/pages/pricing/price-lists/price-grid";
import { usePriceCurrencies } from "@/shared/hooks/use-price-currencies";

const REQUIRED = "Too small: expected string to have >=1 characters";
const LIST = "/r/price-lists";

// Lupus's Create Price List: Details -> Products -> Prices. Like Lupus, moving forward validates
// every earlier tab (and sends you back to the first one that fails) instead of locking tabs.
export function CreatePriceListPage() {
  const navigate = useNavigate();
  const { currencies, loading: loadingCurrencies } = usePriceCurrencies();
  const [tab, setTab] = useState("details");
  const [type, setType] = useState("sale");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("active");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [picked, setPicked] = useState<PickedProducts>({});
  const [prices, setPrices] = useState<PriceMap>({});
  const [showDetails, setShowDetails] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const products = Object.values(picked);
  const variantIds = products.flatMap((p: any) => (p.variants ?? []).map((v: any) => v.id));

  const titleError = title.trim() === "" ? REQUIRED : undefined;
  const descriptionError = description.trim() === "" ? REQUIRED : undefined;
  const endsError =
    startsAt && endsAt && new Date(endsAt) <= new Date(startsAt) ? "The end date must be after the start date" : undefined;
  const detailsOk = !titleError && !descriptionError && !endsError;
  const productsError = products.length === 0 ? "Too small: expected array to have >=1 items" : undefined;
  const pricesError = priceMapError(prices);

  const dirty =
    title.trim() !== "" ||
    description.trim() !== "" ||
    startsAt !== "" ||
    endsAt !== "" ||
    groups.length > 0 ||
    products.length > 0 ||
    type !== "sale" ||
    status !== "active";

  async function leave() {
    if (busy) return;
    if (dirty) {
      const ok = await requestConfirm({
        title: "Are you sure you want to leave this form?",
        description: "You have unsaved changes that will be lost if you exit this form.",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        variant: "primary",
      });
      if (!ok) return;
    }
    navigate(LIST);
  }
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // a picker drawer / dialog / dropdown handles its own Escape
      if (document.querySelector('.confirm-back, .modal-back, [role="listbox"]')) return;
      void leaveRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const order = ["details", "products", "prices"];
  function goTo(target: string) {
    // every tab before the target has to be valid; the first one that is not takes over
    if (order.indexOf(target) > 0 && !detailsOk) {
      setShowDetails(true);
      setTab("details");
      return;
    }
    if (order.indexOf(target) > 1 && productsError) {
      setShowProducts(true);
      setTab("products");
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
    if (productsError) {
      setShowProducts(true);
      setTab("products");
      return;
    }
    if (pricesError) {
      setShowPrices(true);
      setErr(pricesError);
      return;
    }
    setBusy(true);
    try {
      const s = toISO(startsAt);
      const e = toISO(endsAt);
      const res = await api<{ price_list: { id: string } }>("/admin/price-lists", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim(),
          type,
          status,
          starts_at: s,
          ends_at: e,
          ...(groups.length ? { rules: { "customer.groups.id": groups.map((g) => g.id) } } : {}),
          prices: pricesFromMap(prices, variantIds),
        },
      });
      navigate(`${LIST}/${res.price_list.id}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  const last = tab === "prices";

  return (
    <WizardShell
      tabs={[
        { id: "details", label: "Details" },
        { id: "products", label: "Products" },
        { id: "prices", label: "Prices" },
      ]}
      tab={tab}
      onTab={goTo}
      closeTo={LIST}
      onRequestClose={() => void leave()}
      wide={tab !== "details"}
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={last ? save : () => goTo(tab === "details" ? "products" : "prices")}
          submitLabel={last ? "Save" : "Continue"}
          busy={busy}
          disabled={last && loadingCurrencies}
        />
      }
    >
      {err ? (
        <div style={{ padding: tab === "details" ? 0 : "16px 24px 0" }}>
          <Alert>{err}</Alert>
        </div>
      ) : null}

      {tab === "details" ? (
        <FormSection title="Create Price List" subtitle="Create a new price list to manage the prices of your products.">
          <RadioGroupField
            label="Type"
            hint="Choose the type of price list you want to create."
            value={type}
            onChange={setType}
            cols={2}
            options={[
              { id: "sale", label: "Sale", hint: "Sale prices are temporary price changes for products." },
              { id: "override", label: "Override", hint: "Overrides are usually used to create customer-specific prices." },
            ]}
          />
          <FormGrid cols={2}>
            <TextField label="Title" value={title} onChange={setTitle} error={showDetails ? titleError : undefined} />
            <SelectField
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: "Active" },
                { value: "draft", label: "Draft" },
              ]}
            />
          </FormGrid>
          <TextAreaField
            label="Description"
            rows={4}
            value={description}
            onChange={setDescription}
            error={showDetails ? descriptionError : undefined}
          />
          <hr style={{ border: 0, borderTop: "1px solid var(--card-border)", margin: "8px 0" }} />
          <DateTimeField
            layout="split"
            label="Price list has a start date?"
            optional
            hint="Schedule the price list to activate in the future."
            value={startsAt}
            onChange={setStartsAt}
          />
          <hr style={{ border: 0, borderTop: "1px solid var(--card-border)", margin: "8px 0" }} />
          <DateTimeField
            layout="split"
            label="Price list has an expiry date?"
            optional
            hint="Schedule the price list to deactivate in the future."
            value={endsAt}
            onChange={setEndsAt}
            error={showDetails ? endsError : undefined}
          />
          <hr style={{ border: 0, borderTop: "1px solid var(--card-border)", margin: "8px 0" }} />
          <CustomerAvailabilityField groups={groups} onChange={setGroups} />
        </FormSection>
      ) : null}

      {tab === "products" ? (
        <ProductPicker picked={picked} onChange={setPicked} error={showProducts ? productsError : undefined} />
      ) : null}

      {tab === "prices" ? (
        <div style={{ padding: "20px 24px 72px" }}>
          {loadingCurrencies ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              <Spinner size={22} />
            </div>
          ) : (
            <>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg-subtle)" }}>
                Amounts are in the smallest currency unit (e.g. cents). Variants without an amount get no override.
              </p>
              <PriceGrid products={products} currencies={currencies} value={prices} onChange={setPrices} showErrors={showPrices} />
            </>
          )}
        </div>
      ) : null}
    </WizardShell>
  );
}
