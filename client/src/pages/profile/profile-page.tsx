import { useEffect, useState } from "react"
import { api } from "@/shared/api/client"
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives"
import { FormDrawer, TextField } from "@/widgets/form"
import { DetailSection, KV } from "@/widgets/detail/detail-section"
import { MfaSection } from "@/pages/profile/mfa-section"

// Lupus "Profile": who you are, with an edit drawer for your name (the email is the login, not editable here).
export function ProfilePage() {
  const [me, setMe] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  function load() {
    api<{ user: any }>("/admin/users/me")
      .then((d) => setMe(d.user))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [])

  const name = me ? [me.first_name, me.last_name].filter(Boolean).join(" ") : ""

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>Settings › Profile</div>
      {err ? <Alert>{err}</Alert> : null}
      {!me && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : null}
      {me ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection title="Profile" subtitle="Manage your profile details" action={<RowMenu items={[{ label: "Edit", onClick: () => setEditing(true) }]} />}>
            <KV
              rows={[
                ["Name", name || "-"],
                ["Email", me.email],
                ["Language", "English"],
              ]}
            />
          </DetailSection>
          <MfaSection />
        </div>
      ) : null}
      {editing && me ? (
        <EditProfileDrawer
          user={me}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

function EditProfileDrawer({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const [first, setFirst] = useState<string>(user.first_name ?? "")
  const [last, setLast] = useState<string>(user.last_name ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await api(`/admin/users/${user.id}`, { method: "POST", body: { first_name: first.trim() || null, last_name: last.trim() || null } })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <FormDrawer title="Edit Profile" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="First name" optional value={first} onChange={setFirst} />
      <TextField label="Last name" optional value={last} onChange={setLast} />
    </FormDrawer>
  )
}
