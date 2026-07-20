import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { COUNTRY_CODES } from "../modules/region/region-admin.service"

// HTTP coverage for the shared list-query filters retrofitted onto the admin
// list endpoints (see src/modules/infra/list-filter-specs.ts). Every case runs
// through the real app against a live PostgreSQL: unknown params must never
// 400, out-of-whitelist enum values must be ignored (not rejected), ranges and
// repeatable ids must narrow, ?order=-x must reverse, and ?q must free-text
// search.
//
// This suite shares one long-lived dev database with every other suite, and that
// database only ever grows. Nothing here may therefore depend on the fixtures
// winning a size-100 page against the accumulated rows: `stagger` anchors them at
// NOW() (see below) and the fixture-identity assertions use the repeatable `id`
// filter instead of a bare unfiltered page.
const T = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`

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
 * reversed. Only the given ids are touched.
 *
 * The offsets count whole SECONDS back from NOW(), so the newest fixture is
 * stamped at the instant the fixtures are written and every fixture is strictly
 * newer than anything an earlier run - or an earlier suite of the same run -
 * left behind. Stamping in hours instead made the fixtures compete with the
 * whole shared table for the newest-first page, which stops being winnable once
 * more than `limit` rows are younger than the fixtures; that is a property of
 * the database, not of the filtering under test.
 *
 * Whole seconds (not fractions) keep the stamps distinct even on a created_at
 * column with second resolution.
 */
async function stagger(table: string, column: string, rowIds: string[]): Promise<void> {
  for (const [index, id] of rowIds.entries()) {
    const secondsAgo = rowIds.length - 1 - index
    await pool.query(`UPDATE ${table} SET ${column} = NOW() - ($2 || ' seconds')::interval WHERE id = $1`, [id, String(secondsAgo)])
  }
}

let freeCountries: string[] = []

describe("admin list filters (list-query retrofit)", () => {
  const adminEmail = `listfilt-admin-${T}@example.com`
  const draftEmailA = `listfilt-a-${T}@example.com`
  const draftEmailB = `listfilt-b-${T}@example.com`
  const orderEmailA = `listfilt-oa-${T}@example.com`
  const orderEmailB = `listfilt-ob-${T}@example.com`
  let token = ""
  const drafts: string[] = []
  const orders: string[] = []
  const customers: string[] = []
  const channels: string[] = []
  const regions: string[] = []

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email: adminEmail, password: "listfilt-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [adminEmail])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }

    // Four drafts: the first two stay drafts (the draft-orders list), the last
    // two are converted so the orders list has two orders of its own. Each set
    // gets a forced created_at gap so ?order=-created_at has a deterministic
    // winner.
    for (const email of [draftEmailA, draftEmailB, orderEmailA, orderEmailB]) {
      const created = await api("POST", "/admin/draft-orders", { email, currency_code: "usd", items: [] }, token)
      assert.equal(created.status, 201)
      if (drafts.length < 2) {
        drafts.push(created.json.draft_order.id)
      } else {
        const conv = await api("POST", `/admin/draft-orders/${created.json.draft_order.id}/convert-to-order`, {}, token)
        assert.equal(conv.status, 200)
        orders.push(conv.json.order.id)
      }
    }
    await stagger(`"order"`, "created_at", drafts.concat(orders))

    for (const email of [`listfilt-ca-${T}@example.com`, `listfilt-cb-${T}@example.com`]) {
      const created = await api("POST", "/admin/customers", { email, first_name: "Filt", last_name: "Ester" }, token)
      assert.equal(created.status, 201)
      customers.push(created.json.customer.id)
    }
    await stagger("customer", "created_at", customers)

    for (const [i, name] of [`ListFiltChannelA ${T}`, `ListFiltChannelB ${T}`].entries()) {
      const created = await api("POST", "/admin/sales-channels", { name, description: `desc ${name}`, is_disabled: i === 0 }, token)
      assert.equal(created.status, 201)
      channels.push(created.json.sales_channel.id)
    }
    await stagger("sales_channel", "created_at", channels)

    freeCountries = (
      await pool.query(`SELECT c FROM unnest($1::text[]) c WHERE c NOT IN (SELECT iso_2 FROM region_country WHERE deleted_at IS NULL) ORDER BY random() LIMIT 2`, [COUNTRY_CODES])
    ).rows.map((r: any) => r.c as string)
    for (const [i, name] of [`ListFiltRegionA ${T}`, `ListFiltRegionB ${T}`].entries()) {
      const created = await api(
        "POST",
        "/admin/regions",
        { name, currency_code: i === 0 ? "usd" : "eur", countries: [freeCountries[i]] },
        token
      )
      assert.equal(created.status, 201)
      regions.push(created.json.region.id)
    }
    await stagger("region", "created_at", regions)
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("draft-orders: baseline page contains both seeded drafts", async () => {
    // The fixtures are stamped at/after NOW() (see `stagger`) and nothing in
    // this suite writes another draft afterwards, so they are the newest draft
    // rows in the shared database and must sit at the top of the default
    // newest-first page however many rows earlier runs left behind.
    const r = await api("GET", "/admin/draft-orders?limit=100", undefined, token)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.json.draft_orders))
    assert.equal(typeof r.json.count, "number")
    assert.equal(r.json.limit, 100)
    for (const id of drafts) {
      assert.ok(ids(r.json.draft_orders).includes(id), `draft ${id} missing from the baseline page`)
    }
    // Newest first by default.
    const page = ids(r.json.draft_orders).filter((id) => drafts.includes(id))
    assert.deepEqual(page, [drafts[1], drafts[0]])

    // The same contract asserted on the fixtures' own identity, so a failure
    // points at the `id` in-filter rather than at page position. Still a real
    // assertion: both rows must come back, the count must follow the filter and
    // the default order must agree with -created_at.
    const scoped = await api("GET", `/admin/draft-orders?id=${drafts[0]}&id=${drafts[1]}`, undefined, token)
    assert.equal(scoped.status, 200)
    assert.equal(scoped.json.count, 2)
    assert.deepEqual(ids(scoped.json.draft_orders), [drafts[1], drafts[0]])
  })

  it("draft-orders: ?q=<email> narrows to one row", async () => {
    const r = await api("GET", `/admin/draft-orders?q=${encodeURIComponent(draftEmailA)}`, undefined, token)
    assert.equal(r.status, 200)
    assert.deepEqual(ids(r.json.draft_orders), [drafts[0]])
    assert.equal(r.json.count, 1)
  })

  it("draft-orders: ?status=open matches, an out-of-whitelist status is ignored", async () => {
    const open = await api("GET", `/admin/draft-orders?status=open&id=${drafts[0]}`, undefined, token)
    assert.equal(open.status, 200)
    assert.deepEqual(ids(open.json.draft_orders), [drafts[0]])

    const baseline = await api("GET", "/admin/draft-orders?limit=100", undefined, token)
    const bogus = await api("GET", "/admin/draft-orders?limit=100&status=bogus", undefined, token)
    assert.equal(bogus.status, 200, "an unknown status must be ignored, not rejected")
    assert.equal(bogus.json.count, baseline.json.count)
    assert.deepEqual(ids(bogus.json.draft_orders), ids(baseline.json.draft_orders))
  })

  it("draft-orders: created_at range and order", async () => {
    const future = await api("GET", `/admin/draft-orders?created_at_from=${inDays(1)}`, undefined, token)
    assert.equal(future.status, 200)
    assert.equal(future.json.count, 0)
    assert.deepEqual(future.json.draft_orders, [])

    const past = await api("GET", "/admin/draft-orders?created_at_to=2000-01-01", undefined, token)
    assert.equal(past.json.count, 0)

    const desc = await api("GET", `/admin/draft-orders?id=${drafts[0]}&id=${drafts[1]}&order=-created_at`, undefined, token)
    assert.equal(desc.status, 200)
    assert.deepEqual(ids(desc.json.draft_orders), [drafts[1], drafts[0]])
    const asc = await api("GET", `/admin/draft-orders?id=${drafts[0]}&id=${drafts[1]}&order=created_at`, undefined, token)
    assert.deepEqual(ids(asc.json.draft_orders), [drafts[0], drafts[1]])
    // repeatable ids return exactly the two requested rows
    assert.equal(desc.json.count, 2)
  })

  it("draft-orders: unknown params never 400", async () => {
    const r = await api("GET", "/admin/draft-orders?totally_unknown=1", undefined, token)
    assert.equal(r.status, 200)
  })

  it("orders: filters, q, order and repeatable ids", async () => {
    const baseline = await api("GET", "/admin/orders?limit=100", undefined, token)
    assert.equal(baseline.status, 200)
    assert.ok(Array.isArray(baseline.json.orders))
    // the response shape the dashboard relies on is preserved
    const row = baseline.json.orders[0]
    for (const field of ["id", "display_id", "email", "status", "total", "sales_channel_id", "payment_status"]) {
      assert.ok(field in row, `order row is missing ${field}`)
    }

    const q = await api("GET", `/admin/orders?q=${encodeURIComponent(orderEmailB)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.orders), [orders[1]])
    assert.equal(q.json.count, 1)

    const two = await api("GET", `/admin/orders?id=${orders[0]}&id=${orders[1]}`, undefined, token)
    assert.equal(two.status, 200)
    assert.equal(two.json.count, 2)

    const desc = await api("GET", `/admin/orders?id=${orders[0]}&id=${orders[1]}&order=-created_at`, undefined, token)
    assert.deepEqual(ids(desc.json.orders), [orders[1], orders[0]])

    const status = await api("GET", `/admin/orders?status=pending&id=${orders[0]}`, undefined, token)
    assert.deepEqual(ids(status.json.orders), [orders[0]])

    const bogus = await api("GET", "/admin/orders?status=bogus&limit=100", undefined, token)
    assert.equal(bogus.status, 200)
    assert.equal(bogus.json.count, baseline.json.count, "the COUNT must follow the filters and stay unfiltered for a bogus status")

    const future = await api("GET", "/admin/orders?created_at_from=" + inDays(1), undefined, token)
    assert.equal(future.json.count, 0)

    const range = await api("GET", `/admin/orders?id=${orders[0]}&id=${orders[1]}&total_from=0&total_to=100000000`, undefined, token)
    assert.equal(range.json.count, 2)

    // fulfillment_status is a derived EXISTS (there is no such column)
    const notFulfilled = await api("GET", `/admin/orders?id=${orders[0]}&id=${orders[1]}&fulfillment_status=not_fulfilled`, undefined, token)
    assert.equal(notFulfilled.status, 200)
    assert.equal(notFulfilled.json.count, 2)
    const shipped = await api("GET", `/admin/orders?id=${orders[0]}&id=${orders[1]}&fulfillment_status=shipped`, undefined, token)
    assert.equal(shipped.status, 200)
    assert.equal(shipped.json.count, 0)

    const unknown = await api("GET", "/admin/orders?totally_unknown=1", undefined, token)
    assert.equal(unknown.status, 200)
  })

  it("customers: new ?q, has_orders, order and repeatable ids", async () => {
    const q = await api("GET", `/admin/customers?q=${encodeURIComponent(`listfilt-ca-${T}`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.customers), [customers[0]])

    // first_name/last_name are part of the q columns too. Scoped to the two
    // fixtures: every earlier run of this suite also seeded a "Filt Ester", so
    // a bare `?q=Filt` page has to win all of them from the shared database.
    const byName = await api("GET", `/admin/customers?q=Filt&id=${customers[0]}&id=${customers[1]}&limit=100`, undefined, token)
    assert.equal(byName.status, 200)
    assert.equal(byName.json.count, 2)
    for (const id of customers) {
      assert.ok(ids(byName.json.customers).includes(id))
    }

    const two = await api("GET", `/admin/customers?id=${customers[0]}&id=${customers[1]}&order=-created_at`, undefined, token)
    assert.equal(two.status, 200)
    assert.deepEqual(ids(two.json.customers), [customers[1], customers[0]])
    assert.equal(two.json.count, 2)

    // has_orders is an EXISTS on "order": the orders belong to no customer
    const withOrders = await api("GET", `/admin/customers?id=${customers[0]}&id=${customers[1]}&has_orders=true`, undefined, token)
    assert.equal(withOrders.status, 200)
    assert.equal(withOrders.json.count, 0)
    const withoutOrders = await api("GET", `/admin/customers?id=${customers[0]}&id=${customers[1]}&has_orders=false`, undefined, token)
    assert.equal(withoutOrders.json.count, 2)

    const future = await api("GET", `/admin/customers?id=${customers[0]}&created_at_from=${inDays(1)}`, undefined, token)
    assert.equal(future.json.count, 0)

    const email = await api("GET", `/admin/customers?id=${customers[1]}&email=${encodeURIComponent(`listfilt-cb-${T}`)}`, undefined, token)
    assert.deepEqual(ids(email.json.customers), [customers[1]])

    const unknown = await api("GET", "/admin/customers?totally_unknown=1", undefined, token)
    assert.equal(unknown.status, 200)
  })

  it("sales-channels: new ?q, is_disabled, order and repeatable ids", async () => {
    const q = await api("GET", `/admin/sales-channels?q=${encodeURIComponent(`ChannelA ${T}`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.sales_channels), [channels[0]])

    const disabled = await api("GET", `/admin/sales-channels?id=${channels[0]}&id=${channels[1]}&is_disabled=true`, undefined, token)
    assert.equal(disabled.status, 200)
    assert.deepEqual(ids(disabled.json.sales_channels), [channels[0]])

    const desc = await api("GET", `/admin/sales-channels?id=${channels[0]}&id=${channels[1]}&order=-created_at`, undefined, token)
    assert.deepEqual(ids(desc.json.sales_channels), [channels[1], channels[0]])

    const future = await api("GET", "/admin/sales-channels?created_at_from=" + inDays(1), undefined, token)
    assert.equal(future.json.count, 0)

    const unknown = await api("GET", "/admin/sales-channels?totally_unknown=1", undefined, token)
    assert.equal(unknown.status, 200)
  })

  it("regions: new ?q, currency_code, country_code and countries hydration", async () => {
    // Scoped to the two fixtures: the shared database already holds more regions
    // than one page, so the countries hydration is asserted on the fixtures
    // themselves instead of on whichever rows happen to be newest.
    const baseline = await api("GET", `/admin/regions?id=${regions[0]}&id=${regions[1]}&limit=100`, undefined, token)
    assert.equal(baseline.status, 200)
    assert.equal(baseline.json.count, 2)
    const mine = baseline.json.regions
    assert.equal(mine.length, 2)
    // an unfiltered page still answers with a numeric count and a non-empty array
    const unfiltered = await api("GET", "/admin/regions?limit=100", undefined, token)
    assert.equal(unfiltered.status, 200)
    assert.equal(typeof unfiltered.json.count, "number")
    assert.ok(Array.isArray(unfiltered.json.regions))
    assert.ok(unfiltered.json.regions.length > 0)
    const regionA = mine.find((r: any) => r.id === regions[0])
    const regionB = mine.find((r: any) => r.id === regions[1])
    // countries hydration is preserved
    assert.deepEqual(regionA.countries.map((c: any) => c.iso_2), [freeCountries[0]])
    assert.deepEqual(regionB.countries.map((c: any) => c.iso_2), [freeCountries[1]])

    const q = await api("GET", `/admin/regions?q=${encodeURIComponent(`RegionA ${T}`)}`, undefined, token)
    assert.equal(q.status, 200)
    assert.deepEqual(ids(q.json.regions), [regions[0]])

    const two = await api("GET", `/admin/regions?id=${regions[0]}&id=${regions[1]}&order=-created_at`, undefined, token)
    assert.deepEqual(ids(two.json.regions), [regions[1], regions[0]])
    assert.deepEqual(two.json.regions[0].countries.map((c: any) => c.iso_2), [freeCountries[1]])

    // uppercase currency is coerced to lower case (scoped to the two fixtures
    // because the shared test database has other usd regions)
    const currency = await api("GET", `/admin/regions?id=${regions[0]}&id=${regions[1]}&currency_code=USD`, undefined, token)
    assert.equal(currency.status, 200)
    assert.deepEqual(ids(currency.json.regions), [regions[0]])
    assert.equal(currency.json.count, 1)

    // country_code resolves through region_country
    const country = await api("GET", `/admin/regions?country_code=${freeCountries[1].toUpperCase()}&limit=100`, undefined, token)
    assert.equal(country.status, 200)
    assert.ok(ids(country.json.regions).includes(regions[1]))
    assert.ok(!ids(country.json.regions).includes(regions[0]))
    const none = await api("GET", "/admin/regions?country_code=zz", undefined, token)
    assert.equal(none.json.count, 0)

    const future = await api("GET", "/admin/regions?created_at_from=" + inDays(1), undefined, token)
    assert.equal(future.json.count, 0)

    const unknown = await api("GET", "/admin/regions?totally_unknown=1", undefined, token)
    assert.equal(unknown.status, 200)
  })

  it("every listed endpoint tolerates an unknown query param", async () => {
    for (const path of [
      "/admin/draft-orders",
      "/admin/orders",
      "/admin/customers",
      "/admin/users",
      "/admin/customer-groups",
      "/admin/invites",
      "/admin/sales-channels",
      "/admin/regions",
      "/admin/payment-collections",
      "/admin/returns",
      "/admin/claims",
      "/admin/exchanges",
    ]) {
      const r = await api("GET", `${path}?totally_unknown=1`, undefined, token)
      assert.equal(r.status, 200, `${path} answered ${r.status} for an unknown query param`)
    }
  })

  it("users / customer-groups keep ?q and gain created_at + order", async () => {
    const users = await api("GET", `/admin/users?q=${encodeURIComponent(adminEmail)}`, undefined, token)
    assert.equal(users.status, 200)
    assert.ok(users.json.users.length >= 1)

    const groups = await api("POST", "/admin/customer-groups", { name: `ListFiltGroup ${T}` }, token)
    assert.equal(groups.status, 201)
    const groupId = groups.json.customer_group?.id ?? groups.json.customer_group_id
    // q + created_at range, scoped to the group just created: `q=ListFiltGroup`
    // alone also matches every group earlier runs of this suite seeded, and the
    // default page is 50 rows, so an unscoped assertion would eventually fall
    // off the end of the page.
    const list = await api("GET", `/admin/customer-groups?q=ListFiltGroup&id=${groupId}&created_at_from=2000-01-01`, undefined, token)
    assert.equal(list.status, 200)
    assert.deepEqual(ids(list.json.customer_groups), [groupId])
    assert.equal(list.json.count, 1)
    const empty = await api("GET", "/admin/customer-groups?created_at_from=" + inDays(1), undefined, token)
    assert.equal(empty.json.count, 0)
  })

  it("returns / claims / exchanges accept status and created_at", async () => {
    const returns = await api("GET", "/admin/returns?status=requested&created_at_from=2000-01-01&limit=100", undefined, token)
    assert.equal(returns.status, 200)
    assert.ok(Array.isArray(returns.json.returns))
    const claims = await api("GET", "/admin/claims?status=requested&created_at_to=" + inDays(1), undefined, token)
    assert.equal(claims.status, 200)
    assert.ok(Array.isArray(claims.json.claims))
    const exchanges = await api("GET", "/admin/exchanges?status=requested", undefined, token)
    assert.equal(exchanges.status, 200)
    assert.ok(Array.isArray(exchanges.json.exchanges))
    const bogus = await api("GET", "/admin/claims?status=bogus", undefined, token)
    assert.equal(bogus.status, 200)
  })
})