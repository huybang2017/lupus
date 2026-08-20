import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { FormActions, FormDrawer, FormSection, TextAreaField, TextField } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

const PROFILES = "/settings/shipping-profiles";
const TYPES = "/settings/shipping-option-types";

// ------------------------------------------------------------------ shipping profiles

// Lupus "Create Shipping Profile".
export function CreateShippingProfilePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameError = name.trim() === "" ? REQUIRED : undefined;
  const typeError = type.trim() === "" ? REQUIRED : undefined;
  const leave = useLeaveGuard(name.trim() !== "" || type.trim() !== "", PROFILES, busy);

  async function save() {
    if (nameError || typeError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ shipping_profile: { id: string } }>("/admin/shipping-profiles", {
        method: "POST",
        body: { name: name.trim(), type: type.trim() },
      });
      navigate(`${PROFILES}/${res.shipping_profile.id}`);
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
      closeTo={PROFILES}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Create" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title="Create Shipping Profile" subtitle="Create a new shipping profile to group products with similar shipping requirements.">
        <TextField label="Name" value={name} onChange={setName} error={show ? nameError : undefined} />
        <TextField
          label="Type"
          hint="Enter shipping profile type, for example: Heavy, Oversized, Freight-only, etc."
          value={type}
          onChange={setType}
          error={show ? typeError : undefined}
        />
      </FormSection>
    </WizardShell>
  );
}

// Lupus shipping profile detail: name, type, metadata.
export function ShippingProfileDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [profile, setProfile] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "metadata">(null);

  function load() {
    api<{ shipping_profile: any }>(`/admin/shipping-profiles/${id}`)
      .then((d) => setProfile(d.shipping_profile))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Delete Shipping Profile",
      description: `You are about to delete the shipping profile ${profile.name}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: profile.name,
    });
    if (!ok) return;
    try {
      await api(`/admin/shipping-profiles/${id}`, { method: "DELETE" });
      navigate(PROFILES, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to={PROFILES} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Shipping Profiles
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{profile?.name ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!profile && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {profile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection title={profile.name} action={<RowMenu items={[{ label: "Delete", danger: true, onClick: () => void del() }]} />}>
            <KV rows={[["Type", profile.type]]} />
          </DetailSection>
          <MetadataSection metadata={profile.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={profile} />
        </div>
      ) : null}
      {profile && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={profile.metadata}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
          save={async (metadata) => {
            await api(`/admin/shipping-profiles/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ shipping option types

// Lupus "Create Shipping Option Type".
export function CreateShippingOptionTypePage() {
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labelError = label.trim() === "" ? REQUIRED : undefined;
  const codeError = code.trim() === "" ? REQUIRED : undefined;
  const leave = useLeaveGuard(label.trim() !== "" || code.trim() !== "" || description.trim() !== "", TYPES, busy);

  async function save() {
    if (labelError || codeError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ shipping_option_type: { id: string } }>("/admin/shipping-option-types", {
        method: "POST",
        body: { label: label.trim(), code: code.trim(), description: description.trim() || null },
      });
      navigate(`${TYPES}/${res.shipping_option_type.id}`);
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
      closeTo={TYPES}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Create" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title="Create Shipping Option Type" subtitle="Create a new shipping option type to categorize your shipping options.">
        <TextField label="Label" value={label} onChange={setLabel} error={show ? labelError : undefined} />
        <TextField label="Code" value={code} onChange={setCode} error={show ? codeError : undefined} />
        <TextAreaField label="Description" optional rows={3} value={description} onChange={setDescription} />
      </FormSection>
    </WizardShell>
  );
}

export function EditShippingOptionTypeDrawer({ type, onClose, onSaved }: { type: any; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState<string>(type.label ?? "");
  const [code, setCode] = useState<string>(type.code ?? "");
  const [description, setDescription] = useState<string>(type.description ?? "");
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
      await api(`/admin/shipping-option-types/${type.id}`, {
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
    <FormDrawer title="Edit Shipping Option Type" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Label" value={label} onChange={setLabel} error={show ? labelError : undefined} />
      <TextField label="Code" value={code} onChange={setCode} error={show ? codeError : undefined} />
      <TextAreaField label="Description" optional rows={3} value={description} onChange={setDescription} />
    </FormDrawer>
  );
}

// Lupus shipping option type detail: label, code, description.
export function ShippingOptionTypeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [type, setType] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function load() {
    api<{ shipping_option_type: any }>(`/admin/shipping-option-types/${id}`)
      .then((d) => setType(d.shipping_option_type))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the shipping option type "${type.label}". This action cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api(`/admin/shipping-option-types/${id}`, { method: "DELETE" });
      navigate(TYPES, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to={TYPES} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Shipping Option Types
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{type?.label ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!type && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {type ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={type.label}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setEditing(true) },
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            }
          >
            <KV
              rows={[
                ["Code", type.code],
                ["Description", type.description || "-"],
              ]}
            />
          </DetailSection>
          <JsonSection data={type} />
        </div>
      ) : null}
      {type && editing ? (
        <EditShippingOptionTypeDrawer
          type={type}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
