import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"

// Product domain parity with real Lupus (see plan: convert chuẩn module Product).
// Exercises the single-call create/update contract, the validation rules Lupus
// enforces (options required + every variant covers every option + prices required),
// the auth fix on the legacy product router, the money_amount -> price_set
// consolidation, the store API's hard status=published enforcement, and the
// previously-stubbed image<->variant batch endpoints.
const T = Date.now()

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

describe("product domain parity", () => {
  const email = `product-parity-${T}@example.com`
  let token = ""

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "parity-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) {
      await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    }
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("rejects admin product create with no bearer token", async () => {
    const res = await api("POST", "/admin/products", { title: `No auth ${T}` })
    assert.equal(res.status, 401)
  })

  it("creates a full product (options+variants+prices+images) in a single call", async () => {
    const res = await api(
      "POST",
      "/admin/products",
      {
        title: `Winter Jacket ${T}`,
        status: "published",
        images: [{ url: "https://example.com/a.png" }, { url: "https://example.com/b.png" }],
        options: [
          { title: "Size", values: ["S", "M"] },
          { title: "Color", values: ["Red", "Blue"] },
        ],
        variants: [
          { title: "S / Red", sku: `SKU-SR-${T}`, prices: [{ currency_code: "usd", amount: 1000 }], options: { Size: "S", Color: "Red" } },
          { title: "M / Blue", sku: `SKU-MB-${T}`, prices: [{ currency_code: "usd", amount: 1200 }], options: { Size: "M", Color: "Blue" } },
        ],
      },
      token
    )
    assert.equal(res.status, 201)
    const product = res.json.product
    assert.equal(product.thumbnail, "https://example.com/a.png")

    const detail = await api("GET", `/admin/products/${product.id}`, undefined, token)
    assert.equal(detail.status, 200)
    const full = detail.json.product
    assert.equal(full.options.length, 2)
    assert.equal(full.variants.length, 2)
    assert.equal(full.images.length, 2)
    const srVariant = full.variants.find((v: any) => v.title === "S / Red")
    assert.equal(srVariant.options.Size, "S")
    assert.equal(srVariant.options.Color, "Red")
    assert.equal(srVariant.prices[0].amount, 1000)

    const linkCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM product_variant_option_value pvov JOIN product_variant v ON v.id = pvov.variant_id WHERE v.product_id = $1`,
      [product.id]
    )
    assert.equal(linkCount.rows[0].c, 4)

    const priceSetRows = await pool.query(`SELECT price_set_id FROM product_variant WHERE product_id = $1`, [product.id])
    for (const row of priceSetRows.rows) {
      assert.ok(row.price_set_id, "variant should have a price_set_id")
    }
    const moneyAmountRows = await pool.query(
      `SELECT COUNT(*)::int AS c FROM money_amount ma JOIN product_variant v ON v.id = ma.variant_id WHERE v.product_id = $1`,
      [product.id]
    )
    assert.equal(moneyAmountRows.rows[0].c, 0, "new variants must not write to the deprecated money_amount table")
  })

  it("rejects a variant missing a value for a declared option", async () => {
    const res = await api(
      "POST",
      "/admin/products",
      {
        title: `Bad Variant ${T}`,
        options: [{ title: "Size", values: ["S", "M"] }],
        variants: [{ title: "Only size", prices: [{ currency_code: "usd", amount: 500 }], options: {} }],
      },
      token
    )
    assert.equal(res.status, 400)
  })

  it("rejects duplicate option titles", async () => {
    const res = await api(
      "POST",
      "/admin/products",
      {
        title: `Dup Option ${T}`,
        options: [
          { title: "Size", values: ["S"] },
          { title: "Size", values: ["M"] },
        ],
        variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 500 }], options: { Size: "S" } }],
      },
      token
    )
    assert.equal(res.status, 400)
  })

  it("rejects a variant with no prices", async () => {
    const res = await api(
      "POST",
      "/admin/products",
      { title: `No Price ${T}`, variants: [{ title: "V", prices: [] }] },
      token
    )
    assert.equal(res.status, 400)
  })

  it("update diffs variants/options/images by id (update existing, create new, remove missing)", async () => {
    const created = await api(
      "POST",
      "/admin/products",
      {
        title: `Diff Me ${T}`,
        status: "published",
        options: [{ title: "Size", values: ["S", "M"] }],
        variants: [
          { title: "S", sku: `DIFF-S-${T}`, prices: [{ currency_code: "usd", amount: 100 }], options: { Size: "S" } },
          { title: "M", sku: `DIFF-M-${T}`, prices: [{ currency_code: "usd", amount: 200 }], options: { Size: "M" } },
        ],
      },
      token
    )
    assert.equal(created.status, 201)
    const before = (await api("GET", `/admin/products/${created.json.product.id}`, undefined, token)).json.product
    const sVariant = before.variants.find((v: any) => v.title === "S")
    const mVariant = before.variants.find((v: any) => v.title === "M")

    const updated = await api(
      "POST",
      `/admin/products/${created.json.product.id}`,
      {
        variants: [
          { id: sVariant.id, title: "S", prices: [{ currency_code: "usd", amount: 150 }] },
          { title: "L", prices: [{ currency_code: "usd", amount: 300 }], options: { Size: "L" } },
        ],
        options: [{ id: before.options[0].id, title: "Size", values: ["S", "M", "L"] }],
      },
      token
    )
    assert.equal(updated.status, 200)

    const after = (await api("GET", `/admin/products/${created.json.product.id}`, undefined, token)).json.product
    assert.equal(after.variants.length, 2, "M variant (omitted from the update) should be removed")
    assert.ok(!after.variants.some((v: any) => v.id === mVariant.id))
    const keptS = after.variants.find((v: any) => v.id === sVariant.id)
    assert.equal(Number(keptS.prices[0].amount), 150)
    assert.ok(after.variants.some((v: any) => v.title === "L"))
  })

  it("store API only ever returns published products and carries options/images", async () => {
    const draft = await api("POST", "/admin/products", { title: `Draft Only ${T}`, status: "draft", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 100 }] }] }, token)
    assert.equal(draft.status, 201)
    const storeDraft = await api("GET", `/store/products/${draft.json.product.id}`)
    assert.equal(storeDraft.status, 404)

    const storeList = await api("GET", `/store/products?q=${encodeURIComponent(`Draft Only ${T}`)}`)
    assert.equal(storeList.status, 200)
    assert.equal(storeList.json.products.length, 0, "draft products must never appear on the store API")

    const pub = await api(
      "POST",
      "/admin/products",
      {
        title: `Store Shown ${T}`,
        status: "published",
        options: [{ title: "Size", values: ["S"] }],
        images: [{ url: "https://example.com/s.png" }],
        variants: [{ title: "S", prices: [{ currency_code: "usd", amount: 777 }], options: { Size: "S" } }],
      },
      token
    )
    assert.equal(pub.status, 201)
    const storePub = await api("GET", `/store/products/${pub.json.product.id}`)
    assert.equal(storePub.status, 200)
    assert.equal(storePub.json.product.options.length, 1)
    assert.equal(storePub.json.product.images.length, 1)
    assert.equal(storePub.json.product.variants[0].options[0].value, "S")
    assert.equal(typeof storePub.json.product.variants[0].manage_inventory, "boolean")
  })

  it("stores product attributes, lists sales channels and sorts by title", async () => {
    const sc = await api("POST", "/admin/sales-channels", { name: `Attr SC ${T}` }, token)
    assert.equal(sc.status, 201)
    const scId = sc.json.sales_channel.id
    const a = await api(
      "POST",
      "/admin/products",
      {
        title: `AAA Attr ${T}`,
        height: 10,
        width: 20,
        length: 30,
        weight: 4,
        mid_code: "MID",
        hs_code: "HS1",
        origin_country: "VN",
        material: "cotton",
        sales_channels: [{ id: scId }],
        variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 100 }] }],
      },
      token
    )
    assert.equal(a.status, 201)
    const id = a.json.product.id
    const upd = await api("POST", `/admin/products/${id}`, { height: 11, hs_code: null, metadata: { k: "v" } }, token)
    assert.equal(upd.status, 200)
    const got = (await api("GET", `/admin/products/${id}`, undefined, token)).json.product
    assert.equal(Number(got.height), 11)
    assert.equal(Number(got.width), 20)
    assert.equal(got.hs_code, null)
    assert.equal(got.material, "cotton")
    assert.equal(got.origin_country, "VN")
    assert.deepEqual(got.metadata, { k: "v" })
    assert.deepEqual(got.sales_channels.map((c: any) => c.id), [scId])
    const sorted = await api("GET", `/admin/products?order=title&q=${encodeURIComponent(`Attr ${T}`)}`, undefined, token)
    assert.equal(sorted.status, 200)
    assert.ok(sorted.json.products.some((p: any) => p.id === id))
  })

  it("batch-updates variants (title, sku, inventory flags, prices) in one call", async () => {
    const created = await api(
      "POST",
      "/admin/products",
      { title: `Batch Var ${T}`, variants: [{ title: "V1", prices: [{ currency_code: "usd", amount: 100 }] }] },
      token
    )
    assert.equal(created.status, 201)
    const pid = created.json.product.id
    const vid = (await api("GET", `/admin/products/${pid}`, undefined, token)).json.product.variants[0].id
    const res = await api(
      "POST",
      `/admin/products/${pid}/variants/batch`,
      { update: [{ id: vid, title: "V1b", sku: `BV-${T}`, manage_inventory: false, allow_backorder: true, prices: [{ currency_code: "usd", amount: 250 }] }] },
      token
    )
    assert.equal(res.status, 200)
    const v = (await api("GET", `/admin/products/${pid}`, undefined, token)).json.product.variants[0]
    assert.equal(v.title, "V1b")
    assert.equal(v.sku, `BV-${T}`)
    assert.equal(v.manage_inventory, false)
    assert.equal(v.allow_backorder, true)
    assert.equal(Number(v.prices[0].amount), 250)
  })

  it("persists variant<->image associations through the batch endpoint (previously a no-op stub)", async () => {
    const created = await api(
      "POST",
      "/admin/products",
      {
        title: `Image Link ${T}`,
        images: [{ url: "https://example.com/x.png" }],
        variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 100 }] }],
      },
      token
    )
    assert.equal(created.status, 201)
    const product = (await api("GET", `/admin/products/${created.json.product.id}`, undefined, token)).json.product
    const imageId = product.images[0].id
    const variantId = product.variants[0].id

    const link = await api(
      "POST",
      `/admin/products/${product.id}/images/${imageId}/variants/batch`,
      { add: [variantId] },
      token
    )
    assert.equal(link.status, 200)
    assert.deepEqual(link.json.added, [variantId])

    const row = await pool.query(`SELECT 1 FROM product_variant_image WHERE variant_id = $1 AND image_id = $2`, [variantId, imageId])
    assert.equal(row.rows.length, 1, "the link must actually be persisted")

    const refetched = await api("GET", `/admin/products/${product.id}`, undefined, token)
    const refetchedVariant = refetched.json.product.variants.find((v: any) => v.id === variantId)
    assert.equal(refetchedVariant.images.length, 1)
  })

  it("creates global (non-exclusive) options without a product and filters them by type", async () => {
    const title = `Global ${T}`
    const created = await api("POST", "/admin/product-options", { title, values: ["S", "M", "S"] }, token)
    assert.equal(created.status, 201)
    const opt = created.json.product_option
    assert.equal(opt.product_id, null)
    assert.equal(opt.is_exclusive, false)
    assert.deepEqual(opt.values.map((v: any) => v.value).sort(), ["M", "S"], "duplicate values are collapsed")

    const dup = await api("POST", "/admin/product-options", { title: title.toLowerCase(), values: ["X"] }, token)
    assert.equal(dup.status, 409, "global option titles are unique (case-insensitive)")

    const globals = await api("GET", `/admin/product-options?is_exclusive=false&q=${encodeURIComponent(title)}`, undefined, token)
    assert.deepEqual(globals.json.product_options.map((o: any) => o.id), [opt.id])
    const exclusive = await api("GET", `/admin/product-options?is_exclusive=true&q=${encodeURIComponent(title)}`, undefined, token)
    assert.equal(exclusive.json.product_options.length, 0)

    // an option created inside a product stays exclusive to it
    const p = await api("POST", "/admin/products", { title: `Excl ${T}`, options: [{ title: `Excl ${T}`, values: ["a"] }], variants: [{ title: "a", options: { [`Excl ${T}`]: "a" }, prices: [{ currency_code: "usd", amount: 1 }] }] }, token)
    assert.equal(p.status, 201)
    const row = await pool.query(`SELECT is_exclusive FROM product_option WHERE product_id = $1`, [p.json.product.id])
    assert.equal(row.rows[0].is_exclusive, true)
  })

  it("keeps option values in the order they are saved (rank), adding and removing as needed", async () => {
    const created = await api("POST", "/admin/product-options", { title: `Ranked ${T}`, values: ["A", "B", "C"] }, token)
    const id = created.json.product_option.id
    assert.deepEqual(created.json.product_option.values.map((v: any) => v.value), ["A", "B", "C"])

    const updated = await api("POST", `/admin/product-options/${id}`, { values: ["C", "A", "D"] }, token)
    assert.equal(updated.status, 200)
    assert.deepEqual(updated.json.product_option.values.map((v: any) => v.value), ["C", "A", "D"], "reordered, B removed, D added")

    const list = await api("GET", `/admin/product-options?id=${id}`, undefined, token)
    assert.deepEqual(list.json.product_options[0].values.map((v: any) => v.value), ["C", "A", "D"])
    const values = await api("GET", `/admin/product-options/${id}/values`, undefined, token)
    assert.deepEqual(values.json.product_option_values.map((v: any) => v.value), ["C", "A", "D"])
  })

  it("creates an inventory item with stock levels in one call and rejects unknown locations without leaving an item behind", async () => {
    const loc = await api("POST", "/admin/stock-locations", { name: `Loc ${T}` }, token)
    assert.equal(loc.status, 201)
    const locationId = loc.json.stock_location.id

    const ok = await api(
      "POST",
      "/admin/inventory-items",
      { title: `Inv ${T}`, levels: [{ location_id: locationId, stocked_quantity: 7 }] },
      token
    )
    assert.equal(ok.status, 201)
    const lvl = await pool.query(`SELECT stocked_quantity FROM inventory_level_location WHERE inventory_item_id = $1`, [ok.json.inventory_item.id])
    assert.equal(lvl.rows[0].stocked_quantity, 7)

    const bad = await api(
      "POST",
      "/admin/inventory-items",
      { title: `Inv bad ${T}`, levels: [{ location_id: "sloc_missing", stocked_quantity: 1 }] },
      token
    )
    assert.equal(bad.status, 404)
    const left = await pool.query(`SELECT 1 FROM inventory_item WHERE title = $1`, [`Inv bad ${T}`])
    assert.equal(left.rows.length, 0, "the transaction must roll back the item")

    const negative = await api("POST", "/admin/inventory-items", { title: `Inv neg ${T}`, levels: [{ location_id: locationId, stocked_quantity: -1 }] }, token)
    assert.equal(negative.status, 400)
  })

  it("inventory item: null clears a field, levels expose available_quantity, and the batch endpoint links/unlinks locations", async () => {
    const locA = (await api("POST", "/admin/stock-locations", { name: `LocA ${T}` }, token)).json.stock_location.id
    const locB = (await api("POST", "/admin/stock-locations", { name: `LocB ${T}` }, token)).json.stock_location.id
    const created = await api(
      "POST",
      "/admin/inventory-items",
      { title: `Inv upd ${T}`, sku: `SKU-${T}`, mid_code: "MID1", levels: [{ location_id: locA, stocked_quantity: 10 }] },
      token
    )
    const id = created.json.inventory_item.id

    const cleared = await api("POST", `/admin/inventory-items/${id}`, { mid_code: null }, token)
    assert.equal(cleared.status, 200)
    assert.equal(cleared.json.inventory_item.mid_code, null, "an explicit null must clear the field")
    assert.equal(cleared.json.inventory_item.sku, `SKU-${T}`, "fields that are not sent stay untouched")

    const lvlA = cleared.json.inventory_item.location_levels.find((l: any) => l.location_id === locA)
    assert.equal(lvlA.available_quantity, 10)

    const linked = await api("POST", `/admin/inventory-items/${id}/location-levels/batch`, { create: [{ location_id: locB }] }, token)
    assert.equal(linked.status, 200)
    const afterLink = await api("GET", `/admin/inventory-items/${id}`, undefined, token)
    assert.deepEqual(afterLink.json.inventory_item.location_levels.map((l: any) => l.location_id).sort(), [locA, locB].sort())

    const levelB = afterLink.json.inventory_item.location_levels.find((l: any) => l.location_id === locB)
    const unlinked = await api("POST", `/admin/inventory-items/${id}/location-levels/batch`, { delete: [levelB.id] }, token)
    assert.equal(unlinked.status, 200)
    const afterUnlink = await api("GET", `/admin/inventory-items/${id}`, undefined, token)
    assert.deepEqual(afterUnlink.json.inventory_item.location_levels.map((l: any) => l.location_id), [locA])

    const over = await api("POST", "/admin/reservations", { inventory_item_id: id, location_id: locA, quantity: 11 }, token)
    assert.ok(over.status >= 400 && over.status < 500, "reserving more than available is rejected")
    const ok = await api("POST", "/admin/reservations", { inventory_item_id: id, location_id: locA, quantity: 4 }, token)
    assert.equal(ok.status, 201)
    const after = await api("GET", `/admin/inventory-items/${id}`, undefined, token)
    const lvl = after.json.inventory_item.location_levels.find((l: any) => l.location_id === locA)
    assert.equal(lvl.available_quantity, 6)
  })

  it("promotion create validates value ranges, currency, dates and duplicate codes", async () => {
    const code = `PV${T}`
    const base = { code, application_type: "percentage", application_target: "order", application_value: 10 }

    const over = await api("POST", "/admin/promotions", { ...base, application_value: 150 }, token)
    assert.equal(over.status, 400, "a percentage above 100 is rejected")

    const noValue = await api("POST", "/admin/promotions", { code: `${code}A`, application_type: "percentage", application_target: "order" }, token)
    assert.equal(noValue.status, 400, "a percentage needs a value")

    const noCurrency = await api("POST", "/admin/promotions", { code: `${code}B`, application_type: "fixed", application_target: "order", application_value: 500 }, token)
    assert.equal(noCurrency.status, 400, "a fixed amount needs a currency")

    const badDates = await api(
      "POST",
      "/admin/promotions",
      { ...base, code: `${code}C`, starts_at: "2030-01-02T00:00:00.000Z", ends_at: "2030-01-01T00:00:00.000Z" },
      token
    )
    assert.equal(badDates.status, 400, "ends_at must be after starts_at")

    const ok = await api("POST", "/admin/promotions", base, token)
    assert.equal(ok.status, 201)
    const dup = await api("POST", "/admin/promotions", base, token)
    assert.equal(dup.status, 409, "the same code cannot be created twice")
  })
})
