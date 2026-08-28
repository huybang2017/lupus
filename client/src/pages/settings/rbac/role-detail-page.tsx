import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Alert, EmptyState, Spinner } from "@/widgets/ui/primitives";
import {
  CheckListField,
  FormDrawer,
  TextField,
  requiredText,
  toggleInList,
  useFormState,
} from "@/widgets/form";
import { DetailSection, KV } from "@/widgets/detail/detail-section";
import { fmtCell } from "@/widgets/ui/surfaces";
import { useConfirm } from "@/widgets/confirm";

export function RoleDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [role, setRole] = useState<any>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState(false);

  function load() {
    setErr(null);
    api<{ role: any }>(`/admin/rbac/roles/${id}`)
      .then((d) => setRole(d.role))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api(`/admin/rbac/roles/${id}/policies?limit=100&offset=0`)
      .then((d: any) => setPolicies(parseList(d, 200).items))
      .catch(() => {});
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (!(await confirm({ description: `Delete role ${id}?` }))) return;
    try {
      await api(`/admin/rbac/roles/${id}`, { method: "DELETE" });
      navigate("/r/rbac-roles");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function detach(policyId: string) {
    await api(`/admin/rbac/roles/${id}/policies/${policyId}`, {
      method: "DELETE",
    })
      .then(load)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <Link
            to="/r/rbac-roles"
            style={{
              color: "var(--fg-subtle)",
              textDecoration: "none",
              fontSize: 18,
            }}
          >
            ←
          </Link>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {role?.name ?? `Role ${id}`}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setRenaming(true)}
          >
            Rename
          </button>
          <button
            className="btn btn-secondary"
            style={{ color: "#ef4444" }}
            onClick={del}
          >
            Delete
          </button>
        </div>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!role && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {role ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection title="General">
            <KV
              rows={[
                ["Name", fmtCell(role.name)],
                [
                  "ID",
                  <span key="id" className="mono">
                    {fmtCell(role.id)}
                  </span>,
                ],
              ]}
            />
          </DetailSection>
          <DetailSection
            title={`Policies (${policies.length})`}
            action={
              <button
                className="btn btn-secondary"
                onClick={() => setPicker(true)}
              >
                Manage
              </button>
            }
          >
            {policies.length === 0 ? (
              <EmptyState
                title="No policies"
                hint="Attach policies to grant permissions"
              />
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {policies.map((p: any) => (
                  <span
                    key={p.id}
                    className="badge badge-gray"
                    title={p.description ?? p.name}
                  >
                    {p.name}
                    <button
                      onClick={() => detach(p.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "inherit",
                        marginLeft: 4,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </DetailSection>
        </div>
      ) : null}

      {renaming && role ? (
        <RenameForm
          role={role}
          onClose={() => setRenaming(false)}
          onSaved={() => {
            setRenaming(false);
            load();
          }}
        />
      ) : null}
      {picker ? (
        <PolicyPicker
          roleId={id}
          current={policies.map((p: any) => p.id)}
          onClose={() => setPicker(false)}
          onSaved={() => {
            setPicker(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function RenameForm({
  role,
  onClose,
  onSaved,
}: {
  role: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const {
    values,
    set,
    error: err,
    setError: setErr,
    busy,
    setBusy,
    validate,
    fieldErrors,
    dirty,
  } = useFormState({ name: role.name ?? "" });

  async function save() {
    setErr(null);
    if (
      !validate({
        name: (v) => requiredText(`${v}`.trim(), "Name is required."),
      })
    )
      return;
    setBusy(true);
    try {
      await api(`/admin/rbac/roles/${role.id}`, {
        method: "POST",
        body: { name: values.name.trim() },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function requestClose() {
    if (
      dirty &&
      !(await confirm({
        title: "Unsaved changes",
        description:
          "You have unsaved changes. Are you sure you want to discard them?",
        variant: "primary",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    onClose();
  }

  return (
    <FormDrawer
      confirmDiscard={false}
      title="Rename role"
      onClose={requestClose}
      onSubmit={save}
      busy={busy}
      error={err}
    >
      <TextField
        label="Name"
        required
        value={values.name}
        error={fieldErrors.name}
        onChange={(v) => set("name", v)}
      />
    </FormDrawer>
  );
}

function PolicyPicker({
  roleId,
  current,
  onClose,
  onSaved,
}: {
  roleId: string;
  current: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [policies, setPolicies] = useState<any[]>([]);
  const {
    values,
    set,
    error: err,
    setError: setErr,
    busy,
    setBusy,
    dirty,
  } = useFormState({ picked: current });
  const { picked } = values;

  useEffect(() => {
    api("/admin/rbac/policies?limit=100&offset=0")
      .then((d: any) => setPolicies(parseList(d, 200).items))
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const add = picked.filter((x) => !current.includes(x));
      const remove = current.filter((x) => !picked.includes(x));
      if (add.length > 0)
        await api(`/admin/rbac/roles/${roleId}/policies`, {
          method: "POST",
          body: { policies: add },
        });
      for (const pid of remove) {
        await api(`/admin/rbac/roles/${roleId}/policies/${pid}`, {
          method: "DELETE",
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function requestClose() {
    if (
      dirty &&
      !(await confirm({
        title: "Unsaved changes",
        description:
          "You have unsaved changes. Are you sure you want to discard them?",
        variant: "primary",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    onClose();
  }

  return (
    <FormDrawer
      confirmDiscard={false}
      title="Manage policies"
      onClose={requestClose}
      onSubmit={save}
      busy={busy}
      error={err}
    >
      <CheckListField
        options={policies
          .slice(0, 100)
          .map((p: any) => ({ id: p.id, label: p.name ?? p.id }))}
        checked={picked}
        onToggle={(pid) => set("picked", toggleInList(picked, pid))}
        searchable
        searchPlaceholder="Search policies…"
      />
    </FormDrawer>
  );
}
