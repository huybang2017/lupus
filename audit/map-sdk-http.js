// Map every sdk.admin.* / sdk.auth.* method used by the dashboard to its HTTP method+path
// by parsing the upstream checkout's js-sdk sources.
// The clone stays behind in the old monorepo and is not part of this project; point
// LUPUS_UPSTREAM_ROOT at it, e.g.
//   LUPUS_UPSTREAM_ROOT=C:/Users/ndhba/Documents/lupus node audit/map-sdk-http.js
const fs = require("fs")
const path = require("path")

const upstreamRoot = process.env.LUPUS_UPSTREAM_ROOT
if (!upstreamRoot) {
  console.error("LUPUS_UPSTREAM_ROOT is not set. It must point at the upstream checkout (the directory holding packages/).")
  process.exit(1)
}

const sdkRoot = path.join(upstreamRoot, "packages/core/js-sdk/src")
const dashboardCalls = fs
  .readFileSync("audit/dashboard-sdk-calls.txt", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.replace(/ x\d+$/, ""))
  .filter((l) => !l.startsWith("RAW "))

// Parse each admin resource file: class methods -> fetch(path, { method })
function parseResource(file, resourceKey) {
  const src = fs.readFileSync(file, "utf8")
  const methods = new Map() // methodName -> { http, path }

  // Match both `methodName = async (...) => {` fields and `async methodName(...) {`
  // and capture the fetch call that follows within the method body (naive but works for js-sdk style)
  const methodRegex =
    /(?:^|\n)\s{2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*(?:=\s*async\s*)?(?:\(|\s*=\s*async\s*\()/g
  // Simpler: split on top-level method-ish boundaries by finding fetch calls and walking backwards to nearest method name
  const fetchRegex = /this\.client\.fetch(?:<[^>]*>)?\(\s*`([^`]+)`|this\.client\.fetch(?:<[^>]*>)?\(\s*'([^']+)'|this\.client\.fetch(?:<[^>]*>)?\(\s*"([^"]+)"/g
  const positions = []
  let fm
  while ((fm = fetchRegex.exec(src))) {
    const path = fm[1] || fm[2] || fm[3]
    // method: look ahead ~300 chars for method: "XXX"
    const after = src.slice(fetchRegex.lastIndex, fetchRegex.lastIndex + 400)
    const methMatch = after.match(/method:\s*"([A-Z]+)"/)
    const http = methMatch ? methMatch[1] : "GET"
    // method name: walk back to nearest `name = async` or `async name(` at indent 2
    const before = src.slice(0, fm.index)
    const nameMatches = [...before.matchAll(/(?:^|\n)  (?:async\s+)?([a-zA-Z_$][\w$]*)\s*(?:=\s*async\s*)?\(/g)]
    const name = nameMatches.length ? nameMatches[nameMatches.length - 1][1] : "?"
    positions.push({ name, http, path })
  }
  for (const p of positions) methods.set(p.name, p)
  return methods
}

const resourceFiles = {
  product: "admin/product.ts",
  productVariant: "admin/product-variant.ts",
  productOption: "admin/product-option.ts",
  productCategory: "admin/product-category.ts",
  productCollection: "admin/product-collection.ts",
  productTag: "admin/product-tag.ts",
  productType: "admin/product-type.ts",
  priceList: "admin/price-list.ts",
  pricePreference: "admin/price-preference.ts",
  promotion: "admin/promotion.ts",
  campaign: "admin/campaign.ts",
  order: "admin/order.ts",
  orderEdit: "admin/order-edit.ts",
  return: "admin/return.ts",
  returnReason: "admin/return-reason.ts",
  claim: "admin/claim.ts",
  exchange: "admin/exchange.ts",
  draftOrder: "admin/draft-order.ts",
  payment: "admin/payment.ts",
  paymentCollection: "admin/payment-collection.ts",
  refundReasons: "admin/refund-reasons.ts",
  customer: "admin/customer.ts",
  customerGroup: "admin/customer-group.ts",
  user: "admin/user.ts",
  invite: "admin/invite.ts",
  rbacRole: "admin/rbac-role.ts",
  rbacPolicy: "admin/rbac-policy.ts",
  region: "admin/region.ts",
  stockLocation: "admin/stock-location.ts",
  fulfillment: "admin/fulfillment.ts",
  fulfillmentSet: "admin/fulfillment-set.ts",
  fulfillmentProvider: "admin/fulfillment-provider.ts",
  shippingOption: "admin/shipping-option.ts",
  shippingOptionType: "admin/shipping-option-type.ts",
  shippingProfile: "admin/shipping-profile.ts",
  inventoryItem: "admin/inventory-item.ts",
  reservation: "admin/reservation.ts",
  taxRate: "admin/tax-rate.ts",
  taxRegion: "admin/tax-region.ts",
  taxProvider: "admin/tax-provider.ts",
  apiKey: "admin/api-key.ts",
  salesChannel: "admin/sales-channel.ts",
  store: "admin/store.ts",
  currency: "admin/currency.ts",
  notification: "admin/notification.ts",
  upload: "admin/upload.ts",
  locale: "admin/locale.ts",
  views: "admin/views.ts",
  layouts: "admin/layouts.ts",
  propertyLabel: "admin/property-label.ts",
  translation: "admin/translation.ts",
  search: "admin/search.ts",
  workflowExecution: "admin/workflow-execution.ts",
  plugin: "admin/plugin.ts",
}

const parsed = {} // sdkPath -> { http, path, file }
for (const [key, rel] of Object.entries(resourceFiles)) {
  const file = path.join(sdkRoot, rel)
  if (!fs.existsSync(file)) continue
  const methods = parseResource(file, key)
  for (const [name, info] of methods) {
    parsed["admin." + key + "." + name] = { ...info, file: rel }
    // camelCase variants: dashboard calls admin.productVariant.list etc - keys already match resource var names
  }
}

// auth methods from auth/index.ts
const authSrc = fs.readFileSync(path.join(sdkRoot, "auth/index.ts"), "utf8")
const authParsed = {}
{
  const fetchRegex = /this\.client\.fetch(?:<[^>]*>)?\(\s*`([^`]+)`/g
  let fm
  const found = []
  while ((fm = fetchRegex.exec(authSrc))) {
    const after = authSrc.slice(fetchRegex.lastIndex, fetchRegex.lastIndex + 500)
    const methMatch = after.match(/method:\s*"([A-Z]+)"/)
    const before = authSrc.slice(0, fm.index)
    const nameMatches = [...before.matchAll(/(?:^|\n)  (?:async\s+)?([a-zA-Z_$][\w$]*)\s*(?:=\s*async\s*)?\(/g)]
    const name = nameMatches.length ? nameMatches[nameMatches.length - 1][1] : "?"
    found.push({ name, http: methMatch ? methMatch[1] : "GET", path: fm[1] })
  }
  for (const f of found) authParsed["auth." + f.name] = f
}

// Resolve dashboard calls
const resolved = []
const unresolved = []
for (const call of dashboardCalls) {
  if (authParsed[call]) {
    resolved.push({ call, ...authParsed[call] })
    continue
  }
  // try exact
  if (parsed[call]) {
    resolved.push({ call, ...parsed[call] })
    continue
  }
  // try swapping resource name conventions: admin.customerGroup vs parsed key
  unresolved.push(call)
}

const lines = ["=== RESOLVED (" + resolved.length + ") ==="]
for (const r of resolved.sort((a, b) => (a.path + a.http).localeCompare(b.path + b.http))) {
  lines.push(r.http + " " + r.path + "  <= " + r.call)
}
lines.push("")
lines.push("=== UNRESOLVED (" + unresolved.length + ") ===")
for (const u of unresolved) lines.push(u)

fs.writeFileSync("audit/dashboard-http-map.txt", lines.join("\n"))

// Cross-check against lupus routes
const van = fs.readFileSync("audit/lupus-routes.txt", "utf8").split("\n").filter(Boolean)
function normPath(p) {
  return p.replace(/\[([^\]]+)\]/g, ":$1").replace(/\$\{[^}]+\}/g, ":param").replace(/\/$/, "") || "/"
}
const vanSet = new Set()
for (const line of van) {
  const m = line.match(/^(\S+)\s+(\S+)/)
  if (m) vanSet.add(m[1] + " " + normPath(m[2]))
}
// js-sdk paths contain ${id} etc - normalize to :param style, also collapse to first :segment style matching express
function sdkPathToKey(http, p) {
  let np = p
    .replace(/\$\{[^}]+\}/g, ":x")
    .replace(/\$\{[^}]+\}/g, ":x")
  // express uses named params - compare by structure: replace all :params and [id] uniformly
  np = np.replace(/:[a-zA-Z0-9_]+/g, ":p").replace(/\$\{[^}]+\}/g, ":p")
  return http + " " + np
}
const vanKeys = new Set(
  [...vanSet].map((k) => {
    const [m, ...rest] = k.split(" ")
    return m + " " + rest.join(" ").replace(/:[a-zA-Z0-9_]+/g, ":p")
  })
)
const missingForDashboard = []
const presentForDashboard = []
for (const r of resolved) {
  const pathOnly = r.path.split("?")[0]
  const key = sdkPathToKey(r.http, pathOnly)
  if (vanKeys.has(key)) presentForDashboard.push(r)
  else missingForDashboard.push(r)
}
const lines2 = [
  "",
  "=== DASHBOARD-ENDPOINT COVERAGE ===",
  "present in lupus: " + presentForDashboard.length,
  "MISSING for dashboard: " + missingForDashboard.length,
  "",
]
for (const r of missingForDashboard.sort((a, b) => a.path.localeCompare(b.path))) {
  lines2.push(r.http + " " + r.path + "  <= " + r.call)
}
fs.appendFileSync("audit/dashboard-http-map.txt", lines2.join("\n"))
console.log(
  "resolved=" +
    resolved.length +
    " unresolved=" +
    unresolved.length +
    " dash-missing=" +
    missingForDashboard.length +
    " dash-present=" +
    presentForDashboard.length
)
