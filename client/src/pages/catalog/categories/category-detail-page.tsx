import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Badge, fmtCell } from "@/widgets/ui/surfaces";
import {
  Alert,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import {
  DetailSection,
  JsonSection,
  KV,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import {
  FormDrawer,
  FormGrid,
  SelectField,
  TextAreaField,
  TextField,
} from "@/widgets/form";
import { PRODUCT_TABLE_COLS } from "@/widgets/cells/product-cells";
import {
  DataTable,
  TablePager,
  TableSearch,
  TableToolbar,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import { requestConfirm, useConfirm } from "@/widgets/confirm";
import { FilterBar, useLocalFilters } from "@/widgets/filters";
import {
  csvOptions,
  dateFilter,
  selectFilter,
  textFilter,
} from "@/widgets/filters/filter-defs";
import type { FilterDef } from "@/shared/filters/list-filters";

const NO_PARENT = "__none";

// Filters for the category's product table. The rows arrive with the category
// payload, so these run against memory via the accessors rather than a query.
const PRODUCT_FILTERS: FilterDef[] = [
  textFilter("title", "Title", { accessor: (row: any) => row?.title }),
  selectFilter("status", "Status", csvOptions("draft,proposed,published,rejected"), {
    accessor: (row: any) => row?.status,
  }),
  dateFilter("created_at", undefined, {
    accessor: (row: any) => row?.created_at,
  }),
];

export function CategoryDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [cat, setCat] = useState<any>(null);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<null | "edit">(null);

  function load() {
    setErr(null);
    api<{ product_category: any }>(`/admin/product-categories/${id}`)
      .then((d) => setCat(d.product_category))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api("/admin/product-categories?limit=100&offset=0")
      .then((d: any) => setSiblings(parseList(d, 100).items))
      .catch(() => {});
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({ description: `Delete category ${cat?.name ?? id}?` }))
    )
      return;
    setBusy(true);
    try {
      await api(`/admin/product-categories/${id}`, { method: "DELETE" });
      navigate("/r/categories");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const baseProducts: any[] = cat?.products ?? [];
  const {
    draft,
    setDraft,
    submit,
    filtered: searched,
  } = useTableSearch(
    baseProducts,
    (p: any, needle: string) =>
      !needle ||
      `${p.title ?? ""} ${p.handle ?? ""}`.toLowerCase().includes(needle),
  );
  const products = useLocalFilters(searched, PRODUCT_FILTERS);
  const {
    page: safePage,
    setPage,
    limit,
    pageRows,
  } = useTablePaging(products.rows, { resetKey: id });
  const children = siblings.filter((c: any) => c.parent_category_id === id);
  const parent = siblings.find((c: any) => c.id === cat?.parent_category_id);
  const path =
    [...(parent ? [parent.name] : []), cat?.name].filter(Boolean).join(" / ") ||
    "–";

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
          to="/r/categories"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Categories
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{cat?.name ?? id}</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!cat && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {cat ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection
              title={cat.name}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge
                    value={cat.is_active === false ? "Inactive" : "Active"}
                  />
                  <Badge value={cat.is_internal ? "Private" : "Public"} />
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setDrawer("edit") },
                      { label: "Delete", danger: true, onClick: del },
                    ]}
                  />
                </div>
              }
            >
              <KV
                rows={[
                  ["Description", fmtCell(cat.description)],
                  [
                    "Handle",
                    <span key="h" className="mono">
                      /{fmtCell(cat.handle)}
                    </span>,
                  ],
                ]}
              />
            </DetailSection>

            <DetailSection
              title="Products"
              action={
                <RowMenu
                  items={[
                    {
                      label: "Add",
                      onClick: () => navigate(`/r/categories/${id}/products`),
                    },
                  ]}
                />
              }
            >
              <TableToolbar
                left={<FilterBar defs={PRODUCT_FILTERS} filters={products} />}
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
                columns={PRODUCT_TABLE_COLS}
                rows={pageRows}
                rowActions={(p: any) => [
                  {
