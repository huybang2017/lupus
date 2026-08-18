import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { fmtCell } from "@/widgets/ui/surfaces";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FormActions } from "@/widgets/form";
import {
  DataTable,
  TableActions,
  TablePager,
  TableSearch,
  TableToolbar,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import type { TableColumn } from "@/widgets/table";
import { FilterBar, useLocalFilters } from "@/widgets/filters";
import {
  boolFilter,
  dateFilter,
  textFilter,
} from "@/widgets/filters/filter-defs";
import type { FilterDef } from "@/shared/filters/list-filters";

// The picker loads every customer once (limit=100) and pages client-side, so the
// filters are local too. Same defs as the member table on the detail page.
const CUSTOMER_FILTERS: FilterDef[] = [
  textFilter("email", "Email", { accessor: (row: any) => row?.email }),
  boolFilter("has_account", "Customer account", {
    accessor: (row: any) => row?.has_account === true,
  }),
  dateFilter("created_at", undefined, {
    accessor: (row: any) => row?.created_at,
  }),
];

const customerCols: TableColumn[] = [
  {
    key: "email",
    label: "Email",
    render: (c: any) => (
      <span style={{ fontWeight: 600 }}>{fmtCell(c.email)}</span>
    ),
  },
  {
    key: "name",
    label: "Name",
    render: (c: any) =>
      [c.first_name, c.last_name].filter(Boolean).join(" ") || "–",
  },
  {
    key: "account",
    label: "Account",
    render: (c: any) =>
      c.has_account ? (
        "Customer"
      ) : (
        <span>
          <span style={{ color: "#f59e0b" }}>▪</span> Guest
        </span>
      ),
  },
  {
    key: "created",
    label: "Created",
    render: (c: any) =>
      c.created_at
        ? new Date(c.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "–",
  },
];

export function CustomerGroupAddCustomersPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [all, setAll] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ customer_group: any }>(`/admin/customer-groups/${id}`)
      .then((d) => {
        setGroupName(d.customer_group?.name ?? "");
        setPicked((d.customer_group?.customers ?? []).map((c: any) => c.id));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api("/admin/customers?limit=100&offset=0")
      .then((d: any) => setAll(parseList(d, 100).items))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const {
    draft,
    setDraft,
    submit,
    filtered: searched,
  } = useTableSearch(
    all,
    (c: any, needle: string) =>
      !needle ||
      `${c.email ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""}`
        .toLowerCase()
        .includes(needle),
  );
  const filters = useLocalFilters(searched, CUSTOMER_FILTERS);
  const rows = filters.rows;
  const { page: safePage, setPage, limit, pageRows } = useTablePaging(rows);
  const pageIds = pageRows.map((c: any) => c.id);

  function toggleRow(customerId: string) {
    setPicked((s) =>
      s.includes(customerId)
        ? s.filter((x) => x !== customerId)
        : [...s, customerId],
    );
  }

  function toggleAll(checked: boolean) {
    setPicked((s) =>
      checked
        ? [...new Set([...s, ...pageIds])]
        : s.filter((x) => !pageIds.includes(x)),
    );
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/customer-groups/${id}/customers`, {
        method: "POST",
        body: { add: picked },
      });
      navigate(`/r/customer-groups/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <Link
          to={`/r/customer-groups/${id}`}
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          {groupName || "Customer Group"}
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Add customers</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <TableToolbar
            left={<FilterBar defs={CUSTOMER_FILTERS} filters={filters} />}
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
            columns={customerCols}
            rows={pageRows}
            loading={loading}
            selectable
            selected={picked.filter((x) => pageIds.includes(x))}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            emptyTitle={
              draft || filters.count > 0 ? "No results found" : "No records"
            }
            emptyHint={
              draft || filters.count > 0
                ? "No customers match your filter criteria."
                : "There are no records to show"
            }
          />
          <TablePager
            page={safePage}
            limit={limit}
            count={rows.length}
            onPage={setPage}
          />
          <TableActions>
            <FormActions
              onCancel={() => navigate(`/r/customer-groups/${id}`)}
              onSubmit={save}
              busy={busy}
              submitLabel="Save"
              cancelLabel="Cancel"
            />
          </TableActions>
        </div>
      )}
    </div>
  );
}
