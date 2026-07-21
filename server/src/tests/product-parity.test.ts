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
