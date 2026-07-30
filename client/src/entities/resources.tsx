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
