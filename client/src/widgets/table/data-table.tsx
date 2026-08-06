import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { Alert, EmptyState, RowMenu, Spinner } from "@/widgets/ui/primitives";

export interface TableColumn<T = any> {
  key: string;
  label: string;
  width?: number | string;
  align?: "left" | "right" | "center";
  mono?: boolean;
  /** When set the header is a sort toggle. */
  sortKey?: string;
  render: (row: T, index: number) => ReactNode;
}

export interface TableRowAction {
  label: string;
  danger?: boolean;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}

export interface DataTableProps<T = any> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyHint?: string;
  selectable?: boolean;
  selected?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  /** Rows whose checkbox is locked (e.g. already-assigned items). */
  rowDisabled?: (row: T) => boolean;
  rowActions?: (row: T, index: number) => TableRowAction[];
  showActions?: boolean;
  caption?: string;
  /** Current server sort (`key` or `-key`) and its change handler. */
  sort?: string;
  onSort?: (next: string) => void;
  /** Clicking anywhere on a row (not on a link, button or checkbox) calls this, like Lupus's row links. */
  onRowClick?: (row: T) => void;
}

export function DataTable<T = any>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyTitle,
  emptyHint,
  selectable,
  selected,
  onToggleRow,
  onToggleAll,
  rowDisabled,
  rowActions,
  showActions,
  caption,
  sort,
  onSort,
  onRowClick,
}: DataTableProps<T>): JSX.Element {
  const headerNode = useRef<HTMLInputElement | null>(null);
  const show = showActions ?? !!rowActions;
  const rowIds = rows.map((row, i) =>
    rowKey ? rowKey(row, i) : String((row as { id?: unknown }).id ?? i),
  );
  const allChecked =
    rowIds.length > 0 && rowIds.every((id) => selected?.includes(id));
  const partial = !allChecked && rowIds.some((id) => selected?.includes(id));
  const actionsByRow = rowActions
    ? rows.map((row, i) => rowActions(row, i))
    : [];
  const hasActions =
    show && !!rowActions && actionsByRow.some((items) => items.length > 0);
  const setHeaderRef = useCallback(
    (node: HTMLInputElement | null) => {
      headerNode.current = node;
      if (node) node.indeterminate = partial;
    },
    [partial],
  );
  if (headerNode.current) headerNode.current.indeterminate = partial;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [xOverflow, setXOverflow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setXOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.querySelector("table");
    if (table) observer.observe(table);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rows.length, columns.length, selectable, showActions]);

  if (error) return <Alert>{error}</Alert>;
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spinner size={22} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? "No records"}
        hint={emptyHint ?? "There are no records to show"}
      />
    );
  }
  return (
    <div>
      <div
        ref={scrollRef}
        className={"table-wrap" + (xOverflow ? " table-x" : "")}
        style={{ overflowX: "auto" }}
      >
        <table className="dtable">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {selectable ? (
                <th
                  scope="col"
                  className="dtable-sticky-left"
                  style={{ width: 40 }}
                >
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                    aria-label="Select all"
                    ref={setHeaderRef}
                  />
                </th>
              ) : null}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align }}
                  scope="col"
                  aria-sort={
                    c.sortKey && sort?.replace(/^-/, "") === c.sortKey
                      ? sort.startsWith("-")
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                >
                  {c.sortKey && onSort ? (
                    <button
                      type="button"
                      onClick={() => {
                        const cur = sort?.replace(/^-/, "") === c.sortKey ? sort : "";
                        onSort(!cur ? c.sortKey! : cur.startsWith("-") ? "" : `-${c.sortKey}`);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {c.label}
                      <span style={{ fontSize: 10, opacity: sort?.replace(/^-/, "") === c.sortKey ? 1 : 0.35 }}>
                        {sort === c.sortKey ? "▲" : sort === `-${c.sortKey}` ? "▼" : "⇅"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {hasActions ? (
                <th
                  scope="col"
                  className="dtable-sticky-right"
                  style={{ width: 56 }}
                >
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const id = rowIds[i];
              const items = actionsByRow[i] ?? [];
              return (
                <tr
                  key={id}
                  style={onRowClick ? { cursor: "pointer" } : undefined}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as HTMLElement).closest("a,button,input,label,[role='menuitem']")) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {selectable ? (
                    <td className="dtable-sticky-left" style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={!!selected?.includes(id)}
                        disabled={rowDisabled?.(row) ?? false}
                        onChange={() => onToggleRow?.(id)}
                        aria-label={`Select ${id}`}
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={c.mono ? "mono" : undefined}
                      style={{ textAlign: c.align }}
                    >
                      {c.render(row, i)}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="dtable-sticky-right" style={{ width: 56 }}>
                      {items.length > 0 ? <RowMenu items={items} /> : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
