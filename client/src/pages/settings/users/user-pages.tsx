import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Alert, EmptyState, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { CheckListField, FormDrawer, TextField, toggleInList } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";

// Lupus "Edit User": first and last name.
export function EditUserDrawer({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const [first, setFirst] = useState<string>(user.first_name ?? "");
  const [last, setLast] = useState<string>(user.last_name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/users/${user.id}`, { method: "POST", body: { first_name: first.trim() || null, last_name: last.trim() || null } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit User" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="First name" optional value={first} onChange={setFirst} />
      <TextField label="Last name" optional value={last} onChange={setLast} />
    </FormDrawer>
  );
}

function RolePicker({ userId, current, onClose, onSaved }: { userId: string; current: string[]; onClose: () => void; onSaved: () => void }) {
  const [roles, setRoles] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/rbac/roles?limit=100&offset=0")
      .then((d: any) => setRoles(parseList(d, 200).items))
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const add = picked.filter((x) => !current.includes(x));
      const remove = current.filter((x) => !picked.includes(x));
      if (add.length > 0) await api(`/admin/users/${userId}/roles`, { method: "POST", body: { roles: add } });
      for (const rid of remove) await api(`/admin/users/${userId}/roles/${rid}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Manage roles" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <CheckListField
        options={roles.slice(0, 100).map((r: any) => ({ id: r.id, label: r.name ?? r.id }))}
        checked={picked}
        onToggle={(rid) => setPicked((s) => toggleInList(s, rid))}
        searchable
        searchPlaceholder="Search roles…"
      />
    </FormDrawer>
  );
}

// Lupus user detail: name, edit, copy reset password link, delete (type the name to confirm).
export function UserDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "roles" | "metadata">(null);

  function load() {
    api<{ user: any }>(`/admin/users/${id}`)
      .then((d) => {
        setUser(d.user);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api(`/admin/users/${id}/roles?limit=100&offset=0`).then((d: any) => setRoles(parseList(d, 100).items)).catch(() => undefined);
    api<{ providers: string[] }>(`/admin/users/${id}/auth-providers`).then((d) => setProviders(d.providers)).catch(() => undefined);
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "";

  async function del() {
    const label = name || user.email;
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the user ${label}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: label,
    });
    if (!ok) return;
    try {
      await api(`/admin/users/${id}`, { method: "DELETE" });
      navigate("/settings/users", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function copyResetLink() {
    try {
      const { token } = await api<{ token: string }>(`/admin/users/${id}/reset-password`, { method: "POST" });
      const url = `${window.location.origin}/app/reset-password?token=${token}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setNotice("Reset password link copied to clipboard. The link expires shortly and invalidates any reset password link previously sent to this user.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeRole(roleId: string) {
    await api(`/admin/users/${id}/roles/${roleId}`, { method: "DELETE" }).then(load).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to="/settings/users" style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Users
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{user?.email ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {notice ? <div role="status" style={{ margin: "8px 0", fontSize: 13, color: "var(--fg-subtle)" }}>{notice}</div> : null}
      {!user && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {user ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={user.email}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setDrawer("edit") },
                  ...(providers.includes("emailpass") ? [{ label: "Copy reset password link", onClick: () => void copyResetLink() }] : []),
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            }
          >
            <KV rows={[["Name", name || "-"]]} />
          </DetailSection>

          <DetailSection
            title={`Roles (${roles.length})`}
            subtitle="Roles grant the user permissions."
            action={
              <button className="btn btn-secondary" onClick={() => setDrawer("roles")}>
                Manage
              </button>
            }
          >
            {roles.length === 0 ? (
              <EmptyState title="No roles" hint="Assign roles to grant permissions" />
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {roles.map((r: any) => (
                  <span key={r.id} className="badge badge-gray">
                    {r.name}
                    <button onClick={() => void removeRole(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", marginLeft: 4 }}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <MetadataSection metadata={user.metadata} onEdit={() => setDrawer("metadata")} />
          <JsonSection data={user} />
        </div>
      ) : null}

      {user && drawer === "edit" ? <EditUserDrawer user={user} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(); }} /> : null}
      {user && drawer === "roles" ? (
        <RolePicker userId={id} current={roles.map((r) => r.id)} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(); }} />
      ) : null}
      {user && drawer === "metadata" ? (
        <MetadataDrawer
          metadata={user.metadata}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); load(); }}
          save={async (metadata) => {
            await api(`/admin/users/${id}`, { method: "POST", body: { metadata } });
          }}
        />
      ) : null}
    </div>
  );
}
