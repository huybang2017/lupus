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
    <FormDrawer title="Edit Organization" onClose={onClose} onSubmit={save} busy={busy} error={err} submitLabel="Save">
      <SelectField
        label="Type"
        optional
        value={typeId}
        onChange={setTypeId}
        options={types.map((t: any) => ({ value: t.id, label: t.value ?? t.name ?? t.id }))}
        placeholder="Select type"
        searchable
        allowClear
      />
      <SelectField
        label="Collection"
        optional
        value={collectionId}
        onChange={setCollectionId}
        options={collections.map((c: any) => ({ value: c.id, label: c.title ?? c.id }))}
        placeholder="Select collection"
        searchable
        allowClear
      />
      <FormField label="Categories" optional>
        <MultiCombobox
          values={categoryIds.map(catLabel)}
          onChange={(labels) =>
            setCategoryIds(
              labels
                .map((l) => categories.find((c) => c.name === l)?.id)
                .filter((x): x is string => !!x),
            )
          }
          suggestions={categories.map((c) => c.name)}
          placeholder="Select categories"
          allowCreate={false}
        />
      </FormField>
      <FormField label="Tags" optional>
        <MultiCombobox
          values={tags}
          onChange={setTags}
          suggestions={tagOptions}
          placeholder="Select or create tags"
        />
      </FormField>
    </FormDrawer>
  );
}

// --------------------------------------------------------------- shipping

export function ProductShippingDrawer(props: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { product, onClose, onSaved } = props;
  const [profiles, setProfiles] = useState<any[]>([]);
  const [value, setValue] = useState(product.shipping_profile_id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/shipping-profiles?limit=100&offset=0")
      .then((d: any) => setProfiles(parseList(d, 100).items))
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/products/${product.id}`, {
        method: "POST",
        body: { shipping_profile_id: value || null },
      });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Edit Shipping Configuration"
      subtitle="Connect the product to a shipping profile"
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <SelectField
        label="Shipping profile"
        optional
        value={value}
        onChange={setValue}
        options={profiles.map((p: any) => ({ value: p.id, label: p.name ?? p.id }))}
        placeholder="Select shipping profile"
        allowClear
      />
    </FormDrawer>
  );
}

// --------------------------------------------------------- sales channels

export function ProductChannelsPicker(props: {
  product: Product;
  selected: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { product, selected, onClose, onSaved } = props;
  const [rows, setRows] = useState<ChannelRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/sales-channels?limit=100&offset=0")
      .then((d: any) => setRows(parseList(d, 200).items as ChannelRow[]))
      .catch((e) => setErr(errMsg(e)));
  }, []);

  if (err) {
    return (
      <FormDrawer title="Edit Sales Channels" onClose={onClose} error={err} submitLabel="Close" onSubmit={onClose}>
        <span />
      </FormDrawer>
    );
  }
  if (!rows) return null;
  return (
    <SalesChannelPicker
      rows={rows}
      selected={selected}
      onCancel={onClose}
      onSave={async (ids) => {
        try {
          await api(`/admin/products/${product.id}`, {
            method: "POST",
            body: { sales_channels: ids.map((id) => ({ id })) },
          });
          onSaved();
        } catch (e) {
          setErr(errMsg(e));
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- variant

export function ProductVariantDrawer(props: {
  product: Product;
  initial?: ProductVariant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { product, initial, onClose, onSaved } = props;
  const init = (k: ProductVariantFieldKey) =>
    (initial?.[k] == null ? "" : String(initial[k]));
  const [f, setF] = useState({
    title: init("title"),
    material: init("material"),
    sku: init("sku"),
    ean: init("ean"),
    upc: init("upc"),
    barcode: init("barcode"),
    height: init("height"),
    width: init("width"),
    length: init("length"),
    weight: init("weight"),
    mid_code: init("mid_code"),
    hs_code: init("hs_code"),
    origin_country: init("origin_country").toLowerCase(),
  });
  const [allowBackorder, setAllowBackorder] = useState(!!initial?.allow_backorder);
  const [manageInventory, setManageInventory] = useState(initial ? initial.manage_inventory !== false : false);
  const [optValues, setOptValues] = useState<Record<string, string>>(initial?.options ?? {});
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    for (const pr of initial?.prices ?? []) p[String(pr.currency_code).toUpperCase()] = String(pr.amount);
    return p;
  });
  const [currencies, setCurrencies] = useState<string[]>(["USD"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    api("/admin/regions?limit=100&offset=0")
      .then((d) => {
        const cur = [
          ...new Set(
            parseList(d, 100)
              .items.map((r: any) => String(r.currency_code ?? "").toUpperCase())
              .filter(Boolean),
          ),
        ] as string[];
        const existing = Object.keys(prices);
        const all = [...new Set([...cur, ...existing])];
        if (all.length > 0) setCurrencies(all);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!f.title.trim()) {
      setErr("Title is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const priceArr = Object.entries(prices)
        .filter(([, v]) => v.trim() !== "" && Number(v) >= 0)
        .map(([currency_code, v]) => ({
          currency_code: currency_code.toLowerCase(),
          amount: Math.round(Number(v)),
        }));
      const extras = {
        title: f.title.trim(),
        sku: strOrNull(f.sku),
        barcode: strOrNull(f.barcode),
        ean: strOrNull(f.ean),
        upc: strOrNull(f.upc),
        material: strOrNull(f.material),
        manage_inventory: manageInventory,
        allow_backorder: allowBackorder,
        height: numOrNull(f.height),
        width: numOrNull(f.width),
        length: numOrNull(f.length),
        weight: numOrNull(f.weight),
        mid_code: strOrNull(f.mid_code),
        hs_code: strOrNull(f.hs_code),
        origin_country: strOrNull(f.origin_country),
      };
      const options = Object.fromEntries(Object.entries(optValues).filter(([, v]) => v));
      let variantId = initial?.id as string | undefined;
