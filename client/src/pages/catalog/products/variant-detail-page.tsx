import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/formatting/money";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable } from "@/widgets/table";
import { useConfirm } from "@/widgets/confirm";
import { DetailSection, JsonSection, KV } from "@/widgets/detail/detail-section";
import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { ProductVariantDrawer } from "@/pages/catalog/products/product-forms";
import type {
  MoneyAmount,
  Product,
  ProductVariant,
  ProductVariantInventoryItem,
} from "@/pages/catalog/products/product-types";

const dash = <span style={{ color: "var(--fg-muted)" }}>-</span>;
const show = (v: unknown) => (v === null || v === undefined || v === "" ? dash : String(v));
const yesNo = (v: unknown) => (v ? "True" : "False");

// Lupus variant detail: general, attributes, options, prices, linked inventory.
export function VariantDetailPage() {
  const { id = "", variantId = "" } = useParams<{ id: string; variantId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function load() {
    api<{ variant: ProductVariant }>(`/admin/products/${id}/variants/${variantId}`)
      .then((d) => {
        setVariant(d.variant);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api<{ product: Product }>(`/admin/products/${id}`)
      .then((d) => setProduct(d.product))
      .catch(() => undefined);
  }
  useEffect(load, [id, variantId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the variant ${variant!.title}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: variant!.title,
    });
    if (!ok) return;
    try {
      await api(`/admin/products/${id}/variants/${variantId}`, { method: "DELETE" });
      navigate(`/r/products/${id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const options = Object.entries(variant?.options ?? {});
  const prices: MoneyAmount[] = variant?.prices ?? [];
  const items: ProductVariantInventoryItem[] = variant?.inventory_items ?? [];

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to="/r/products" style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Products
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <Link to={`/r/products/${id}`} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          {product?.title ?? id}
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{variant?.title ?? variantId}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!variant && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {variant ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection
            title={variant.title}
            action={
              <RowMenu
                items={[
                  { label: "Edit", onClick: () => setEditing(true) },
                  { label: "Delete", danger: true, onClick: () => void del() },
                ]}
              />
            }
          >
            <KV
              rows={[
                ["SKU", show(variant.sku)],
                ["EAN", show(variant.ean)],
                ["UPC", show(variant.upc)],
                ["Barcode", show(variant.barcode)],
                ["Manage inventory", yesNo(variant.manage_inventory)],
                ["Allow backorder", yesNo(variant.allow_backorder)],
              ]}
            />
          </DetailSection>

          <DetailSection title="Attributes">
            <KV
              rows={[
                ["Weight", show(variant.weight)],
                ["Length", show(variant.length)],
                ["Width", show(variant.width)],
                ["Height", show(variant.height)],
                ["MID code", show(variant.mid_code)],
                ["HS code", show(variant.hs_code)],
                ["Origin country", show(variant.origin_country)],
                ["Material", show(variant.material)],
              ]}
            />
          </DetailSection>

          <DetailSection title="Options">
            {options.length === 0 ? <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>This variant has no options.</div> : <KV rows={options.map(([k, v]) => [k, String(v)])} />}
          </DetailSection>

          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Prices</h2>
            </div>
            <DataTable
              columns={[
                { key: "currency", label: "Currency", render: (p: MoneyAmount) => String(p.currency_code ?? "").toUpperCase() },
                { key: "amount", label: "Price", render: (p: MoneyAmount) => fmtMoney(p.amount, p.currency_code) },
              ]}
              rows={prices}
              rowKey={(p) => `${p.currency_code}`}
              emptyTitle="No prices"
              emptyHint="This variant has no prices yet."
            />
          </section>

          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Inventory items</h2>
            </div>
            <DataTable
              columns={[
                {
                  key: "item",
                  label: "Item",
                  render: (i: ProductVariantInventoryItem) => (
                    <Link to={`/r/inventory-items/${i.inventory_item_id ?? i.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                      {i.inventory?.sku ?? i.sku ?? i.inventory_item_id ?? i.id}
                    </Link>
                  ),
                },
                { key: "required", label: "Required quantity", render: (i: ProductVariantInventoryItem) => String(i.required_quantity ?? 1) },
              ]}
              rows={items}
              rowKey={(i, idx) => String(i.inventory_item_id ?? i.id ?? idx)}
              emptyTitle="No inventory items"
              emptyHint={variant.manage_inventory ? "Link an inventory item to track stock." : "Inventory is not managed for this variant."}
            />
          </section>

          <EditableMetadata metadata={variant.metadata} path={`/admin/products/${id}/variants/${variantId}`} onSaved={load} />
          <JsonSection data={variant} />
        </div>
      ) : null}
      {variant && product && editing ? (
        <ProductVariantDrawer
          product={product}
          initial={variant}
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
