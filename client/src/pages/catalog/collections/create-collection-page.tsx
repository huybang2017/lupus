import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert } from "@/widgets/ui/primitives";
import { FormActions, FormGrid, TextField } from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

// Lupus "Create Collection": a focus page with Title + Handle (no tabs).
export function CreateCollectionPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = title.trim() !== "" || handle.trim() !== "";
  const invalid = title.trim() === "";

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
    navigate("/r/collections");
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
      const res = await api<{ collection: any }>("/admin/collections", {
        method: "POST",
        body: { title: title.trim(), ...(handle.trim() ? { handle: handle.trim() } : {}) },
      });
      navigate(`/r/collections/${res.collection.id}`);
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
      closeTo="/r/collections"
      onRequestClose={() => void leave()}
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={save}
          submitLabel="Create"
          disabled={invalid}
          busy={busy}
        />
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--fg-base)" }}>
            Create Collection
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>
            Create a new collection to organize your products.
          </p>
        </div>
        <FormGrid cols={2}>
          <TextField label="Title" value={title} onChange={setTitle} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
              Handle
              <span
                title="The handle is the URL-friendly version of the collection. If not specified, it is generated from the title."
                style={{ color: "var(--fg-muted)", cursor: "help", fontSize: 12 }}
              >
                ⓘ
              </span>
              <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>(Optional)</span>
            </div>
            <div className="input-group">
              <span className="input-group-prefix">/</span>
              <input
                className="input"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                aria-label="Handle"
              />
            </div>
          </div>
        </FormGrid>
      </div>
    </WizardShell>
  );
}
