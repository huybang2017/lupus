import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { slugify, toISO } from "@/shared/utils/form-utils";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  DateTimeField,
  FormActions,
  FormGrid,
  NumberField,
  RadioGroupField,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import {
  PromotionRulesField,
  newRow,
  requiredRow,
  rowError,
} from "@/pages/promotions/promotion-rules-field";
import type { RuleAttribute, RuleRow, RuleType } from "@/pages/promotions/promotion-rules-field";

type Allocation = "each" | "across" | "once";

interface Template {
  id: string;
  type: "standard" | "buyget";
  title: string;
  description: string;
  methodType: "fixed" | "percentage";
  targetType: "items" | "order" | "shipping_methods";
  allocation: Allocation;
  /** which allocation choices the template offers (empty = no allocation choice) */
  allocations: Allocation[];
  taxInclusiveToggle: boolean;
  showValue: boolean;
  value?: number;
}

// Ported from Lupus's promotion-create templates (hidden fields + defaults).
const TEMPLATES: Template[] = [
  {
    id: "amount_off_products",
    type: "standard",
    title: "Amount off products",
    description: "Discount specific products or collection of products",
    methodType: "fixed",
    targetType: "items",
    allocation: "each",
    allocations: ["each", "once"],
    taxInclusiveToggle: true,
    showValue: true,
  },
  {
    id: "amount_off_order",
    type: "standard",
    title: "Amount off order",
    description: "Discounts the total order amount",
    methodType: "fixed",
    targetType: "order",
    allocation: "across",
    allocations: [],
    taxInclusiveToggle: true,
    showValue: true,
  },
  {
    id: "percentage_off_product",
    type: "standard",
    title: "Percentage off product",
    description: "Discounts a percentage off selected products",
    methodType: "percentage",
    targetType: "items",
    allocation: "each",
    allocations: ["each", "once"],
    taxInclusiveToggle: false,
    showValue: true,
  },
  {
    id: "percentage_off_order",
    type: "standard",
    title: "Percentage off order",
    description: "Discounts a percentage of the total order amount",
    methodType: "percentage",
    targetType: "order",
    allocation: "across",
    allocations: [],
    taxInclusiveToggle: false,
    showValue: true,
  },
  {
    id: "buy_get",
    type: "buyget",
    title: "Buy X Get Y",
    description: "Buy X product(s), get Y product(s)",
    methodType: "percentage",
    targetType: "items",
    allocation: "each",
    allocations: [],
    taxInclusiveToggle: false,
    showValue: false,
    value: 100,
  },
  {
    id: "shipping_discount",
    type: "standard",
    title: "Free shipping",
    description: "Applies a 100% discount to shipping fees",
    methodType: "percentage",
    targetType: "shipping_methods",
    allocation: "across",
    allocations: [],
    taxInclusiveToggle: false,
    showValue: false,
    value: 100,
  },
];

const ALLOCATION_COPY: Record<Allocation, { label: string; hint: string }> = {
  each: { label: "Each", hint: "Applies value on each item" },
  across: { label: "Across", hint: "Applies value across items" },
  once: { label: "Once", hint: "Applies value to a limited number of items" },
};

const TABS = [
  { id: "type", label: "Type" },
  { id: "details", label: "Details" },
  { id: "campaign", label: "Campaign" },
];

const divider = <hr style={{ border: "none", borderTop: "1px solid var(--card-border)", margin: 0, width: "100%" }} />;
const sectionLabel = (text: string) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-base)", marginBottom: 6 }}>{text}</div>
);

function currencySymbol(code: string): string {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: code.toUpperCase() })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code.toUpperCase()
    );
  } catch {
    return code.toUpperCase();
  }
}

const OP_EQ = [{ value: "eq", label: "Equals" }];
const OPS_ALL = [
  { value: "in", label: "In" },
  { value: "eq", label: "Equals" },
  { value: "ne", label: "Not In" },
];
const attr = (id: string, label: string, field_type: RuleAttribute["field_type"], required: boolean, disguised: boolean): RuleAttribute => ({
  id,
  value: id === "product" ? "items.product.id" : id,
  label,
  field_type,
  required,
  disguised,
  operators: disguised ? OP_EQ : OPS_ALL,
});

/** The conditions a template always needs, usable before (or without) the attribute list. */
function fallbackAttributes(t: Template): Record<RuleType, RuleAttribute[]> {
  const buy = t.type === "buyget";
  return {
    rules: [attr("currency_code", "Currency Code", "select", t.methodType === "fixed", true)],
    "buy-rules": buy
      ? [attr("product", "Product", "multiselect", false, false), attr("buy_rules_min_quantity", "Minimum quantity of items", "number", true, true)]
      : [],
    "target-rules": buy
      ? [attr("product", "Product", "multiselect", false, false), attr("apply_to_quantity", "Quantity of items promotion will apply to", "number", true, true)]
      : [],
  };
}

