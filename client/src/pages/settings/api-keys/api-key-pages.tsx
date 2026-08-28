import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { fmtDate } from "@/shared/formatting/format-date";
import { useServerList } from "@/shared/hooks/use-server-list";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { CopyButton } from "@/widgets/ui/copy-button";
import { DataTable, TableBulkBar, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { FormActions, FormDrawer, FormSection, TextField, toggleInList } from "@/widgets/form";
import { StatusBadge, StatusCell } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { DetailSection, JsonSection, KV } from "@/widgets/detail/detail-section";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { REQUIRED } from "@/pages/fulfillment/locations/location-utils";

export type ApiKeyType = "publishable" | "secret";

const TYPES = {
  publishable: {
    list: "/settings/publishable-api-keys",
    plural: "Publishable API Keys",
    title: "Publishable API Key",
    subtitle: "API keys used to scope storefront requests to specific sales channels.",
    createSubtitle: "Create a new publishable API key to scope storefront requests to sales channels.",
  },
  secret: {
    list: "/settings/secret-api-keys",
    plural: "Secret API Keys",
    title: "Secret API Key",
    subtitle: "API keys used to authenticate admin users in admin applications.",
    createSubtitle: "Create a new secret API key to authenticate admin users in admin applications.",
  },
} as const;

const revoked = (k: { revoked_at?: string | null }) => !!k.revoked_at && new Date(k.revoked_at).getTime() <= Date.now();
const dash = <span style={{ color: "var(--fg-muted)" }}>-</span>;

function KeyStatus({ k, badge }: { k: any; badge?: boolean }) {
  const text = revoked(k) ? "Revoked" : "Active";
  const color = revoked(k) ? "red" : "green";
  return badge ? <StatusBadge color={color}>{text}</StatusBadge> : <StatusCell color={color}>{text}</StatusCell>;
}

// Lists show the redacted key; a publishable key is shown whole on its own page. Only publishable keys can be copied.
function TokenCell({ k, full }: { k: any; full?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="badge badge-gray" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
        {full && k.type === "publishable" ? k.token : k.redacted}
      </span>
      {k.type === "publishable" ? <CopyButton value={k.token} title="Copy token" /> : null}
    </span>
  );
}

// Lupus asks for confirmation before it revokes a key.
async function askRevoke(confirm: ReturnType<typeof useConfirm>, k: any) {
  return confirm({
    title: "Are you sure?",
    description: `You are about to revoke the API key ${k.title}. This action cannot be undone.`,
    confirmLabel: "Revoke",
  });
}

async function askDelete(confirm: ReturnType<typeof useConfirm>, k: any) {
  return confirm({
    title: "Are you sure?",
    description: `You are about to delete the API key ${k.title}. This action cannot be undone.`,
    confirmLabel: "Delete",
    verifyText: k.title,
  });
}

// ------------------------------------------------------------------ list

export function ApiKeysListPage({ type }: { type: ApiKeyType }) {
  const t = TYPES[type];
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error, reload } = useServerList<any>("/admin/api-keys", { page, limit: 20, q, params: { type, order: order || undefined } });

  async function act(run: () => Promise<unknown>) {
    setErr(null);
    try {
      await run();
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>Settings › {t.plural}</div>
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px" }}>
          <div style={{ maxWidth: 620 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t.plural}</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--fg-subtle)" }}>{t.subtitle}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TableSearch value={draft} onChange={setDraft} onSubmit={() => { setQ(draft.trim()); setPage(1); }} width={200} placeholder="Search" />
            <button className="btn btn-primary" onClick={() => navigate(`${t.list}/create`)}>
              Create
            </button>
          </div>
        </div>
        {err ? (
          <div style={{ padding: "0 20px 12px" }}>
            <Alert>{err}</Alert>
          </div>
        ) : null}
        <DataTable
          columns={[
            {
              key: "title",
              label: "Title",
              sortKey: "title",
              render: (k: any) => (
                <Link to={`${t.list}/${k.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                  {k.title}
                </Link>
              ),
            },
            { key: "token", label: "Token", render: (k: any) => <TokenCell k={k} /> },
            { key: "status", label: "Status", render: (k: any) => <KeyStatus k={k} /> },
            { key: "created_at", label: "Created", sortKey: "created_at", render: (k: any) => fmtDate(k.created_at) },
          ]}
          rows={items}
          loading={loading}
          error={error}
          sort={order}
          onSort={(next) => { setOrder(next); setPage(1); }}
          rowActions={(k: any) => [
            { label: "Edit", onClick: () => setEditing(k) },
            ...(revoked(k)
              ? []
              : [
                  {
                    label: "Revoke",
                    danger: true,
                    onClick: () => void askRevoke(confirm, k).then(async (ok) => { if (ok) await act(() => api(`/admin/api-keys/${k.id}/revoke`, { method: "POST", body: {} })) }),
                  },
                ]),
            {
              label: "Delete",
              danger: true,
              disabled: !revoked(k),
              hint: "Revoke the key before deleting it",
              onClick: () => void askDelete(confirm, k).then(async (ok) => { if (ok) await act(() => api(`/admin/api-keys/${k.id}`, { method: "DELETE" })) }),
            },
          ]}
          emptyTitle={q ? "No results" : "No API keys"}
          emptyHint={q ? "No API keys match the current search." : "Create an API key to get started."}
        />
        <TablePager page={page} limit={20} count={count} onPage={setPage} />
      </section>
      {editing ? <EditApiKeyDrawer apiKey={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ create

// A secret key is only ever shown here, right after it is created.
function SecretKeyDialog({ token, onDone }: { token: string; onDone: () => void }) {
  return (
    <div className="confirm-back">
      <div className="confirm" role="dialog" aria-modal="true" aria-label="Save your key" style={{ maxWidth: 520 }}>
        <div className="confirm-title">Save your key</div>
        <div className="confirm-body">
          Please save the secret key. This is the only time it will be shown, so copy it and keep it somewhere safe.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px" }}>
          <code style={{ flex: 1, overflowWrap: "anywhere", fontSize: 12, padding: "8px 10px", border: "1px solid var(--card-border)", borderRadius: 6 }}>{token}</code>
          <CopyButton value={token} title="Copy key" />
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-primary" onClick={onDone}>
            I have saved it
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateApiKeyPage({ type }: { type: ApiKeyType }) {
  const t = TYPES[type];
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null);
  const titleError = title.trim() === "" ? REQUIRED : undefined;
  const leave = useLeaveGuard(title.trim() !== "" && !created, t.list, busy);

  async function save() {
    if (titleError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ api_key: { id: string; token: string } }>("/admin/api-keys", { method: "POST", body: { title: title.trim(), type } });
      if (type === "secret") setCreated(res.api_key);
      else navigate(`${t.list}/${res.api_key.id}`);
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
      closeTo={t.list}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title={`Create ${t.title}`} subtitle={t.createSubtitle}>
        <TextField label="Title" value={title} onChange={setTitle} error={show ? titleError : undefined} />
      </FormSection>
      {created ? <SecretKeyDialog token={created.token} onDone={() => navigate(`${t.list}/${created.id}`)} /> : null}
    </WizardShell>
  );
}

// ------------------------------------------------------------------ edit

export function EditApiKeyDrawer({ apiKey, onClose, onSaved }: { apiKey: any; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState<string>(apiKey.title ?? "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titleError = title.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (titleError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/api-keys/${apiKey.id}`, { method: "POST", body: { title: title.trim() } });
      onSaved();
