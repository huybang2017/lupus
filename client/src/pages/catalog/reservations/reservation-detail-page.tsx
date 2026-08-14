import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { fmtCell } from "@/widgets/ui/surfaces";
import {
  Alert,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import { FormDrawer, NumberField, TextAreaField } from "@/widgets/form";
import {
  DetailSection,
  JsonSection,
  KV,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import { useConfirm } from "@/widgets/confirm";

export function ReservationDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [res, setRes] = useState<any>(null);
  const [item, setItem] = useState<any>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function load() {
    setErr(null);
    api<{ reservation: any }>(`/admin/reservations/${id}`)
      .then((d) => setRes(d.reservation))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!res) return;
    let alive = true;
    if (res.inventory_item_id) {
      api<{ inventory_item: any }>(
        `/admin/inventory-items/${res.inventory_item_id}`,
      )
        .then((d) => {
          if (alive) setItem(d.inventory_item);
        })
        .catch(() => {
          if (alive) setItem(null);
        });
    }
    if (res.location_id) {
      api("/admin/stock-locations?limit=100&offset=0")
        .then((d: any) => {
          if (!alive) return;
          const found = parseList(d, 100).items.find(
            (l: any) => l.id === res.location_id,
          );
          setLocationName(found ? (found.name ?? found.id) : null);
        })
        .catch(() => {
          if (alive) setLocationName(null);
        });
    }
    return () => {
      alive = false;
    };
  }, [res?.inventory_item_id, res?.location_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({
        description: `Delete reservation ${id}? Reserved stock is released.`,
      }))
    )
      return;
    try {
      await api(`/admin/reservations/${id}`, { method: "DELETE" });
      navigate("/r/reservations");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const levels: any[] = item?.location_levels ?? [];
  const atLoc = levels.find((l: any) => l.location_id === res?.location_id);
  const totalStocked = levels.reduce(
    (s: number, l: any) => s + Number(l.stocked_quantity ?? 0),
    0,
  );
  const totalReserved = levels.reduce(
    (s: number, l: any) => s + Number(l.reserved_quantity ?? 0),
    0,
  );
  const itemTitle = item?.title ?? item?.sku ?? res?.inventory_item_id ?? id;

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
          to="/r/reservations"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Reservations
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{itemTitle}</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!res && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {res ? (
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
              title={`Reservation of ${itemTitle}`}
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
                rows={[
                  [
                    "Line item ID",
                    <span key="l" className="mono">
                      {fmtCell(res.line_item_id)}
                    </span>,
                  ],
                  ["Description", fmtCell(res.description)],
                  ["Location", fmtCell(locationName ?? res.location_id)],
                  [
                    "In stock at this location",
                    atLoc
                      ? Number(atLoc.stocked_quantity ?? 0).toLocaleString()
                      : "–",
                  ],
                  [
                    "Available at this location",
                    atLoc
                      ? (
                          Number(atLoc.stocked_quantity ?? 0) -
                          Number(atLoc.reserved_quantity ?? 0)
                        ).toLocaleString()
                      : "–",
                  ],
                  [
                    "Reserved at this location",
                    Number(res.quantity ?? 0).toLocaleString(),
                  ],
                ]}
              />
            </DetailSection>

            <EditableMetadata metadata={res.metadata} path={`/admin/reservations/${id}`} onSaved={load} />

            <JsonSection data={res} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection title={`${itemTitle} Details`}>
              <KV
                rows={[
                  [
                    "SKU",
                    <span key="s" className="mono">
                      {fmtCell(item?.sku)}
                    </span>,
                  ],
                  [
                    "In stock",
                    `${totalStocked.toLocaleString()} across ${levels.length} location${levels.length === 1 ? "" : "s"}`,
                  ],
                  [
                    "Reserved",
                    `${totalReserved.toLocaleString()} across ${levels.length} location${levels.length === 1 ? "" : "s"}`,
                  ],
                  [
                    "Available",
                    `${(totalStocked - totalReserved).toLocaleString()} across ${levels.length} location${levels.length === 1 ? "" : "s"}`,
                  ],
                ]}
              />
            </DetailSection>
          </div>
        </div>
      ) : null}

      {editing ? (
        <ReservationEditForm
          res={res}
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

function ReservationEditForm({
  res,
  onClose,
  onSaved,
}: {
  res: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState(String(res.quantity ?? 0));
  const [description, setDescription] = useState(res.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const qty = Math.round(Number(quantity) || 0);
    if (qty <= 0) {
      setErr("Quantity must be positive.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/reservations/${res.id}`, {
        method: "POST",
        body: { quantity: qty, description: description.trim() || null },
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
      title="Edit reservation"
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <NumberField
        label="Quantity"
        required
        value={quantity}
        onChange={setQuantity}
        min={1}
        maxWidth={200}
      />
      <TextAreaField
        label="Description"
        value={description}
        onChange={setDescription}
        rows={3}
      />
    </FormDrawer>
  );
}
