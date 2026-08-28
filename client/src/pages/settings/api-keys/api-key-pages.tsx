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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit API Key" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <TextField label="Title" value={title} onChange={setTitle} error={show ? titleError : undefined} />
    </FormDrawer>
  );
}

// ------------------------------------------------------------------ detail

export function ApiKeyDetailPage({ type }: { type: ApiKeyType }) {
  const t = TYPES[type];
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [key, setKey] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [channelSearch, setChannelSearch] = useState({ draft: "", q: "" });

  function load() {
    api<{ api_key: any }>(`/admin/api-keys/${id}`)
      .then((d) => {
        setKey(d.api_key);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setErr(null);
    try {
      await fn();
      after ? after() : load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeChannels(ids: string[], name?: string) {
    const ok = await confirm({
      title: "Are you sure?",
      description: name
        ? `You are about to remove the sales channel ${name} from the API key. This action cannot be undone.`
        : `You are about to remove ${ids.length} ${ids.length === 1 ? "sales channel" : "sales channels"} from the API key. This action cannot be undone.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    await run(() => api(`/admin/api-keys/${id}/sales-channels`, { method: "POST", body: { remove: ids } }), () => {
      setSelected([]);
      load();
    });
  }

  const channels: any[] = (key?.sales_channels ?? []).filter(
    (c: any) => !channelSearch.q || `${c.name} ${c.description ?? ""}`.toLowerCase().includes(channelSearch.q.toLowerCase()),
  );
  const isRevoked = key ? revoked(key) : false;

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to={t.list} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          {t.plural}
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{key?.title ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!key && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {key ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={key.title}
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <KeyStatus k={key} badge />
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setEditing(true) },
                    ...(isRevoked
                      ? []
                      : [
                          {
                            label: "Revoke",
                            danger: true,
                            onClick: () => void askRevoke(confirm, key).then(async (ok) => { if (ok) await run(() => api(`/admin/api-keys/${id}/revoke`, { method: "POST", body: {} })) }),
                          },
                        ]),
                    {
                      label: "Delete",
                      danger: true,
                      disabled: !isRevoked,
                      hint: "Revoke the key before deleting it",
                      onClick: () => void askDelete(confirm, key).then(async (ok) => { if (ok) await run(() => api(`/admin/api-keys/${id}`, { method: "DELETE" }), () => navigate(t.list, { replace: true })) }),
                    },
                  ]}
                />
              </div>
            }
          >
            <KV
              rows={[
                ["Title", key.title],
                ["Key", <TokenCell key="t" k={key} full />],
                ["Type", type === "publishable" ? "Publishable" : "Secret"],
                ["Last used at", key.last_used_at ? fmtDate(key.last_used_at) : dash],
                ["Created by", key.created_by ?? dash],
                ...(key.revoked_at ? [["Revoked at", fmtDate(key.revoked_at)] as [string, any], ["Revoked by", key.revoked_by ?? dash] as [string, any]] : []),
              ]}
            />
          </DetailSection>

          {type === "publishable" ? (
            <section className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Sales Channels</h2>
                <RowMenu items={[{ label: "Add", onClick: () => navigate(`${t.list}/${id}/sales-channels`) }]} />
              </div>
              <TableToolbar
                style={{ padding: "0 24px 12px", borderBottom: "none" }}
                right={
                  <TableSearch
                    value={channelSearch.draft}
                    onChange={(draft) => setChannelSearch((s) => ({ ...s, draft }))}
                    onSubmit={() => setChannelSearch((s) => ({ ...s, q: s.draft.trim() }))}
                    width={220}
                    placeholder="Search"
                  />
                }
              />
              {selected.length > 0 ? (
                <TableBulkBar count={selected.length}>
                  <button className="btn btn-secondary" onClick={() => void removeChannels(selected)}>
                    Remove
                  </button>
                </TableBulkBar>
              ) : null}
              <DataTable
                columns={[
                  { key: "name", label: "Name", render: (c: any) => c.name },
                  { key: "description", label: "Description", render: (c: any) => c.description || dash },
                ]}
                rows={channels}
                selectable
                selected={selected}
                onToggleRow={(cid) => setSelected((s) => toggleInList(s, cid))}
                onToggleAll={(checked) => setSelected(checked ? channels.map((c: any) => c.id) : [])}
                rowActions={(c: any) => [{ label: "Remove", danger: true, onClick: () => void removeChannels([c.id], c.name) }]}
                emptyTitle={channelSearch.q ? "No results found" : "No records"}
                emptyHint={channelSearch.q ? "No sales channels match your search." : "There are no records to show"}
              />
            </section>
          ) : null}

          <JsonSection data={key} />
        </div>
      ) : null}
      {key && editing ? (
        <EditApiKeyDrawer
          apiKey={key}
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

// Lupus "Add sales channels" for a publishable key: every channel, those already linked checked.
export function ApiKeySalesChannelsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = `${TYPES.publishable.list}/${id}`;
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [initial, setInitial] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { items, count, loading, error } = useServerList<any>("/admin/sales-channels", { page, limit: 50, q });

  useEffect(() => {
    api<{ api_key: any }>(`/admin/api-keys/${id}`)
      .then((d) => {
        const ids = (d.api_key.sales_channels ?? []).map((c: any) => c.id as string);
        setInitial(ids);
        setChecked(ids);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  async function save() {
    const before = initial ?? [];
    const add = checked.filter((c) => !before.includes(c));
    const remove = before.filter((c) => !checked.includes(c));
    if (add.length === 0 && remove.length === 0) {
      navigate(back);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/api-keys/${id}/sales-channels`, { method: "POST", body: { add, remove } });
      navigate(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const pageIds = items.map((c: any) => c.id as string);

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo={back}
      wide
      footer={<FormActions onCancel={() => navigate(back)} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <TableToolbar right={<TableSearch value={draft} onChange={setDraft} onSubmit={() => { setQ(draft.trim()); setPage(1); }} width={220} placeholder="Search" />} />
      <DataTable
        columns={[
          { key: "name", label: "Name", render: (c: any) => c.name },
          { key: "description", label: "Description", render: (c: any) => c.description || dash },
          { key: "status", label: "Status", render: (c: any) => <StatusCell color={c.is_disabled ? "grey" : "green"}>{c.is_disabled ? "Disabled" : "Enabled"}</StatusCell> },
        ]}
        rows={items}
        loading={loading || initial === null}
        error={error}
        selectable
        selected={checked}
        onToggleRow={(cid) => setChecked((s) => toggleInList(s, cid))}
        onToggleAll={(on) => setChecked((s) => (on ? [...new Set([...s, ...pageIds])] : s.filter((c) => !pageIds.includes(c))))}
        emptyTitle={q ? "No results found" : "No records"}
        emptyHint={q ? "No sales channels match your search." : "There are no records to show"}
      />
      <TablePager page={page} limit={50} count={count} onPage={setPage} />
    </WizardShell>
  );
}
