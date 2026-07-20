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
    assert.deepEqual(ids(byType.json.products), [products[0]])
    const byHandle = await api("GET", `/admin/products?handle=${encodeURIComponent(`${P}prodb`.toLowerCase())}&limit=100`, undefined, token)
    assert.deepEqual(ids(byHandle.json.products), [products[1]])
  })

  it("product-variants: q, sku, product_id, created_at and order", async () => {
    await baseline("/admin/product-variants", "variants", variants)

    const q = await api("GET", `/admin/product-variants?q=${encodeURIComponent(`${P}varA`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.variants), [variants[0]])
    assert.equal(q.json.count, 1)

    const sku = await api("GET", `/admin/product-variants?sku=${encodeURIComponent(`${P}pskuB`)}`, undefined, token)
    assert.deepEqual(ids(sku.json.variants), [variants[1]])

    const byProduct = await api("GET", `/admin/product-variants?product_id=${products[0]}`, undefined, token)
    assert.deepEqual(ids(byProduct.json.variants), [variants[0]])

    const two = await api("GET", `/admin/product-variants?id=${variants[0]}&id=${variants[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.variants), [variants[1], variants[0]])
    const asc = await api("GET", `/admin/product-variants?id=${variants[0]}&id=${variants[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.variants), [variants[0], variants[1]])

    const future = await api("GET", `/admin/product-variants?created_at_from=${inDays(1)}`, undefined, token)
    assert.equal(future.json.count, 0)
    // the per-variant enrichment the dashboard needs is preserved: prices list,
    // option keymap, linked inventory items, images
    const row = (await api("GET", `/admin/product-variants?id=${variants[0]}`, undefined, token)).json.variants[0]
    assert.ok(Array.isArray(row.prices))
    assert.equal(row.prices[0].currency_code, "usd")
    assert.equal(typeof row.options, "object")
    assert.ok(Object.keys(row.options).length > 0)
    assert.ok(Array.isArray(row.inventory_items))
    assert.ok(Array.isArray(row.images))
  })

  it("product-options and option values: q, created_at and order", async () => {
    await baseline("/admin/product-options", "product_options", options)

    const q = await api("GET", `/admin/product-options?q=${encodeURIComponent(`${P}optB`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.product_options), [options[1]])
    assert.equal(q.json.count, 1)

    const byTitle = await api("GET", `/admin/product-options?title=${encodeURIComponent(`${P}optA`)}`, undefined, token)
    assert.deepEqual(ids(byTitle.json.product_options), [options[0]])
    // the json_agg `values` hydration is preserved
    assert.equal(byTitle.json.product_options[0].values.length, 2)

    const desc = await api("GET", `/admin/product-options?id=${options[0]}&id=${options[1]}&order=-created_at`, undefined, token)
    assert.equal(desc.json.count, 2)
    assert.deepEqual(ids(desc.json.product_options), [options[1], options[0]])
    const future = await api("GET", `/admin/product-options?created_at_from=${inDays(1)}`, undefined, token)
    assert.equal(future.json.count, 0)

    const values = await api("GET", `/admin/product-options/${options[0]}/values?limit=100&order=-created_at`, undefined, token)
    assert.equal(values.status, 200)
    assert.equal(values.json.count, 2)
    assert.deepEqual(ids(values.json.product_option_values), [optionValues[1], optionValues[0]])
    const valueQ = await api("GET", `/admin/product-options/${options[0]}/values?q=${encodeURIComponent(`${P}valAOne`)}`, undefined, token)
    assert.deepEqual(ids(valueQ.json.product_option_values), [optionValues[0]])
    const other = await api("GET", `/admin/product-options/${options[1]}/values?id=${optionValues[0]}&id=${optionValues[1]}`, undefined, token)
    assert.equal(other.json.count, 0, "values are scoped to the option in the path")
  })

  it("product-types and product-tags: q, created_at and order", async () => {
    await baseline("/admin/product-types", "product_types", types)
    await baseline("/admin/product-tags", "product_tags", tags)

    const typeQ = await api("GET", `/admin/product-types?q=${encodeURIComponent(`${P}typeA`)}`, undefined, token)
    assert.equal(typeQ.status, 200)
    assert.deepEqual(ids(typeQ.json.product_types), [types[0]])
    assert.equal(typeQ.json.count, 1)
    const typeOrder = await api("GET", `/admin/product-types?id=${types[0]}&id=${types[1]}&order=-created_at`, undefined, token)
    assert.equal(typeOrder.json.count, 2)
    assert.deepEqual(ids(typeOrder.json.product_types), [types[1], types[0]])
    const typeValue = await api("GET", `/admin/product-types?value=${encodeURIComponent(`${P}typeB`)}`, undefined, token)
    assert.deepEqual(ids(typeValue.json.product_types), [types[1]])
    assert.equal((await api("GET", `/admin/product-types?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)

    const tagQ = await api("GET", `/admin/product-tags?q=${encodeURIComponent(`${P}tagB`)}`, undefined, token)
    assert.equal(tagQ.status, 200)
    assert.deepEqual(ids(tagQ.json.product_tags), [tags[1]])
    assert.equal(tagQ.json.count, 1)
    const tagOrder = await api("GET", `/admin/product-tags?id=${tags[0]}&id=${tags[1]}&order=-created_at`, undefined, token)
    assert.equal(tagOrder.json.count, 2)
    assert.deepEqual(ids(tagOrder.json.product_tags), [tags[1], tags[0]])
    assert.equal((await api("GET", `/admin/product-tags?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("collections: q, created_at and order", async () => {
    await baseline("/admin/collections", "collections", collections)

    const q = await api("GET", `/admin/collections?q=${encodeURIComponent(`${P}colA`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.collections), [collections[0]])
    assert.equal(q.json.count, 1)

    const two = await api("GET", `/admin/collections?id=${collections[0]}&id=${collections[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.collections), [collections[1], collections[0]])
    const asc = await api("GET", `/admin/collections?id=${collections[0]}&id=${collections[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.collections), [collections[0], collections[1]])
    assert.equal((await api("GET", `/admin/collections?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("product-categories: q, parent_id, real paging and the rank ASC organize default", async () => {
    await baseline("/admin/product-categories", "product_categories", categories)

    const q = await api("GET", `/admin/product-categories?q=${encodeURIComponent(`${P}catB`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.product_categories), [categories[1]])
    assert.equal(q.json.count, 1)

    // the organize page contract: rank ASC by default (rank 2 before rank 9)
    const ranked = await api("GET", `/admin/product-categories?id=${categories[0]}&id=${categories[1]}`, undefined, token)
    assert.equal(ranked.status, 200)
    assert.equal(ranked.json.count, 2)
    assert.deepEqual(ids(ranked.json.product_categories), [categories[1], categories[0]])
    const desc = await api("GET", `/admin/product-categories?id=${categories[0]}&id=${categories[1]}&order=-rank`, undefined, token)
    assert.deepEqual(ids(desc.json.product_categories), [categories[0], categories[1]])
    const byCreated = await api("GET", `/admin/product-categories?id=${categories[0]}&id=${categories[1]}&order=-created_at`, undefined, token)
    assert.deepEqual(ids(byCreated.json.product_categories), [categories[1], categories[0]])

    // the default page is still rank-ordered end to end
    const page = await api("GET", "/admin/product-categories?limit=100", undefined, token)
    assert.equal(page.status, 200)
    const ranks = page.json.product_categories.map((c: any) => Number(c.rank))
    assert.deepEqual(ranks, [...ranks].sort((x: number, y: number) => x - y), "the default order must be rank ASC")

    // paging is real: limit/offset window the result and count stays total
    const windowed = await api("GET", "/admin/product-categories?limit=3&offset=1", undefined, token)
    assert.equal(windowed.status, 200)
    assert.equal(windowed.json.product_categories.length, 3)
    assert.equal(windowed.json.offset, 1)
    assert.equal(windowed.json.limit, 3)
    assert.equal(windowed.json.count, page.json.count)
    assert.deepEqual(windowed.json.product_categories.map((c: any) => c.id), page.json.product_categories.slice(1, 4).map((c: any) => c.id))

    // parent_id is an in-filter over the self-referencing parent
    await api("POST", `/admin/product-categories/${categories[1]}`, { parent_category_id: categories[0] }, token)
    const byParent = await api("GET", `/admin/product-categories?parent_id=${categories[0]}`, undefined, token)
    assert.equal(byParent.status, 200)
    assert.deepEqual(ids(byParent.json.product_categories), [categories[1]])
    assert.equal((await api("GET", `/admin/product-categories?parent_id=${P}no-such-parent`, undefined, token)).json.count, 0)
    assert.equal((await api("GET", `/admin/product-categories?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  // ------------------------------------------- promotions / campaigns / pricing ---

  it("promotions: q, status/type whitelists, is_automatic, campaign_id and order", async () => {
    await baseline("/admin/promotions", "promotions", promotions)

    const q = await api("GET", `/admin/promotions?q=${encodeURIComponent(`${P}-promA`.toLowerCase())}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.promotions), [promotions[0]])
    assert.equal(q.json.count, 1)

    const two = await api("GET", `/admin/promotions?id=${promotions[0]}&id=${promotions[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.promotions), [promotions[1], promotions[0]])
    const asc = await api("GET", `/admin/promotions?id=${promotions[0]}&id=${promotions[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.promotions), [promotions[0], promotions[1]])

    const draft = await api("GET", `/admin/promotions?status=draft&id=${promotions[0]}&id=${promotions[1]}`, undefined, token)
    assert.deepEqual(ids(draft.json.promotions), [promotions[0]])
    const bogus = await api("GET", "/admin/promotions?status=bogus&limit=100", undefined, token)
    assert.equal(bogus.status, 200, "an unknown promotion status must be ignored")
    const clean = await api("GET", "/admin/promotions?limit=100", undefined, token)
    assert.equal(bogus.json.count, clean.json.count)

    const fixed = await api("GET", `/admin/promotions?type=fixed&id=${promotions[0]}&id=${promotions[1]}`, undefined, token)
    assert.deepEqual(ids(fixed.json.promotions), [promotions[1]])
    const bogusType = await api("GET", `/admin/promotions?type=bogus&limit=100`, undefined, token)
    assert.equal(bogusType.status, 200)
    assert.equal(bogusType.json.count, clean.json.count)

    const automatic = await api("GET", `/admin/promotions?is_automatic=true&id=${promotions[0]}&id=${promotions[1]}`, undefined, token)
    assert.deepEqual(ids(automatic.json.promotions), [promotions[1]])
    const manual = await api("GET", `/admin/promotions?is_automatic=false&id=${promotions[0]}&id=${promotions[1]}`, undefined, token)
    assert.deepEqual(ids(manual.json.promotions), [promotions[0]])

    const byCampaign = await api("GET", `/admin/promotions?campaign_id=${campaigns[0]}&limit=100`, undefined, token)
    assert.deepEqual(ids(byCampaign.json.promotions), [promotions[0]])
    assert.equal((await api("GET", `/admin/promotions?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("campaigns: q over identifier, created_at and order", async () => {
    await baseline("/admin/campaigns", "campaigns", campaigns)

    const q = await api("GET", `/admin/campaigns?q=${encodeURIComponent(`${P}-campB`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.campaigns), [campaigns[1]])
    assert.equal(q.json.count, 1)

    const two = await api("GET", `/admin/campaigns?id=${campaigns[0]}&id=${campaigns[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.campaigns), [campaigns[1], campaigns[0]])
    const byIdentifier = await api("GET", `/admin/campaigns?identifier=${encodeURIComponent(`${P}-campA`)}`, undefined, token)
    assert.deepEqual(ids(byIdentifier.json.campaigns), [campaigns[0]])
    const asc = await api("GET", `/admin/campaigns?id=${campaigns[0]}&id=${campaigns[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.campaigns), [campaigns[0], campaigns[1]])
    assert.equal((await api("GET", `/admin/campaigns?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("price-lists: q over title/description, status whitelist, created_at and order", async () => {
    await baseline("/admin/price-lists", "price_lists", priceLists)

    const q = await api("GET", `/admin/price-lists?q=${encodeURIComponent(`${P}plB`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.price_lists), [priceLists[1]])
    assert.equal(q.json.count, 1)
    // the description is part of the free-text search
    const byDesc = await api("GET", `/admin/price-lists?q=${encodeURIComponent(`${P}pldesca`)}`, undefined, token)
    assert.deepEqual(ids(byDesc.json.price_lists), [priceLists[0]])

    const two = await api("GET", `/admin/price-lists?id=${priceLists[0]}&id=${priceLists[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.price_lists), [priceLists[1], priceLists[0]])
    const asc = await api("GET", `/admin/price-lists?id=${priceLists[0]}&id=${priceLists[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.price_lists), [priceLists[0], priceLists[1]])

    const status = await api("GET", `/admin/price-lists?id=${priceLists[0]}&id=${priceLists[1]}&status=draft`, undefined, token)
    assert.equal(status.status, 200)
    assert.equal(status.json.count, 1, "only the seeded draft price list matches status=draft")
    assert.deepEqual(ids(status.json.price_lists), [priceLists[0]])
    const active = await api("GET", `/admin/price-lists?id=${priceLists[0]}&id=${priceLists[1]}&status=active`, undefined, token)
    assert.equal(active.json.count, 1)
    assert.deepEqual(ids(active.json.price_lists), [priceLists[1]])
    const bogus = await api("GET", "/admin/price-lists?status=bogus&limit=100", undefined, token)
    assert.equal(bogus.status, 200, "an unknown price-list status must be ignored")
    const clean = await api("GET", "/admin/price-lists?limit=100", undefined, token)
    assert.equal(bogus.json.count, clean.json.count)
    assert.equal((await api("GET", `/admin/price-lists?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  // ------------------------------------------------------ inventory / fulfillment ---

  it("inventory-items: q, sku, location_id EXISTS, created_at and order", async () => {
    await baseline("/admin/inventory-items", "inventory_items", items)
    // the hydrateInventoryItem enrichment is preserved (scoped to the seeded item
    // because product creation also auto-creates level-less inventory items)
    const row = (await api("GET", `/admin/inventory-items?id=${items[0]}`, undefined, token)).json.inventory_items[0]
    assert.ok(Array.isArray(row.location_levels))
    assert.ok("stocked_quantity" in row.location_levels[0])
    assert.equal(row.location_levels[0].location_id, locations[0])
    assert.equal(row.location_levels[0].id, `${items[0]}:${locations[0]}`)

    const q = await api("GET", `/admin/inventory-items?q=${encodeURIComponent(`${P}iskuA`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.inventory_items), [items[0]])
    assert.equal(q.json.count, 1)
    const byTitle = await api("GET", `/admin/inventory-items?q=${encodeURIComponent(`${P}ititleB`)}`, undefined, token)
    assert.deepEqual(ids(byTitle.json.inventory_items), [items[1]])

    const two = await api("GET", `/admin/inventory-items?id=${items[0]}&id=${items[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.inventory_items), [items[1], items[0]])
    const asc = await api("GET", `/admin/inventory-items?id=${items[0]}&id=${items[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.inventory_items), [items[0], items[1]])

    const sku = await api("GET", `/admin/inventory-items?sku=${encodeURIComponent(`${P}iskuB`)}`, undefined, token)
    assert.deepEqual(ids(sku.json.inventory_items), [items[1]])

    const byLocation = await api("GET", `/admin/inventory-items?location_id=${locations[1]}&id=${items[0]}&id=${items[1]}`, undefined, token)
    assert.equal(byLocation.status, 200)
    assert.deepEqual(ids(byLocation.json.inventory_items), [items[1]])
    const none = await api("GET", `/admin/inventory-items?location_id=${P}no-such-location&limit=100`, undefined, token)
    assert.equal(none.status, 200)
    assert.equal(none.json.count, 0)
    const shipping = await api("GET", `/admin/inventory-items?requires_shipping=true&id=${items[0]}&id=${items[1]}`, undefined, token)
    assert.equal(shipping.json.count, 2)

    assert.equal((await api("GET", `/admin/inventory-items?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("inventory location levels: location_id, q and order stay scoped to the item", async () => {
    const levels = await api("GET", `/admin/inventory-items/${items[0]}/location-levels`, undefined, token)
    assert.equal(levels.status, 200)
    assert.equal(levels.json.count, 1)
    assert.equal(levels.json.inventory_levels[0].location_id, locations[0])
    assert.equal(levels.json.inventory_levels[0].inventory_item_id, items[0])

    const byLocation = await api("GET", `/admin/inventory-items/${items[0]}/location-levels?location_id=${locations[0]}`, undefined, token)
    assert.equal(byLocation.json.count, 1)
    const miss = await api("GET", `/admin/inventory-items/${items[0]}/location-levels?location_id=${locations[1]}`, undefined, token)
    assert.equal(miss.status, 200)
    assert.equal(miss.json.count, 0)
    const byQ = await api("GET", `/admin/inventory-items/${items[0]}/location-levels?q=${encodeURIComponent(locations[0])}`, undefined, token)
    assert.equal(byQ.json.count, 1)
    const ordered = await api("GET", `/admin/inventory-items/${items[0]}/location-levels?order=-stocked_quantity`, undefined, token)
    assert.equal(ordered.status, 200)
  })

  it("reservations: whitelisted column filters, created_at and order", async () => {
    const body = await baseline("/admin/reservations", "reservations", reservations)
    for (const field of ["id", "inventory_item_id", "location_id", "quantity"]) {
      assert.ok(field in body.reservations[0], `reservation row is missing ${field}`)
    }

    const byItem = await api("GET", `/admin/reservations?inventory_item_id=${items[0]}`, undefined, token)
    assert.equal(byItem.status, 200)
    assert.deepEqual(ids(byItem.json.reservations), [reservations[0]])
    const byLocation = await api("GET", `/admin/reservations?location_id=${locations[1]}&limit=100`, undefined, token)
    assert.deepEqual(ids(byLocation.json.reservations), [reservations[1]])
    const miss = await api("GET", `/admin/reservations?inventory_item_id=${P}no-such-item&limit=100`, undefined, token)
    assert.equal(miss.status, 200)
    assert.equal(miss.json.count, 0)

    const two = await api("GET", `/admin/reservations?id=${reservations[0]}&id=${reservations[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.reservations), [reservations[1], reservations[0]])
    const asc = await api("GET", `/admin/reservations?id=${reservations[0]}&id=${reservations[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.reservations), [reservations[0], reservations[1]])
    assert.equal((await api("GET", `/admin/reservations?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("stock-locations: q over name/address/city, created_at and order", async () => {
    await baseline("/admin/stock-locations", "stock_locations", locations)

    const q = await api("GET", `/admin/stock-locations?q=${encodeURIComponent(`${P}locA`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.stock_locations), [locations[0]])
    assert.equal(q.json.count, 1)
    const byCity = await api("GET", `/admin/stock-locations?q=${encodeURIComponent(`${P}cityB`)}`, undefined, token)
    assert.deepEqual(ids(byCity.json.stock_locations), [locations[1]])

    const two = await api("GET", `/admin/stock-locations?id=${locations[0]}&id=${locations[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.stock_locations), [locations[1], locations[0]])
    const asc = await api("GET", `/admin/stock-locations?id=${locations[0]}&id=${locations[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.stock_locations), [locations[0], locations[1]])
    const byName = await api("GET", `/admin/stock-locations?name=${encodeURIComponent(`${P}locB`)}`, undefined, token)
    assert.deepEqual(ids(byName.json.stock_locations), [locations[1]])
    assert.equal((await api("GET", `/admin/stock-locations?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("shipping-profiles: q, created_at and order", async () => {
    await baseline("/admin/shipping-profiles", "shipping_profiles", profiles)

    const q = await api("GET", `/admin/shipping-profiles?q=${encodeURIComponent(`${P}spB`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.shipping_profiles), [profiles[1]])
    assert.equal(q.json.count, 1)

    const two = await api("GET", `/admin/shipping-profiles?id=${profiles[0]}&id=${profiles[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.shipping_profiles), [profiles[1], profiles[0]])
    const asc = await api("GET", `/admin/shipping-profiles?id=${profiles[0]}&id=${profiles[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.shipping_profiles), [profiles[0], profiles[1]])
    assert.equal((await api("GET", `/admin/shipping-profiles?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  // ------------------------------------------------------------------- tax ---

  it("tax-regions: q over the country/province codes, filters, created_at and order", async () => {
    const body = await baseline("/admin/tax-regions", "tax_regions", taxRegions)
    // taxRegionShape hydration is preserved
    assert.ok(Array.isArray(body.tax_regions[0].tax_rates))

    const q = await api("GET", `/admin/tax-regions?q=${encodeURIComponent(taxCountries[0])}`, undefined, token)
    assert.equal(q.status, 200)
    // a two-letter code can also sit inside another region's province code, so only check membership
    assert.ok(ids(q.json.tax_regions).includes(taxRegions[0]))
    assert.ok(!ids(q.json.tax_regions).includes(taxRegions[1]))

    const two = await api("GET", `/admin/tax-regions?id=${taxRegions[0]}&id=${taxRegions[1]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.tax_regions), [taxRegions[1], taxRegions[0]])
    const asc = await api("GET", `/admin/tax-regions?id=${taxRegions[0]}&id=${taxRegions[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.tax_regions), [taxRegions[0], taxRegions[1]])

    const byCountry = await api("GET", `/admin/tax-regions?country_code=${taxCountries[1].toUpperCase()}&limit=100`, undefined, token)
    assert.equal(byCountry.status, 200)
    assert.deepEqual(ids(byCountry.json.tax_regions), [taxRegions[1]])
    const byProvider = await api("GET", `/admin/tax-regions?provider_id=system&id=${taxRegions[0]}&id=${taxRegions[1]}`, undefined, token)
    assert.equal(byProvider.json.count, 2)
    const byProvince = await api("GET", `/admin/tax-regions?province_code=&id=${taxRegions[0]}&id=${taxRegions[1]}`, undefined, token)
    assert.equal(byProvince.status, 200)
    assert.equal((await api("GET", `/admin/tax-regions?created_at_from=${inDays(1)}`, undefined, token)).json.count, 0)
  })

  it("tax-rates: q, is_default/is_combinable split, created_at and order", async () => {
    const body = await baseline(`/admin/tax-rates?tax_region_id=${taxRegions[0]}`, "tax_rates", taxRates)
    assert.equal(body.count, 2)

    const q = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&q=${encodeURIComponent(`${P}rateA`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.tax_rates), [taxRates[0]])
    assert.equal(q.json.count, 1)
    const byCode = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&code=lct${T}rb`, undefined, token)
    assert.deepEqual(ids(byCode.json.tax_rates), [taxRates[1]])

    // boolean split: ?is_default=false must not be coerced to true
    const def = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&is_default=true`, undefined, token)
    assert.equal(def.status, 200)
    assert.deepEqual(ids(def.json.tax_rates), [taxRates[0]])
    const notDef = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&is_default=false`, undefined, token)
    assert.equal(notDef.status, 200)
    assert.deepEqual(ids(notDef.json.tax_rates), [taxRates[1]])
    const combinable = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&is_combinable=false`, undefined, token)
    assert.equal(combinable.json.count, 2)
    const combinableYes = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&is_combinable=true`, undefined, token)
    assert.equal(combinableYes.json.count, 0)

    const two = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&order=-created_at`, undefined, token)
    assert.equal(two.json.count, 2)
    assert.deepEqual(ids(two.json.tax_rates), [taxRates[1], taxRates[0]])
    const asc = await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.tax_rates), [taxRates[0], taxRates[1]])
    assert.equal(
      (await api("GET", `/admin/tax-rates?tax_region_id=${taxRegions[0]}&created_at_from=${inDays(1)}`, undefined, token)).json.count,
      0
    )
  })

  it("every retrofitted endpoint tolerates an unknown query param (never 400)", async () => {
    for (const path of [
      "/admin/products",
      "/admin/product-variants",
      "/admin/product-options",
      `/admin/product-options/${options[0]}/values`,
      "/admin/product-types",
      "/admin/product-tags",
      "/admin/product-categories",
      "/admin/collections",
      "/admin/promotions",
      "/admin/campaigns",
      "/admin/price-lists",
      "/admin/inventory-items",
      `/admin/inventory-items/${items[0]}/location-levels`,
      "/admin/reservations",
      "/admin/stock-locations",
      "/admin/shipping-profiles",
      "/admin/tax-regions",
      "/admin/tax-rates",
    ]) {
      const r = await api("GET", `${path}?totally_unknown=1`, undefined, token)
      assert.equal(r.status, 200, `${path} answered ${r.status} for an unknown query param`)
    }
  })

  it("bad paging and bad sort keys degrade instead of throwing", async () => {
    // sort keys outside the allow-list fall back to the endpoint default
    for (const path of ["/admin/products", "/admin/tax-regions", "/admin/promotions"]) {
      const r = await api("GET", `${path}?order=;DROP%20TABLE%20product--`, undefined, token)
      assert.equal(r.status, 200, `${path} answered ${r.status} for a hostile sort key`)
      assert.equal(typeof r.json.count, "number")
    }
    const capped = await api("GET", "/admin/products?limit=100000", undefined, token)
    assert.equal(capped.status, 200)
    assert.equal(capped.json.limit, 100)
  })
})
