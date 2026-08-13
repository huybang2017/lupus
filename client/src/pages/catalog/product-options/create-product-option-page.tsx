import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert } from "@/widgets/ui/primitives";
import { FormActions, TextField } from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { MultiCombobox } from "@/widgets/wizard/product-options-editor";

// Lupus "Create Product Option": a focus page with Title + Values. It creates a global
// option (not tied to a product) that products can reuse.
export function CreateProductOptionPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = title.trim() !== "" || values.length > 0;
  const invalid = title.trim() === "" || values.length === 0;

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
    navigate("/r/product-options?is_exclusive=false");
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
      await api("/admin/product-options", {
        method: "POST",
        body: { title: title.trim(), values },
      });
      navigate("/r/product-options?is_exclusive=false");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo="/r/product-options?is_exclusive=false"
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
            Create Product Option
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>
            Create a new product option and manage its values.
          </p>
        </div>
        <TextField label="Title" placeholder="Size" value={title} onChange={setTitle} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Values</div>
          <MultiCombobox values={values} onChange={setValues} suggestions={[]} placeholder="S, M, L" />
        </div>
      </div>
    </WizardShell>
  );
}
