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
  rules: {
    title: "Who can use this code?",
    description: "Which customer is allowed to use the promotion code? Promotion code can be used by all customers if left untouched.",
  },
  "target-rules": {
    title: "What items will the promotion be applied to?",
    description: "The promotion will be applied to items that match the following conditions.",
  },
  "buy-rules": {
    title: "What needs to be in the cart to unlock the promotion?",
    description: "If these conditions match, we enable the promotion on the target items.",
  },
};

// Lupus "Edit conditions": the promotion's existing conditions in the same editor as create.
// Disguised rows (currency, quantities) are written to the application method; real conditions
// are added / updated / removed through the rule batch endpoint.
export function EditConditionsDrawer({
  promotion,
  ruleType,
  onClose,
  onSaved,
}: {
  promotion: any;
  ruleType: RuleType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [original, setOriginal] = useState<RuleRow[]>([]);
  const [attrs, setAttrs] = useState<RuleAttribute[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = promotion.application_method ?? {};

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({
      promotion_type: promotion.type,
      application_method_type: m.type,
      application_method_target_type: m.target_type,
    }).toString();
    Promise.all([
      api<{ rules: any[] }>(`/admin/promotions/${promotion.id}/${ruleType}`),
      api<{ attributes: RuleAttribute[] }>(`/admin/promotions/rule-attribute-options/${ruleType}?${q}`),
    ])
      .then(([r, a]) => {
        if (!alive) return;
        const mapped: RuleRow[] = (r.rules ?? []).map((x) => {
          const isNumber = x.field_type === "number";
          const values: string[] = isNumber
            ? x.values == null ? [] : [String(x.values)]
            : (x.values ?? []).map((v: any) => String(v.value));
          const labels: Record<string, string> = {};
          if (!isNumber) for (const v of x.values ?? []) labels[String(v.value)] = String(v.label);
          return newRow({
            id: x.id,
            attribute: x.attribute,
            operator: x.operator,
            values,
            labels,
            required: !!x.required,
            disguised: !!x.disguised,
            field_type: x.field_type,
          });
        });
        setRows(mapped);
        setOriginal(mapped);
        setAttrs(a.attributes ?? []);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion.id, ruleType]);

  async function save() {
    if (!rows) return;
    setShowErrors(true);
    if (rows.some((r) => !!rowError(r))) return;
    setBusy(true);
    setErr(null);
    try {
      const method: Record<string, any> = {};
      for (const r of rows.filter((x) => x.disguised)) {
        method[r.attribute] = r.field_type === "number" ? parseInt(r.values[0], 10) : r.values[0];
      }
      // a disguised row that was removed (e.g. an optional currency) clears its field
      for (const o of original.filter((x) => x.disguised && !rows.some((r) => r.attribute === x.attribute))) {
        method[o.attribute] = null;
      }
      const real = rows.filter((x) => !x.disguised);
      const body = (r: RuleRow) => ({
        attribute: r.attribute,
        operator: r.operator,
        values: r.operator === "eq" ? r.values[0] : r.values,
      });
      const remove = original.filter((o) => !o.disguised && o.id && !real.some((r) => r.id === o.id)).map((o) => o.id!);
      if (Object.keys(method).length > 0) {
        await api(`/admin/promotions/${promotion.id}`, { method: "POST", body: { application_method: method } });
      }
      const create = real.filter((r) => !r.id).map(body);
      const update = real.filter((r) => r.id).map((r) => ({ id: r.id, ...body(r) }));
      if (create.length || update.length || remove.length) {
        await api(`/admin/promotions/${promotion.id}/${ruleType}/batch`, {
          method: "POST",
          body: { create, update, delete: remove },
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title={DRAWER_TITLES[ruleType]} onClose={onClose} onSubmit={save} busy={busy} disabled={!rows} error={err} submitLabel="Save">
      {rows === null ? (
        err ? null : (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <Spinner size={20} />
          </div>
        )
      ) : (
        <PromotionRulesField
          title={COPY[ruleType].title}
          description={COPY[ruleType].description}
          ruleType={ruleType}
          rows={rows}
          onChange={setRows}
          attributes={attrs}
          showErrors={showErrors}
        />
      )}
    </FormDrawer>
  );
}

// Lupus "Edit Campaign" (add-to-campaign): none / an existing campaign, with its details below.
export function CampaignDrawer({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [choice, setChoice] = useState(promotion.campaign_id ? "existing" : "none");
  const [campaignId, setCampaignId] = useState<string>(promotion.campaign_id ?? "");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const currency: string = promotion.application_method?.currency_code ?? "";

  useEffect(() => {
    api("/admin/campaigns?limit=100&offset=0")
      .then((d) => setCampaigns(parseList(d, 200).items))
      .catch(() => {});
  }, []);

  const selected = campaigns.find((c) => c.id === campaignId);
  async function save() {
    if (choice === "existing" && !campaignId) {
      setErr("Select a campaign.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/promotions/${promotion.id}`, {
        method: "POST",
        body: { campaign_id: choice === "existing" ? campaignId : null },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Campaign" onClose={onClose} onSubmit={save} busy={busy} error={err} submitLabel="Save">
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <RadioGroupField
          label="Campaign"
          value={choice}
          onChange={setChoice}
          options={[
            { id: "none", label: "Without Campaign", hint: "Proceed without associating promotion with campaign" },
            { id: "existing", label: "Existing Campaign", hint: "Add promotion to an existing campaign." },
          ]}
        />
        {choice === "existing" ? (
          <div>
            {fieldLabel("Existing Campaign")}
            {campaigns.length === 0 ? (
              <Alert>No existing campaigns. You can create one to track multiple promotions and set budget limits.</Alert>
            ) : (
              <select className="input" style={{ width: "100%" }} aria-label="Existing Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Select campaign</option>
                {campaigns.map((c) => {
                  const mismatch = !!c.currency_code && String(c.currency_code).toLowerCase() !== currency.toLowerCase();
                  return (
                    <option key={c.id} value={c.id} disabled={mismatch}>
                      {String(c.name ?? c.id).toUpperCase()}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        ) : null}
        {choice === "existing" && selected ? (
          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Campaign details</h2>
            {[
              ["Identifier", selected.identifier ?? "-"],
              ["Description", selected.description || "-"],
              ["Start date", selected.starts_at ? new Date(selected.starts_at).toLocaleString() : "-"],
              ["End date", selected.ends_at ? new Date(selected.ends_at).toLocaleString() : "-"],
              [
                "Budget",
                selected.budget_limit != null
                  ? `Spend Â· ${Number(selected.budget_limit).toLocaleString()} ${String(selected.currency_code ?? "").toUpperCase()}`
                  : selected.usage_limit != null
                    ? `Usage Â· ${Number(selected.usage_limit).toLocaleString()}`
                    : "-",
              ],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "4px 0", fontSize: 13, color: "var(--fg-subtle)" }}>
                <span style={{ fontWeight: 600 }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </FormDrawer>
  );
}
