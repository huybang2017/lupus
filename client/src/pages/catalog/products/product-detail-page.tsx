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
          Products
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {product?.title ?? id}
        </span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!product && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {product ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Left column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection
              title={product.title}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusDot status={product.status} />
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setDrawer("general") },
                      { label: "Delete", danger: true, onClick: del },
                    ]}
                  />
                </div>
              }
            >
              <KV
                rows={[
                  ["Description", fmtCell(product.description)],
                  ["Subtitle", fmtCell(product.subtitle)],
                  [
                    "Handle",
                    <span key="h" className="mono">
                      /{fmtCell(product.handle)}
                    </span>,
                  ],
                  ["Material", fmtCell(product.material)],
                  ["Discountable", String(product.discountable !== false)],
                ]}
              />
            </DetailSection>

            <MediaSection product={product} onChanged={load} />
            <OptionsSection
              product={product}
              onChanged={load}
              onAdd={() => setDrawer("option")}
            />

            <DetailSection
              title="Variants"
              action={
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <TableSearch
                    value={variantQuery}
                    onChange={setVariantQuery}
                    placeholder="Search"
                    width={160}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDrawer("editVariants")}
                    disabled={(product.variants ?? []).length === 0}
                  >
                    Edit variants
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDrawer("variant")}
                  >
                    Create
                  </button>
                </div>
              }
            >
              <DataTable
                columns={variantColumns}
                rows={variants}
                rowKey={(v) => v.id}
                onRowClick={(v) => navigate(`/r/products/${product.id}/variants/${v.id}`)}
                emptyTitle="No variants"
                emptyHint="Add variants for this product"
                rowActions={(v) => [
                  {
                    label: "Edit",
                    onClick: () => setDrawer({ editVariant: v }),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    onClick: () => delVariant(product.id, v.id, load, setErr),
                  },
                ]}
              />
            </DetailSection>
          </div>

          {/* Right rail */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection
              title="Sales Channels"
              action={
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setDrawer("channels") },
                  ]}
                />
              }
            >
              {channels.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
                  Not available in any channel
                </div>
              ) : (
                <>
                  {channels.slice(0, 3).map((c: any) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: "var(--hover-bg)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                        }}
                      >
                        ◈
                      </span>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--fg-subtle)",
                      marginTop: 6,
                    }}
                  >
                    Available in {channels.length} of {totalChannels ?? channels.length} sales
                    channels
                  </div>
                </>
              )}
            </DetailSection>

            <DetailSection
              title="Shipping configuration"
              action={
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setDrawer("shipping") },
                  ]}
                />
              }
            >
              <div
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: "var(--hover-bg)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                  }}
                >
                  ▣
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {profile
                      ? (profile.name ?? profile.type ?? "Shipping profile")
                      : "–"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                    {profile?.type ?? ""}
                  </div>
                </div>
              </div>
            </DetailSection>

            <DetailSection
              title="Organize"
              action={
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setDrawer("organize") },
                  ]}
                />
              }
            >
              <KV
                rows={[
                  [
                    "Tags",
                    (product.tags ?? []).length > 0
                      ? (product.tags ?? [])
                          .map((t) => t.value ?? t.name)
                          .join(", ")
                      : "–",
                  ],
                  ["Type", fmtCell(product.type?.value ?? product.type?.title)],
                  ["Collection", fmtCell(product.collection?.title)],
                  [
                    "Categories",
                    (product.categories ?? []).length > 0 ? (
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(product.categories ?? []).map((c) => (
                          <span
                            key={c.id}
                            className="badge badge-gray"
                            style={{ maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" }}
                          >
                            {c.name}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "–"
                    ),
                  ],
                ]}
              />
            </DetailSection>

            <DetailSection
              title="Attributes"
              action={
                <RowMenu
                  items={[
                    { label: "Edit", onClick: () => setDrawer("attributes") },
                  ]}
                />
              }
            >
              <KV
                rows={[
                  ["Height", fmtCell(product.height)],
                  ["Width", fmtCell(product.width)],
                  ["Length", fmtCell(product.length)],
                  ["Weight", fmtCell(product.weight)],
                  ["MID code", fmtCell(product.mid_code)],
                  ["HS code", fmtCell(product.hs_code)],
                  ["Country of origin", fmtCell(countryName(product.origin_country))],
                ]}
              />
            </DetailSection>

            <MetadataSection
              metadata={product.metadata}
              onEdit={() => setDrawer("metadata")}
            />
            <JsonSection data={product} />
          </div>
        </div>
      ) : null}

      {drawer === "general" ? (
        <ProductGeneralDrawer product={product!} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer === "attributes" ? (
        <ProductAttributesDrawer product={product!} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer === "organize" ? (
        <ProductOrganizeDrawer product={product!} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer === "shipping" ? (
        <ProductShippingDrawer product={product!} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer === "channels" ? (
        <ProductChannelsPicker
          product={product!}
          selected={channels.map((c: any) => c.id)}
          onClose={() => setDrawer(null)}
          onSaved={saved}
        />
      ) : null}
      {drawer === "metadata" ? (
        <MetadataDrawer
          metadata={product!.metadata}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          save={async (m: Record<string, string>) => {
            await api(`/admin/products/${product!.id}`, { method: "POST", body: { metadata: m } });
          }}
        />
      ) : null}
      {drawer === "option" ? (
        <OptionForm productId={id} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer === "variant" ? (
        <ProductVariantDrawer product={product!} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer === "editVariants" ? (
        <ProductVariantsEditor product={product!} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
      {drawer !== null && typeof drawer === "object" && "editVariant" in drawer ? (
        <ProductVariantDrawer
          product={product!}
          initial={drawer.editVariant}
          onClose={() => setDrawer(null)}
          onSaved={saved}
        />
      ) : null}
    </div>
  );
}

async function delVariant(
  productId: string,
  variantId: string,
  reload: () => void,
  setErr: (e: string | null) => void,
) {
  if (!(await requestConfirm({ description: "Delete this variant?" }))) return;
  await api(`/admin/products/${productId}/variants/${variantId}`, {
    method: "DELETE",
  })
    .then(reload)
    .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
}

// ---------- Media ----------
function MediaSection({
  product,
  onChanged,
}: {
  product: Product;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const images: ProductImage[] = product.images ?? [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f, f.name));
      const up = await fetch("/admin/uploads", {
        method: "POST",
        body: fd,
        headers: {
          authorization: `Bearer ${localStorage.getItem("lupus_admin_token") ?? ""}`,
        },
      });
      const uj: any = await up.json().catch(() => null);
      const urls: string[] = Array.isArray(uj?.files)
        ? uj.files.map((f: any) => f.url ?? f.path).filter(Boolean)
        : [];
      if (urls.length === 0) throw new Error("Upload returned no files");
      await api(`/admin/products/${product.id}/images`, {
        method: "POST",
        body: { urls },
      });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(imageId: string) {
    if (!(await confirm({ description: "Delete this image?" }))) return;
    await api(`/admin/product-images/${imageId}`, { method: "DELETE" }).catch(
      (e) => setErr(e instanceof Error ? e.message : String(e)),
    );
    onChanged();
  }

  async function setThumbnail(url: string) {
    await api(`/admin/products/${product.id}`, {
      method: "POST",
      body: { thumbnail: url },
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    onChanged();
  }

  return (
    <DetailSection
      title="Media"
      action={
        <RowMenu
          items={[
            {
              label: "Upload",
              onClick: () =>
                document.getElementById("pd-media-upload")?.click(),
            },
          ]}
        />
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      <HiddenFileInput
        id="pd-media-upload"
        accept="image/*"
        multiple
        onFiles={upload}
      />
      {busy ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
          <Spinner />
        </div>
      ) : null}
      {images.length === 0 && !busy ? (
        <EmptyState title="No media" hint="Upload images for this product" />
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {images.map((img, i) => (
            <div
              key={img.id}
              style={{
                position: "relative",
                width: 96,
                height: 96,
                borderRadius: 10,
                overflow: "hidden",
                background: "#fff",
                border: "1px solid var(--card-border)",
              }}
            >
              <img
                src={img.url}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
