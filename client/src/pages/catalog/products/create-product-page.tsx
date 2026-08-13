import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { slugify } from "@/shared/utils/form-utils";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  CheckListField,
  FormActions,
  FormField,
  FormGrid,
  FormSection,
  MultiFileField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
  toggleInList,
} from "@/widgets/form";
import type { CheckOption } from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";
import {
  MultiCombobox,
  ProductOptionsEditor,
  VariantRanking,
} from "@/widgets/wizard/product-options-editor";
import { CardToggle, SalesChannelsField } from "@/widgets/wizard/product-organize";
import type { ChannelRow } from "@/widgets/wizard/product-organize";
import { VariantsGrid, emptyVariantEdit } from "@/widgets/wizard/variants-grid";
import type { VariantEdit } from "@/widgets/wizard/variants-grid";
import type { ExistingOption, OptionRow } from "@/widgets/wizard/product-options-editor";
import type {
  CreateProductPayload,
  CreateProductVariantPayload,
  Product,
} from "@/pages/catalog/products/product-types";

interface VariantRow {
  key: string;
  title: string;
  sku: string;
  prices: Record<string, string>;
  options: Record<string, string>;
}

const DEFAULT_KEY = "__default__";

type Tab = "details" | "organize" | "variants";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "organize", label: "Organize" },
  { id: "variants", label: "Variants" },
];

