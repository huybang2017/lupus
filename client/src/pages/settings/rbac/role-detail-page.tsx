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
