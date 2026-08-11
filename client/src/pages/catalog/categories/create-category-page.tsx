import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { slugify } from "@/shared/utils/form-utils";
import { Alert } from "@/widgets/ui/primitives";
import {
  FormActions,
  FormField,
  FormGrid,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
} from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

type Tab = "details" | "ranking";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "ranking", label: "Organize Ranking" },
];

const NEW_ID = "__new__";

interface Sibling {
  id: string;
  name: string;
  rank?: number;
  parent_category_id?: string | null;
}

// Lupus "Create category": Details (title, handle, description, status, visibility)
// then Organize Ranking — a list of the sibling categories where only the new one can
// be dragged to choose its position.
export function CreateCategoryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("details");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [active, setActive] = useState("true");
  const [internal, setInternal] = useState("false");
  const [parentId, setParentId] = useState("");
  const [all, setAll] = useState<Sibling[]>([]);
  const [order, setOrder] = useState<string[]>([NEW_ID]);
  const [dragging, setDragging] = useState(false);
  const [overId, setOverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/product-categories?limit=100&offset=0")
      .then((d) => setAll(parseList<Sibling>(d, 200).items))
      .catch(() => {});
  }, []);

  const siblings = all
    .filter((c) => (c.parent_category_id ?? "") === parentId)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  // New category starts first; rebuild when the sibling set (parent) changes.
  const siblingKey = siblings.map((s) => s.id).join(",");
  useEffect(() => {
    setOrder([NEW_ID, ...siblings.map((s) => s.id)]);
  }, [siblingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = name.trim() !== "" || description.trim() !== "" || handleTouched || parentId !== "";
  const invalid = name.trim() === "";

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
    navigate("/r/categories");
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

  function moveNewTo(targetId: string) {
    setOrder((o) => {
      const to = o.indexOf(targetId);
      if (to < 0 || targetId === NEW_ID) return o;
      const next = o.filter((x) => x !== NEW_ID);
      next.splice(to, 0, NEW_ID);
      return next;
    });
  }

  async function save() {
    if (invalid) return;
    setBusy(true);
    setErr(null);
    try {
      const position = Math.max(0, order.indexOf(NEW_ID));
      const res = await api<{ product_category: any }>("/admin/product-categories", {
        method: "POST",
        body: {
          name: name.trim(),
          ...(handle.trim() ? { handle: handle.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          is_active: active === "true",
          is_internal: internal === "true",
          ...(parentId ? { parent_category_id: parentId } : {}),
          rank: position,
        },
      });
      // Re-number the siblings so they follow the order shown (new one at `position`).
      const others = order.filter((x) => x !== NEW_ID);
      for (let i = 0; i < others.length; i++) {
        const rank = i < position ? i : i + 1;
        const cur = siblings.find((s) => s.id === others[i]);
        if (cur && (cur.rank ?? 0) !== rank) {
          await api(`/admin/product-categories/${cur.id}`, { method: "POST", body: { rank } });
        }
      }
      navigate(`/r/categories/${res.product_category.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const lastTab = tab === "ranking";

  return (
    <WizardShell
      tabs={TABS}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
      closeTo="/r/categories"
      onRequestClose={() => void leave()}
      disabledTabs={invalid ? ["ranking"] : []}
      wide={lastTab}
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={lastTab ? save : () => setTab("ranking")}
          submitLabel={lastTab ? "Save" : "Continue"}
          disabled={invalid}
          busy={busy}
        />
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      {tab === "details" ? (
        <FormSection title="Create Category">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <FormGrid cols={2}>
              <TextField
                label="Title"
                value={name}
                onChange={(v) => {
                  setName(v);
                  if (!handleTouched) setHandle(slugify(v));
                }}
              />
              <FormField label="Handle" optional>
                <div className="input-group">
                  <span className="input-group-prefix">/</span>
                  <input
                    className="input"
                    placeholder="category-handle"
                    value={handle}
                    onChange={(e) => {
                      setHandle(e.target.value);
                      setHandleTouched(true);
                    }}
                  />
                </div>
              </FormField>
            </FormGrid>
            <TextAreaField label="Description" optional rows={3} value={description} onChange={setDescription} />
            <FormGrid cols={2}>
              <SelectField
                label="Status"
                value={active}
                onChange={setActive}
                options={[
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
              />
              <SelectField
                label="Visibility"
                value={internal}
                onChange={setInternal}
                options={[
                  { value: "false", label: "Public" },
                  { value: "true", label: "Private" },
                ]}
              />
            </FormGrid>
            <SelectField
              label="Parent category"
              optional
              value={parentId}
              onChange={setParentId}
              options={all.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select parent category"
              searchable
              allowClear
            />
          </div>
        </FormSection>
      ) : (
        <div style={{ borderBottom: "1px solid var(--card-border)" }}>
          {order.map((id) => {
            const isNew = id === NEW_ID;
            const label = isNew ? name.trim() || "New category" : (siblings.find((s) => s.id === id)?.name ?? id);
            return (
              <div
                key={id}
                draggable={isNew}
                onDragStart={() => isNew && setDragging(true)}
                onDragEnd={() => {
                  setDragging(false);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOverId(id);
                }}
                onDrop={() => {
                  if (dragging) moveNewTo(id);
                  setDragging(false);
                  setOverId(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 28,
                  height: 49,
                  padding: "0 24px 0 36px",
                  borderTop: "1px solid var(--card-border)",
                  background: isNew ? "var(--hover-bg)" : "transparent",
                  boxShadow: overId === id && dragging && !isNew ? "inset 0 2px 0 var(--fg-interactive)" : "none",
                  opacity: isNew ? 1 : 0.85,
                  fontSize: 13,
                  color: "var(--fg-base)",
                }}
              >
                <span
                  title={isNew ? "Drag to reorder" : undefined}
                  style={{
                    cursor: isNew ? "grab" : "default",
                    color: "var(--fg-muted)",
                    opacity: isNew ? 1 : 0.4,
                    userSelect: "none",
                    width: 16,
                  }}
                >
                  ⠿
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="#6366f1" aria-hidden>
                  <path d="M1.5 2.5A1 1 0 0 1 2.5 1.5h5.1a1 1 0 0 1 .7.3l6 6a1 1 0 0 1 0 1.4l-5.1 5.1a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1-.3-.7V2.5Zm3 1.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
                </svg>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  {label}
                  {isNew ? (
                    <span className="badge badge-blue" style={{ fontSize: 11 }}>
                      New
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WizardShell>
  );
}
