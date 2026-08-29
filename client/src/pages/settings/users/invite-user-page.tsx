import { useState } from "react";
import { api } from "@/shared/api/client";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert } from "@/widgets/ui/primitives";
import { DataTable, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { TextField } from "@/widgets/form";
import { StatusBadge } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

const PAGE = 10;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ (\d{4})$/, ", $1");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lupus "Invite User": send an invite by email and manage the pending ones underneath.
export function InviteUserPage() {
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { items, count, loading, error, reload } = useServerList<any>("/admin/invites", { page, limit: PAGE, q });
  const emailError = !EMAIL.test(email.trim()) ? "Invalid email" : undefined;

  async function send() {
    setErr(null);
    setNotice(null);
    if (emailError) {
      setShow(true);
      return;
    }
    setBusy(true);
    try {
      await api("/admin/invites", { method: "POST", body: { email: email.trim() } });
      setEmail("");
      setShow(false);
      setPage(1);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, message?: string) {
    setErr(null);
    try {
      await fn();
      if (message) setNotice(message);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(inv: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the invite for ${inv.email}. This action cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (ok) await act(() => api(`/admin/invites/${inv.id}`, { method: "DELETE" }));
  }

  async function copyLink(inv: any) {
    const url = `${window.location.origin}/app/invite?token=${inv.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Invite link copied to clipboard");
    } catch {
      setNotice(url);
    }
  }

  const status = (inv: any) => {
    if (inv.accepted) return { color: "green" as const, text: "Accepted", tip: `Accepted on ${fmt(inv.updated_at ?? inv.created_at)}` };
    if (new Date(inv.expires_at) < new Date()) return { color: "red" as const, text: "Expired", tip: `Expired on ${fmt(inv.expires_at)}` };
    return { color: "orange" as const, text: "Pending", tip: `Valid from ${fmt(inv.created_at)} - ${fmt(inv.expires_at)}` };
  };

  return (
    <WizardShell tabs={[]} tab="" onTab={() => {}} closeTo="/settings/users">
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Invite User</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>Invite a new user to your store.</p>
        </div>
        {err ? <Alert>{err}</Alert> : null}
        {notice ? (
          <div role="status" style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
            {notice}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <TextField label="Email" placeholder="john.doe@example.com" value={email} onChange={setEmail} error={show ? emailError : undefined} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>

        <div>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>Pending Invites</h2>
          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <TableToolbar
              right={
                <TableSearch
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => {
                    setQ(draft.trim());
                    setPage(1);
                  }}
                  width={220}
                  placeholder="Search"
                  autoFocus={false}
                />
              }
            />
            <DataTable
              columns={[
                { key: "email", label: "Email", render: (i: any) => i.email },
                {
                  key: "status",
                  label: "Status",
                  render: (i: any) => {
                    const s = status(i);
                    return (
                      <span title={s.tip}>
                        <StatusBadge color={s.color}>{s.text}</StatusBadge>
                      </span>
                    );
                  },
                },
              ]}
              rows={items}
              loading={loading}
              error={error}
              rowActions={(i: any) => [
                { label: "Resend invite", onClick: () => void act(() => api(`/admin/invites/${i.id}/resend`, { method: "POST" }), `Invite for ${i.email} was resent`) },
                { label: "Copy invite link", onClick: () => void copyLink(i) },
                { label: "Delete", danger: true, onClick: () => void remove(i) },
              ]}
              emptyTitle={q ? "No results found" : "No records"}
              emptyHint={q ? "No invites match your search." : "There are no records to show"}
            />
            <TablePager page={page} limit={PAGE} count={count} onPage={setPage} />
          </section>
        </div>
      </div>
    </WizardShell>
  );
}