/** Pre-added required rows: the disguised ones first, then the single-value product row (Lupus order). */
function requiredRowsFor(list: RuleAttribute[]): RuleRow[] {
  const product = list.find((a) => a.id === "product");
  return [
    ...list.filter((a) => a.required).map(requiredRow),
    ...(product ? [newRow({ attribute: product.value, operator: "eq", required: true, field_type: "select" })] : []),
  ];
}

export function CreatePromotionPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("type");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const template = TEMPLATES.find((t) => t.id === templateId)!;

  const [isAutomatic, setIsAutomatic] = useState("false");
  const [status, setStatus] = useState("draft");
  const [code, setCode] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [value, setValue] = useState(template.value != null ? String(template.value) : "");
  const [allocation, setAllocation] = useState<Allocation>(template.allocation);
  const [maxQuantity, setMaxQuantity] = useState("1");
  const [limit, setLimit] = useState("");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [buyRules, setBuyRules] = useState<RuleRow[]>([]);
  const [targetRules, setTargetRules] = useState<RuleRow[]>([]);
  const [attrs, setAttrs] = useState<Record<RuleType, RuleAttribute[]>>({ rules: [], "target-rules": [], "buy-rules": [] });
  const [attrsReady, setAttrsReady] = useState(false);
  const [attrsError, setAttrsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [campaignChoice, setCampaignChoice] = useState("none");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [camp, setCamp] = useState({
    name: "",
    identifier: "",
    identifierTouched: false,
    description: "",
    startsAt: "",
    endsAt: "",
    budgetType: "usage",
    budgetLimit: "",
  });

  const [showErrors, setShowErrors] = useState(false);
  const [showCampaignErrors, setShowCampaignErrors] = useState(false);
  const [touchedCode, setTouchedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A different template is a different form: reset everything, then load that template's
  // rule attributes and pre-add its required conditions (currency, minimum quantity, product).
  const firstRender = useRef(true);
  useEffect(() => {
    if (!firstRender.current) {
      setIsAutomatic("false");
      setStatus("draft");
      setCode("");
      setTaxInclusive(false);
      setValue(template.value != null ? String(template.value) : "");
      setAllocation(template.allocation);
      setMaxQuantity(template.allocation === "across" ? "" : "1");
      setLimit("");
      setShowErrors(false);
      setTouchedCode(false);
      setCampaignChoice("none");
      setCampaignId("");
    }
    firstRender.current = false;
    let alive = true;
    // The required conditions (currency / minimum quantity / product) are part of the template,
    // so they are in place immediately; the attribute list that feeds "Add condition" loads after.
    const fb = fallbackAttributes(template);
    setAttrs(fb);
    setRules(fb.rules.filter((a) => a.required).map(requiredRow));
    setBuyRules(template.type === "buyget" ? requiredRowsFor(fb["buy-rules"]) : []);
    setTargetRules(template.type === "buyget" ? requiredRowsFor(fb["target-rules"]) : []);
    setAttrsReady(true);
    setAttrsError(null);
    const q = new URLSearchParams({
      promotion_type: template.type,
      application_method_type: template.methodType,
      application_method_target_type: template.targetType,
    }).toString();
    (async () => {
      const get = async (rt: RuleType): Promise<RuleAttribute[]> =>
        (await api<{ attributes: RuleAttribute[] }>(`/admin/promotions/rule-attribute-options/${rt}?${q}`)).attributes ?? [];
      try {
        const [r, t, b] = await Promise.all([get("rules"), get("target-rules"), get("buy-rules")]);
        if (alive) setAttrs({ rules: r, "target-rules": t, "buy-rules": b });
      } catch (e) {
        if (alive) setAttrsError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, reloadKey]);

  useEffect(() => {
    api("/admin/campaigns?limit=100&offset=0")
      .then((d) => setCampaigns(parseList(d, 200).items))
      .catch(() => {});
  }, []);

  const isFixed = template.methodType === "fixed";
  const isBuyGet = template.type === "buyget";
  const currency = rules.find((r) => r.attribute === "currency_code")?.values[0] ?? "";
  const showMaxQuantity =
    (template.type === "standard" && allocation !== "across" && template.allocations.length > 0) || isBuyGet;
  const showTarget = template.targetType === "items";

  // ---- validation (Lupus's CreatePromotionSchema) ----
  const valueNum = value.trim() === "" ? NaN : Number(value);
  const codeErr = code.trim() === "" ? "Too small: expected string to have >=1 characters" : undefined;
  const valueErr = !template.showValue
    ? undefined
    : value.trim() === ""
      ? "Required field"
      : !(valueNum >= 0)
        ? "Must be a number greater than or equal to 0"
        : !isFixed && valueNum > 100
          ? "Percentage cannot be more than 100"
          : undefined;
  const maxErr = !showMaxQuantity
    ? undefined
    : maxQuantity.trim() === "" || !(Number.isInteger(Number(maxQuantity)) && Number(maxQuantity) >= 1)
      ? "Required field"
      : undefined;
  const limitErr =
    limit.trim() !== "" && !(Number.isInteger(Number(limit)) && Number(limit) >= 1)
      ? "Must be a whole number of at least 1"
      : undefined;
  const rowsInvalid = [...rules, ...(isBuyGet ? buyRules : []), ...(showTarget ? targetRules : [])].some((r) => !!rowError(r));
  const detailsInvalid = !!(codeErr || valueErr || maxErr || limitErr || rowsInvalid) || !attrsReady;

  const identifier = (camp.identifierTouched ? camp.identifier : slugify(camp.name)).trim();
  const newCampErr = {
    name: camp.name.trim() === "" ? "Too small: expected string to have >=1 characters" : undefined,
    identifier: identifier === "" ? "Too small: expected string to have >=1 characters" : undefined,
    limit:
      camp.budgetLimit.trim() !== "" && !(Number.isInteger(Number(camp.budgetLimit)) && Number(camp.budgetLimit) >= 0)
        ? "Must be a whole number"
        : undefined,
    dates:
      toISO(camp.startsAt) && toISO(camp.endsAt) && new Date(toISO(camp.endsAt)!) <= new Date(toISO(camp.startsAt)!)
        ? "Must be after the start date"
        : undefined,
  };
  const campaignInvalid =
    (campaignChoice === "existing" && !campaignId) ||
    (campaignChoice === "new" && !!(newCampErr.name || newCampErr.identifier || newCampErr.limit || newCampErr.dates));

  const allRows = [...rules, ...buyRules, ...targetRules];
  const dirty =
    code.trim() !== "" ||
    value.trim() !== "" && !template.value ||
    limit.trim() !== "" ||
    campaignChoice !== "none" ||
    allRows.some((r) => r.values.length > 0 || (!r.required && r.attribute));

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
    navigate("/r/promotions");
  }
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".confirm-back, [role=\"listbox\"]")) return;
      void leaveRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lupus: Continue / the Campaign tab validate the whole Details tab and stay put on errors.
  function goTo(next: string) {
    if (next === "campaign" && detailsInvalid) {
      setShowErrors(true);
      setTouchedCode(true);
      setTab("details");
      return;
    }
    setTab(next);
  }

  const buildRules = (list: RuleRow[]) =>
    list
      .filter((r) => !r.disguised)
      .map((r) => ({ attribute: r.attribute, operator: r.operator, values: r.operator === "eq" ? r.values[0] : r.values }));

  async function save() {
    if (detailsInvalid) {
      goTo("campaign");
      return;
    }
    if (campaignInvalid) {
      setShowCampaignErrors(true);
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      // disguised rows are not conditions: they set fields of the application method
      const method: Record<string, any> = {};
      for (const r of [...targetRules, ...buyRules, ...rules].filter((x) => x.disguised)) {
        method[r.attribute] = r.field_type === "number" ? parseInt(r.values[0], 10) : r.values[0];
      }
      const body: Record<string, any> = {
        code: code.trim(),
        type: template.type,
        status,
        is_automatic: isAutomatic === "true",
        is_tax_inclusive: template.taxInclusiveToggle ? taxInclusive : false,
        rules: buildRules(rules),
        application_method: {
          type: template.methodType,
          target_type: template.targetType,
          ...(template.type === "standard" ? { allocation } : {}),
          value: template.value ?? Number(value),
          ...method,
          ...(showMaxQuantity ? { max_quantity: Number(maxQuantity) } : {}),
          target_rules: showTarget ? buildRules(targetRules) : [],
          buy_rules: isBuyGet ? buildRules(buyRules) : [],
        },
      };
      if (limit.trim()) body.limit = Number(limit);
      if (campaignChoice === "existing") body.campaign_id = campaignId;
      if (campaignChoice === "new") {
        const spend = camp.budgetType === "spend";
        body.campaign = {
          name: camp.name.trim(),
