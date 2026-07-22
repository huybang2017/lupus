import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { productService } from "../modules/product/product.service"
import { regionService } from "../modules/region/region.service"

// Lupus Next.js storefront contract: the Store API shapes and flows the ported storefront relies on
// (regions, products with calculated prices and filters, categories tree, collections, carts with
// Lupus totals, payment collection + session, order shape, customer registration and orders).
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

async function api(method: string, path: string, body?: any, token?: string, extra: Record<string, string> = {}) {
  const headers: any = { "content-type": "application/json", ...extra }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { _raw: text }
  }
  return { status: res.status, json }
}

describe("storefront parity", () => {
  const code = String(T).slice(-4)
  const cur = "zq" + String.fromCharCode(97 + (T % 26))
  const cur2 = "zr" + String.fromCharCode(97 + (T % 26))
  const handle = `sf-shirt-${T}`
  const email = `sf-${T}@example.com`
  const created = { regions: [] as string[], products: [] as string[], categories: [] as string[], collections: [] as string[], tags: [] as string[], carts: [] as string[] }
  let regionId = ""
  let region2Id = ""
  let productId = ""
  let variantId = ""
  let collectionId = ""
  let parentCat = ""
  let childCat = ""
  let tagId = ""
  let cartId = ""
  let orderId = ""
  let token = ""

  before(async () => {
    await migrate()
    server = buildApp().listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    // isolate from automatic promotions created by other suites
    await pool.query("UPDATE promotion SET status='draft' WHERE is_automatic=TRUE").catch(() => undefined)

    regionId = (await regionService.create({ name: `SF ${code}`, currency_code: cur, countries: ["xa"] })).id
    region2Id = (await regionService.create({ name: `SF2 ${code}`, currency_code: cur2, countries: [] })).id
    created.regions.push(regionId, region2Id)
    collectionId = (await pool.query(`INSERT INTO product_collection (title, handle) VALUES ($1,$2) RETURNING id`, [`SF Collection ${T}`, `sf-col-${T}`])).rows[0].id
    created.collections.push(collectionId)
    parentCat = (await pool.query(`INSERT INTO product_category (name, handle) VALUES ($1,$2) RETURNING id`, [`SF Parent ${T}`, `sf-parent-${T}`])).rows[0].id
    childCat = (await pool.query(`INSERT INTO product_category (name, handle, parent_category_id) VALUES ($1,$2,$3) RETURNING id`, [`SF Child ${T}`, `sf-child-${T}`, parentCat])).rows[0].id
    created.categories.push(childCat, parentCat)
    tagId = (await pool.query(`INSERT INTO product_tag (value) VALUES ($1) RETURNING id`, [`sf-tag-${T}`])).rows[0].id
    created.tags.push(tagId)
    const product = await productService.create({
      title: `SF Shirt ${T}`,
      handle,
      status: "published",
      variants: [{ title: "M", prices: [{ currency_code: cur, amount: 2500 }, { currency_code: cur2, amount: 900 }] }, { title: "L", prices: [{ currency_code: cur, amount: 2700 }] }],
    })
    productId = product.id
    created.products.push(productId)
    await pool.query(`UPDATE product SET collection_id=$2, thumbnail='http://example.com/t.png' WHERE id=$1`, [productId, collectionId])
    await pool.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2)`, [productId, childCat])
    await pool.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2)`, [productId, tagId])
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 AND title='M'`, [productId])
    variantId = v.rows[0].id
    for (const row of (await pool.query(`SELECT id FROM product_variant WHERE product_id=$1`, [productId])).rows) {
      await pool.query(`INSERT INTO inventory_level (variant_id, stocked_quantity) VALUES ($1,50) ON CONFLICT (variant_id) DO UPDATE SET stocked_quantity=50`, [row.id])
    }
  })

  after(async () => {
    const swallow = () => undefined
    await pool.query(`DELETE FROM "order" WHERE customer_id IN (SELECT id FROM customer WHERE email=$1)`, [email]).catch(swallow)
    for (const id of created.carts) await pool.query(`DELETE FROM cart WHERE id=$1`, [id]).catch(swallow)
    await pool.query(`DELETE FROM customer WHERE email=$1`, [email]).catch(swallow)
    await pool.query(`DELETE FROM provider_identity WHERE entity_id=$1`, [email]).catch(swallow)
    for (const id of created.products) await pool.query(`DELETE FROM product WHERE id=$1`, [id]).catch(swallow)
    for (const id of created.categories) await pool.query(`DELETE FROM product_category WHERE id=$1`, [id]).catch(swallow)
    for (const id of created.collections) await pool.query(`DELETE FROM product_collection WHERE id=$1`, [id]).catch(swallow)
    for (const id of created.tags) await pool.query(`DELETE FROM product_tag WHERE id=$1`, [id]).catch(swallow)
    for (const id of created.regions) await pool.query(`DELETE FROM region WHERE id=$1`, [id]).catch(swallow)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(swallow)
  })

  it("regions: Lupus list shape with countries and payment providers", async () => {
    const r = await api("GET", "/store/regions")
    assert.equal(r.status, 200)
    assert.equal(typeof r.json.count, "number")
    const mine = r.json.regions.find((x: any) => x.id === regionId)
    assert.ok(mine)
    assert.equal(mine.currency_code, cur)
    assert.equal(mine.countries.length, 1)
    assert.ok(mine.countries[0].iso_2)
    assert.ok(Array.isArray(mine.payment_providers))
    const one = await api("GET", `/store/regions/${regionId}`)
    assert.equal(one.json.region.id, regionId)
    assert.ok(one.json.region.countries[0].display_name)
  })

  it("products: count/paging, filters, order and region calculated prices", async () => {
    const list = await api("GET", `/store/products?handle=${handle}&region_id=${regionId}`)
    assert.equal(list.status, 200)
    assert.equal(list.json.count, 1)
    assert.equal(list.json.limit, 50)
    assert.equal(list.json.offset, 0)
    const p = list.json.products[0]
    assert.equal(p.id, productId)
    assert.equal(p.collection.handle, `sf-col-${T}`)
    assert.equal(p.categories[0].handle, `sf-child-${T}`)
    assert.equal(p.tags[0].value, `sf-tag-${T}`)
    const m = p.variants.find((x: any) => x.title === "M")
    assert.equal(m.calculated_price.calculated_amount, 2500)
    assert.equal(m.calculated_price.original_amount, 2500)
    assert.equal(m.calculated_price.currency_code, cur)

    const noCtx = await api("GET", `/store/products?handle=${handle}`)
    assert.equal(noCtx.json.products[0].variants[0].calculated_price, undefined)

    for (const q of [`collection_id=${collectionId}`, `category_id=${childCat}`, `tag_id=${tagId}`, `id=${productId}`, `q=${encodeURIComponent(`SF Shirt ${T}`)}`]) {
      const f = await api("GET", `/store/products?${q}`)
      assert.equal(f.json.count, 1, q)
      assert.equal(f.json.products[0].id, productId, q)
    }
    assert.equal((await api("GET", `/store/products?category_id=${parentCat}`)).json.count, 0)
    const paged = await api("GET", `/store/products?collection_id=${collectionId}&limit=1&offset=1`)
    assert.equal(paged.json.products.length, 0)
    assert.equal(paged.json.count, 1)
    const sorted = await api("GET", "/store/products?limit=2&order=-created_at")
    assert.equal(sorted.status, 200)
    assert.equal((await api("GET", `/store/products?handle=${handle}&region_id=reg_missing`)).status, 404)
    const retrieve = await api("GET", `/store/products/${productId}?region_id=${regionId}`)
    assert.equal(retrieve.json.product.variants.find((x: any) => x.title === "L").calculated_price.calculated_amount, 2700)
  })

  it("categories: filters, children and parent chain; collections by handle", async () => {
    const byHandle = await api("GET", `/store/product-categories?handle=sf-child-${T}`)
    assert.equal(byHandle.json.count, 1)
    assert.equal(byHandle.json.product_categories[0].parent_category.handle, `sf-parent-${T}`)
    const parent = await api("GET", `/store/product-categories?handle=sf-parent-${T}`)
    assert.equal(parent.json.product_categories[0].category_children[0].id, childCat)
    const roots = await api("GET", "/store/product-categories?parent_category_id=null&limit=1000")
    assert.ok(roots.json.product_categories.some((c: any) => c.id === parentCat))
    assert.ok(!roots.json.product_categories.some((c: any) => c.id === childCat))
    const col = await api("GET", `/store/collections?handle=sf-col-${T}`)
    assert.equal(col.json.count, 1)
    assert.equal(col.json.collections[0].id, collectionId)
    // internal categories stay out of the storefront
    await pool.query(`UPDATE product_category SET is_internal=TRUE WHERE id=$1`, [childCat])
    assert.equal((await api("GET", `/store/product-categories?handle=sf-child-${T}`)).json.count, 0)
    await pool.query(`UPDATE product_category SET is_internal=FALSE WHERE id=$1`, [childCat])
  })

  it("translations: x-lupus-locale overlays product, collection and category text with a language fallback", async () => {
    await pool.query(`INSERT INTO translation_locale (code) VALUES ('vi') ON CONFLICT DO NOTHING`)
