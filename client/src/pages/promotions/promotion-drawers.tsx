import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FormDrawer, NumberField, RadioGroupField, TextField, ToggleField } from "@/widgets/form";
import { PromotionRulesField, newRow, rowError } from "@/pages/promotions/promotion-rules-field";
import type { RuleAttribute, RuleRow, RuleType } from "@/pages/promotions/promotion-rules-field";

const currencySymbol = (code: string) => {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: code.toUpperCase() })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code.toUpperCase()
    );
  } catch {
    return code.toUpperCase();
  }
};

const adornment = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0 12px",
  border: "1px solid var(--field-border)",
  background: "var(--hover-bg)",
  fontSize: 13,
  color: "var(--fg-subtle)",
} as const;

const fieldLabel = (text: string, tip?: string) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-base)", marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>
    {text}
    {tip ? (
      <span title={tip} aria-label={tip} style={{ color: "var(--fg-muted)", fontSize: 12, cursor: "help" }}>
        â“˜
      </span>
    ) : null}
  </div>
);

type Allocation = "each" | "across" | "once";

// Lupus "Edit Promotion Details": status, method, tax toggle (fixed standard only), code, value
// type, amount / percentage, allocation (switching between across and each/once is not allowed)
// and the maximum quantity when the allocation needs one.
export function EditPromotionDrawer({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = promotion.application_method ?? {};
  const isBuyGet = promotion.type === "buyget";
  const showValue = m.target_type !== "shipping_methods";
  const originalAllocation: Allocation | null = m.allocation ?? null;
  const [status, setStatus] = useState<string>(promotion.status);
  const [isAutomatic, setIsAutomatic] = useState(String(!!promotion.is_automatic));
  const [taxInclusive, setTaxInclusive] = useState(!!promotion.is_tax_inclusive);
  const [code, setCode] = useState<string>(promotion.code ?? "");
  const [valueType, setValueType] = useState<string>(m.type === "fixed" ? "fixed" : "percentage");
  const [value, setValue] = useState(m.value != null ? String(m.value) : "");
  const [allocation, setAllocation] = useState<Allocation>((originalAllocation ?? "each") as Allocation);
  const [maxQuantity, setMaxQuantity] = useState(m.max_quantity != null ? String(m.max_quantity) : "");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isFixed = valueType === "fixed";
  const currency: string = m.currency_code ?? "";
  const showAllocation = !isBuyGet && showValue && m.target_type === "items";
  const showMax = isBuyGet || (showAllocation && (allocation === "each" || allocation === "once"));
  const valueNum = value.trim() === "" ? NaN : Number(value);
  const codeErr = code.trim() === "" ? "Too small: expected string to have >=1 characters" : undefined;
  const valueErr = !showValue
    ? undefined
    : value.trim() === "" || !(valueNum >= 0)
      ? "Invalid promotion value"
      : !isFixed && valueNum > 100
        ? "Percentage cannot be more than 100"
        : undefined;
  const maxErr = showMax && !(Number.isInteger(Number(maxQuantity)) && Number(maxQuantity) >= 1) ? "Required field" : undefined;
  const invalid = !!(codeErr || valueErr || maxErr);

  async function save() {
    setSubmitted(true);
    if (invalid) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/promotions/${promotion.id}`, {
        method: "POST",
        body: {
          is_automatic: isAutomatic === "true",
          code: code.trim(),
          status,
          is_tax_inclusive: isFixed && promotion.type === "standard" ? taxInclusive : false,
          ...(showValue
            ? {
                application_method: {
                  value: Number(value),
                  ...(isBuyGet ? {} : { type: valueType }),
                  ...(showAllocation ? { allocation } : {}),
                  ...(showMax ? { max_quantity: Number(maxQuantity) } : {}),
                },
              }
            : {}),
        },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const gap = { display: "flex", flexDirection: "column", gap: 32 } as const;
  return (
    <FormDrawer title="Edit Promotion Details" onClose={onClose} onSubmit={save} busy={busy} error={err} submitLabel="Save">
      <div style={gap}>
        <RadioGroupField
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { id: "draft", label: "Draft", hint: "Customers will not be able to use the code yet" },
            { id: "active", label: "Active", hint: "Customers will be able to use the code" },
            { id: "inactive", label: "Inactive", hint: "Customers will no longer be able to use the code" },
          ]}
        />
        <RadioGroupField
          label="Method"
          value={isAutomatic}
          onChange={setIsAutomatic}
          options={[
            { id: "false", label: "Promotion code", hint: "Customers must enter this code at checkout" },
            { id: "true", label: "Automatic", hint: "Customers will see this promotion at checkout" },
          ]}
        />
        {isFixed && promotion.type === "standard" ? (
          <ToggleField
            checked={taxInclusive}
            onChange={setTaxInclusive}
            title="Does promotion include taxes?"
            hint="Enable this field to apply the promotion after taxes"
            switchSide="right"
          />
        ) : null}
        <TextField
          label="Code"
          hint="The code your customers will enter during checkout."
          value={code}
          error={submitted ? codeErr : undefined}
          onChange={setCode}
        />
        {showValue ? (
          <>
            {!isBuyGet ? (
              <RadioGroupField
                label="Value Type"
                value={valueType}
                onChange={setValueType}
                options={[
                  {
                    id: "fixed",
                    label: "Fixed amount",
                    hint: currency ? "The amount to be discounted. eg. 100" : "Add a currency condition to this promotion first.",
                    disabled: !currency,
                  },
                  { id: "percentage", label: "Percentage", hint: "The percentage to discount off the amount. eg. 8%" },
                ]}
              />
            ) : null}
            <div>
              {fieldLabel(isFixed ? "Amount" : "Percentage")}
              <div style={{ display: "flex", alignItems: "stretch" }}>
                {isFixed ? <span style={{ ...adornment, borderRight: "none", borderRadius: "8px 0 0 8px" }}>{currency.toUpperCase()}</span> : null}
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={isFixed ? undefined : 100}
                  step={isFixed ? 1 : "any"}
                  aria-label={isFixed ? "Amount" : "Percentage"}
                  style={{
                    flex: 1,
                    textAlign: isFixed ? "left" : "right",
                    borderRadius: isFixed ? 0 : "8px 0 0 8px",
                    borderColor: submitted && valueErr ? "#ef4444" : undefined,
                  }}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <span style={{ ...adornment, borderLeft: "none", borderRadius: "0 8px 8px 0" }}>{isFixed ? currencySymbol(currency) : "%"}</span>
              </div>
              {isFixed ? <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 6 }}>In minor units (e.g. 1000 = 10.00).</div> : null}
              {submitted && valueErr ? (
                <div role="alert" style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>
                  {valueErr}
                </div>
              ) : null}
            </div>
            {showAllocation ? (
              <RadioGroupField
                label="Allocation"
                hint="Each enforces the quantity limit per item, while Once enforces the quantity limit across the entire cart"
                value={allocation}
                onChange={(v) => setAllocation(v as Allocation)}
                options={[
                  { id: "each", label: "Each", hint: "Applies value on each item", disabled: originalAllocation === "across" },
                  { id: "across", label: "Across", hint: "Applies value across items", disabled: originalAllocation === "each" || originalAllocation === "once" },
                  { id: "once", label: "Once", hint: "Applies value to a limited number of items", disabled: originalAllocation === "across" },
                ]}
              />
            ) : null}
            {showMax ? (
              <NumberField
                label="Maximum Quantity"
                min={1}
                step={1}
                placeholder="3"
                hint="Maximum quantity of items this promotion applies to."
                value={maxQuantity}
                error={submitted ? maxErr : undefined}
                onChange={setMaxQuantity}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </FormDrawer>
  );
}

const DRAWER_TITLES: Record<RuleType, string> = {
  rules: "Edit usage conditions",
  "target-rules": "Edit item conditions",
  "buy-rules": "Edit buy rules",
};

const COPY: Record<RuleType, { title: string; description: string }> = {
