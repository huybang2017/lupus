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
          hs_code: `${P}hsc${suffix}`,
          levels: [{ location_id: loc.json.stock_location.id, stocked_quantity: 9 }],
        },
        token
      )
      assert.equal(item.status, 201, `inventory item ${suffix}`)
      items.push(item.json.inventory_item.id)

      const profile = await api("POST", "/admin/shipping-profiles", { name: `${P}sp${suffix}` }, token)
      assert.equal(profile.status, 201, `shipping profile ${suffix}`)
      profiles.push(profile.json.shipping_profile.id)

      const camp = await api("POST", "/admin/campaigns", { name: `${P}camp${suffix}`, identifier: `${P}-camp${suffix}` }, token)
      assert.equal(camp.status, 201, `campaign ${suffix}`)
      campaigns.push(camp.json.campaign.id)

      const pl = await api(
        "POST",
        "/admin/price-lists",
        {
          title: `${P}pl${suffix}`,
          type: "sale",
          status: index === 0 ? "draft" : "active",
          description: `${P}pldesc${suffix}`,
          prices: [],
        },
        token
      )
      assert.equal(pl.status, 201, `price list ${suffix}`)
      priceLists.push(pl.json.price_list_id)
    }

    // promotions: one draft/percentage/linked, one active/fixed/unlinked
    for (const [index, suffix] of ["A", "B"].entries()) {
      const promo = await api(
        "POST",
        "/admin/promotions",
        {
          code: `${P}-prom${suffix}`.toLowerCase(),
          status: index === 0 ? "draft" : "active",
          campaign_id: index === 0 ? campaigns[0] : null,
          application_type: index === 0 ? "percentage" : "fixed",
          application_target: "order",
          application_value: 10,
          ...(index === 1 ? { application_currency: "usd" } : {}),
          is_automatic: index === 1,
        },
        token
      )
      assert.equal(promo.status, 201, `promotion ${suffix}`)
      promotions.push(promo.json.promotion.id)
    }
    // is_automatic is only settable through the update route, so flip B there
    const automatic = await api("POST", `/admin/promotions/${promotions[1]}`, { is_automatic: true }, token)
    assert.equal(automatic.status, 200)
    assert.equal(automatic.json.promotion.is_automatic, true)

    // products: A is published + linked to the collection/type/channel, B is draft
    for (const [index, suffix] of ["A", "B"].entries()) {
      const created = await api(
        "POST",
        "/admin/products",
        {
          title: `${P}prod${suffix}`,
          description: `${P}proddesc${suffix}`,
          status: index === 0 ? "published" : "draft",
          collection_id: collections[index],
          type_id: types[index],
          tags: [{ id: tags[index] }],
          categories: [{ id: categories[index] }],
          sales_channels: index === 0 ? [{ id: salesChannel }] : [],
          options: [{ title: `${P}opt${suffix}`, values: [`${P}val${suffix}One`, `${P}val${suffix}Two`] }],
          variants: [
            {
              title: `${P}var${suffix}`,
              sku: `${P}psku${suffix}`,
              // every variant must answer every declared option
              options: { [`${P}opt${suffix}`]: `${P}val${suffix}One` },
              prices: [{ currency_code: "usd", amount: 1000 + index }],
            },
          ],
        },
        token
      )
      assert.equal(created.status, 201, `product ${suffix}`)
      products.push(created.json.product.id)
      variants.push(created.json.product.variants[0].id)

      const opts = await api("GET", `/admin/products/${created.json.product.id}/options`, undefined, token)
      assert.equal(opts.status, 200)
      options.push(opts.json.options[0].id)
    }

    // reservations: one per seeded (item, location) pair
    for (const index of [0, 1]) {
      const res = await api(
        "POST",
        "/admin/reservations",
        { inventory_item_id: items[index], location_id: locations[index], quantity: 1, description: `${P}res${index}` },
        token
      )
      assert.equal(res.status, 201, `reservation ${index}`)
      reservations.push(res.json.reservation.id)
    }

    // the two option values of product A's option, in a deterministic order
    const values = await api("GET", `/admin/product-options/${options[0]}/values?limit=100&order=value`, undefined, token)
    assert.equal(values.status, 200)
    for (const v of values.json.product_option_values) {
      optionValues.push(v.id)
    }
    assert.equal(optionValues.length, 2)

    // tax regions: two countries nobody has a region for yet; region A owns the only
    // default rate plus a plain one, region B a single plain rate
    taxCountries = (
      await pool.query(`SELECT c FROM unnest($1::text[]) c WHERE c NOT IN (SELECT country_code FROM tax_region WHERE deleted_at IS NULL) ORDER BY random() LIMIT 2`, [COUNTRY_CODES])
    ).rows.map((r: any) => r.c as string)
    assert.equal(taxCountries.length, 2)
    for (const [index, suffix] of ["a", "b"].entries()) {
      const region = await api(
        "POST",
        "/admin/tax-regions",
        {
          country_code: taxCountries[index],
          provider_id: "system",
          ...(index === 0 ? { default_tax_rate: { code: `lct${T}ra`, name: `${P}rateA`, rate: 5 } } : {}),
        },
        token
      )
      assert.equal(region.status, 201, `tax region ${suffix}`)
      taxRegions.push(region.json.tax_region.id)
      const extra = index === 0 ? { code: `lct${T}rb`, name: `${P}rateB`, rate: 7 } : { code: `lct${T}rc`, name: `${P}rateC`, rate: 9 }
      const rate = await api("POST", "/admin/tax-rates", { tax_region_id: region.json.tax_region.id, ...extra }, token)
      assert.equal(rate.status, 201, `tax rate ${suffix}`)
    }
    const regionA = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&limit=100&order=created_at`, undefined, token)
    assert.equal(regionA.status, 200)
    for (const rate of regionA.json.tax_rates) {
      taxRates.push(rate.id)
    }
    assert.equal(taxRates.length, 2)

    // explicit ranks so the product-categories default order is observable
    await api("POST", `/admin/product-categories/${categories[0]}`, { rank: 9 }, token)
    await api("POST", `/admin/product-categories/${categories[1]}`, { rank: 2 }, token)

    // oldest -> newest, one second apart at the newest end (see `stagger`)
    await stagger("product_collection", "created_at", collections)
    await stagger("product_type", "created_at", types)
    await stagger("product_tag", "created_at", tags)
    await stagger("product_category", "created_at", categories)
    await stagger("product", "created_at", products)
    await stagger("product_variant", "created_at", variants)
    await stagger("product_option", "created_at", options)
    await stagger("product_option_value", "created_at", optionValues)
    await stagger("stock_location", "created_at", locations)
    await stagger("inventory_item", "created_at", items)
    await stagger("reservation_item", "created_at", reservations)
    await stagger("shipping_profile", "created_at", profiles)
    await stagger("campaign", "created_at", campaigns)
    await stagger("promotion", "created_at", promotions)
    await stagger("price_list", "created_at", priceLists)
    await stagger("tax_region", "created_at", taxRegions)
    await stagger("tax_rate", "created_at", taxRates)
  })

  after(async () => {
    // The `is_automatic` fixture applies itself to every later cart created on
    // the shared test database, which would corrupt the fixed-amount discount
    // assertions of the other suites. Soft-delete the fixture promotions on the
    // way out (also clearing rows left behind by earlier runs of this file) so
    // the fixture stays local.
    await pool.query(`UPDATE promotion SET is_automatic = FALSE, deleted_at = NOW() WHERE code LIKE 'lc%-prom%'`)
    // the fixture countries go back to having no tax region
    if (taxRegions.length) await pool.query(`UPDATE tax_region SET deleted_at = NOW() WHERE id = ANY($1)`, [taxRegions])
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  // ---------------------------------------------------------------- catalog ---

  it("products: q, status whitelist, sales_channel_id EXISTS, repeatable ids and order", async () => {
    const body = await baseline("/admin/products", "products", products)
    assert.ok(body.count >= 2)
    // the enriched dashboard shape is preserved
    for (const field of ["id", "title", "handle", "status", "collection", "type", "variants", "options"]) {
      assert.ok(field in body.products[0], `product row is missing ${field}`)
    }

    const q = await api("GET", `/admin/products?q=${encodeURIComponent(`${P}prodA`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.products), [products[0]])
    assert.equal(q.json.count, 1)

    const two = await api("GET", `/admin/products?id=${products[0]}&id=${products[1]}`, undefined, token)
    assert.equal(two.status, 200)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.products), [products[1], products[0]], "default order is created_at DESC")

    const asc = await api("GET", `/admin/products?id=${products[0]}&id=${products[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.products), [products[0], products[1]])

    const future = await api("GET", `/admin/products?created_at_from=${inDays(1)}`, undefined, token)
    assert.equal(future.status, 200)
    assert.equal(future.json.count, 0)

    const past = await api("GET", `/admin/products?created_at_to=2000-01-01`, undefined, token)
    assert.equal(past.json.count, 0)

    // enum filters
    const published = await api("GET", `/admin/products?status=published&id=${products[0]}&id=${products[1]}`, undefined, token)
    assert.deepEqual(ids(published.json.products), [products[0]])
    const bogus = await api("GET", `/admin/products?status=totally-bogus&limit=100`, undefined, token)
    assert.equal(bogus.status, 200, "an unknown product status must be ignored, not rejected")
    const clean = await api("GET", "/admin/products?limit=100", undefined, token)
    assert.equal(bogus.json.count, clean.json.count)

    // link-table EXISTS filters
    const linked = await api("GET", `/admin/products?sales_channel_id=${salesChannel}&id=${products[0]}&id=${products[1]}`, undefined, token)
    assert.equal(linked.status, 200)
    assert.deepEqual(ids(linked.json.products), [products[0]])
    const otherChannel = await api("GET", `/admin/products?sales_channel_id=${collections[0]}&limit=100`, undefined, token)
    assert.equal(otherChannel.json.count, 0, "a sales channel id that links nothing must return nothing")

    const byCollection = await api("GET", `/admin/products?collection_id=${collections[1]}&limit=100`, undefined, token)
    assert.deepEqual(ids(byCollection.json.products), [products[1]])
    const byType = await api("GET", `/admin/products?type_id=${types[0]}&limit=100`, undefined, token)
