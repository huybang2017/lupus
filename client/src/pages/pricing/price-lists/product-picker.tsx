import { useState } from "react";
import { DataTable, TablePager, TableSearch, TableToolbar } from "@/widgets/table";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import { useServerList } from "@/shared/hooks/use-server-list";

export type PickedProducts = Record<string, any>;

const PAGE = 20;

// Lupus's product picker (price list create / add prices): a paged, searchable product table with
// checkboxes. A product without variants cannot carry a price, so its checkbox is locked; products
// already in the list (`locked`) are shown checked and locked too.
export function ProductPicker({
  picked,
  onChange,
  locked = [],
  priceListId,
  error,
}: {
  picked: PickedProducts;
  onChange: (next: PickedProducts) => void;
  locked?: string[];
  /** Restrict to products that already have a price in this list (the detail page's section). */
  priceListId?: string;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { items, count, loading, error: loadError } = useServerList<any>("/admin/products", {
    page,
    limit: PAGE,
    q,
    params: { status: status || undefined, price_list_id: priceListId },
  });
  const unusable = (p: any) => locked.includes(p.id) || (p.variants ?? []).length === 0;
  const selectable = items.filter((p) => !unusable(p));
  const ids = [...locked, ...Object.keys(picked)];

  function toggle(id: string) {
    const row = items.find((p) => p.id === id);
    if (!row || unusable(row)) return;
    const next = { ...picked };
    if (next[id]) delete next[id];
    else next[id] = row;
    onChange(next);
  }
  function toggleAll(checked: boolean) {
    const next = { ...picked };
    for (const p of selectable) {
      if (checked) next[p.id] = p;
      else delete next[p.id];
    }
    onChange(next);
  }

  return (
    <div>
      <TableToolbar
        left={
          <select
            className="input"
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            style={{ width: 150 }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="proposed">Proposed</option>
            <option value="published">Published</option>
            <option value="rejected">Rejected</option>
          </select>
        }
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
      {error ? (
        <div role="alert" style={{ padding: "8px 16px", fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      ) : null}
      <DataTable
        columns={PRODUCT_TABLE_COLS}
        rows={items}
        loading={loading}
        error={loadError}
        selectable
        selected={ids}
        rowDisabled={unusable}
        onToggleRow={toggle}
        onToggleAll={toggleAll}
        emptyTitle={q || status ? "No results found" : "No records"}
        emptyHint={
          q || status ? "No products match your filter criteria." : "There are no records to show"
        }
      />
      <TablePager page={page} limit={PAGE} count={count} onPage={setPage} />
    </div>
  );
}
