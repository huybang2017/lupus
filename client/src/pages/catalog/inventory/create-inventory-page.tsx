import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { numOrNull } from "@/shared/utils/form-utils";
import { COUNTRIES } from "@/shared/i18n/countries";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  FormActions,
  FormGrid,
  FormSection,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/widgets/form";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

export function CreateInventoryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("details");
  const [title, setTitle] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [requiresShipping, setRequiresShipping] = useState(true);
  const [dims, setDims] = useState({
    width: "",
    length: "",
    height: "",
    weight: "",
    mid_code: "",
    hs_code: "",
    material: "",
    country: "",
    unit: "",
  });
  const [locations, setLocations] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);

  const invalid = title.trim() === "";

  // Same rules as Lupus's form: dimensions are numbers >= 0, stock is a whole number >= 0.
  const badDim = (v: string) => v.trim() !== "" && !(Number(v) >= 0);
  const badQty = (v: string) =>
    v.trim() !== "" && !(Number.isInteger(Number(v)) && Number(v) >= 0);
  const dimErrors = (["width", "length", "height", "weight"] as const).filter((k) =>
    badDim(dims[k]),
  );
  const qtyErrors = Object.values(levels).filter(badQty).length;
  const hasErrors = invalid || dimErrors.length > 0 || qtyErrors > 0;
  const titleError =
    titleTouched && invalid
      ? "Too small: expected string to have >=1 characters"
      : undefined;
  const dirty =
    title.trim() !== "" ||
    sku.trim() !== "" ||
    description.trim() !== "" ||
    Object.values(dims).some((v) => v !== "") ||
    Object.values(levels).some((v) => v !== "");

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
    navigate("/r/inventory-items");
  }

  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".confirm-back, [role=\"listbox\"]")) return;
      const el = e.target as HTMLElement | null;
      if (el?.getAttribute?.("aria-label")?.startsWith("In stock at")) {
        el.blur();
        return;
      }
      void leaveRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all: { id: string; label: string }[] = [];
      for (let offset = 0; offset < 10000; offset += 100) {
        const d: any = await api(`/admin/stock-locations?limit=100&offset=${offset}`);
        const page = parseList(d, 100);
        all.push(...page.items.map((l: any) => ({ id: l.id, label: l.name ?? l.id })));
        if (page.items.length < 100) break;
      }
      if (alive) setLocations(all);
    })()
      .catch(() => {
        if (alive) setLocations([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const num = (v: string) => numOrNull(v);

  async function save() {
    if (hasErrors) return;
    setErr(null);
    setBusy(true);
    try {
      const body: Record<string, any> = {
        ...(sku.trim() ? { sku: sku.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        requires_shipping: requiresShipping,
        ...(dims.width.trim() ? { width: num(dims.width) } : {}),
        ...(dims.length.trim() ? { length: num(dims.length) } : {}),
        ...(dims.height.trim() ? { height: num(dims.height) } : {}),
        ...(dims.weight.trim() ? { weight: num(dims.weight) } : {}),
        ...(dims.mid_code.trim() ? { mid_code: dims.mid_code.trim() } : {}),
        ...(dims.hs_code.trim() ? { hs_code: dims.hs_code.trim() } : {}),
        ...(dims.material.trim() ? { material: dims.material.trim() } : {}),
        ...(dims.country ? { origin_country: dims.country } : {}),
        ...(dims.unit.trim()
          ? { metadata: { unit_of_measure: dims.unit.trim() } }
          : {}),
      };
      const lvl = Object.entries(levels)
        .filter(([, q]) => q.trim() !== "")
        .map(([location_id, q]) => ({
          location_id,
          stocked_quantity: Number(q),
        }));
      if (lvl.length > 0) body.levels = lvl;
      const res = await api<{ inventory_item: any }>("/admin/inventory-items", {
        method: "POST",
        body,
      });
      navigate(`/r/inventory-items/${res.inventory_item.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dim = (k: keyof typeof dims, label: string, placeholder?: string) => (
    <TextField
      label={label}
      optional
      placeholder={placeholder ?? "100"}
      value={dims[k]}
      onChange={(v) => setDims((s) => ({ ...s, [k]: v }))}
    />
  );

  const numDim = (k: "width" | "length" | "height" | "weight", label: string) => (
    <NumberField
      label={label}
      optional
      min={0}
      placeholder="100"
      value={dims[k]}
      error={badDim(dims[k]) ? "Must be a number greater than or equal to 0" : undefined}
      onChange={(v) => setDims((s) => ({ ...s, [k]: v }))}
    />
  );

  return (
