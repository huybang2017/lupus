import type { ReactNode } from "react";
import { api } from "@/shared/api/client";
import {
  CollectionCell,
  ProductTitleCell,
  SalesChannelsCell,
  StatusDot,
  VariantsCell,
} from "@/widgets/cells/product-cells";
import { LIST_LIMIT, parseList } from "@/shared/api/list";
// Type-only, so it costs nothing at runtime and (verified against the import
// graph) the barrel does not reach this file back.
import type { FilterDef, FilterOption } from "@/widgets/filters";
import {
  boolFilter,
  csvOptions,
  dateFilter,
  multiSelectFilter,
  numberFilter,
  options,
  selectFilter,
  textFilter,
} from "@/widgets/filters/filter-defs";
import type { FieldDef } from "@/widgets/ui/surfaces";
import { PriceCountCell, PriceListStatusCell, StatusCell } from "@/widgets/cells/status-pill";
import { EditPriceListDrawer } from "@/pages/pricing/price-lists/price-list-drawers";
import { EditShippingOptionTypeDrawer } from "@/pages/fulfillment/shipping-config/shipping-config-pages";
import { EditRefundReasonDrawer, EditReturnReasonDrawer } from "@/pages/settings/reasons/reason-pages";
import { EditTaxonomyDrawer } from "@/pages/catalog/taxonomy/taxonomy-pages";
import { EditCollectionDrawer } from "@/pages/catalog/collections/collection-pages";
import { EditSalesChannelDrawer } from "@/pages/settings/sales-channels/sales-channel-detail-page";
import { fmtDate } from "@/shared/formatting/format-date";
import { fmtMoney } from "@/shared/formatting/money";
import { FulfillmentStatusCell, OrderStatusCell, PaymentStatusCell } from "@/widgets/cells/order-status";
import { Link } from "react-router-dom";
import { IdBadge, ProgressCell, WorkflowStateCell } from "@/pages/settings/workflows/workflow-pages";
import { EditUserDrawer } from "@/pages/settings/users/user-pages";

// ---------- remote filter options ----------
//
// ID filters (customer, sales channel, ...) cannot be a static option list: the
// table may hold ten thousand customers and the def is built at module load, so
// the choices have to be fetched on demand. `remoteFilter` is the one place that
// knows the list-envelope shape, the page ceiling and the label heuristics, so
// every picker in the app behaves the same.

/** Best-effort human label for a list row that has no single obvious name. */
function rowLabel(row: any): FilterOption {
  const label =
    row?.title ?? row?.name ?? row?.email ?? row?.display_id ?? row?.id ?? "";
  return { value: String(row?.id ?? ""), label: String(label) };
}

/**
 * Build a `loadOptions` for `path`. The user's term is always sent as `q=`
 * because a table with thousands of rows cannot be searched in the browser.
 * `exclude` drops rows that can never be a legal choice (a category that is its
 * own parent, say) without the caller having to re-implement the envelope
 * handling below.
 * Never throws: a failed lookup renders as "no results", not as a broken chip.
 */
function remoteFilter(
  path: string,
  pick?: (row: any) => FilterOption,
  exclude?: (row: any) => boolean,
): FilterDef["loadOptions"] {
  return async (search: string) => {
    const term = search.trim();
    const qs = term === "" ? "" : `&q=${encodeURIComponent(term)}`;
    try {
      const data = await api(`${path}?limit=${LIST_LIMIT}&offset=0${qs}`);
      const items = parseList(data, LIST_LIMIT).items;
      return (exclude ? items.filter((row) => !exclude(row)) : items).map(
        (row) => (pick ? pick(row) : rowLabel(row)),
      );
    } catch {
      return [];
    }
  };
}

/** A tax region is identified by its country (and province when set). */
function taxRegionLabel(row: any): FilterOption {
  const parts = [row?.country_code, row?.province_code].filter(Boolean);
  return {
    value: String(row?.id ?? ""),
    label: parts.length > 0 ? parts.join("-") : String(row?.id ?? ""),
  };
}

const CUSTOMER_OPTIONS = remoteFilter("/admin/customers");
const SALES_CHANNEL_OPTIONS = remoteFilter("/admin/sales-channels");
const REGION_OPTIONS = remoteFilter("/admin/regions", (row) => ({
  value: String(row.id ?? ""),
  label: String(row?.name ?? row?.id ?? ""),
}));
const LOCATION_OPTIONS = remoteFilter("/admin/stock-locations");
const ORDER_OPTIONS = remoteFilter("/admin/orders", (row) => ({
  value: String(row.id ?? ""),
  label: row?.display_id != null ? `#${row.display_id}` : String(row?.id ?? ""),
}));
const TAX_REGION_OPTIONS = remoteFilter("/admin/tax-regions", taxRegionLabel);
const CAMPAIGN_OPTIONS = remoteFilter("/admin/campaigns");

/**
 * Parent-category picker. `parent_id` is an `in` filter, so several parents can
 * be chosen at once ("every child of these two categories").
 *
 * The loader drops a category that points at itself, which is the only cycle a
 * single row can carry. A deeper cycle (picking an ancestor of the category you
 * are already on) cannot be detected here - `loadOptions` only receives the
 * search term, never the row being filtered - but it is harmless: the server
 * then simply matches no rows, it never re-parents anything.
 */
const PARENT_CATEGORY_OPTIONS = remoteFilter(
  "/admin/product-categories",
  (row) => ({
    value: String(row.id ?? ""),
    label: String(row?.name ?? row?.id ?? ""),
  }),
  (row) => row?.parent_category_id != null && row.parent_category_id === row.id,
);

// ---------- status vocabularies ----------
//
// These mirror the CHECK constraints / filter whitelists in
// server/src/modules/infra/list-filter-specs.ts. A value the
// server does not accept is silently ignored, which would look like a broken
// filter, so the two lists have to stay in step.

const ORDER_STATUSES = csvOptions(
  "pending,completed,archived,canceled,requires_action",
);
/** Derived through an EXISTS on fulfillment; "order" has no such column. */
const FULFILLMENT_STATUSES = csvOptions(
  "not_fulfilled,fulfilled,shipped,delivered",
);
/** return_request.status has its own CHECK list, distinct from claims. */
const RETURN_STATUSES = csvOptions(
  "requested,confirmed,partially_received,received,canceled,dismissed",
);
const RMA_STATUSES = csvOptions("requested,confirmed,received,canceled,dismissed");
/** claim.type only; `exchange` has no such column, so it is not offered there. */
const CLAIM_TYPES = csvOptions("refund,replace");
/** payment_collection.status; also the value the orders list reports as payment_status. */
const PAYMENT_STATUSES = csvOptions(
  "awaiting,authorized,partially_authorized,captured,partially_captured,refunded,canceled,requires_more",
);
/** "open" is the draft lifecycle value; the server maps it onto the stored one. */
const DRAFT_ORDER_STATUSES = options("open", ...ORDER_STATUSES.map((o) => o.value));
/** promotion.status / price_list.status; `inactive` is accepted, matches nothing. */
const PROMOTION_STATUSES = csvOptions("draft,active,inactive");
/** promotion.application_type, which the list endpoint exposes as `type`. */
const PROMOTION_TYPES = csvOptions("percentage,fixed,buyget");
/** promotion.application_target. */
const PROMOTION_TARGETS = csvOptions("order,items,shipping_methods");
/** price_list.type. */
const PRICE_LIST_TYPES = csvOptions("sale,override");
/**
 * shipping_profile.type has no CHECK constraint and no server-side whitelist, so
 * the only vocabulary that actually occurs is the one this dashboard writes
 * (see the shipping-profiles create form).
 */
