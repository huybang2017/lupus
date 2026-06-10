import { readFile } from "fs/promises"
import { pool } from "../server/src/db"

const FILES = [
  "src/db/schema.sql",
  "src/db/schema-auth-customer-region.sql",
  "src/db/schema-cart.sql",
  "src/db/schema-order-payment.sql",
  "src/db/schema-pricing-promotion-tax.sql",
  "src/db/schema-cart-totals-patch.sql",
  "src/db/schema-order-totals-patch.sql",
  "src/db/schema-fulfillment-returns.sql",
  "src/db/schema-fulfillment-patch.sql",
  "src/db/schema-channels-locations.sql",
  "src/db/schema-groups-giftcard-draft.sql",
  "src/db/schema-admin-store-notif.sql",
  "src/db/schema-infra.sql",
  "src/db/schema-missing.sql",
  "src/db/schema-p1-catalog.sql",
  "src/db/schema-p2-pricing.sql",
  "src/db/schema-p3-promo.sql",
  "src/db/schema-p4-rma.sql",
  "src/db/schema-p5-fulfillment.sql",
  "src/db/schema-p6-tax.sql",
  "src/db/schema-p6b-address.sql",
  "src/db/schema-p7-auth.sql",
  "src/db/schema-p8-order.sql",
  "src/db/schema-p9-platform.sql",
  "src/db/schema-p10-lupus-auth.sql",
]

let base = ""
let pass = 0
let fail = 0
const failures: string[] = []

async function api(method: string, path: string, body?: any, token?: string) {
  const headers: any = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++
    console.log(`ok - ${name}`)
  } else {
    fail++
    failures.push(name)
    console.log(`FAIL - ${name}${extra ? " :: " + extra : ""}`)
  }
}

function envelope(json: any, key: string): boolean {
  return !!json && Array.isArray(json[key]) && typeof json.count === "number" && typeof json.offset === "number" && typeof json.limit === "number"
}

