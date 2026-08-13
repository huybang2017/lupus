import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
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
import { FormDrawer, TextField } from "@/widgets/form";
import {
  DataTable,
  TablePager,
  TableSearch,
  useTablePaging,
  useTableSearch,
} from "@/widgets/table";
import type { TableColumn } from "@/widgets/table";
import { useConfirm } from "@/widgets/confirm";
import { MultiCombobox } from "@/widgets/wizard/product-options-editor";

const valueCols: TableColumn[] = [
  {
    key: "value",
    label: "Values",
    render: (v: any) => (
      <span style={{ fontWeight: 600 }}>{fmtCell(v.value)}</span>
    ),
  },
];

const parentCols: TableColumn[] = [
  {
    key: "product",
    label: "Product",
    render: (p: any) => (
      <Link
        to={`/r/products/${p.id}`}
        style={{
          color: "var(--fg-interactive)",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        {fmtCell(p.title)}
      </Link>
    ),
  },
  {
    key: "handle",
    label: "Handle",
    mono: true,
    render: (p: any) => fmtCell(p.handle),
  },
  {
    key: "status",
    label: "Status",
    render: (p: any) => <Badge value={p.status} />,
  },
];

export function OptionDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [option, setOption] = useState<any>(null);
  const [parent, setParent] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<null | "edit" | "value">(null);

  function load() {
    setErr(null);
    api<{ product_option: any }>(`/admin/product-options/${id}`)
      .then((d) => setOption(d.product_option))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pid = option?.product_id;
    if (!pid) {
      setParent(null);
      return;
    }
    let alive = true;
    api<{ product: any }>(`/admin/products/${pid}`)
      .then((d) => {
        if (alive) setParent(d.product);
      })
      .catch(() => {
        if (alive) setParent(null);
      });
    return () => {
      alive = false;
    };
  }, [option?.product_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({ description: `Delete option ${option?.title ?? id}?` }))
    )
      return;
    setBusy(true);
    try {
      await api(`/admin/product-options/${id}`, { method: "DELETE" });
      navigate("/r/product-options");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function delValue(valueId: string, value: string) {
    if (
      !(await confirm({
        description: `Delete value "${value}"? Variants using it keep their other values.`,
      }))
    )
      return;
    await api(`/admin/product-options/${id}/values/${valueId}`, {
      method: "DELETE",
    })
      .then(load)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  const baseValues: any[] = option?.values ?? [];
  const {
    draft,
    setDraft,
    submit,
    filtered: values,
  } = useTableSearch(
    baseValues,
    (v: any, needle: string) =>
      !needle ||
      String(v.value ?? "")
        .toLowerCase()
        .includes(needle),
  );
  const {
    page: safePage,
    setPage,
    limit,
    pageRows,
  } = useTablePaging(values, { resetKey: id });

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
          to="/r/product-options"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Options
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {option?.title ?? id}
        </span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!option && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {option ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          <DetailSection
            title={option.title}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setDrawer("edit") },
                  { label: "Delete", danger: true, onClick: del },
                ]}
              />
            }
          >
            <KV
              rows={[
                [
                  "Type",
                  <span key="t" className="badge badge-blue">
                    Global
                  </span>,
                ],
              ]}
            />
          </DetailSection>

          <DetailSection
            title="Values"
            action={
              <div style={{ display: "flex", gap: 8 }}>
                <TableSearch
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => {
                    submit();
                    setPage(1);
                  }}
                  width={180}
                />
                <button
                  className="btn btn-secondary"
                  onClick={() => setDrawer("value")}
                >
                  Add
                </button>
              </div>
