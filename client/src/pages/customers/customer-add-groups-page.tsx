import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { listAll } from "@/shared/api/list-all";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FormActions } from "@/widgets/form";
import {
  DataTable,
  TablePager,
  TableSearch,
  TableToolbar,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import type { TableColumn } from "@/widgets/table";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

const cols: TableColumn[] = [
  { key: "name", label: "Name", render: (g: any) => <span style={{ fontWeight: 600 }}>{g.name}</span> },
  {
    key: "created",
    label: "Created",
    render: (g: any) =>
      g.created_at
        ? new Date(g.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "-",
  },
];

// Lupus "Add customer to groups": a full-screen picker (esc to close) with the group table.
// Groups the customer already belongs to are shown checked and locked.
export function CustomerAddGroupsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = `/r/customers/${id}`;
  const [groups, setGroups] = useState<any[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api<{ customer: any }>(`/admin/customers/${id}`)
      .then((d) => setExisting((d.customer?.groups ?? []).map((g: any) => g.id)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    listAll("/admin/customer-groups")
      .then(setGroups)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector(".confirm-back")) navigate(back);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, navigate]);

  const { draft, setDraft, submit, filtered } = useTableSearch(
    groups,
    (g: any, needle: string) => !needle || String(g.name ?? "").toLowerCase().includes(needle),
  );
  const { page, setPage, limit, pageRows } = useTablePaging(filtered);
  const selectable = pageRows.map((g: any) => g.id).filter((x: string) => !existing.includes(x));

  async function save() {
    if (picked.length === 0) {
      setSubmitted(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/customers/${id}/customer-groups`, { method: "POST", body: { add: picked } });
      navigate(back);
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
      closeTo={back}
      wide
      footer={
        <FormActions onCancel={() => navigate(back)} onSubmit={save} submitLabel="Save" busy={busy} />
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      {submitted && picked.length === 0 ? (
        <Alert>Select at least one group to add the customer to.</Alert>
      ) : null}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : (
        <div>
          <TableToolbar
            right={
              <TableSearch
                value={draft}
                onChange={setDraft}
                onSubmit={() => {
                  submit();
                  setPage(1);
                }}
                width={220}
                placeholder="Search"
              />
            }
          />
          <DataTable
            columns={cols}
            rows={pageRows}
            selectable
            selected={[...existing, ...picked]}
            rowDisabled={(g: any) => existing.includes(g.id)}
            onToggleRow={(gid) => {
              setSubmitted(false);
              setPicked((s) => (s.includes(gid) ? s.filter((x) => x !== gid) : [...s, gid]));
            }}
            onToggleAll={(checked) =>
              setPicked((s) => (checked ? [...new Set([...s, ...selectable])] : s.filter((x) => !selectable.includes(x))))
            }
            emptyTitle={draft ? "No results found" : "No records"}
            emptyHint={draft ? "No groups match your search." : "There are no customer groups to add."}
          />
          <TablePager page={page} limit={limit} count={filtered.length} onPage={setPage} />
        </div>
      )}
    </WizardShell>
  );
}
