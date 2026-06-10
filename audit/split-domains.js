const fs = require("fs")
const lines = fs.readFileSync("audit/dashboard-http-map.txt", "utf8").split("\n")
const start = lines.findIndex((l) => l.startsWith("MISSING for dashboard"))
const missing = lines.slice(start + 1).filter((l) => /^[A-Z]+ \//.test(l))

const domains = {
  "domain-catalog.txt": [/\/admin\/products/, /\/admin\/product-options/, /\/admin\/product-tags/, /\/admin\/product-types/, /\/admin\/product-categories/, /\/admin\/product-variants/, /\/admin\/collections/],
  "domain-orders.txt": [/\/admin\/orders/, /\/admin\/order-edits/, /\/admin\/order-changes/, /\/admin\/payment-collections/, /\/admin\/payments/, /\/admin\/refund-reasons/, /\/admin\/fulfillments/],
  "domain-rma.txt": [/\/admin\/claims/, /\/admin\/exchanges/, /\/admin\/returns/],
  "domain-customers.txt": [/\/admin\/customers/, /\/admin\/customer-groups/, /\/admin\/users/, /\/admin\/invites/, /\/admin\/rbac/],
  "domain-fulfillment.txt": [/\/admin\/stock-locations/, /\/admin\/fulfillment-sets/, /\/admin\/fulfillment-providers/, /\/admin\/shipping-options/, /\/admin\/shipping-profiles/, /\/admin\/shipping-option-types/, /\/admin\/inventory-items/, /\/admin\/reservations/],
  "domain-pricing.txt": [/\/admin\/price-lists/, /\/admin\/price-preferences/, /\/admin\/promotions/, /\/admin\/campaigns/],
  "domain-platform.txt": [/.*/],
}
const buckets = {}
for (const k of Object.keys(domains)) buckets[k] = []
const rest = []
for (const line of missing) {
  let placed = false
  for (const [file, patterns] of Object.entries(domains)) {
    if (file === "domain-platform.txt") continue
    if (patterns.some((p) => p.test(line))) {
      buckets[file].push(line)
      placed = true
      break
    }
  }
  if (!placed) rest.push(line)
}
buckets["domain-platform.txt"] = rest
for (const [file, items] of Object.entries(buckets)) {
  fs.writeFileSync("audit/" + file, items.join("\n") + "\n")
  console.log(file + ": " + items.length)
}
