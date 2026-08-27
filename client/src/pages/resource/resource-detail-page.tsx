import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { listUrl, useAdminBase } from "@/shared/utils/admin-path";
import { getResource } from "@/entities/resources";
import { fmtCell } from "@/widgets/ui/surfaces";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { singular } from "@/shared/formatting/text";
import { ResourceForm } from "@/pages/resource/resource-form";
import { ProductDetailPage } from "@/pages/catalog/products/product-detail-page";
import { OrderDetailPage } from "@/pages/orders/order-detail-page";
import { CustomerDetailPage } from "@/pages/customers/customer-detail-page";
import { TaxRegionDetailPage } from "@/pages/settings/tax/tax-pages";
import { SalesChannelDetailPage } from "@/pages/settings/sales-channels/sales-channel-detail-page";
import { UserDetailPage } from "@/pages/settings/users/user-pages";
import { RoleDetailPage } from "@/pages/settings/rbac/role-detail-page";
import { DraftOrderDetailPage } from "@/pages/orders/draft-orders/draft-order-detail-page";
import { CategoryDetailPage } from "@/pages/catalog/categories/category-detail-page";
import { OptionDetailPage } from "@/pages/catalog/product-options/option-detail-page";
import { InventoryDetailPage } from "@/pages/catalog/inventory/inventory-detail-page";
import { ReservationDetailPage } from "@/pages/catalog/reservations/reservation-detail-page";
import { CustomerGroupDetailPage } from "@/pages/customers/customer-groups/customer-group-detail-page";
import { PromotionDetailPage } from "@/pages/promotions/promotion-detail-page";
import { CampaignDetailPage } from "@/pages/promotions/campaigns/campaign-detail-page";
import { PriceListDetailPage } from "@/pages/pricing/price-lists/price-list-detail-page";
import { LocationDetailPage } from "@/pages/fulfillment/locations/location-detail-page";
import { RegionDetailPage } from "@/pages/settings/regions/region-pages";
import { TaxonomyDetailPage } from "@/pages/catalog/taxonomy/taxonomy-pages";
import { CollectionDetailPage } from "@/pages/catalog/collections/collection-pages";
import { WorkflowDetailPage } from "@/pages/settings/workflows/workflow-pages";
import { ShippingOptionTypeDetailPage, ShippingProfileDetailPage } from "@/pages/fulfillment/shipping-config/shipping-config-pages";
import { useConfirm } from "@/widgets/confirm";
import { JsonSection } from "@/widgets/detail/detail-section";
import { EditableMetadata } from "@/widgets/detail/editable-metadata";

// Lupus-style detail: header (back + title + edit/delete), General card,
// Metadata card, raw JSON card.
export function ResourceDetailPage() {
  const confirm = useConfirm();
  const { slug = "", id = "" } = useParams<{ slug: string; id: string }>();
  const resource = getResource(slug);
  const base = useAdminBase();
  const navigate = useNavigate();
  const [item, setItem] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!resource?.detailPath) return;
    setItem(null);
    setErr(null);
    api(resource.detailPath(id))
      .then((d: any) => setItem(d?.[resource.detailKey ?? ""] ?? d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [slug, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!resource)
    return <div style={{ padding: 24 }}>Resource not found: {slug}</div>;
  // Dedicated detail experiences (Lupus section logic); everything else
  // falls through to the generic section renderer below.
  if (resource.customDetail === "product") return <ProductDetailPage />;
  if (resource.customDetail === "order") return <OrderDetailPage />;
  if (resource.customDetail === "draft-order") return <DraftOrderDetailPage />;
  if (resource.customDetail === "category") return <CategoryDetailPage />;
  if (resource.customDetail === "product-option") return <OptionDetailPage />;
  if (resource.customDetail === "inventory") return <InventoryDetailPage />;
  if (resource.customDetail === "reservation") return <ReservationDetailPage />;
  if (resource.customDetail === "customer-group")
    return <CustomerGroupDetailPage />;
  if (resource.customDetail === "promotion") return <PromotionDetailPage />;
  if (resource.customDetail === "campaign") return <CampaignDetailPage />;
  if (resource.customDetail === "price-list") return <PriceListDetailPage />;
  if (resource.customDetail === "stock-location") return <LocationDetailPage />;
  if (resource.customDetail === "shipping-profile") return <ShippingProfileDetailPage />;
  if (resource.customDetail === "shipping-option-type") return <ShippingOptionTypeDetailPage />;
  if (resource.customDetail === "workflow-execution") return <WorkflowDetailPage />;
  if (slug === "customers") return <CustomerDetailPage />;
  if (slug === "tax-regions") return <TaxRegionDetailPage />;
  if (slug === "sales-channels") return <SalesChannelDetailPage />;
  if (slug === "users") return <UserDetailPage />;
  if (slug === "regions") return <RegionDetailPage />;
  if (resource.slug === "collections") return <CollectionDetailPage />;
  if (resource.slug === "product-types") return <TaxonomyDetailPage kind="type" />;
  if (resource.slug === "product-tags") return <TaxonomyDetailPage kind="tag" />;
  if (slug === "rbac-roles") return <RoleDetailPage />;
  const r = resource;
  const singularName = singular(r.label);

  async function del() {
    if (
      !r.deletePath ||
      !(await confirm({ description: `Delete ${singularName} ${id}?` }))
    )
      return;
    setBusy(true);
    try {
      await api(r.deletePath(id), { method: "DELETE" });
      navigate(listUrl(base, r.slug));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <Link
            to={listUrl(base, r.slug)}
            style={{
              color: "var(--fg-subtle)",
              textDecoration: "none",
              fontSize: 18,
            }}
          >
            â†
          </Link>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item
              ? (item.title ??
                item.name ??
                item.email ??
                item.code ??
                item.handle ??
                id)
              : `${singularName} ${id}`}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {r.updatePath ? (
            <button
              className="btn btn-secondary"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          ) : null}
          {r.deletePath ? (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={del}
              style={{ color: "#ef4444" }}
            >
              {busy ? "Deletingâ€¦" : "Delete"}
            </button>
          ) : null}
        </div>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!item && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {item ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card" style={{ padding: "20px 24px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>
              General
            </h2>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                color: "var(--fg-subtle)",
              }}
            >
              Manage the {singularName.toLowerCase()} details
            </p>
            <dl style={{ margin: 0 }}>
              {r.columns.map((c) => (
                <div
                  key={c.key}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: "10px 0",
                    borderTop: "1px solid var(--card-border)",
                    fontSize: 13,
                  }}
                >
                  <dt
                    style={{
                      width: 180,
                      flexShrink: 0,
                      color: "var(--fg-subtle)",
                    }}
                  >
                    {c.label}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      flex: 1,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {fmtCell(item[c.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <EditableMetadata metadata={item?.metadata} path={r.updatePath ? r.updatePath(id) : `${r.listPath}/${id}`} onSaved={() => { if (r.detailPath) api(r.detailPath(id)).then((d: any) => setItem(d?.[r.detailKey ?? ""] ?? d)).catch(() => {}); }} />

          <JsonSection data={item} />
        </div>
      ) : null}

      {editing && item ? (
        <ResourceForm
          resource={r}
          mode="edit"
          initial={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            api(r.detailPath!(id))
              .then((d: any) => setItem(d?.[r.detailKey ?? ""] ?? d))
              .catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}
