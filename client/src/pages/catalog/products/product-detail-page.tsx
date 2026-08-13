import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Badge, fmtCell } from "@/widgets/ui/surfaces";
import {
  Alert,
  EmptyState,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import {
  CheckListField,
  CheckboxField,
  FormDrawer,
  FormField,
  HiddenFileInput,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  toggleInList,
} from "@/widgets/form";
import { DataTable, TableSearch, type TableColumn } from "@/widgets/table";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { StatusDot } from "@/widgets/cells/product-cells";
import { countryName } from "@/shared/i18n/country-options";
import {
  ProductAttributesDrawer,
  ProductChannelsPicker,
  ProductGeneralDrawer,
  ProductOrganizeDrawer,
  ProductShippingDrawer,
  ProductVariantDrawer,
  ProductVariantsEditor,
} from "@/pages/catalog/products/product-forms";
import type {
  MoneyAmount,
  Product,
  ProductImage,
  ProductOption,
  ProductVariant,
} from "@/pages/catalog/products/product-types";
import { requestConfirm, useConfirm } from "@/widgets/confirm";

function money(prices: MoneyAmount[]): string {
  if (!Array.isArray(prices) || prices.length === 0) return "–";
  return prices
    .map(
      (p) =>
        `${Number(p.amount)} ${String(p.currency_code ?? "").toUpperCase()}`,
    )
    .join(", ");
}

export function ProductDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [totalChannels, setTotalChannels] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [stockByVariant, setStockByVariant] = useState<
    Record<string, { qty: number; locs: number }>
  >({});
  const [variantQuery, setVariantQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<
    | null
    | "general"
    | "attributes"
    | "organize"
    | "shipping"
    | "channels"
    | "metadata"
    | "editVariants"
    | "option"
    | "variant"
    | { editVariant: ProductVariant }
  >(null);

  function load() {
    setErr(null);
    api<{ product: Product }>(`/admin/products/${id}`)
      .then((d) => setProduct(d.product))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api(`/admin/products/${id}/sales-channels`)
      .then((d: any) => setChannels(parseList(d).items))
      .catch(() => {});
    api("/admin/sales-channels?limit=1&offset=0")
      .then((d: any) => setTotalChannels(parseList(d, 1).count ?? null))
      .catch(() => {});
    api("/admin/shipping-profiles?limit=100&offset=0")
      .then((d: any) => setProfiles(parseList(d, 100).items))
      .catch(() => {});
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = () => {
    setDrawer(null);
    load();
  };

  // Availability per variant: sum stocked quantities over linked inventory items.
  useEffect(() => {
    const variants: ProductVariant[] = product?.variants ?? [];
    const itemIds = [
      ...new Set(
        variants
          .flatMap((v) =>
            (v.inventory_items ?? []).map((l) => l.inventory_item_id),
          )
          .filter(Boolean),
      ),
    ];
    if (itemIds.length === 0) {
      setStockByVariant({});
      return;
    }
    let alive = true;
    Promise.all(
      itemIds.map((iid) =>
        api(`/admin/inventory-items/${iid}/location-levels?limit=100&offset=0`)
          .then((d: any) => ({ iid, levels: parseList(d, 100).items }))
          .catch(() => ({ iid, levels: [] })),
      ),
    ).then((rows) => {
      if (!alive) return;
      const qtyByItem: Record<string, { qty: number; locs: number }> = {};
      for (const r of rows) {
        qtyByItem[r.iid] = {
          qty: r.levels.reduce(
            (s: number, l: any) => s + Number(l.stocked_quantity ?? 0),
            0,
          ),
          locs: new Set(r.levels.map((l: any) => l.location_id)).size,
        };
      }
      const out: Record<string, { qty: number; locs: number }> = {};
      for (const v of variants) {
        let qty = 0;
        const locs = new Set<string>();
        for (const l of v.inventory_items ?? []) {
          const q = qtyByItem[l.inventory_item_id];
          if (!q) continue;
          qty += q.qty * Number(l.required_quantity ?? 1);
        }
        // locations spanned by this variant's items
        for (const l of v.inventory_items ?? []) {
          const rowsFor = rows.find((r) => r.iid === l.inventory_item_id);
          for (const lv of rowsFor?.levels ?? [])
            if (lv.location_id) locs.add(lv.location_id);
        }
        out[v.id] = { qty, locs: locs.size };
      }
      setStockByVariant(out);
    });
    return () => {
      alive = false;
    };
  }, [product]);

  async function del() {
    if (!(await confirm({ description: `Delete product ${id}?` }))) return;
    try {
      await api(`/admin/products/${id}`, { method: "DELETE" });
      navigate("/r/products");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const profile = profiles.find(
    (p: any) =>
      p.id === (product?.shipping_profile_id ?? product?.shipping_profile?.id),
  );
  const optionTitles: string[] = (product?.options ?? []).map(
    (o) => o.title,
  );
  const variants: ProductVariant[] = (product?.variants ?? []).filter((v) => {
    const q = variantQuery.trim().toLowerCase();
    return !q || `${v.title ?? ""} ${v.sku ?? ""}`.toLowerCase().includes(q);
  });
  const variantColumns: TableColumn<ProductVariant>[] = [
    {
      key: "title",
      label: "Title",
      render: (v) => (
        <span style={{ fontWeight: 600 }}>{fmtCell(v.title)}</span>
      ),
    },
    {
      key: "sku",
      label: "SKU",
      mono: true,
      render: (v) => fmtCell(v.sku),
    },
    ...optionTitles.map((t: string) => ({
      key: `option:${t}`,
      label: t,
      render: (v: ProductVariant) =>
        v.options?.[t] ? (
          <span className="badge badge-gray">{v.options[t]}</span>
        ) : (
          "–"
        ),
    })),
    {
      key: "inventory",
      label: "Inventory",
      render: (v) => {
        const st = stockByVariant[v.id];
        return (
          <span style={{ fontSize: 12 }}>
            {st
              ? `${st.qty} available at ${st.locs} location${st.locs === 1 ? "" : "s"}`
              : "–"}
          </span>
        );
      },
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
          to="/r/products"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
