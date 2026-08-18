import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { fmtCell } from "@/widgets/ui/surfaces";
import {
  Alert,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import { CheckboxField } from "@/widgets/form";
import {
  DetailSection,
  JsonSection,
  KV,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import { ResourceForm } from "@/pages/resource/resource-form";
import { getResource } from "@/entities/resources";
import {
  DataTable,
  TablePager,
  TableSearch,
  TableToolbar,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import type { TableColumn } from "@/widgets/table";
import { useConfirm } from "@/widgets/confirm";
import { FilterBar, useLocalFilters } from "@/widgets/filters";
import {
  boolFilter,
  dateFilter,
  textFilter,
} from "@/widgets/filters/filter-defs";
import type { FilterDef } from "@/shared/filters/list-filters";

// Client-side filters for the members table: the whole group is already in
// memory, so paging and filtering stay local. Accessors read the same row the
// columns render, so a chip can never disagree with what is on screen.
const MEMBER_FILTERS: FilterDef[] = [
  textFilter("email", "Email", { accessor: (row: any) => row?.email }),
  boolFilter("has_account", "Customer account", {
    accessor: (row: any) => row?.has_account === true,
  }),
  dateFilter("created_at", undefined, {
    accessor: (row: any) => row?.created_at,
  }),
];

const memberCols: TableColumn[] = [
  {
    key: "select",
    label: "",
    render: (c: any) => (
      <CheckboxField
        label={c.email}
        checked={false}
        onChange={() => {}}
        disabled
      />
    ),
  },
  {
    key: "email",
    label: "Email",
    render: (c: any) => (
      <Link
        to={`/r/customers/${c.id}`}
        style={{
          color: "var(--fg-interactive)",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        {fmtCell(c.email)}
      </Link>
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

export function CustomerGroupDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const groupsRes = getResource("customer-groups");

  function load() {
    setErr(null);
    api<{ customer_group: any }>(`/admin/customer-groups/${id}`)
      .then((d) => setGroup(d.customer_group))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({
        description: `Delete customer group ${group?.name ?? id}?`,
      }))
    )
      return;
    try {
      await api(`/admin/customer-groups/${id}`, { method: "DELETE" });
      navigate("/r/customer-groups");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeMember(customerId: string, email: string) {
    if (!(await confirm({ description: `Remove ${email} from this group?` })))
      return;
    await api(`/admin/customer-groups/${id}/customers`, {
      method: "POST",
      body: { remove: [customerId] },
    })
      .then(load)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  const baseMembers: any[] = group?.customers ?? [];
  // Search first (it is a substring match), then the filter chips, then paging:
  // each stage narrows what the next one sees.
  const {
    draft,
    setDraft,
    submit,
    filtered: searched,
  } = useTableSearch(
    baseMembers,
    (c: any, needle: string) =>
      !needle ||
      `${c.email ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""}`
        .toLowerCase()
        .includes(needle),
  );
  const members = useLocalFilters(searched, MEMBER_FILTERS);
  const {
    page: safePage,
    setPage,
    limit,
    pageRows,
  } = useTablePaging(members.rows, { resetKey: id });

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
          to="/r/customer-groups"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Customer Groups
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {group?.name ?? id}
        </span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!group && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {group ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          <DetailSection
            title={group.name}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setEditing(true) },
                  { label: "Delete", danger: true, onClick: del },
                ]}
              />
            }
          >
            <KV
              rows={[["Customers", String((group.customers ?? []).length)]]}
            />
          </DetailSection>

          <DetailSection
            title="Customers"
            action={
              <button
                className="btn btn-secondary"
                onClick={() =>
                  navigate(`/r/customer-groups/${id}/add-customers`)
                }
              >
                Add
              </button>
            }
          >
            <TableToolbar
              left={<FilterBar defs={MEMBER_FILTERS} filters={members} />}
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
              columns={memberCols}
              rows={pageRows}
              rowActions={(c: any) => [
                {
                  label: "Remove",
                  danger: true,
                  onClick: () => removeMember(c.id, c.email),
                },
              ]}
              emptyTitle={
                draft || members.count > 0 ? "No results found" : "No records"
              }
              emptyHint={
                draft || members.count > 0
                  ? "No customers match your filter criteria."
                  : "There are no records to show"
              }
            />
            {members.rows.length > 0 ? (
              <TablePager
                page={safePage}
                limit={limit}
                count={members.rows.length}
                onPage={setPage}
              />
            ) : null}
          </DetailSection>

          <EditableMetadata metadata={group.metadata} path={`/admin/customer-groups/${id}`} onSaved={load} />

          <JsonSection data={group} />
        </div>
      ) : null}

      {editing && groupsRes ? (
        <ResourceForm
          resource={groupsRes}
          mode="edit"
          initial={group}
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