async function main() {
  for (const f of FILES) {
    await pool.query(await readFile("server/" + f, "utf8")).catch((e: any) => {
      if (!String(e?.message ?? "").includes("already exists")) throw e
    })
  }
  await pool.query("UPDATE promotion SET status='draft' WHERE is_automatic=TRUE").catch(() => undefined)
  const { buildApp } = await import("../server/src/app")
  const server = buildApp().listen(0)
  await new Promise<void>((r) => server.once("listening", () => r()))
  base = `http://127.0.0.1:${(server.address() as any).port}`
  const T = Date.now()
  const email = `smoke-${T}@example.com`

  // --- auth ---
  let r = await api("GET", "/auth/user/providers")
  check("providers list emailpass", r.status === 200 && r.json.providers?.some((p: any) => p.id === "emailpass"), r.text)
  r = await api("POST", "/auth/user/emailpass/register", { email, password: "smoke-pass-1", first_name: "Smoke" })
  check("register admin", r.status === 200 && typeof r.json.token === "string", r.text?.slice(0, 200))
  const token = r.json.token
  // grant super-admin like the sibling app's CLI would (fresh-install bootstrap covers
  // only the very first admin; smoke uses a shared DB)
  await pool.query(
    `INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`
  ).then(async (role) => {
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }
  })
  r = await api("POST", "/auth/user/emailpass", { email, password: "smoke-pass-1" })
  check("login emailpass", r.status === 200 && typeof r.json.token === "string", r.text?.slice(0, 200))
  const loginToken: string = r.json.token
  r = await api("GET", "/admin/users/me", undefined, loginToken)
  check("users/me", r.status === 200 && r.json.user?.email === email, r.text?.slice(0, 200))
  r = await api("POST", "/auth/token/refresh", undefined, loginToken)
  check("token refresh", r.status === 200 && typeof r.json.token === "string", r.text?.slice(0, 200))

  // --- catalog ---
  r = await api("POST", "/admin/products", { title: `Smoke ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 1000 }] }] }, loginToken)
  check("create product", (r.status === 200 || r.status === 201) && !!r.json.product?.id, r.text?.slice(0, 200))
  const pid: string = r.json.product?.id
  r = await api("GET", "/admin/products?limit=5", undefined, loginToken)
  check("products list envelope", r.status === 200 && envelope(r.json, "products"), r.text?.slice(0, 200))
  if (pid) {
    r = await api("GET", `/admin/products/${pid}`, undefined, loginToken)
    check("product retrieve w/ variants", r.status === 200 && Array.isArray(r.json.product?.variants), r.text?.slice(0, 200))
  }
  r = await api("GET", "/admin/product-options?limit=5", undefined, loginToken)
  check("product-options envelope", r.status === 200 && envelope(r.json, "product_options"), r.text?.slice(0, 200))
  r = await api("GET", "/admin/product-variants?limit=5", undefined, loginToken)
  check("variants envelope", r.status === 200 && envelope(r.json, "variants"), r.text?.slice(0, 200))

  // --- orders / customers / misc lists ---
  for (const [name, path, key] of [
    ["orders envelope", "/admin/orders?limit=5", "orders"],
    ["customers envelope", "/admin/customers?limit=5", "customers"],
    ["customer-groups envelope", "/admin/customer-groups?limit=5", "customer_groups"],
    ["regions envelope", "/admin/regions?limit=5", "regions"],
    ["promotions envelope", "/admin/promotions?limit=5", "promotions"],
    ["campaigns envelope", "/admin/campaigns?limit=5", "campaigns"],
    ["price-lists envelope", "/admin/price-lists?limit=5", "price_lists"],
    ["stock-locations envelope", "/admin/stock-locations?limit=5", "stock_locations"],
    ["inventory envelope", "/admin/inventory-items?limit=5", "inventory_items"],
    ["reservations envelope", "/admin/reservations?limit=5", "reservations"],
    ["tax-regions envelope", "/admin/tax-regions?limit=5", "tax_regions"],
    ["tax-rates envelope", "/admin/tax-rates?limit=5", "tax_rates"],
    ["sales-channels envelope", "/admin/sales-channels?limit=5", "sales_channels"],
    ["api-keys envelope", "/admin/api-keys?limit=5", "api_keys"],
    ["users envelope", "/admin/users?limit=5", "users"],
    ["invites envelope", "/admin/invites?limit=5", "invites"],
    ["currencies envelope", "/admin/currencies?limit=20", "currencies"],
    ["locales envelope", "/admin/locales", "locales"],
    ["notifications list", "/admin/notifications?limit=5", "notifications"],
    ["claims envelope", "/admin/claims?limit=5", "claims"],
    ["exchanges envelope", "/admin/exchanges?limit=5", "exchanges"],
    ["returns envelope", "/admin/returns?limit=5", "returns"],
    ["draft-orders envelope", "/admin/draft-orders?limit=5", "draft_orders"],
    ["payment-collections envelope", "/admin/payment-collections?limit=5", "payment_collections"],
    ["shipping-options envelope", "/admin/shipping-options?limit=5", "shipping_options"],
    ["shipping-profiles envelope", "/admin/shipping-profiles?limit=5", "shipping_profiles"],
    ["fulfillment-sets envelope", "/admin/fulfillment-sets?limit=5", "fulfillment_sets"],
    ["price-preferences envelope", "/admin/price-preferences?limit=5", "price_preferences"],
    ["draft-orders envelope", "/admin/draft-orders?limit=5", "draft_orders"],
    ["uploads envelope", "/admin/uploads?limit=5", "files"],
    ["payments envelope", "/admin/payments?limit=5", "payments"],
    ["refund-reasons envelope", "/admin/refund-reasons?limit=5", "refund_reasons"],
    ["return-reasons envelope", "/admin/return-reasons?limit=5", "return_reasons"],
    ["workflow executions", "/admin/workflows-executions?limit=5", "workflow_executions"],
  ] as [string, string, string][]) {
    r = await api("GET", path, undefined, loginToken)
    check(name, r.status === 200 && envelope(r.json, key), `${r.status} ${r.text?.slice(0, 160)}`)
  }

  // --- creates across domains ---
  r = await api("POST", "/admin/customers", { email: `c-${T}@example.com`, first_name: "C" }, loginToken)
  check("create customer", (r.status === 200 || r.status === 201) && !!r.json.customer?.id, r.text?.slice(0, 200))
  r = await api("POST", "/admin/regions", { name: `R${T}`, currency_code: "usd", countries: ["us"] }, loginToken)
  check("create region", (r.status === 200 || r.status === 201) && !!(r.json.region?.id ?? r.json.region), r.text?.slice(0, 200))
  r = await api("POST", "/admin/tax-regions", { country_code: "de", default_tax_rate: { code: `SMOKE${T}`, name: "Smoke", rate: 19 } }, loginToken)
  check("create tax-region lupus shape", r.status === 201 && !!r.json.tax_region?.id, r.text?.slice(0, 200))
  r = await api("GET", "/admin/stores", undefined, loginToken)
  check("stores list", r.status === 200 && Array.isArray(r.json.stores), r.text?.slice(0, 200))
  r = await api("GET", "/admin/rbac/me/permissions", undefined, loginToken)
  check("rbac me permissions", r.status === 200, r.text?.slice(0, 200))
  r = await api("GET", "/admin/views/entities", undefined, loginToken)
  check("views entities", r.status === 200, r.text?.slice(0, 200))
  r = await api("GET", "/admin/payments/payment-providers", undefined, loginToken)
  check("payment providers", r.status === 200, r.text?.slice(0, 200))
  r = await api("GET", "/admin/workflows-executions?limit=5", undefined, loginToken)
  check("workflow executions", r.status === 200, r.text?.slice(0, 200))

  // --- dashboard static ---
  const html = await fetch(`${base}/app/`).then((x) => x.text())
  check("dashboard html served", html.includes("/app/assets/") && html.includes("root"), html.slice(0, 120))
  const spa = await fetch(`${base}/app/orders`, { headers: { accept: "text/html" } }).then((x) => x.text())
  check("spa fallback", spa.includes("root"), spa.slice(0, 120))

  console.log(`\nSMOKE: ${pass} pass, ${fail} fail`)
  if (failures.length) console.log("FAILURES:\n- " + failures.join("\n- "))
  server.close()
  await pool.end()
  process.exit(fail > 0 ? 1 : 0)
}
main().catch((e) => {
  console.log("FATAL", e)
  process.exit(1)
})
