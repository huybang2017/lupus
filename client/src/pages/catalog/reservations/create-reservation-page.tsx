import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { listAll } from "@/shared/api/list-all";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  FormActions,
  FormGrid,
  NumberField,
  SelectField,
  TextAreaField,
} from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

const fmt = (n: number | undefined | null, unit?: string) =>
  n == null ? "-" : `${n.toLocaleString()}${unit ? ` ${unit}` : ""}`;

// Lupus "Create reservation": pick the item first (or arrive with ?item_id=), then only
// the locations that stock it are offered; stock/available fill in once a location is
// chosen and quantity + description stay locked until both are set.
export function CreateReservationPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetItemId = params.get("item_id") ?? "";
  const back = presetItemId ? `/r/inventory-items/${presetItemId}` : "/r/reservations";

  const [items, setItems] = useState<any[]>([]);
  const [locationNames, setLocationNames] = useState<Record<string, { name: string; sub?: string }>>({});
  const [itemId, setItemId] = useState(presetItemId);
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qtyError, setQtyError] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [itemRes, locs, preset] = await Promise.all([
        api("/admin/inventory-items?limit=100&offset=0").catch(() => null),
        listAll("/admin/stock-locations").catch(() => []),
        presetItemId
          ? api<{ inventory_item: any }>(`/admin/inventory-items/${presetItemId}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!alive) return;
      const list: any[] = itemRes ? parseList(itemRes, 100).items : [];
      if (preset?.inventory_item && !list.some((i) => i.id === presetItemId)) {
        list.unshift(preset.inventory_item);
      }
      setItems(list);
      const names: Record<string, { name: string; sub?: string }> = {};
      for (const l of locs as any[]) {
        names[l.id] = {
          name: l.name ?? l.id,
          sub:
            [l.address?.address_1, l.address?.city, l.address?.country_code]
              .filter(Boolean)
              .join(", ") || undefined,
        };
      }
      setLocationNames(names);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [presetItemId]);

  const selected = items.find((i) => i.id === itemId);
  const levels: any[] = selected?.location_levels ?? [];
  const level = levels.find((l) => l.location_id === locationId);
  const unit: string | undefined = selected?.metadata?.unit_of_measure;
  const available = level
    ? Number(level.available_quantity ?? Number(level.stocked_quantity) - Number(level.reserved_quantity))
    : 0;
  const qtyNum = quantity.trim() === "" ? 0 : Number(quantity);
  const ready = !!itemId && !!locationId;

  const dirty = locationId !== "" || quantity !== "" || description.trim() !== "" || (!presetItemId && itemId !== "");

  async function leave() {
    if (busy) return;
    if (dirty) {
      const ok = await requestConfirm({
        title: "Are you sure you want to leave this form?",
        description: "You have unsaved changes that will be lost if you exit this form.",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        variant: "primary",
      });
      if (!ok) return;
    }
    navigate(back);
  }

  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".confirm-back, [role=\"listbox\"]")) return;
      void leaveRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function changeItem(v: string) {
    setItemId(v);
    setLocationId("");
    setQuantity("");
    setQtyError(undefined);
  }

  async function save() {
    setErr(null);
    if (!ready) return;
    if (!(qtyNum > 0)) {
      setQtyError("Quantity must be greater than 0.");
      return;
    }
    if (!Number.isInteger(qtyNum)) {
      setQtyError("Quantity must be a whole number.");
      return;
    }
    if (!available) {
      setQtyError("Stock location doesn't have available quantity.");
      return;
    }
    if (qtyNum > available) {
      setQtyError(`Minimum quantity is 1 and maximum quantity is ${available.toLocaleString()}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ reservation: any }>("/admin/reservations", {
        method: "POST",
        body: {
          inventory_item_id: itemId,
          location_id: locationId,
          quantity: qtyNum,
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      navigate(presetItemId ? back : `/r/reservations/${res.reservation.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Title", selected?.title ?? selected?.sku ?? "-"],
    ["SKU", selected?.sku ?? "-"],
    ["In stock", level ? fmt(Number(level.stocked_quantity), unit) : "-"],
    ["Available", available ? fmt(available - (qtyNum || 0), unit) : "-"],
  ];

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo={back}
      onRequestClose={() => void leave()}
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={save}
          submitLabel="Create"
          busy={busy}
          disabled={loading || !ready}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--fg-base)" }}>
          Create reservation
        </h1>
        {err ? <Alert>{err}</Alert> : null}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner size={22} />
          </div>
        ) : (
          <>
            <FormGrid cols={2} gap={16}>
              <SelectField
                label="Item to reserve"
                value={itemId}
                onChange={changeItem}
                disabled={!!presetItemId}
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.title ?? i.sku ?? i.id,
                  sub: i.sku,
                }))}
                placeholder="Select item"
                searchable
              />
              <SelectField
                label="Location"
                value={locationId}
                onChange={(v) => {
                  setLocationId(v);
                  setQtyError(undefined);
                }}
                disabled={!itemId}
                options={levels.map((l: any) => ({
                  value: l.location_id,
                  label: locationNames[l.location_id]?.name ?? l.location_id,
                  sub: locationNames[l.location_id]?.sub,
                }))}
                placeholder="Select location"
                emptyText={itemId ? "This item is not stocked at any location" : undefined}
                searchable
              />
            </FormGrid>
            {itemId && levels.length === 0 ? (
              <Alert>
                This item isn't stocked at any location yet, so there is nothing to reserve.{" "}
                <Link to={`/r/inventory-items/${itemId}`} style={{ color: "inherit", fontWeight: 600 }}>
                  Open the item
                </Link>{" "}
                and use Manage locations to add one.
              </Alert>
            ) : null}
            <div
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 8,
                overflow: "hidden",
                fontSize: 13,
              }}
            >
              {rows.map(([k, v], i) => (
                <div
                  key={k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    borderTop: i === 0 ? "none" : "1px solid var(--card-border)",
                  }}
                >
                  <span style={{ padding: "8px 12px", color: "var(--fg-subtle)" }}>{k}</span>
                  <span
                    style={{
                      padding: "8px 12px",
                      borderLeft: "1px solid var(--card-border)",
                    }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ maxWidth: 340 }}>
              <NumberField
                label="Quantity"
                min={1}
                step={1}
                placeholder="How much do you want to reserve?"
                disabled={!ready}
                value={quantity}
                error={qtyError}
                hint={unit ? `Unit: ${unit}` : undefined}
                onChange={(v) => {
                  setQuantity(v);
                  setQtyError(undefined);
                }}
              />
            </div>
            <TextAreaField
              label="Description"
              optional
              rows={4}
              disabled={!ready}
              placeholder="What type of reservation is this?"
              value={description}
              onChange={setDescription}
            />
          </>
        )}
      </div>
    </WizardShell>
  );
}
