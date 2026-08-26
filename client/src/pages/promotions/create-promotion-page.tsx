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
