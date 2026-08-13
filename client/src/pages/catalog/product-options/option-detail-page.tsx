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
            }
          >
            <DataTable
              columns={valueCols}
              rows={pageRows}
              rowActions={(v: any) => [
                {
                  label: "Delete",
                  danger: true,
                  onClick: () => delValue(v.id, v.value),
                },
              ]}
              emptyTitle="No records"
              emptyHint="There are no records to show"
            />
            {values.length > 0 ? (
              <TablePager
                page={safePage}
                limit={limit}
                count={values.length}
                onPage={setPage}
              />
            ) : null}
          </DetailSection>

          <DetailSection title="Products">
            <DataTable
              columns={parentCols}
              rows={parent ? [parent] : []}
              emptyTitle="No records"
              emptyHint="This option is not linked to a product"
            />
          </DetailSection>

          <EditableMetadata metadata={option.metadata} path={`/admin/product-options/${id}`} onSaved={load} />

          <JsonSection data={option} />
        </div>
      ) : null}

      {drawer === "edit" ? (
        <OptionEditForm
          option={option}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "value" ? (
        <OptionValueForm
          optionId={id}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function OptionEditForm({
  option,
  onClose,
  onSaved,
}: {
  option: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(option.title ?? "");
  const [values, setValues] = useState<string[]>(
    (option.values ?? []).map((v: any) => v.value),
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function dropOn(to: number) {
    if (dragIdx === null || dragIdx === to) return;
    setValues((list) => {
      const next = [...list];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function save() {
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    if (values.length === 0) {
      setErr("Add at least one value.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/product-options/${option.id}`, {
        method: "POST",
        body: { title: title.trim(), values },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Edit Product Option"
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <TextField label="Title" value={title} onChange={setTitle} />
      <div className="field">
        <label className="field-label">Values</label>
        <MultiCombobox values={values} onChange={setValues} suggestions={[]} placeholder="S, M, L" />
      </div>
      <div className="field">
        <label className="field-label">Rank</label>
        <div>
          {values.map((v, i) => (
            <div
              key={v}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragOver={(e) => {
                if (dragIdx === null) return;
                e.preventDefault();
                setOverIdx(i);
              }}
              onDrop={() => {
                dropOn(i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                height: 52,
                padding: "0 4px",
                borderBottom: "1px solid var(--card-border)",
                fontSize: 13,
                cursor: "grab",
                background: dragIdx === i ? "var(--hover-bg)" : "transparent",
                boxShadow:
                  overIdx === i && dragIdx !== null && dragIdx !== i
                    ? "inset 0 2px 0 var(--fg-interactive)"
                    : "none",
              }}
            >
              <span title="Drag to reorder" style={{ color: "var(--fg-muted)", userSelect: "none" }}>
                ⠿
              </span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </FormDrawer>
  );
}

function OptionValueForm({
  optionId,
  onClose,
  onSaved,
}: {
  optionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!value.trim()) {
      setErr("Value is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const cur = await api<{ product_option: any }>(
        `/admin/product-options/${optionId}`,
      ).then((d) => d.product_option);
      const values = [
        ...(cur.values ?? []).map((v: any) => v.value),
        value.trim(),
      ];
      await api(`/admin/product-options/${optionId}`, {
        method: "POST",
        body: { values },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Add value"
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <TextField
        label="Value"
        required
        placeholder="XL"
        value={value}
        onChange={setValue}
      />
    </FormDrawer>
  );
}
