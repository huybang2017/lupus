import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { listAll } from "@/shared/api/list-all";
import { COUNTRY_OPTIONS, countryName } from "@/shared/i18n/country-options";
import { fmtCell } from "@/widgets/ui/surfaces";
import {
  Alert,
  EmptyState,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import {
  FormDrawer,
  FormGrid,
  NumberField,
  SelectField,
  TextField,
  ToggleField,
} from "@/widgets/form";
import {
  DataTable,
  TablePager,
  useTablePaging,
  type TableColumn,
} from "@/widgets/table";
import {
  DetailSection,
  JsonSection,
  KV,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import { useConfirm } from "@/widgets/confirm";

export function InventoryDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<any>(null);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [reservations, setReservations] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "attributes" | "locations" | "level">(
    null,
  );
  const [levelTarget, setLevelTarget] = useState<any>(null);

  function load() {
    setErr(null);
    api<{ inventory_item: any }>(`/admin/inventory-items/${id}`)
      .then((d) => setItem(d.inventory_item))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api("/admin/reservations?limit=100&offset=0&inventory_item_id=" + id)
      .then((d: any) => setReservations(parseList(d, 100).items))
      .catch(() => {});
    api("/admin/product-variants?limit=100&offset=0")
      .then((d: any) =>
        setVariants(
          parseList(d, 100).items.filter((v: any) =>
            (v.inventory_items ?? []).some(
              (l: any) => l.inventory_item_id === id,
            ),
          ),
        ),
      )
      .catch(() => {});
    listAll("/admin/stock-locations")
      .then((rows: any[]) => {
        const m: Record<string, string> = {};
        for (const l of rows) m[l.id] = l.name ?? l.id;
        setLocations(m);
      })
      .catch(() => {});
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({
        description: `Delete inventory item ${item?.sku ?? id}?`,
      }))
    )
      return;
    try {
      await api(`/admin/inventory-items/${id}`, { method: "DELETE" });
      navigate("/r/inventory-items");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function delLevel(locationId: string) {
    if (!(await confirm({ description: "Delete this location level?" })))
      return;
    await api(`/admin/inventory-items/${id}/location-levels/${locationId}`, {
      method: "DELETE",
    })
      .then(load)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  const levels: any[] = item?.location_levels ?? [];
  const stocked = levels.reduce(
    (s: number, l: any) => s + Number(l.stocked_quantity ?? 0),
    0,
  );
  const reserved = levels.reduce(
    (s: number, l: any) => s + Number(l.reserved_quantity ?? 0),
    0,
  );
  const locCount = new Set(levels.map((l: any) => l.location_id)).size;
  const {
    page: locPage,
    setPage: setLocPage,
    limit: locLimit,
    pageRows: locRows,
  } = useTablePaging(levels);
  const title = item?.title ?? variants[0]?.title ?? item?.sku ?? id;

  const locColumns: TableColumn[] = [
    {
      key: "location",
      label: "Location",
      render: (l: any) => (
        <span style={{ fontWeight: 600 }}>
          {locations[l.location_id] ?? l.location_id}
        </span>
      ),
    },
    {
      key: "reserved",
      label: "Reserved",
      render: (l: any) => Number(l.reserved_quantity ?? 0).toLocaleString(),
    },
    {
      key: "stocked",
      label: "In stock",
      render: (l: any) => Number(l.stocked_quantity ?? 0).toLocaleString(),
    },
    {
      key: "available",
      label: "Available",
      render: (l: any) =>
        (
          Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0)
        ).toLocaleString(),
    },
  ];

  const resColumns: TableColumn[] = [
    {
      key: "id",
      label: "ID",
      render: (r: any) => (
        <Link
          to={`/r/reservations/${r.id}`}
          style={{
            color: "var(--fg-interactive)",
            textDecoration: "none",
            fontWeight: 600,
          }}
          className="mono"
        >
          {r.id.slice(0, 18)}…
        </Link>
      ),
    },
    {
      key: "location",
      label: "Location",
      render: (r: any) => locations[r.location_id] ?? r.location_id,
    },
    { key: "qty", label: "Qty", render: (r: any) => r.quantity },
    {
      key: "description",
      label: "Description",
      render: (r: any) => fmtCell(r.description),
    },
  ];

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
          to="/r/inventory-items"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Inventory
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!item && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {item ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
