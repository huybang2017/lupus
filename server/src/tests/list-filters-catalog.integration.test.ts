import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { COUNTRY_CODES } from "../modules/region/region-admin.service"

// HTTP coverage for the catalog / promotions / pricing / inventory / tax admin
// list endpoints retrofitted onto the shared list-query helper (specs live in
// src/modules/infra/list-filter-specs.ts). Same contract as
// list-filters.integration.test.ts: an unknown param must never 400, an
// out-of-whitelist enum value must be ignored rather than rejected, ranges and
// repeatable ids must narrow, ?order=-x must reverse and ?q must free-text
// search.
//
// Every fixture is created through the real admin API and then gets a forced
// created_at gap (`stagger`) so `?order=-created_at` has a deterministic winner
// and the seeded rows sit at the top of the default (newest-first) page. That
// page is size 100 on a database that only ever grows - `product` alone was past
// 600 rows - so the stamps are anchored at NOW() (see `stagger`), not an hour or
// a minute into the past: a fixture in the past has to out-rank every row a
// previous run left behind, which is a property of the database rather than of
// the filtering under test.
const T = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
// Distinctive, space-free and underscore-free seed token: it survives the
// LIKE-metacharacter escaping in the helper and, because T carries a random
// suffix, cannot collide with anything another run wrote.
const P = `LC${T}`

async function migrate() {
  for (const f of [
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
    "src/db/schema-p11-category-rank.sql",
    "src/db/schema-p12-admin-create-gaps.sql",
    "src/db/schema-p14-refund-accumulate.sql",
    "src/db/schema-p15-order-shipping.sql",
    "src/db/schema-p16-product-parity.sql",
    "src/db/schema-p17-product-attributes.sql",
    "src/db/schema-p18-global-options.sql",
    "src/db/schema-p19-promotion-parity.sql",
    "src/db/schema-p20-price-list-parity.sql",
    "src/db/schema-p21-locations-shipping.sql",
    "src/db/schema-p22-store.sql",
    "src/db/schema-p23-invites.sql",
    "src/db/schema-p24-regions.sql",
    "src/db/schema-p25-reference-data.sql",
    "src/db/schema-p26-api-keys.sql",
    "src/db/schema-p27-workflow-executions.sql",
    "src/db/schema-p28-tax-regions.sql",
    "src/db/schema-p29-metadata.sql",
    "src/db/schema-p30-storefront.sql",
  ]) {
    await pool.query(await readFile(f, "utf8")).catch((e: any) => {
      if (!String(e?.message ?? "").includes("already exists")) throw e
    })
  }
}

let server: any
let base = ""

async function api(method: string, path: string, body?: any, token?: string) {
  const headers: any = { "content-type": "application/json" }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }
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
    json = { _raw: text }
  }
  return { status: res.status, json }
}

function ids(rows: any[]): string[] {
  return rows.map((r: any) => r.id)
}

/** ISO timestamp `days` in the future, used for the "created_at_from" empty case. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString()
}

/**
 * Force a deterministic created_at order inside a fixture set: index 0 is the
 * oldest, the last index the newest, so `?order=-created_at` must come back
 * reversed.
 *
 * The offsets count whole SECONDS back from NOW(), so the newest fixture is
 * stamped at the instant the fixtures are written. Every fixture is therefore
 * strictly newer than any row written by an earlier run - or by a later suite of
 * the same run - which is what keeps the fixtures on the first page of a table
 * that already holds hundreds of rows. Whole seconds keep the stamps distinct
 * even on a created_at column with second resolution.
 */
async function stagger(table: string, column: string, rowIds: string[]): Promise<void> {
  for (const [index, id] of rowIds.entries()) {
    const secondsAgo = rowIds.length - 1 - index
    await pool.query(`UPDATE ${table} SET ${column} = NOW() - ($2 || ' seconds')::interval WHERE id = $1`, [id, String(secondsAgo)])
  }
}

describe("admin list filters (catalog / promo / pricing / inventory / tax)", () => {
  const adminEmail = `listcat-admin-${T}@example.com`
  let token = ""

  const collections: string[] = []
  const types: string[] = []
  const tags: string[] = []
  const categories: string[] = []
  const products: string[] = []
  const variants: string[] = []
  const options: string[] = []
  const optionValues: string[] = []
  const locations: string[] = []
  const items: string[] = []
  const reservations: string[] = []
  const profiles: string[] = []
  const campaigns: string[] = []
  const promotions: string[] = []
  const priceLists: string[] = []
  const taxRegions: string[] = []
  let taxCountries: string[] = []
  const taxRates: string[] = []
  let salesChannel = ""

  /**
   * Baseline page for one list endpoint: newest-first, wide enough that the two
   * seeded rows are always on it. Returns the parsed body for further asserts.
   *
   * Being on the page is guaranteed by construction, not by the table being
   * small: `stagger` stamps the fixtures at NOW(), and this suite writes nothing
   * into these tables afterwards, so they are the newest rows of a table that
   * keeps growing across runs.
   */
  async function baseline(path: string, key: string, fixture: string[]) {
    const sep = path.includes("?") ? "&" : "?"
    const r = await api("GET", `${path}${sep}limit=100&order=-created_at&created_at_from=2000-01-01`, undefined, token)
    assert.equal(r.status, 200, `${path} baseline answered ${r.status}`)
    assert.ok(Array.isArray(r.json[key]), `${path} is missing the ${key} envelope`)
    assert.equal(typeof r.json.count, "number", `${path} is missing count`)
    assert.equal(typeof r.json.offset, "number", `${path} is missing offset`)
    assert.equal(r.json.limit, 100)
    assert.equal(r.json[key].length, Math.min(r.json.count, 100), `${path} page size must follow count/limit`)
    const mine = ids(r.json[key]).filter((id) => fixture.includes(id))
    assert.equal(mine.length, fixture.length, `${path} baseline page is missing a seeded row`)
    return r.json
  }

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email: adminEmail, password: "listcat-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [adminEmail])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }

    const sc = await api("POST", "/admin/sales-channels", { name: `${P}sc` }, token)
    assert.equal(sc.status, 201)
    salesChannel = sc.json.sales_channel.id

    // price lists: A is a draft, B is active
    for (const [index, suffix] of ["A", "B"].entries()) {
      const col = await api("POST", "/admin/collections", { title: `${P}col${suffix}` }, token)
      assert.equal(col.status, 201, `collection ${suffix}`)
      collections.push(col.json.collection.id)

      const type = await api("POST", "/admin/product-types", { value: `${P}type${suffix}` }, token)
      assert.equal(type.status, 201, `product type ${suffix}`)
      types.push(type.json.product_type.id)

      const tag = await api("POST", "/admin/product-tags", { value: `${P}tag${suffix}` }, token)
      assert.equal(tag.status, 201, `product tag ${suffix}`)
      tags.push(tag.json.product_tag.id)

      const cat = await api("POST", "/admin/product-categories", { name: `${P}cat${suffix}` }, token)
      assert.equal(cat.status, 201, `product category ${suffix}`)
      categories.push(cat.json.product_category.id)

      const loc = await api("POST", "/admin/stock-locations", { name: `${P}loc${suffix}`, city: `${P}city${suffix}` }, token)
      assert.equal(loc.status, 201, `stock location ${suffix}`)
      locations.push(loc.json.stock_location.id)

      const item = await api(
        "POST",
        "/admin/inventory-items",
        {
          sku: `${P}isku${suffix}`,
          title: `${P}ititle${suffix}`,