export function CreateProductPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("details");

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [hasVariants, setHasVariants] = useState(false);

  const [types, setTypes] = useState<CheckOption[]>([]);
  const [collections, setCollections] = useState<CheckOption[]>([]);
  const [categories, setCategories] = useState<CheckOption[]>([]);
  const [tags, setTags] = useState<CheckOption[]>([]);
  const [channels, setChannels] = useState<CheckOption[]>([]);
  const [typeId, setTypeId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([]);
  const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);
  const [discountable, setDiscountable] = useState(true);
  const [shippingProfiles, setShippingProfiles] = useState<CheckOption[]>([]);
  const [shippingProfileId, setShippingProfileId] = useState("");

  const [currencies, setCurrencies] = useState<string[]>([]);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [existingOptions, setExistingOptions] = useState<ExistingOption[]>([]);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, VariantEdit>>({});

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [ty, co, ca, ta, ch, rg, po, sp, st] = await Promise.all([
          api("/admin/product-types?limit=100&offset=0").catch(() => null),
          api("/admin/collections?limit=100&offset=0").catch(() => null),
          api("/admin/product-categories?limit=100&offset=0").catch(() => null),
          api("/admin/tags?limit=100&offset=0").catch(() => null),
          api("/admin/sales-channels?limit=100&offset=0").catch(() => null),
          api("/admin/regions?limit=100&offset=0").catch(() => null),
          api("/admin/product-options?limit=100&offset=0").catch(() => null),
          api("/admin/shipping-profiles?limit=100&offset=0").catch(() => null),
          api("/admin/store").catch(() => null),
        ]);
        if (!alive) return;
        if (sp)
          setShippingProfiles(
            parseList(sp, 200).items.map((x: any) => ({
              id: x.id,
              label: x.name ?? x.id,
            })),
          );
        if (ch) setChannelRows(parseList(ch, 200).items as any[]);
        const defCh =
          (st as any)?.store?.default_sales_channel_id ??
          (st as any)?.default_sales_channel_id ??
          null;
        if (defCh && ch) {
          const chItems = parseList(ch, 200).items as any[];
          if (chItems.some((c) => c.id === defCh)) {
            setDefaultChannelId(defCh);
            setChannelIds([defCh]);
          }
        }
        if (po) {
          const byTitle = new Map<string, ExistingOption>();
          for (const o of parseList(po, 200).items as any[]) {
            const title = String(o.title ?? "").trim();
            if (!title) continue;
            const key = title.toLowerCase();
            const cur = byTitle.get(key) ?? { title, values: [] };
            for (const v of o.values ?? [])
              if (v?.value && !cur.values.includes(v.value))
                cur.values.push(v.value);
            byTitle.set(key, cur);
          }
          setExistingOptions([...byTitle.values()]);
        }
        if (ty)
          setTypes(
            parseList(ty, 200).items.map((t: any) => ({
              id: t.id,
              label: t.name ?? t.value ?? t.id,
            })),
          );
        if (co)
          setCollections(
            parseList(co, 200).items.map((c: any) => ({
              id: c.id,
              label: c.title ?? c.id,
            })),
          );
        if (ca)
          setCategories(
            parseList(ca, 200).items.map((c: any) => ({
              id: c.id,
              label: c.name ?? c.id,
            })),
          );
        if (ta)
          setTags(
            parseList(ta, 200).items.map((t: any) => ({
              id: String(t.id ?? t.value),
              label: t.value ?? t.name ?? String(t.id),
            })),
          );
        if (ch)
          setChannels(
            parseList(ch, 200).items.map((c: any) => ({
              id: c.id,
              label: c.name ?? c.id,
            })),
          );
        if (rg) {
          const cur = [
            ...new Set(
              parseList(rg, 100)
                .items.map((r: any) =>
                  String(r.currency_code ?? "").toUpperCase(),
                )
                .filter(Boolean),
            ),
          ] as string[];
          setCurrencies(cur.length > 0 ? cur : ["USD"]);
        } else setCurrencies(["USD"]);
      } catch (e) {
        if (alive) setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!handleTouched) setHandle(slugify(v));
  }

  const allCombos: VariantRow[] = useMemo(() => {
    const opts = options
      .map((o) => ({ name: o.name.trim(), values: o.values }))
      .filter((o) => o.name && o.values.length > 0);
    if (opts.length === 0) return [];
    let acc: Record<string, string>[] = [{}];
    for (const o of opts) {
      const next: Record<string, string>[] = [];
      for (const base of acc)
        for (const v of o.values) next.push({ ...base, [o.name]: v });
      acc = next;
    }
    return acc.map((combo) => {
      const title = Object.values(combo).join(" / ");
      return { key: title, title, sku: "", prices: {}, options: combo };
    });
  }, [options]);

  // User-defined ranking (drag & drop) layered over the generated combinations.
  const rankedCombos: VariantRow[] = useMemo(() => {
    const idx = (k: string) => {
      const i = order.indexOf(k);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...allCombos].sort((a, b) => idx(a.key) - idx(b.key));
  }, [allCombos, order]);
  const combos = useMemo(
    () => rankedCombos.filter((c) => !excluded[c.key]),
    [rankedCombos, excluded],
  );

  function moveVariant(fromKey: string, toKey: string) {
    const keys = rankedCombos.map((c) => c.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from === -1 || to === -1) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setOrder(keys);
  }

  function buildPrices(record: Record<string, string>) {
    return Object.entries(record)
      .filter(([, v]) => v.trim() !== "" && Number(v) >= 0)
      .map(([currency_code, v]) => ({
        currency_code: currency_code.toLowerCase(),
        amount: Math.round(Number(v)),
      }));
  }

  async function save(status: "draft" | "published") {
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      setTab("details");
      return;
    }
    if (hasVariants && combos.length === 0) {
      setErr("Add at least one option with values, or turn off variants.");
      setTab("variants");
      return;
    }

    // The backend requires every variant to have at least one price (matches
    // Lupus's createProductsWorkflow contract) — validate client-side first so a
    // missing price shows up as a clear message instead of a 400 after upload.
    const ed = (k: string): VariantEdit => edits[k] ?? emptyVariantEdit;
    const variantFields = (k: string, defaultTitle: string) => {
      const e = ed(k);
      return {
        title: (e.title ?? defaultTitle).trim() || defaultTitle,
        ...(e.sku.trim() ? { sku: e.sku.trim() } : {}),
        manage_inventory: e.manage,
        allow_backorder: e.backorder,
        prices: buildPrices(e.prices),
      };
    };
    const variantsPayload: CreateProductVariantPayload[] = !hasVariants
      ? [variantFields(DEFAULT_KEY, title.trim())]
      : combos.map((c, rank) => ({
          ...variantFields(c.key, c.title),
          variant_rank: rank,
          options: c.options,
        }));
    if (variantsPayload.some((v) => v.prices.length === 0)) {
      setErr("Add at least one price for every variant.");
      setTab("variants");
      return;
    }

    setBusy(true);
    try {
      let imageUrls: string[] = [];
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f, f.name));
        const up = await fetch("/admin/uploads", {
          method: "POST",
          body: fd,
          headers: {
            authorization: `Bearer ${localStorage.getItem("lupus_admin_token") ?? ""}`,
          },
        });
        const uj: any = await up.json().catch(() => null);
        imageUrls = Array.isArray(uj?.files)
          ? uj.files.map((f: any) => f.url ?? f.path).filter(Boolean)
          : [];
      }

      const body: CreateProductPayload = {
        title: title.trim(),
        ...(handle.trim() ? { handle: handle.trim() } : {}),
        ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        status,
        ...(imageUrls.length > 0
          ? { images: imageUrls.map((url) => ({ url })) }
          : {}),
        discountable,
        ...(shippingProfileId ? { shipping_profile_id: shippingProfileId } : {}),
        ...(collectionId ? { collection_id: collectionId } : {}),
        ...(typeId ? { type_id: typeId } : {}),
        ...(categoryIds.length > 0
          ? { categories: categoryIds.map((id) => ({ id })) }
          : {}),
        ...(tagValues.length > 0
          ? { tags: tagValues.map((value) => ({ value })) }
          : {}),
        ...(channelIds.length > 0
          ? { sales_channels: channelIds.map((id) => ({ id })) }
          : {}),
        variants: variantsPayload,
      };
      if (hasVariants) {
        body.options = options
          .map((o) => ({ title: o.name.trim(), values: o.values }))
          .filter((o) => o.title && o.values.length > 0);
      }

      const created = await api<{ product: Product }>("/admin/products", {
        method: "POST",
        body,
      });
      navigate(`/r/products/${created.product.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleCheck(list: string[], id: string, set: (v: string[]) => void) {
    set(toggleInList(list, id));
  }

  const tabIdx = TABS.findIndex((t) => t.id === tab);
  const lastTab = tabIdx === TABS.length - 1;
  const titleMissing = title.trim() === "";
  const detailsInvalid =
    titleMissing ||
    (hasVariants &&
      !options.some((o) => o.name.trim() && o.values.length > 0));

  const dirty =
    title.trim() !== "" ||
    subtitle.trim() !== "" ||
    handleTouched ||
    description.trim() !== "" ||
    files.length > 0 ||
    hasVariants ||
    typeId !== "" ||
    collectionId !== "" ||
    categoryIds.length > 0 ||
    tagValues.length > 0 ||
    channelIds.join() !== (defaultChannelId ?? "") ||
    !discountable ||
    shippingProfileId !== "" ||
    Object.values(edits).some(
      (e) =>
        e.title !== undefined ||
        e.sku.trim() !== "" ||
        e.manage ||
        e.backorder ||
        Object.values(e.prices).some((v) => v.trim() !== ""),
    ) ||
    options.some((o) => o.name.trim() !== "" || o.values.length > 0);

  async function leave() {
    if (busy) return;
    if (dirty) {
      const ok = await requestConfirm({
        title: "Are you sure you want to leave this form?",
        description:
          "You have unsaved changes that will be lost if you exit this form.",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        variant: "primary",
      });
      if (!ok) return;
    }
    navigate("/r/products");
  }

  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".confirm-back, [role=\"listbox\"], [data-stacked-modal]")) return;
      void leaveRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <WizardShell
      tabs={TABS}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
      closeTo="/r/products"
      onRequestClose={() => void leave()}
      wide={tab === "variants"}
      disabledTabs={detailsInvalid ? ["organize", "variants"] : []}
      footer={
        <FormActions
          onCancel={() => void leave()}
          disabled={detailsInvalid}
          onSubmit={
            lastTab
              ? () => save("published")
              : () => setTab(TABS[tabIdx + 1].id)
          }
          submitLabel={lastTab ? "Publish" : "Continue"}
          busy={busy}
          busyLabel={lastTab ? "Publishing…" : undefined}
          extra={
            <button
              className="btn btn-secondary"
              onClick={() => save("draft")}
              disabled={busy || detailsInvalid}
            >
              {busy ? "Saving…" : "Save as draft"}
            </button>
          }
        />
      }
    >
      {loadErr ? <Alert>{loadErr}</Alert> : null}
      {err ? <Alert>{err}</Alert> : null}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : (
        <>
          {tab === "details" ? (
            <>
              <FormSection title="General">
                <FormGrid cols={3}>
                  <TextField
                    label="Title"
                    placeholder="Winter jacket"
                    value={title}
                    onChange={onTitleChange}
                    style={
                      title.trim() === ""
                        ? { borderColor: "#ef4444" }
                        : undefined
                    }
                  />
                  <TextField
                    label="Subtitle"
                    optional
                    placeholder="Warm and cosy"
                    value={subtitle}
                    onChange={setSubtitle}
                  />
                  <FormField label="Handle" optional>
                    <div className="input-group">
                      <span className="input-group-prefix">/</span>
                      <input
                        className="input"
                        placeholder="winter-jacket"
                        value={handle}
                        onChange={(e) => {
                          setHandle(e.target.value);
                          setHandleTouched(true);
                        }}
                      />
                    </div>
                  </FormField>
                </FormGrid>
                <TextAreaField
                  label="Description"
                  optional
                  rows={4}
                  placeholder="A warm and cozy jacket"
                  value={description}
                  onChange={setDescription}
                />
              </FormSection>
              <FormSection title="Media">
                <MultiFileField
                  label="Media"
                  optional
                  files={files}
                  onChange={setFiles}
                  accept="image/*"
                  markFirst
                  dropTitle="⤒ Upload images"
                  dropHint="Drag and drop images here or click to upload. First image becomes the thumbnail."
                />
              </FormSection>
              <FormSection title="Variants">
                <CardToggle
                  checked={hasVariants}
                  onChange={setHasVariants}
                  title="Yes, this is a product with variants"
                  hint="When unchecked, we will create a default variant for you"
                />
                {hasVariants ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 28,
                      marginTop: 20,
                      paddingTop: 20,
                      borderTop: "1px solid var(--card-border)",
                    }}
                  >
                    <ProductOptionsEditor
                      options={options}
                      onChange={setOptions}
                      existing={existingOptions}
                    />
                    <VariantRanking
                      variants={rankedCombos}
                      columns={options.map((o) => o.name.trim()).filter(Boolean)}
                      onToggleAll={(include) =>
                        setExcluded(
                          include
                            ? {}
                            : Object.fromEntries(
                                rankedCombos.map((c) => [c.key, true]),
                              ),
                        )
                      }
                      excluded={excluded}
                      onToggle={(k) =>
                        setExcluded((s) => ({ ...s, [k]: !s[k] }))
                      }
                      onMove={moveVariant}
                    />
                  </div>
                ) : null}
              </FormSection>
            </>
          ) : null}

          {tab === "organize" ? (
            <FormSection title="Organize">
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <CardToggle
                checked={discountable}
                onChange={setDiscountable}
                title="Discountable (Optional)"
                hint="When unchecked, discounts will not be applied to this product"
              />
              <FormGrid cols={2}>
                <SelectField
                  label="Type"
                  optional
                  value={typeId}
                  onChange={setTypeId}
                  options={types.map((t) => ({ value: t.id, label: t.label }))}
                  placeholder="Select type"
                  searchable
                  allowClear
                />
                <SelectField
                  label="Collection"
                  optional
                  value={collectionId}
                  onChange={setCollectionId}
                  options={collections.map((c) => ({
                    value: c.id,
                    label: c.label,
                  }))}
                  placeholder="Select collection"
                  searchable
                  allowClear
                />
              </FormGrid>
              <FormGrid cols={2}>
                <FormField label="Categories" optional>
                  <MultiCombobox
                    values={categoryIds.map(
                      (id) => categories.find((c) => c.id === id)?.label ?? id,
                    )}
                    onChange={(labels) =>
                      setCategoryIds(
                        labels
                          .map((l) => categories.find((c) => c.label === l)?.id)
                          .filter((x): x is string => !!x),
                      )
                    }
                    suggestions={categories.map((c) => c.label)}
                    placeholder="Select categories"
                    allowCreate={false}
                  />
                </FormField>
                <FormField label="Tags" optional>
                  <MultiCombobox
                    values={tagValues}
                    onChange={setTagValues}
                    suggestions={tags.map((t) => t.label)}
                    placeholder="Select or create tags"
                  />
                </FormField>
              </FormGrid>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-base)" }}>
                    Shipping profile{" "}
                    <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>(Optional)</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 2 }}>
                    Connect the product to a shipping profile
                  </div>
                </div>
                <SelectField
                  value={shippingProfileId}
                  onChange={setShippingProfileId}
                  options={shippingProfiles.map((x) => ({ value: x.id, label: x.label }))}
                  placeholder="Select shipping profile"
                  allowClear
                />
              </div>
              <SalesChannelsField
                rows={channelRows}
                selected={channelIds}
                onChange={setChannelIds}
              />
              </div>
            </FormSection>
          ) : null}

          {tab === "variants" ? (
            <VariantsGrid
              rows={
                hasVariants
                  ? combos.map((c) => ({
                      key: c.key,
                      label: c.title,
                      defaultTitle: c.title,
                    }))
                  : [
                      {
                        key: DEFAULT_KEY,
                        label: "",
                        defaultTitle: title.trim(),
                      },
                    ]
              }
              labelHeader={
                hasVariants
                  ? options
                      .filter((o) => o.name.trim() && o.values.length > 0)
                      .map((o) => o.name.trim())
                      .join(" / ")
                  : null
              }
              edits={edits}
              onEdit={(key, patch) =>
                setEdits((s) => ({
                  ...s,
                  [key]: { ...(s[key] ?? emptyVariantEdit), ...patch },
                }))
              }
              currencies={currencies}
            />
          ) : null}
        </>
      )}
    </WizardShell>
  );
}