const SHIPPING_PROFILE_TYPES = options("default", "custom");

const STATUS = (label = "Status"): FieldDef => ({
  key: "status",
  label: label,
  type: "select",
  options: [
    { value: "active", label: "active" },
    { value: "draft", label: "draft" },
    { value: "pending", label: "pending" },
    { value: "published", label: "published" },
  ],
});

const JSON_LIST = (key: string, label: string, hint?: string): FieldDef => ({
  key,
  label,
  type: "json",
  hint,
});

export interface ActionDef {
  key: string;
  label: string;
  method: "POST" | "DELETE";
  path: (id: string, values?: any) => string;
  fields?: FieldDef[];
  staticBody?: Record<string, unknown>;
  confirm?: string;
  scope: "row" | "global";
}
export interface ColumnDef {
  key: string;
  label: string;
  /** Custom cell. `ctx.to` is the detail URL when the resource has a detail page. */
  render?: (row: any, ctx: { to: string | null }) => ReactNode;
  /** Server `order` key; makes the header clickable (asc, desc, off). */
  sortKey?: string;
  width?: number | string;
}
export interface Resource {
  slug: string;
  label: string;
  group: string;
  listKey: string;
  listPath: string;
  detailKey?: string;
  detailPath?: (id: string) => string;
  linkIf?: (row: any) => boolean;
  createPath?: string | ((values: any) => string);
  createStrip?: string[];
  /** Dedicated create page (wizard). When set, the list Create button navigates here instead of the drawer. */
  createPage?: string;
  /** Extra buttons shown before Export in the list header (e.g. Edit ranking). */
  headerLinks?: { label: string; to: string }[];
  /** Custom label for the list Create button (default "Create"). */
  createLabel?: string;
  /** One line under the list heading (Lupus shows one on its simpler lists). */
  subtitle?: string;
  /** Hide the CSV Export / Import buttons. */
  noTransfer?: boolean;
  /** Hide the row checkboxes (and with them bulk delete). */
  noSelect?: boolean;
  /** Hide the "View" row action; the title already links to the detail page. */
  hideView?: boolean;
  /** Replaces the generic edit drawer opened by the row "Edit" action. */
  renderEdit?: (row: any, close: () => void, saved: () => void) => ReactNode;
  /** Replaces the generic "Delete <label> <id>?" confirmation. */
  deleteConfirm?: (row: any) => { title: string; description: string; verifyText?: string };
  updatePath?: (id: string) => string;
  deletePath?: (id: string) => string;
  columns: ColumnDef[];
  fields: FieldDef[];
  search?: boolean;
  /**
   * Declarative filter definitions for the list view (Add filter menu + chips).
   * Only declare a filter the list endpoint actually accepts as a query param:
   * unknown params are dropped by the backend, so an unsupported filter is a chip
   * that silently does nothing.
   */
  filters?: FilterDef[];
  actions?: ActionDef[];
  customDetail?:
    | "product"
    | "order"
    | "option"
    | "draft-order"
    | "category"
    | "product-option"
    | "inventory"
    | "reservation"
    | "customer-group"
    | "promotion"
    | "campaign"
    | "price-list"
    | "stock-location"
    | "shipping-profile"
    | "shipping-option-type"
    | "workflow-execution";
}

