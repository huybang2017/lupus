import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import {
  FormDrawer,
  FormField,
  FormGrid,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/widgets/form";
import { COUNTRY_OPTIONS } from "@/shared/i18n/country-options";
import { CardToggle, SalesChannelPicker } from "@/widgets/wizard/product-organize";
import type { ChannelRow } from "@/widgets/wizard/product-organize";
import { MultiCombobox } from "@/widgets/wizard/product-options-editor";
import { VariantsGrid, emptyVariantEdit } from "@/widgets/wizard/variants-grid";
import type { VariantEdit } from "@/widgets/wizard/variants-grid";
import type {
  Product,
  ProductAttributeKey,
  ProductVariant,
  ProductVariantFieldKey,
} from "@/pages/catalog/products/product-types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const numOrNull = (v: string): number | null =>
  v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v);
const strOrNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

// ---------------------------------------------------------------- general

export function ProductGeneralDrawer(props: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { product, onClose, onSaved } = props;
  const [form, setForm] = useState({
    title: product.title ?? "",
    subtitle: product.subtitle ?? "",
    handle: product.handle ?? "",
    material: product.material ?? "",
    description: product.description ?? "",
    status: product.status ?? "draft",
    discountable: product.discountable !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!form.title.trim()) {
      setErr("Title is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/products/${product.id}`, {
        method: "POST",
        body: {
          title: form.title.trim(),
          subtitle: strOrNull(form.subtitle),
          handle: form.handle.trim() || undefined,
          material: strOrNull(form.material),
          description: strOrNull(form.description),
          status: form.status,
          discountable: form.discountable,
        },
      });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Product" onClose={onClose} onSubmit={save} busy={busy} error={err} submitLabel="Save">
      <SelectField
        label="Status"
        value={form.status}
        onChange={(v) => set("status", v)}
        options={[
          { value: "draft", label: "Draft" },
          { value: "proposed", label: "Proposed" },
          { value: "published", label: "Published" },
          { value: "rejected", label: "Rejected" },
        ]}
      />
      <TextField label="Title" required value={form.title} onChange={(v) => set("title", v)} />
      <TextField label="Subtitle" optional value={form.subtitle} onChange={(v) => set("subtitle", v)} />
      <FormField label="Handle" optional>
        <div className="input-group">
          <span className="input-group-prefix">/</span>
          <input
            className="input"
            value={form.handle}
            onChange={(e) => set("handle", e.target.value)}
          />
        </div>
      </FormField>
      <TextField label="Material" optional value={form.material} onChange={(v) => set("material", v)} />
      <TextAreaField
        label="Description"
        optional
        rows={4}
        value={form.description}
        onChange={(v) => set("description", v)}
      />
      <CardToggle
        title="Discountable"
        hint="When unchecked, discounts will not be applied to this product"
        checked={form.discountable}
        onChange={(v) => set("discountable", v)}
      />
    </FormDrawer>
  );
}

// ------------------------------------------------------------- attributes

export function ProductAttributesDrawer(props: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { product, onClose, onSaved } = props;
  const init = (k: ProductAttributeKey) =>
    (product[k] == null ? "" : String(product[k]));
  const [f, setF] = useState({
    height: init("height"),
    width: init("width"),
    length: init("length"),
    weight: init("weight"),
    mid_code: init("mid_code"),
    hs_code: init("hs_code"),
    origin_country: init("origin_country").toLowerCase(),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/products/${product.id}`, {
        method: "POST",
        body: {
          height: numOrNull(f.height),
          width: numOrNull(f.width),
          length: numOrNull(f.length),
          weight: numOrNull(f.weight),
          mid_code: strOrNull(f.mid_code),
          hs_code: strOrNull(f.hs_code),
          origin_country: strOrNull(f.origin_country),
        },
      });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Attributes" onClose={onClose} onSubmit={save} busy={busy} error={err} submitLabel="Save">
      <NumberField label="Width" value={f.width} onChange={(v) => set("width", v)} min={0} />
      <NumberField label="Height" value={f.height} onChange={(v) => set("height", v)} min={0} />
      <NumberField label="Length" value={f.length} onChange={(v) => set("length", v)} min={0} />
      <NumberField label="Weight" value={f.weight} onChange={(v) => set("weight", v)} min={0} />
      <TextField label="MID code" value={f.mid_code} onChange={(v) => set("mid_code", v)} />
      <TextField label="HS code" value={f.hs_code} onChange={(v) => set("hs_code", v)} />
      <SelectField
        label="Country of origin"
        optional
        value={f.origin_country}
        onChange={(v) => set("origin_country", v)}
        options={COUNTRY_OPTIONS}
        placeholder="Select country"
        searchable
        allowClear
      />
    </FormDrawer>
  );
}

// --------------------------------------------------------------- organize

export function ProductOrganizeDrawer(props: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { product, onClose, onSaved } = props;
  const [types, setTypes] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [typeId, setTypeId] = useState(product.type_id ?? product.type?.id ?? "");
  const [collectionId, setCollectionId] = useState(product.collection_id ?? product.collection?.id ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    (product.categories ?? []).map((c) => c.id),
  );
  const [tags, setTags] = useState<string[]>(
    (product.tags ?? []).map((t) => t.value ?? t.name).filter(Boolean),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api("/admin/product-types?limit=100&offset=0").catch(() => null),
      api("/admin/collections?limit=100&offset=0").catch(() => null),
      api("/admin/product-categories?limit=100&offset=0").catch(() => null),
      api("/admin/tags?limit=100&offset=0").catch(() => null),
    ]).then(([ty, co, ca, ta]) => {
      if (!alive) return;
      if (ty) setTypes(parseList(ty, 200).items);
      if (co) setCollections(parseList(co, 200).items);
      if (ca) setCategories(parseList(ca, 200).items);
      if (ta)
        setTagOptions(
          parseList(ta, 200)
            .items.map((t: any) => t.value ?? t.name)
            .filter(Boolean),
        );
    });
    return () => {
      alive = false;
    };
  }, []);

  const catLabel = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/products/${product.id}`, {
        method: "POST",
        body: {
          type_id: typeId || null,
          collection_id: collectionId || null,
          categories: categoryIds.map((id) => ({ id })),
          tags: tags.map((value) => ({ value })),
