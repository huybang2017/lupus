import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { COUNTRY_OPTIONS } from "@/shared/i18n/country-options";
import { Alert } from "@/widgets/ui/primitives";
import { FormActions, FormGrid, SelectField, TextField } from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

const EMPTY = {
  address_name: "",
  address_1: "",
  address_2: "",
  postal_code: "",
  city: "",
  country_code: "",
  province: "",
  company: "",
  phone: "",
};

// Lupus "Create Address": a focus page (not a drawer). Address name, Address and Country
// are required; the rest is optional. Save stays locked until the required fields are set.
export function CustomerCreateAddressPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = `/r/customers/${id}`;
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((s) => ({ ...s, [k]: v }));
    setTouched((s) => ({ ...s, [k]: true }));
  };
  const required = ["address_name", "address_1", "country_code"] as const;
  const invalid = required.some((k) => form[k].trim() === "");
  const errorFor = (k: (typeof required)[number]) =>
    touched[k] && form[k].trim() === ""
      ? k === "country_code"
        ? "Select a country"
        : "Too small: expected string to have >=1 characters"
      : undefined;
  const dirty = Object.values(form).some((v) => v.trim() !== "");

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
    navigate(back);
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

  async function save() {
    if (invalid) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) if (v.trim()) body[k] = v.trim();
      await api(`/admin/customers/${id}/addresses`, { method: "POST", body });
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
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={save}
          submitLabel="Save"
          disabled={invalid}
          busy={busy}
        />
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--fg-base)" }}>
            Create Address
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>
            Create a new address for the customer.
          </p>
        </div>
        <FormGrid cols={2} gap={16}>
          <TextField
            label="Address name"
            value={form.address_name}
            error={errorFor("address_name")}
            onChange={(v) => set("address_name", v)}
          />
        </FormGrid>
        <FormGrid cols={2} gap={16}>
          <TextField
            label="Address"
            value={form.address_1}
            error={errorFor("address_1")}
            onChange={(v) => set("address_1", v)}
          />
          <TextField
            label="Apartment, suite, etc."
            optional
            value={form.address_2}
            onChange={(v) => set("address_2", v)}
          />
          <TextField
            label="Postal Code"
            optional
            value={form.postal_code}
            onChange={(v) => set("postal_code", v)}
          />
          <TextField label="City" optional value={form.city} onChange={(v) => set("city", v)} />
          <SelectField
            label="Country"
            value={form.country_code}
            error={errorFor("country_code")}
            onChange={(v) => set("country_code", v)}
            options={COUNTRY_OPTIONS}
            placeholder="Select country"
            searchable
          />
          <TextField label="State" optional value={form.province} onChange={(v) => set("province", v)} />
          <TextField label="Company" optional value={form.company} onChange={(v) => set("company", v)} />
          <TextField label="Phone" optional value={form.phone} onChange={(v) => set("phone", v)} />
        </FormGrid>
      </div>
    </WizardShell>
  );
}
