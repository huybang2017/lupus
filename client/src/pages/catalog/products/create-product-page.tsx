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
