import { useState } from "react";
import { Drawer } from "@/widgets/ui/primitives";
import { FormField } from "@/widgets/form";
import { DataTable, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { useServerList } from "@/shared/hooks/use-server-list";

export interface Group {
  id: string;
  name: string;
}

const PAGE = 20;

/** Lupus's "Customer Groups  In" rule picker: a paged table of groups with checkboxes. */
export function CustomerGroupPickerDrawer({
  selected,
  onSave,
  onClose,
}: {
  selected: Group[];
  onSave: (groups: Group[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Group[]>(selected);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { items, count, loading, error } = useServerList<any>("/admin/customer-groups", { page, limit: PAGE, q });
  const ids = picked.map((g) => g.id);

  function toggle(id: string) {
    const row = items.find((g) => g.id === id);
    setPicked((s) => (s.some((g) => g.id === id) ? s.filter((g) => g.id !== id) : row ? [...s, { id, name: row.name ?? id }] : s));
  }
  function toggleAll(checked: boolean) {
    setPicked((s) => {
      const rest = s.filter((g) => !items.some((r) => r.id === g.id));
      return checked ? [...rest, ...items.map((r) => ({ id: r.id, name: r.name ?? r.id }))] : rest;
    });
  }

  return (
    <Drawer
      title="Customer Groups"
      subtitle="Choose which customer groups the price list applies to."
      onClose={onClose}
      style={{ width: "min(720px, 100vw)", maxWidth: "min(720px, 100vw)" }}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(picked)}>
            Save
          </button>
        </>
      }
    >
      <div style={{ margin: "-20px -24px 0" }}>
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
            />
          }
        />
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (g: any) => <span style={{ fontWeight: 600 }}>{g.name}</span> },
            { key: "customers", label: "Customers", render: (g: any) => String(g.customers_count ?? 0) },
          ]}
          rows={items}
          loading={loading}
          error={error}
          selectable
          selected={ids}
          onToggleRow={toggle}
          onToggleAll={toggleAll}
          emptyTitle={q ? "No results found" : "No records"}
          emptyHint={q ? "No customer groups match your search." : "There are no records to show"}
        />
        <TablePager page={page} limit={PAGE} count={count} onPage={setPage} />
      </div>
    </Drawer>
  );
}

/** The "Customer availability" field of the create form and the configuration drawer. */
export function CustomerAvailabilityField({
  groups,
  onChange,
  onPickerOpenChange,
  compact,
}: {
  groups: Group[];
  onChange: (groups: Group[]) => void;
  /** Lets a host drawer ignore Escape while the picker drawer is on top of it. */
  onPickerOpenChange?: (open: boolean) => void;
  compact?: boolean;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onPickerOpenChange?.(v);
  };
  const cell = {
    padding: "6px 10px",
    fontSize: 13,
    borderRadius: 6,
    background: "var(--field-bg)",
    border: "1px solid var(--field-border)",
  } as const;
  return (
    <FormField
      label="Customer availability"
      optional
      hint="Choose which customer groups the price list should be applied to."
    >
      <div
        role="application"
        style={{
          display: "grid",
          gap: 8,
          padding: 8,
          borderRadius: 12,
          background: "var(--hover-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 8, color: "var(--fg-subtle)" }}>
          <div style={cell}>Customer Groups</div>
          <div style={cell}>In</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              ...cell,
              flex: 1,
              textAlign: "left",
              color: "var(--fg-muted)",
              cursor: "pointer",
            }}
          >
            Search
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
            Browse
          </button>
        </div>
        {groups.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px dashed var(--card-border)", paddingTop: 8 }}>
            {groups.map((g) => (
              <div
                key={g.id}
                style={{ ...cell, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 6px 3px 10px" }}
              >
                <span>{g.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${g.name}`}
                  onClick={() => onChange(groups.filter((x) => x.id !== g.id))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)", fontSize: 12, padding: "2px 6px" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {open ? (
        <CustomerGroupPickerDrawer
          selected={groups}
          onClose={() => setOpen(false)}
          onSave={(g) => {
            onChange(g);
            setOpen(false);
          }}
        />
      ) : null}
    </FormField>
  );
}
