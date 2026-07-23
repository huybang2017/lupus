// Admin dashboard (static, no build step) backed by lupus-backend admin APIs.
// Covers every resource group read-only by default, with create forms for the most
// common writes. It is an ops console, not a port of the React dashboard
// (upstream/packages/admin, ~1947 files).
let token = localStorage.getItem("lupus_token") || "";

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    const r = await api("/admin/users/register", { method: "POST", body: JSON.stringify({ email, password }) });
    token = r.token;
  } catch (e) {
    const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    token = r.token;
  }
  localStorage.setItem("lupus_token", token);
  document.getElementById("who").textContent = email;
  show("products");
}

function table(rows, cols) {
  if (!rows.length) return "<p>Empty</p>";
  return "<table><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr>" +
    rows.map((r) => "<tr>" + cols.map((c) => {
      const v = r[c];
      const s = v == null ? "" : (typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v));
      return `<td title="${s.replace(/"/g, "&quot;")}">${s.slice(0, 60)}</td>`;
    }).join("") + "</tr>").join("") + "</table>";
}

// resourceKey -> [endpoint, idField, columns]
const RESOURCES = {
  products: ["/store/products?limit=50", "products", ["id", "title", "handle", "status"]],
  orders: ["/admin/orders", "orders", ["id", "email", "currency_code", "status", "total", "payment_status"]],
  customers: ["/admin/customers", "customers", ["id", "email", "first_name", "last_name"]],
  promotions: ["/admin/promotions", "promotions", ["id", "code", "application_type", "status", "usage_count"]],
  campaigns: ["/admin/campaigns", "campaigns", ["id", "name", "usage_count", "budget_used", "budget_limit"]],
  price_lists: ["/admin/price-lists", "price_lists", ["id", "title", "type", "status"]],
  regions: ["/store/regions", "regions", ["id", "name", "currency_code"]],
  shipping_options: ["/admin/shipping-options", "shipping_options", ["id", "name", "amount", "currency_code", "provider_id"]],
  fulfillment_sets: ["/admin/fulfillment-sets", "fulfillment_sets", ["id", "name", "type"]],
  stock_locations: ["/admin/stock-locations", null, null],
  sales_channels: ["/store/sales-channels", "sales_channels", ["id", "name"]],
  inventory: [null, null, null],
  returns: ["/admin/returns", "returns", ["id", "order_id", "status", "refund_amount", "refunded"]],
  gift_cards: [null, null, null],
  draft_orders: ["/admin/orders?limit=50", "orders", ["id", "email", "status", "total", "is_draft_order"]],
  users: [null, null, null],
  invites: [null, null, null],
  api_keys: [null, null, null],
  notifications: ["/admin/notifications", "notifications", ["id", "to_address", "channel", "template", "status"]],
  templates: ["/admin/notification-templates", "templates", ["event_name", "channel", "is_enabled"]],
  files: ["/admin/files", "files", ["id", "filename", "url", "provider_id"]],
  currencies: ["/store/currencies", "currencies", ["code", "symbol", "name"]],
  translations: [null, null, null],
  categories: ["/store/product-categories", "product_categories", ["id", "name", "handle"]],
  collections: ["/admin/collections", "collections", ["id", "title", "handle"]],
  tags: ["/admin/product-tags", "product_tags", ["id", "value"]],
  types: ["/admin/product-types", "product_types", ["id", "value"]],
  groups: [null, null, null],
  payments: ["/admin/payment-collections", "payment_collections", ["id", "currency_code", "amount", "status"]],
  events: ["/admin/events?limit=50", "events", ["name", "created_at"]],
  workflows: ["/admin/workflows/executions?limit=50", "executions", ["workflow_id", "status", "created_at"]],
  flags: ["/admin/feature-flags", "feature_flags", ["key", "is_enabled"]],
  views: ["/admin/views", "views", ["id", "name"]],
  analytics: ["/admin/analytics/top-products", "products", ["title", "qty", "revenue"]],
};

function navButtons() {
  return Object.keys(RESOURCES).map((k) => `<button onclick="show('${k}')">${k.replace(/_/g, " ")}</button>`).join("");
}
document.querySelector("nav").innerHTML = navButtons();

async function show(kind) {
  const out = document.getElementById("out");
  out.innerHTML = "<p>Loading...</p>";
  try {
    const [endpoint, field, cols] = RESOURCES[kind];
    if (!endpoint) {
      out.innerHTML = "<p>Use the API directly for this resource (see README). Endpoints: " + kind + "</p>";
      return;
    }
    const data = await api(endpoint);
    const rows = data[field] || data.hits || [];
    let html = table(rows, cols);
    if (kind === "products") {
      html += `<h3>Create product</h3><input id="np-title" placeholder="title" /><button onclick="createProduct()">Create</button><div id="msg"></div>`;
    } else if (kind === "promotions") {
      html += `<h3>Create promotion</h3><input id="np-code" placeholder="CODE" /><input id="np-value" placeholder="value" type="number" /><button onclick="createPromo()">Create 10% order promo</button><div id="msg"></div>`;
    } else if (kind === "orders") {
      html += `<h3>Order summary</h3><input id="np-order" placeholder="order id" /><button onclick="orderSummary()">View</button><div id="msg"></div>`;
    }
    out.innerHTML = html;
  } catch (e) {
    out.innerHTML = "<pre>" + (e.message || e) + "</pre>";
  }
}

async function createProduct() {
  const title = document.getElementById("np-title").value;
  try {
    const r = await api("/admin/products", { method: "POST", body: JSON.stringify({ title, status: "draft" }) });
    document.getElementById("msg").textContent = "Created " + r.product.id;
    show("products");
  } catch (e) { document.getElementById("msg").textContent = e.message; }
}

async function createPromo() {
  const code = document.getElementById("np-code").value || "SAVE10";
  const value = Number(document.getElementById("np-value").value || 10);
  try {
    const r = await api("/admin/promotions", { method: "POST", body: JSON.stringify({ code, application_type: "percentage", application_target: "order", application_allocation: "across", application_value: value }) });
    document.getElementById("msg").textContent = "Created " + r.promotion.id;
    show("promotions");
  } catch (e) { document.getElementById("msg").textContent = e.message; }
}

async function orderSummary() {
  const id = document.getElementById("np-order").value;
  try {
    const r = await api(`/admin/orders/${id}/summary`);
    document.getElementById("msg").innerHTML = "<pre>" + JSON.stringify(r, null, 1).slice(0, 4000) + "</pre>";
  } catch (e) { document.getElementById("msg").textContent = e.message; }
}