export const RESOURCES: Resource[] = [
  {
    slug: "products",
    label: "Products",
    group: "Catalog",
    listKey: "products",
    listPath: "/admin/products",
    detailKey: "product",
    detailPath: (id) => `/admin/products/${id}`,
    createPath: "/admin/products",
    createPage: "/r/products/create",
    updatePath: (id) => `/admin/products/${id}`,
    deletePath: (id) => `/admin/products/${id}`,
    columns: [
      {
        key: "title",
        label: "Product",
        sortKey: "title",
        render: (row, ctx) =>
          ctx.to ? <ProductTitleCell row={row} to={ctx.to} /> : <span>{row.title}</span>,
      },
      {
        key: "collection",
        label: "Collection",
        sortKey: "collection",
        render: (row) => <CollectionCell row={row} />,
      },
      {
        key: "sales_channels",
        label: "Sales channels",
        render: (row) => <SalesChannelsCell row={row} />,
      },
      {
        key: "variants",
        label: "Variants",
        render: (row) => <VariantsCell row={row} />,
      },
      {
        key: "status",
        label: "Status",
        sortKey: "status",
        render: (row) => <StatusDot status={row.status} />,
      },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "handle", label: "Handle", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "draft", label: "draft" },
          { value: "published", label: "published" },
        ],
      },
    ],
    search: true,
    filters: [
      selectFilter(
        "status",
        "Status",
        csvOptions("draft,proposed,published,rejected"),
      ),
      textFilter("handle", "Handle", { help: "Exact match" }),
      // The server compares collection_id / type_id with `=`, so these are
      // single-valued selects even though the ids are the only useful filter.
      selectFilter("collection_id", "Collection", [], {
        loadOptions: remoteFilter("/admin/collections"),
      }),
      selectFilter("type_id", "Product type", [], {
        loadOptions: remoteFilter("/admin/product-types", (row) => ({
          value: String(row.id ?? ""),
          label: String(row?.value ?? row?.id ?? ""),
        })),
      }),
      multiSelectFilter("tag_id", "Tag", [], {
        loadOptions: remoteFilter("/admin/product-tags", (row) => ({ value: String(row.id ?? ""), label: String(row?.value ?? row?.id ?? "") })),
      }),
      multiSelectFilter("category_id", "Category", [], {
        loadOptions: remoteFilter("/admin/product-categories", (row) => ({ value: String(row.id ?? ""), label: String(row?.name ?? row?.id ?? "") })),
      }),
      textFilter("title", "Title"),
      dateFilter("created_at"),
      dateFilter("updated_at"),
      // Not a product column: the route resolves it through the
      // product_sales_channel pivot with a bound array, so it repeats.
      multiSelectFilter("sales_channel_id", "Sales channel", [], {
        loadOptions: SALES_CHANNEL_OPTIONS,
      }),
    ],
    customDetail: "product",
  },
  {
    slug: "product-variants",
    label: "Variants",
    group: "Catalog",
    listKey: "variants",
    listPath: "/admin/product-variants",
    detailKey: "variant",
    detailPath: (id) => `/admin/product-variants/${id}`,
    columns: [
      { key: "title", label: "Title" },
      { key: "sku", label: "SKU" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
    ],
    filters: [
      textFilter("sku", "SKU", { help: "Exact match" }),
      // product_id accepts a repeated param, so this one is a real multi-select.
      multiSelectFilter("product_id", "Product", [], {
        loadOptions: remoteFilter("/admin/products"),
      }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "product-options",
    label: "Options",
    group: "Catalog",
    listKey: "product_options",
    listPath: "/admin/product-options",
    detailKey: "product_option",
    detailPath: (id) => `/admin/product-options/${id}`,
    createPage: "/r/product-options/create",
    columns: [
      { key: "title", label: "Title", sortKey: "title" },
      {
        key: "values",
        label: "Values",
        render: (row) => {
          const n = (row.values ?? []).length;
          return n === 0 ? "-" : `${n} ${n === 1 ? "value" : "values"}`;
        },
      },
      {
        key: "is_exclusive",
        label: "Status",
        render: (row) => (
          <span
            style={{
              display: "inline-block",
              padding: "1px 8px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--card-border)",
              color: row.is_exclusive === false ? "#60a5fa" : "var(--fg-subtle)",
              background: row.is_exclusive === false ? "rgba(59,130,246,0.12)" : "var(--hover-bg)",
            }}
          >
            {row.is_exclusive === false ? "Global" : "Exclusive"}
          </span>
        ),
      },
    ],
    fields: [{ key: "title", label: "Title", type: "text", required: true }],
    filters: [
      selectFilter(
        "is_exclusive",
        "Type",
        [
          { value: "false", label: "Global" },
          { value: "true", label: "Exclusive" },
        ],
      ),
      textFilter("title", "Title", { help: "Exact match" }),
      // product_id is compared with `=`, so a repeated param would be an array
      // where the route reads a single value: single select only.
      selectFilter("product_id", "Product", [], {
        loadOptions: remoteFilter("/admin/products"),
      }),
      dateFilter("created_at"),
    ],
    customDetail: "product-option",
  },
  {
    slug: "categories",
    label: "Categories",
    group: "Catalog",
    listKey: "categories",
    listPath: "/admin/product-categories",
    detailKey: "category",
    detailPath: (id) => `/admin/product-categories/${id}`,
    createPage: "/r/categories/create",
    columns: [
      { key: "name", label: "Name", sortKey: "name" },
      { key: "handle", label: "Handle", render: (row) => <span className="mono">/{row.handle}</span> },
      {
        key: "is_active",
        label: "Status",
        render: (row) => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: row.is_active === false ? "#9ca3af" : "#22c55e" }} />
            {row.is_active === false ? "Inactive" : "Active"}
          </span>
        ),
      },
      { key: "is_internal", label: "Visibility", render: (row) => (row.is_internal ? "Private" : "Public") },
    ],
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
    // No sort UI: the admin Organize page depends on this endpoint's
    // `rank ASC, created_at DESC` default, so there is nothing to override.
    filters: [
      textFilter("handle", "Handle", { help: "Exact match" }),
      multiSelectFilter("parent_id", "Parent category", [], {
        loadOptions: PARENT_CATEGORY_OPTIONS,
      }),
      dateFilter("created_at"),
    ],
    customDetail: "category",
  },
  {
    slug: "collections",
    label: "Collections",
    group: "Catalog",
    listKey: "collections",
    listPath: "/admin/collections",
    detailKey: "collection",
    detailPath: (id) => `/admin/collections/${id}`,
    createPath: "/admin/collections",
    createPage: "/r/collections/create",
    updatePath: (id) => `/admin/collections/${id}`,
    deletePath: (id) => `/admin/collections/${id}`,
    hideView: true,
    columns: [
      { key: "title", label: "Title", sortKey: "title" },
      { key: "handle", label: "Handle", sortKey: "handle", render: (row) => <span className="mono">/{row.handle}</span> },
      { key: "products", label: "Products", render: (row) => (row.products_count ? String(row.products_count) : <span style={{ color: "var(--fg-muted)" }}>-</span>) },
    ],
    renderEdit: (row, close, saved) => <EditCollectionDrawer collection={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the collection ${row.title}. This action cannot be undone.`,
      verifyText: row.title,
    }),
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "handle", label: "Handle", type: "text" },
    ],
    search: true,
    filters: [
      textFilter("title", "Title", { help: "Exact match" }),
      textFilter("handle", "Handle", { help: "Exact match" }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "product-tags",
    label: "Product Tags",
    group: "Catalog",
    listKey: "product_tags",
    listPath: "/admin/product-tags",
    detailKey: "product_tag",
    detailPath: (id) => `/admin/product-tags/${id}`,
    createPath: "/admin/product-tags",
    createPage: "/settings/product-tags/create",
    updatePath: (id) => `/admin/product-tags/${id}`,
    deletePath: (id) => `/admin/product-tags/${id}`,
    subtitle: "Organize your products with tags.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    columns: [
      { key: "value", label: "Value", sortKey: "value" },
      { key: "created_at", label: "Created", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
      { key: "updated_at", label: "Updated", sortKey: "updated_at", render: (row) => fmtDate(row.updated_at) },
    ],
    fields: [{ key: "value", label: "Value", type: "text", required: true }],
    renderEdit: (row, close, saved) => <EditTaxonomyDrawer kind="tag" row={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the product tag ${row.value}. This action cannot be undone.`,
      verifyText: row.value,
    }),
    filters: [
      textFilter("value", "Value", { help: "Exact match" }),
      dateFilter("created_at"),
      dateFilter("updated_at"),
    ],
  },
  {
    slug: "product-types",
    label: "Product Types",
    group: "Catalog",
    listKey: "product_types",
    listPath: "/admin/product-types",
    detailKey: "product_type",
    detailPath: (id) => `/admin/product-types/${id}`,
    createPath: "/admin/product-types",
    createPage: "/settings/product-types/create",
    updatePath: (id) => `/admin/product-types/${id}`,
    deletePath: (id) => `/admin/product-types/${id}`,
    subtitle: "Organize your products into types.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    columns: [
      { key: "value", label: "Value", sortKey: "value" },
      { key: "created_at", label: "Created", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
      { key: "updated_at", label: "Updated", sortKey: "updated_at", render: (row) => fmtDate(row.updated_at) },
    ],
    fields: [{ key: "value", label: "Value", type: "text", required: true }],
    renderEdit: (row, close, saved) => <EditTaxonomyDrawer kind="type" row={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the product type ${row.value}. This action cannot be undone.`,
      verifyText: row.value,
    }),
    filters: [
      textFilter("value", "Value", { help: "Exact match" }),
      dateFilter("created_at"),
      dateFilter("updated_at"),
    ],
  },
  {
    slug: "regions",
    label: "Regions",
    group: "Settings",
    listKey: "regions",
    listPath: "/admin/regions",
    detailKey: "region",
    detailPath: (id) => `/admin/regions/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "currency_code", label: "Currency" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "currency_code", label: "Currency", type: "text" },
    ],
    search: true,
    filters: [
      textFilter("name", "Name"),
      textFilter("currency_code", "Currency", { help: "Exact match, e.g. usd" }),
      textFilter("country_code", "Country", { help: "ISO-2, e.g. us" }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "currencies",
    label: "Currencies",
    group: "Settings",
    listKey: "currencies",
    listPath: "/admin/currencies",
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
    ],
    fields: [],
  },
  {
    slug: "locales",
    label: "Locales",
    group: "Settings",
    listKey: "locales",
    listPath: "/admin/locales",
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
    ],
    fields: [],
  },
  {
    slug: "stores",
    label: "Store",
    group: "Settings",
    listKey: "stores",
    listPath: "/admin/stores",
    detailKey: "store",
    detailPath: (id) => `/admin/stores/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "id", label: "ID" },
    ],
    fields: [{ key: "name", label: "Name", type: "text" }],
  },
  {
    slug: "customers",
    label: "Customers",
    group: "Customers",
    listKey: "customers",
    listPath: "/admin/customers",
    detailKey: "customer",
    detailPath: (id) => `/admin/customers/${id}`,
    createPath: "/admin/customers",
    createPage: "/r/customers/create",
    updatePath: (id) => `/admin/customers/${id}`,
    deletePath: (id) => `/admin/customers/${id}`,
    hideView: true,
    columns: [
      { key: "email", label: "Email", render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>{row.email}</Link> : <span>{row.email}</span>) },
      { key: "name", label: "Name", render: (row) => [row.first_name, row.last_name].filter(Boolean).join(" ") || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "has_account", label: "Account", render: (row) => (row.has_account ? "Registered" : "Guest") },
      { key: "created_at", label: "Created", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
    ],
    fields: [
      { key: "email", label: "Email", type: "text", required: true },
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
      { key: "company_name", label: "Company", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
    ],
    search: true,
    filters: [
      textFilter("email", "Email"),
      boolFilter("has_account", "Has account"),
      multiSelectFilter("groups", "Customer group", [], { loadOptions: remoteFilter("/admin/customer-groups", (row) => ({ value: String(row.id ?? ""), label: String(row?.name ?? row?.id ?? "") })) }),
      // EXISTS over "order", handled by the route rather than a FilterSpec.
      boolFilter("has_orders", "Has orders"),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "customer-groups",
    label: "Customer Groups",
    group: "Customers",
    listKey: "customer_groups",
    listPath: "/admin/customer-groups",
    detailKey: "customer_group",
    detailPath: (id) => `/admin/customer-groups/${id}`,
    createPage: "/r/customer-groups/create",
    updatePath: (id) => `/admin/customer-groups/${id}`,
    deletePath: (id) => `/admin/customer-groups/${id}`,
    hideView: true,
    columns: [
      { key: "name", label: "Name", sortKey: "name", render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>{row.name}</Link> : <span>{row.name}</span>) },
      { key: "customers", label: "Customers", render: (row) => String(row.customers_count ?? 0) },
      { key: "created_at", label: "Created", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
    ],
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the customer group ${row.name}. This action cannot be undone.`,
      verifyText: row.name,
    }),
    search: true,
    filters: [textFilter("name", "Name"), dateFilter("created_at")],
    customDetail: "customer-group",
  },
  {
    slug: "orders",
    label: "Orders",
    group: "Orders",
    listKey: "orders",
    listPath: "/admin/orders",
    detailKey: "order",
    detailPath: (id) => `/admin/orders/${id}`,
    columns: [
      {
        key: "display_id",
        label: "Order",
        sortKey: "display_id",
        render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>#{row.display_id}</Link> : <span>#{row.display_id}</span>),
      },
      { key: "created_at", label: "Date", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
      { key: "customer", label: "Customer", render: (row) => row.customer_name || row.email || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "sales_channel", label: "Sales Channel", render: (row) => row.sales_channel_name || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "payment_status", label: "Payment", render: (row) => <PaymentStatusCell value={row.payment_status} /> },
      { key: "fulfillment_status", label: "Fulfillment", render: (row) => <FulfillmentStatusCell value={row.fulfillment_status} /> },
      { key: "total", label: "Total", sortKey: "total", render: (row) => fmtMoney(row.total, row.currency_code) },
    ],
    fields: [{ key: "email", label: "Email", type: "text" }],
    search: true,
    noTransfer: false,
    hideView: true,
    filters: [
      selectFilter("status", "Status", ORDER_STATUSES),
      selectFilter("payment_status", "Payment status", PAYMENT_STATUSES),
      // Derived through an EXISTS on fulfillment; "order" has no such column.
      selectFilter("fulfillment_status", "Fulfillment", FULFILLMENT_STATUSES),
      textFilter("email", "Email"),
      selectFilter("customer_id", "Customer", [], {
        loadOptions: CUSTOMER_OPTIONS,
      }),
      selectFilter("sales_channel_id", "Sales channel", [], {
        loadOptions: SALES_CHANNEL_OPTIONS,
      }),
      selectFilter("region_id", "Region", [], { loadOptions: REGION_OPTIONS }),
      dateFilter("created_at"),
      numberFilter("total"),
    ],
    customDetail: "order",
  },
  {
    slug: "claims",
    label: "Claims",
    group: "RMA",
    listKey: "claims",
    listPath: "/admin/claims",
    detailKey: "claim",
    detailPath: (id) => `/admin/claims/${id}`,
    createPath: "/admin/claims",
    deletePath: (id) => `/admin/claims/${id}`,
    columns: [
      { key: "order_id", label: "Order" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "order_id", label: "Order ID", type: "text", required: true },
    ],
    filters: [
      selectFilter("status", "Status", RMA_STATUSES),
      selectFilter("type", "Type", CLAIM_TYPES),
      selectFilter("order_id", "Order", [], { loadOptions: ORDER_OPTIONS }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "exchanges",
    label: "Exchanges",
    group: "RMA",
    listKey: "exchanges",
    listPath: "/admin/exchanges",
    detailKey: "exchange",
    detailPath: (id) => `/admin/exchanges/${id}`,
    createPath: "/admin/exchanges",
    deletePath: (id) => `/admin/exchanges/${id}`,
    columns: [
      { key: "order_id", label: "Order" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "order_id", label: "Order ID", type: "text", required: true },
    ],
    filters: [
      selectFilter("status", "Status", RMA_STATUSES),
      selectFilter("order_id", "Order", [], { loadOptions: ORDER_OPTIONS }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "returns",
    label: "Returns",
    group: "RMA",
    listKey: "returns",
    listPath: "/admin/returns",
    detailKey: "return",
    detailPath: (id) => `/admin/returns/${id}`,
    createPath: "/admin/returns",
    updatePath: (id) => `/admin/returns/${id}`,
    deletePath: (id) => `/admin/returns/${id}`,
    columns: [
      { key: "order_id", label: "Order" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "order_id", label: "Order ID", type: "text", required: true },
    ],
    filters: [
      selectFilter("status", "Status", RETURN_STATUSES),
      selectFilter("order_id", "Order", [], { loadOptions: ORDER_OPTIONS }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "draft-orders",
    label: "Draft Orders",
    group: "Orders",
    listKey: "draft_orders",
    listPath: "/admin/draft-orders",
    detailKey: "draft_order",
    detailPath: (id) => `/admin/draft-orders/${id}`,
    createPath: "/admin/draft-orders",
    createPage: "/r/draft-orders/create",
    updatePath: (id) => `/admin/draft-orders/${id}`,
    deletePath: (id) => `/admin/draft-orders/${id}`,
    columns: [
      {
        key: "display_id",
        label: "Draft",
        sortKey: "display_id",
        render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>#{row.display_id}</Link> : <span>#{row.display_id}</span>),
      },
      { key: "created_at", label: "Date", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
      { key: "customer", label: "Customer", render: (row) => row.customer?.email || row.email || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "status", label: "Status", render: (row) => <OrderStatusCell value={row.status} /> },
      { key: "total", label: "Total", sortKey: "total", render: (row) => fmtMoney(row.total, row.currency_code) },
    ],
    hideView: true,
    fields: [
      { key: "email", label: "Email", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "draft", label: "draft" },
          { value: "confirmed", label: "confirmed" },
        ],
      },
    ],
    filters: [
      selectFilter("status", "Status", DRAFT_ORDER_STATUSES),
      textFilter("email", "Email"),
      selectFilter("customer_id", "Customer", [], {
        loadOptions: CUSTOMER_OPTIONS,
      }),
      selectFilter("sales_channel_id", "Sales channel", [], {
        loadOptions: SALES_CHANNEL_OPTIONS,
      }),
      selectFilter("region_id", "Region", [], { loadOptions: REGION_OPTIONS }),
      dateFilter("created_at"),
      numberFilter("total"),
    ],
    customDetail: "draft-order",
  },
  {
    slug: "promotions",
    label: "Promotions",
    group: "Promotions",
    listKey: "promotions",
    listPath: "/admin/promotions",
    detailKey: "promotion",
    detailPath: (id) => `/admin/promotions/${id}`,
    createPath: "/admin/promotions",
    createPage: "/r/promotions/create",
    updatePath: (id) => `/admin/promotions/${id}`,
    deletePath: (id) => `/admin/promotions/${id}`,
    columns: [
      { key: "code", label: "Code" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "active" },
          { value: "draft", label: "draft" },
        ],
      },
    ],
    filters: [
      textFilter("code", "Code", { help: "Exact match" }),
      selectFilter("status", "Status", PROMOTION_STATUSES),
      // `type` is the dashboard's name for promotion.application_type.
      selectFilter("type", "Type", PROMOTION_TYPES),
      selectFilter("application_target", "Target", PROMOTION_TARGETS),
      boolFilter("is_automatic", "Automatic"),
      selectFilter("campaign_id", "Campaign", [], {
        loadOptions: CAMPAIGN_OPTIONS,
      }),
      dateFilter("created_at"),
    ],
    customDetail: "promotion",
  },
  {
    slug: "campaigns",
    label: "Campaigns",
    group: "Promotions",
    listKey: "campaigns",
    listPath: "/admin/campaigns",
    detailKey: "campaign",
    detailPath: (id) => `/admin/campaigns/${id}`,
    createPath: "/admin/campaigns",
    createPage: "/r/campaigns/create",
    updatePath: (id) => `/admin/campaigns/${id}`,
    deletePath: (id) => `/admin/campaigns/${id}`,
    hideView: true,
    columns: [
      { key: "name", label: "Name", sortKey: "name", render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>{row.name}</Link> : <span>{row.name}</span>) },
      { key: "identifier", label: "Identifier", render: (row) => row.identifier || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "description", label: "Description", render: (row) => row.description || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "starts_at", label: "Start date", sortKey: "starts_at", render: (row) => (row.starts_at ? fmtDate(row.starts_at) : <span style={{ color: "var(--fg-muted)" }}>-</span>) },
      { key: "ends_at", label: "End date", sortKey: "ends_at", render: (row) => (row.ends_at ? fmtDate(row.ends_at) : <span style={{ color: "var(--fg-muted)" }}>-</span>) },
    ],
    fields: [{ key: "name", label: "Name", type: "text" }],
    filters: [
      textFilter("identifier", "Identifier", { help: "Exact match" }),
      textFilter("name", "Name", { help: "Exact match" }),
      dateFilter("created_at"),
    ],
    customDetail: "campaign",
  },
  {
    slug: "price-lists",
    label: "Price Lists",
    group: "Pricing",
    listKey: "price_lists",
    listPath: "/admin/price-lists",
    detailKey: "price_list",
    detailPath: (id) => `/admin/price-lists/${id}`,
    createPath: "/admin/price-lists",
    createPage: "/r/price-lists/create",
    updatePath: (id) => `/admin/price-lists/${id}`,
    deletePath: (id) => `/admin/price-lists/${id}`,
    subtitle: "Create sales or override prices for specific conditions.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    columns: [
      { key: "title", label: "Title", sortKey: "title" },
      {
        key: "status",
        label: "Status",
        sortKey: "status",
        render: (row) => <PriceListStatusCell row={row} />,
      },
      {
        key: "price_overrides",
        label: "Price Overrides",
        render: (row) => <PriceCountCell row={row} />,
      },
    ],
    renderEdit: (row, close, saved) => (
      <EditPriceListDrawer list={row} onClose={close} onSaved={saved} />
    ),
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the price list ${row.title}. This action cannot be undone.`,
    }),
    fields: [
      { key: "name", label: "Name", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "active" },
          { value: "draft", label: "draft" },
        ],
      },
    ],
    // The list endpoint keys the row on `title`, not `name`.
    filters: [
      textFilter("title", "Title", { help: "Exact match" }),
      selectFilter("status", "Status", PROMOTION_STATUSES),
      selectFilter("type", "Type", PRICE_LIST_TYPES),
      dateFilter("created_at"),
      dateFilter("updated_at"),
    ],
    customDetail: "price-list",
  },
  {
    slug: "inventory-items",
    label: "Inventory",
    group: "Inventory",
    listKey: "inventory_items",
    listPath: "/admin/inventory-items",
    detailKey: "inventory_item",
    detailPath: (id) => `/admin/inventory-items/${id}`,
    createPath: "/admin/inventory-items",
    createPage: "/r/inventory-items/create",
    updatePath: (id) => `/admin/inventory-items/${id}`,
    deletePath: (id) => `/admin/inventory-items/${id}`,
    hideView: true,
    columns: [
      { key: "title", label: "Title", render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>{row.title || row.sku}</Link> : <span>{row.title || row.sku}</span>) },
      { key: "sku", label: "SKU", render: (row) => row.sku || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "reserved", label: "Reserved", render: (row) => String((row.location_levels ?? []).reduce((n: number, l: any) => n + Number(l.reserved_quantity ?? 0), 0)) },
      { key: "in_stock", label: "In stock", render: (row) => String((row.location_levels ?? []).reduce((n: number, l: any) => n + Number(l.stocked_quantity ?? 0), 0)) },
    ],
    fields: [
      { key: "sku", label: "SKU", type: "text", required: true },
      { key: "title", label: "Title", type: "text" },
    ],
    search: true,
    // Level quantities live on a nested endpoint, so the level row itself is not
    // filterable here; these are the columns inventory_item actually has.
    filters: [
      textFilter("sku", "SKU", { help: "Exact match" }),
      textFilter("hs_code", "HS code", { help: "Exact match" }),
      // The route lowercases this before comparing, so `US` still works.
      textFilter("origin_country", "Origin country", { help: "ISO-2, e.g. us" }),
      boolFilter("requires_shipping", "Requires shipping"),
      dateFilter("created_at"),
      // Not an inventory_item column: the route resolves it through the
      // inventory_level_location pivot with `= ANY(...)`, so it is a real
      // multi-select ("every item stocked at these two locations").
      multiSelectFilter("location_id", "Location", [], {
        loadOptions: LOCATION_OPTIONS,
      }),
    ],
    customDetail: "inventory",
  },
  {
    slug: "reservations",
    label: "Reservations",
    group: "Inventory",
    listKey: "reservations",
    listPath: "/admin/reservations",
    detailKey: "reservation",
    detailPath: (id) => `/admin/reservations/${id}`,
    createPage: "/r/reservations/create",
    hideView: true,
    columns: [
      { key: "item", label: "Item", render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>{row.inventory_item_sku || row.inventory_item_id}</Link> : <span>{row.inventory_item_sku || row.inventory_item_id}</span>) },
      { key: "description", label: "Description", render: (row) => row.description || <span style={{ color: "var(--fg-muted)" }}>-</span> },
      { key: "created_at", label: "Created", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
      { key: "quantity", label: "Quantity", render: (row) => String(row.quantity ?? 0) },
    ],
    fields: [
      { key: "inventory_item_id", label: "Item ID", type: "text" },
      { key: "location_id", label: "Location ID", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
    ],
    filters: [
      selectFilter("location_id", "Location", [], {
        loadOptions: LOCATION_OPTIONS,
      }),
      selectFilter("inventory_item_id", "Inventory item", [], {
        loadOptions: remoteFilter("/admin/inventory-items"),
      }),
      // RESERVATION_FILTERS compares line_item_id with `=`, so a repeated param
      // would be an array where the route reads a single value.
      textFilter("line_item_id", "Line item", { help: "Exact line item id" }),
      dateFilter("created_at"),
    ],
    customDetail: "reservation",
  },
  {
    slug: "stock-locations",
    label: "Stock Locations",
    group: "Fulfillment",
    listKey: "stock_locations",
    listPath: "/admin/stock-locations",
    detailKey: "stock_location",
    detailPath: (id) => `/admin/stock-locations/${id}`,
    createPath: "/admin/stock-locations",
    createPage: "/settings/stock-locations/create",
    updatePath: (id) => `/admin/stock-locations/${id}`,
    deletePath: (id) => `/admin/stock-locations/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "country_code", label: "Country" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "country_code", label: "Country", type: "text" },
    ],
    filters: [
      textFilter("name", "Name", { help: "Exact match" }),
      // The route lowercases this before comparing, so `US` still works.
      textFilter("country_code", "Country", { help: "ISO-2, e.g. us" }),
      dateFilter("created_at"),
    ],
    customDetail: "stock-location",
  },
  {
    slug: "fulfillment-sets",
    label: "Fulfillment Sets",
    group: "Fulfillment",
    listKey: "fulfillment_sets",
    listPath: "/admin/fulfillment-sets",
    detailKey: "fulfillment_set",
    detailPath: (id) => `/admin/fulfillment-sets/${id}`,
    createPath: "/admin/fulfillment-sets",
    deletePath: (id) => `/admin/fulfillment-sets/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "type", label: "Type", type: "text" },
    ],
  },
  {
    slug: "shipping-options",
    label: "Shipping Options",
    group: "Fulfillment",
    listKey: "shipping_options",
    listPath: "/admin/shipping-options",
    detailKey: "shipping_option",
    detailPath: (id) => `/admin/shipping-options/${id}`,
    createPath: "/admin/shipping-options",
    updatePath: (id) => `/admin/shipping-options/${id}`,
    deletePath: (id) => `/admin/shipping-options/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "provider_id", label: "Provider" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "provider_id", label: "Provider", type: "text" },
    ],
  },
  {
    slug: "shipping-profiles",
    label: "Shipping Profiles",
    group: "Fulfillment",
    listKey: "shipping_profiles",
    listPath: "/admin/shipping-profiles",
    detailKey: "shipping_profile",
    detailPath: (id) => `/admin/shipping-profiles/${id}`,
    createPath: "/admin/shipping-profiles",
    createPage: "/settings/shipping-profiles/create",
    deletePath: (id) => `/admin/shipping-profiles/${id}`,
    subtitle: "Group products with similar shipping requirements into profiles.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    deleteConfirm: (row) => ({
      title: "Delete Shipping Profile",
      description: `You are about to delete the shipping profile ${row.name}. This action cannot be undone.`,
      verifyText: row.name,
    }),
    columns: [
      { key: "name", label: "Name", sortKey: "name" },
      { key: "type", label: "Type", sortKey: "type" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "type", label: "Type", type: "text" },
    ],
    filters: [
      textFilter("name", "Name", { help: "Exact match" }),
      selectFilter("type", "Type", SHIPPING_PROFILE_TYPES),
      dateFilter("created_at"),
      dateFilter("updated_at"),
    ],
    customDetail: "shipping-profile",
  },
  {
    slug: "shipping-option-types",
    label: "Shipping Option Types",
    group: "Fulfillment",
    listKey: "shipping_option_types",
    listPath: "/admin/shipping-option-types",
    detailKey: "shipping_option_type",
    detailPath: (id) => `/admin/shipping-option-types/${id}`,
    createPath: "/admin/shipping-option-types",
    createPage: "/settings/shipping-option-types/create",
    updatePath: (id) => `/admin/shipping-option-types/${id}`,
    deletePath: (id) => `/admin/shipping-option-types/${id}`,
    subtitle: "Organize your shipping options into types.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    columns: [
      { key: "label", label: "Label", sortKey: "label" },
      { key: "code", label: "Code", sortKey: "code" },
      { key: "description", label: "Description", sortKey: "description" },
    ],
    fields: [
      { key: "label", label: "Label", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text" },
    ],
    renderEdit: (row, close, saved) => <EditShippingOptionTypeDrawer type={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the shipping option type "${row.label}". This action cannot be undone.`,
    }),
    filters: [
      textFilter("label", "Label", { help: "Exact match" }),
      textFilter("code", "Code", { help: "Exact match" }),
      dateFilter("created_at"),
      dateFilter("updated_at"),
    ],
    customDetail: "shipping-option-type",
  },
  {
    slug: "tax-regions",
    label: "Tax Regions",
    group: "Tax",
    listKey: "tax_regions",
    listPath: "/admin/tax-regions",
    detailKey: "tax_region",
    detailPath: (id) => `/admin/tax-regions/${id}`,
    createPath: "/admin/tax-regions",
    createPage: "/settings/tax-regions/create",
    updatePath: (id) => `/admin/tax-regions/${id}`,
    deletePath: (id) => `/admin/tax-regions/${id}`,
    columns: [
      { key: "country_code", label: "Country" },
      { key: "name", label: "Name" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "country_code", label: "Country", type: "select", required: true },
      {
        key: "provider_id",
        label: "Tax provider",
        type: "select",
        required: true,
      },
      { key: "name", label: "Name", type: "text", required: false },
      { key: "code", label: "Code", type: "text", required: false },
      { key: "rate", label: "Rate", type: "number", required: false },
    ],
    filters: [
      textFilter("country_code", "Country", { help: "ISO-2, e.g. us" }),
      textFilter("province_code", "Province", { help: "e.g. ca" }),
      textFilter("provider_id", "Provider", { help: "Exact match" }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "tax-rates",
    label: "Tax Rates",
    group: "Tax",
    listKey: "tax_rates",
    listPath: "/admin/tax-rates",
    detailKey: "tax_rate",
    detailPath: (id) => `/admin/tax-rates/${id}`,
    createPath: "/admin/tax-rates",
    createPage: "/settings/tax-rates/create",
    updatePath: (id) => `/admin/tax-rates/${id}`,
    deletePath: (id) => `/admin/tax-rates/${id}`,
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "rate", label: "Rate" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "rate", label: "Rate", type: "number" },
      { key: "is_default", label: "Default", type: "checkbox" },
      { key: "is_combinable", label: "Combinable", type: "checkbox" },
    ],
    filters: [
      textFilter("code", "Code", { help: "Exact match" }),
      textFilter("name", "Name", { help: "Exact match" }),
      multiSelectFilter("tax_region_id", "Tax region", [], {
        loadOptions: TAX_REGION_OPTIONS,
      }),
      boolFilter("is_default", "Default"),
      boolFilter("is_combinable", "Combinable"),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "sales-channels",
    label: "Sales Channels",
    group: "Channels",
    listKey: "sales_channels",
    listPath: "/admin/sales-channels",
    detailKey: "sales_channel",
    detailPath: (id) => `/admin/sales-channels/${id}`,
    createPath: "/admin/sales-channels",
    createPage: "/settings/sales-channels/create",
    updatePath: (id) => `/admin/sales-channels/${id}`,
    deletePath: (id) => `/admin/sales-channels/${id}`,
    subtitle: "Control which products are available in which channels.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    columns: [
      { key: "name", label: "Name", sortKey: "name" },
      { key: "description", label: "Description" },
      {
        key: "is_disabled",
        label: "Status",
        render: (row) => <StatusCell color={row.is_disabled ? "grey" : "green"}>{row.is_disabled ? "Disabled" : "Enabled"}</StatusCell>,
      },
    ],
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
    renderEdit: (row, close, saved) => <EditSalesChannelDrawer channel={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the sales channel ${row.name}. This action cannot be undone.`,
      verifyText: row.name,
    }),
    filters: [
      textFilter("name", "Name"),
      boolFilter("is_disabled", "Disabled"),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "users",
    label: "Users",
    group: "Team",
    listKey: "users",
    listPath: "/admin/users",
    detailKey: "user",
    detailPath: (id) => `/admin/users/${id}`,
    createLabel: "Invite",
    createPage: "/settings/users/invite",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    renderEdit: (row, close, saved) => <EditUserDrawer user={row} onClose={close} onSaved={saved} />,
    updatePath: (id) => `/admin/users/${id}`,
    columns: [
      { key: "email", label: "Email" },
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
    ],
    fields: [
      { key: "email", label: "Email", type: "text" },
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
    ],
    search: true,
    // first_name / last_name are reachable through ?q only, so they are not
    // offered as their own filters.
    filters: [dateFilter("created_at")],
  },
  {
    slug: "invites",
    label: "Invites",
    group: "Team",
    listKey: "invites",
    listPath: "/admin/invites",
    detailKey: "invite",
    detailPath: (id) => `/admin/invites/${id}`,
    createPath: "/admin/invites",
    deletePath: (id) => `/admin/invites/${id}`,
    columns: [
      { key: "email", label: "Email" },
      { key: "accepted", label: "Accepted" },
      { key: "id", label: "ID" },
    ],
    fields: [{ key: "email", label: "Email", type: "text", required: true }],
    filters: [
      textFilter("email", "Email"),
      boolFilter("accepted", "Accepted"),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "rbac-roles",
    label: "Roles",
    group: "Team",
    listKey: "roles",
    listPath: "/admin/rbac/roles",
    detailKey: "role",
    detailPath: (id) => `/admin/rbac/roles/${id}`,
    createPath: "/admin/rbac/roles",
    createPage: "/settings/rbac-roles/create",
    updatePath: (id) => `/admin/rbac/roles/${id}`,
    deletePath: (id) => `/admin/rbac/roles/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "id", label: "ID" },
    ],
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "rbac-policies",
    label: "Policies",
    group: "Team",
    listKey: "policies",
    listPath: "/admin/rbac/policies",
    detailKey: "policy",
    detailPath: (id) => `/admin/rbac/policies/${id}`,
    createPath: "/admin/rbac/policies",
    updatePath: (id) => `/admin/rbac/policies/${id}`,
    deletePath: (id) => `/admin/rbac/policies/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    slug: "refund-reasons",
    label: "Refund Reasons",
    group: "Payments",
    listKey: "refund_reasons",
    listPath: "/admin/refund-reasons",
    createPath: "/admin/refund-reasons",
    createPage: "/settings/refund-reasons/create",
    updatePath: (id) => `/admin/refund-reasons/${id}`,
    deletePath: (id) => `/admin/refund-reasons/${id}`,
    subtitle: "Manage reasons for refunds.",
    noTransfer: true,
    noSelect: true,
    search: true,
    columns: [
      { key: "label", label: "Label", sortKey: "label" },
      { key: "code", label: "Code", sortKey: "code" },
      { key: "description", label: "Description" },
    ],
    fields: [
      { key: "label", label: "Label", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
    renderEdit: (row, close, saved) => <EditRefundReasonDrawer reason={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the refund reason ${row.label}. This action cannot be undone.`,
    }),
    filters: [textFilter("label", "Label"), textFilter("code", "Code", { help: "Exact match" }), dateFilter("created_at"), dateFilter("updated_at")],
  },
  {
    slug: "return-reasons",
    label: "Return Reasons",
    group: "Payments",
    listKey: "return_reasons",
    listPath: "/admin/return-reasons",
    createPath: "/admin/return-reasons",
    createPage: "/settings/return-reasons/create",
    updatePath: (id) => `/admin/return-reasons/${id}`,
    deletePath: (id) => `/admin/return-reasons/${id}`,
    subtitle: "Manage reasons for returned items.",
    noTransfer: true,
    noSelect: true,
    search: true,
    columns: [
      { key: "label", label: "Label", sortKey: "label" },
      { key: "value", label: "Value", sortKey: "value" },
      { key: "description", label: "Description" },
    ],
    fields: [
      { key: "value", label: "Value", type: "text", required: true },
      { key: "label", label: "Label", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
    renderEdit: (row, close, saved) => <EditReturnReasonDrawer reason={row} onClose={close} onSaved={saved} />,
    deleteConfirm: (row) => ({
      title: "Are you sure?",
      description: `You are about to delete the return reason ${row.label}. This action cannot be undone.`,
    }),
    filters: [textFilter("label", "Label"), textFilter("value", "Value", { help: "Exact match" }), dateFilter("created_at"), dateFilter("updated_at")],
  },
  {
    slug: "payment-collections",
    label: "Payment Collections",
    group: "Payments",
    listKey: "payment_collections",
    listPath: "/admin/payment-collections",
    detailKey: "payment_collection",
    detailPath: (id) => `/admin/payment-collections/${id}`,
    createPath: "/admin/payment-collections",
    createPage: "/settings/payment-collections/create",
    deletePath: (id) => `/admin/payment-collections/${id}`,
    columns: [
      { key: "currency_code", label: "Currency" },
      { key: "amount", label: "Amount" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "currency_code", label: "Currency", type: "text", required: true },
      { key: "amount", label: "Amount", type: "number", required: true },
    ],
    filters: [
      selectFilter(
        "status",
        "Status",
        PAYMENT_STATUSES,
      ),
      textFilter("currency_code", "Currency", { help: "ISO code, e.g. usd" }),
      dateFilter("created_at"),
    ],
  },
  {
    slug: "payments",
    label: "Payments",
    group: "Payments",
    listKey: "payments",
    listPath: "/admin/payments",
    columns: [
      { key: "provider_id", label: "Provider" },
      { key: "amount", label: "Amount" },
      { key: "id", label: "ID" },
    ],
    fields: [],
  },
  {
    slug: "uploads",
    label: "Files",
    group: "Settings",
    listKey: "files",
    listPath: "/admin/uploads",
    detailKey: "file",
    detailPath: (id) => `/admin/uploads/${id}`,
    createPath: "/admin/uploads",
    deletePath: (id) => `/admin/uploads/${id}`,
    columns: [
      { key: "filename", label: "Filename" },
      { key: "url", label: "URL" },
      { key: "id", label: "ID" },
    ],
    fields: [{ key: "file", label: "File", type: "file", required: true }],
  },
  {
    slug: "api-keys",
    label: "API Keys",
    group: "Settings",
    listKey: "api_keys",
    listPath: "/admin/api-keys",
    detailKey: "api_key",
    detailPath: (id) => `/admin/api-keys/${id}`,
    createPath: "/admin/api-keys",
    updatePath: (id) => `/admin/api-keys/${id}`,
    deletePath: (id) => `/admin/api-keys/${id}`,
    columns: [
      { key: "title", label: "Title" },
      { key: "type", label: "Type" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "publishable", label: "publishable" },
          { value: "secret", label: "secret" },
        ],
      },
    ],
    // `type` is the one non-paging param the list route reads; the vocabulary
    // comes from the create schema (z.enum(["publishable","secret"])).
    filters: [selectFilter("type", "Type", options("publishable", "secret"))],
  },
  {
    slug: "notifications",
    label: "Notifications",
    group: "Settings",
    listKey: "notifications",
    listPath: "/admin/notifications",
    columns: [
      { key: "to_address", label: "To" },
      { key: "channel", label: "Channel" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ],
    fields: [],
  },
  {
    slug: "workflows",
    label: "Workflows",
    group: "System",
    listKey: "workflow_executions",
    listPath: "/admin/workflows-executions",
    detailKey: "workflow_execution",
    detailPath: (id) => `/admin/workflows-executions/${id}`,
    subtitle: "View and manage the workflow executions of your store.",
    noTransfer: true,
    noSelect: true,
    hideView: true,
    search: true,
    columns: [
      { key: "workflow_id", label: "Workflow ID", render: (row, ctx) => (ctx.to ? <Link to={ctx.to} style={{ textDecoration: "none" }}><IdBadge value={row.workflow_id} /></Link> : <IdBadge value={row.workflow_id} />) },
      { key: "transaction_id", label: "Transaction ID", render: (row) => <IdBadge value={row.transaction_id} /> },
      { key: "state", label: "State", render: (row) => <WorkflowStateCell row={row} /> },
      { key: "progress", label: "Progress", render: (row) => <ProgressCell row={row} /> },
      { key: "created_at", label: "Created", sortKey: "created_at", render: (row) => fmtDate(row.created_at) },
    ],
    fields: [],
    filters: [
      textFilter("workflow_id", "Workflow ID", { help: "Exact workflow id" }),
      multiSelectFilter("state", "State", csvOptions("not_started,invoking,waiting_to_compensate,compensating,done,reverted,failed")),
      dateFilter("created_at"),
    ],
    customDetail: "workflow-execution",
  },
  {
    slug: "events",
    label: "Events",
    group: "System",
    listKey: "events",
    listPath: "/admin/events",
    columns: [
      { key: "name", label: "Event" },
      { key: "created_at", label: "At" },
      { key: "id", label: "ID" },
    ],
    fields: [],
  },
  {
    slug: "property-labels",
    label: "Property Labels",
    group: "Settings",
    listKey: "property_labels",
    listPath: "/admin/property-labels",
    columns: [
      { key: "entity", label: "Entity" },
      { key: "property", label: "Property" },
      { key: "label", label: "Label" },
      { key: "id", label: "ID" },
    ],
    fields: [
      { key: "entity", label: "Entity", type: "text" },
      { key: "property", label: "Property", type: "text" },
    ],
  },
  {
    slug: "translations",
    label: "Translations",
    group: "Settings",
    listKey: "translations",
    listPath: "/admin/translations",
    columns: [
      { key: "reference", label: "Reference" },
      { key: "reference_id", label: "Ref ID" },
      { key: "locale_code", label: "Locale" },
      { key: "id", label: "ID" },
    ],
    fields: [],
    // `reference_id` is deliberately absent: it is the id of whichever entity
    // `reference` names, so there is no single endpoint to load options from.
    // Both of these are matched with `= ANY($1)`, but a typed value is honest
    // here: /admin/locales accepts no `q`, so a remote picker could not search.
    filters: [
      textFilter("reference", "Reference", { help: "Exact entity, e.g. product" }),
      textFilter("locale_code", "Locale", { help: "ISO code, e.g. en" }),
    ],
  },
  {
    slug: "views",
    label: "Views",
    group: "Settings",
    listKey: "views",
    listPath: "/admin/views",
    columns: [
      { key: "name", label: "Name" },
      { key: "id", label: "ID" },
    ],
    fields: [],
  },
];

export const RESOURCE_GROUPS = [
  "Catalog",
  "Catalog",
  "Settings",
  "Customers",
  "Orders",
  "RMA",
  "Promotions",
  "Pricing",
  "Inventory",
  "Fulfillment",
  "Tax",
  "Channels",
  "Team",
  "Payments",
  "System",
] as string[];

// Lupus settings URLs differ from some resource slugs; both resolve to the same resource.
const SLUG_ALIASES: Record<string, string> = {
  tags: "product-tags",
  "workflow-executions": "workflows",
  roles: "rbac-roles",
  policies: "rbac-policies",
  locations: "stock-locations",
};

export function getResource(slug: string): Resource | undefined {
  const wanted = SLUG_ALIASES[slug] ?? slug;
  return RESOURCES.find((r) => r.slug === wanted);
}

export const RESOURCE_GROUPS_SET = [...new Set(RESOURCE_GROUPS)];
