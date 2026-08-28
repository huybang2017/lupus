import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert } from "@/widgets/ui/primitives";
import { FormActions, FormDrawer, FormSection, TextAreaField, TextField } from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

const RETURN = "/settings/return-reasons";
const REFUND = "/settings/refund-reasons";

// Lupus fills the refund reason code from the label until the code is typed by hand.
const slug = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

interface ReasonFormValues {
  label: string;
  key: string;
  description: string;
}

// ------------------------------------------------------------------ return reasons

// Lupus "Create Return Reason": a unique value, a label and an optional description.
export function CreateReturnReasonPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valueError = value.trim() === "" ? REQUIRED : undefined;
  const labelError = label.trim() === "" ? REQUIRED : undefined;
  const leave = useLeaveGuard(value.trim() !== "" || label.trim() !== "" || description.trim() !== "", RETURN, busy);

  async function save() {
    if (valueError || labelError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/admin/return-reasons", {
        method: "POST",
        body: { value: value.trim(), label: label.trim(), description: description.trim() || null },
      });
      navigate(RETURN, { replace: true });
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
      closeTo={RETURN}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title="Create Return Reason" subtitle="Create a new return reason to categorize returns.">
        <TextField
          label="Value"
          hint="A unique identifier for the return reason, for example: wrong_size"
          placeholder="wrong_size"
          value={value}
          onChange={setValue}
          error={show ? valueError : undefined}
        />
        <TextField label="Label" placeholder="Wrong size" value={label} onChange={setLabel} error={show ? labelError : undefined} />
        <TextAreaField label="Description" optional rows={3} placeholder="The customer received the wrong size" value={description} onChange={setDescription} />
      </FormSection>
    </WizardShell>
  );
}

export function EditReturnReasonDrawer({ reason, onClose, onSaved }: { reason: any; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<string>(reason.value ?? "");
  const [label, setLabel] = useState<string>(reason.label ?? "");
  const [description, setDescription] = useState<string>(reason.description ?? "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valueError = value.trim() === "" ? REQUIRED : undefined;
  const labelError = label.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (valueError || labelError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/return-reasons/${reason.id}`, {
        method: "POST",
        body: { value: value.trim(), label: label.trim(), description: description.trim() || null },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Return Reason" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Value" value={value} onChange={setValue} error={show ? valueError : undefined} />
      <TextField label="Label" value={label} onChange={setLabel} error={show ? labelError : undefined} />
      <TextAreaField label="Description" optional rows={3} value={description} onChange={setDescription} />
    </FormDrawer>
  );
}

// ------------------------------------------------------------------ refund reasons

function useRefundReasonForm(initial: { label: string; code: string; description: string }, autoCode: boolean) {
  const [values, setValues] = useState<ReasonFormValues>({ label: initial.label, key: initial.code, description: initial.description });
  const [codeTouched, setCodeTouched] = useState(!autoCode);
  return {
    values,
    setLabel: (label: string) => setValues((v) => ({ ...v, label, key: codeTouched ? v.key : slug(label) })),
    setCode: (key: string) => {
      setCodeTouched(true);
      setValues((v) => ({ ...v, key }));
    },
    setDescription: (description: string) => setValues((v) => ({ ...v, description })),
  };
}

// Lupus "Create Refund Reason": label, code (filled from the label) and description.
export function CreateRefundReasonPage() {
  const navigate = useNavigate();
  const form = useRefundReasonForm({ label: "", code: "", description: "" }, true);
  const { label, key: code, description } = form.values;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labelError = label.trim() === "" ? REQUIRED : undefined;
  const codeError = code.trim() === "" ? REQUIRED : undefined;
  const leave = useLeaveGuard(label.trim() !== "" || code.trim() !== "" || description.trim() !== "", REFUND, busy);

  async function save() {
    if (labelError || codeError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/admin/refund-reasons", {
        method: "POST",
        body: { label: label.trim(), code: code.trim(), description: description.trim() || null },
      });
      navigate(REFUND, { replace: true });
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
      closeTo={REFUND}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title="Create Refund Reason" subtitle="Create a new refund reason to categorize refunds.">
        <TextField label="Label" value={label} onChange={form.setLabel} error={show ? labelError : undefined} />
        <TextField label="Code" value={code} onChange={form.setCode} error={show ? codeError : undefined} />
        <TextAreaField label="Description" optional rows={3} value={description} onChange={form.setDescription} />
      </FormSection>
    </WizardShell>
  );
}

export function EditRefundReasonDrawer({ reason, onClose, onSaved }: { reason: any; onClose: () => void; onSaved: () => void }) {
  const form = useRefundReasonForm({ label: reason.label ?? "", code: reason.code ?? "", description: reason.description ?? "" }, false);
  const { label, key: code, description } = form.values;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labelError = label.trim() === "" ? REQUIRED : undefined;
  const codeError = code.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (labelError || codeError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/refund-reasons/${reason.id}`, {
        method: "POST",
        body: { label: label.trim(), code: code.trim(), description: description.trim() || null },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Refund Reason" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Label" value={label} onChange={form.setLabel} error={show ? labelError : undefined} />
      <TextField label="Code" value={code} onChange={form.setCode} error={show ? codeError : undefined} />
      <TextAreaField label="Description" optional rows={3} value={description} onChange={form.setDescription} />
    </FormDrawer>
  );
}
