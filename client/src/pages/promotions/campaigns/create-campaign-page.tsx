import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { slugify, toISO } from "@/shared/utils/form-utils";
import { Alert } from "@/widgets/ui/primitives";
import {
  DateTimeField,
  FormActions,
  FormGrid,
  FormSection,
  NumberField,
  RadioGroupField,
  TextAreaField,
  TextField,
} from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

export function CreateCampaignPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [budgetType, setBudgetType] = useState("usage");
  const [limit, setLimit] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onName(v: string) {
    setName(v);
    if (!identifierTouched) setIdentifier(slugify(v));
  }

  async function save() {
    setErr(null);
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    const lim = limit.trim() === "" ? null : Math.round(Number(limit));
    if (limit.trim() !== "" && !(lim !== null && lim > 0)) {
      setErr("Limit must be a positive integer.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, any> = { name: name.trim() };
      const ident = (identifierTouched ? identifier : slugify(name)).trim();
      if (ident) body.identifier = ident;
      if (description.trim()) body.description = description.trim();
      const s = toISO(startsAt);
      const e = toISO(endsAt);
      if (s) body.starts_at = s;
      if (e) body.ends_at = e;
      if (budgetType === "usage") {
        if (lim !== null) body.usage_limit = lim;
      } else {
        if (lim !== null) body.budget_limit = lim;
        body.currency_code = currency.trim().toLowerCase() || "usd";
      }
      const res = await api<{ campaign: any }>("/admin/campaigns", {
        method: "POST",
        body,
      });
      navigate(`/r/campaigns/${res.campaign.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardShell
      tabs={[{ id: "details", label: "Details" }]}
      tab="details"
      onTab={() => {}}
      closeTo="/r/campaigns"
      footer={
        <FormActions
          onCancel={() => navigate("/r/campaigns")}
          onSubmit={save}
          submitLabel="Create"
          busy={busy}
        />
      }
    >
      <FormSection
        title="Create Campaign"
        subtitle="Create a promotional campaign."
      >
        {err ? <Alert>{err}</Alert> : null}
        <FormGrid cols={2}>
          <TextField label="Name" value={name} onChange={onName} />
          <TextField
            label="Identifier"
            hint="Auto-filled from the name; must be unique."
            value={identifier}
            onChange={(v) => {
              setIdentifier(v);
              setIdentifierTouched(true);
            }}
          />
        </FormGrid>
        <TextAreaField
          label="Description"
          optional
          rows={4}
          value={description}
          onChange={setDescription}
        />
        <FormGrid cols={2}>
          <DateTimeField
            label="Start date"
            optional
            value={startsAt}
            onChange={setStartsAt}
          />
          <DateTimeField
            label="End date"
            optional
            value={endsAt}
            onChange={setEndsAt}
          />
        </FormGrid>
      </FormSection>
      <FormSection
        title="Campaign Budget"
        subtitle="Create a budget for the campaign."
      >
        <RadioGroupField
          label="Type"
          value={budgetType}
          onChange={setBudgetType}
          cols={2}
          options={[
            {
              id: "usage",
              label: "Usage",
              hint: "Set a limit on how many times the promotion can be used.",
            },
            {
              id: "spend",
              label: "Spend",
              hint: "Set a limit on the total discounted amount of all promotion usages.",
            },
          ]}
        />
        <FormGrid cols={2}>
          <NumberField
            label="Limit"
            hint={
              budgetType === "spend"
                ? "Max total discount in minor units."
                : "Max number of usages."
            }
            min={1}
            value={limit}
            onChange={setLimit}
          />
          {budgetType === "spend" ? (
            <TextField
              label="Currency"
              maxLength={3}
              value={currency}
              onChange={setCurrency}
            />
          ) : null}
        </FormGrid>
      </FormSection>
    </WizardShell>
  );
}
