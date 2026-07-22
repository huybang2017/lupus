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
    const put = (entity: string, id: string, field: string, text: string) =>
      pool.query(
        `INSERT INTO translation (locale_code, entity, entity_id, field, text) VALUES ('vi',$1,$2,$3,$4) ON CONFLICT (locale_code, entity, entity_id, field) DO UPDATE SET text=$4`,
        [entity, id, field, text]
      )
    await put("product", productId, "title", `Ao thun ${T}`)
    await put("product_collection", collectionId, "title", `Bo suu tap ${T}`)
    await put("product_category", childCat, "name", `Ao so mi ${T}`)
    try {
      const vi = await api("GET", `/store/products?handle=${handle}`, undefined, undefined, { "x-lupus-locale": "vi-VN" })
      assert.equal(vi.json.products[0].title, `Ao thun ${T}`, "vi-vn falls back to the vi translation")
      assert.equal(vi.json.products[0].collection.title, `Bo suu tap ${T}`)
      assert.equal(vi.json.products[0].categories[0].name, `Ao so mi ${T}`)
      assert.equal(vi.json.products[0].handle, handle, "untranslated fields stay")
      const cats = await api("GET", `/store/product-categories?handle=sf-child-${T}`, undefined, undefined, { "x-lupus-locale": "vi" })
      assert.equal(cats.json.product_categories[0].name, `Ao so mi ${T}`)
      const cols = await api("GET", `/store/collections?handle=sf-col-${T}`, undefined, undefined, { "x-lupus-locale": "vi" })
      assert.equal(cols.json.collections[0].title, `Bo suu tap ${T}`)
      const plain = await api("GET", `/store/products?handle=${handle}`)
      assert.equal(plain.json.products[0].title, `SF Shirt ${T}`)
      const other = await api("GET", `/store/products?handle=${handle}`, undefined, undefined, { "x-lupus-locale": "de" })
      assert.equal(other.json.products[0].title, `SF Shirt ${T}`)
    } finally {
      await pool.query(`DELETE FROM translation WHERE entity_id = ANY($1)`, [[productId, collectionId, childCat]])
    }
  })

  it("cart: region currency, Lupus totals, addresses, region move, shipping tamper guard", async () => {
    const created1 = await api("POST", "/store/carts", { region_id: regionId })
    assert.equal(created1.status, 201)
    cartId = created1.json.cart.id
    created.carts.push(cartId)
    assert.equal(created1.json.cart.currency_code, cur)
    assert.equal(created1.json.cart.region.id, regionId)

    const add = await api("POST", `/store/carts/${cartId}/line-items`, { variant_id: variantId, quantity: 2 })
    assert.equal(add.status, 201)
    const item = add.json.cart.items[0]
    assert.equal(item.product_title, `SF Shirt ${T}`)
    assert.equal(item.product_handle, handle)
    assert.equal(item.thumbnail, "http://example.com/t.png")
    assert.equal(item.subtotal, 5000)
    assert.equal(item.total, 5000)
    assert.equal(add.json.cart.subtotal, 5000)
    assert.equal(add.json.cart.total, 5000)
    assert.equal(add.json.cart.totals.total, 5000)
    assert.equal(add.json.cart.shipping_total, 0)

    const upd = await api("POST", `/store/carts/${cartId}`, {
      email,
      shipping_address: { first_name: "Sam", last_name: "Front", address_1: "1 Main", address_2: "Apt 2", company: "Acme", city: "Town", country_code: "dk", postal_code: "1000", province: "X", phone: "123" },
      billing_address: { first_name: "Sam", last_name: "Front", address_1: "1 Main", city: "Town", country_code: "dk", postal_code: "1000" },
    })
    assert.equal(upd.status, 200)
    assert.equal(upd.json.cart.email, email)
    assert.equal(upd.json.cart.shipping_address.address_2, "Apt 2")
    assert.equal(upd.json.cart.shipping_address.company, "Acme")
    assert.equal(upd.json.cart.billing_address.city, "Town")

    const options = await api("GET", `/store/shipping-options?cart_id=${cartId}`)
    assert.equal(options.status, 200)
    assert.ok(Array.isArray(options.json.shipping_options))
    // the price is never taken from the request: an option the cart is not offered is refused
    const forged = await api("POST", `/store/carts/${cartId}/shipping-methods`, { option_id: "so_forged", name: "Free", amount: 0 })
    assert.equal(forged.status, 400)
    const noOption = await api("POST", `/store/carts/${cartId}/shipping-methods`, { name: "Free", amount: 0 })
    assert.equal(noOption.status, 400)

    // moving to a region in another currency reprices the line (variant M has a price there)
    const moved = await api("POST", `/store/carts/${cartId}`, { region_id: region2Id })
    assert.equal(moved.status, 200)
    assert.equal(moved.json.cart.currency_code, cur2)
    assert.equal(moved.json.cart.items[0].unit_price, 900)
    assert.equal(moved.json.cart.total, 1800)
    const back = await api("POST", `/store/carts/${cartId}`, { region_id: regionId })
    assert.equal(back.json.cart.items[0].unit_price, 2500)

    // a variant without a price in the target currency blocks the move instead of silently dropping it
    const l = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 AND title='L'`, [productId])
    await api("POST", `/store/carts/${cartId}/line-items`, { variant_id: l.rows[0].id, quantity: 1 })
    const blocked = await api("POST", `/store/carts/${cartId}`, { region_id: region2Id })
    assert.equal(blocked.status, 400)
    const still = await api("GET", `/store/carts/${cartId}`)
    assert.equal(still.json.cart.currency_code, cur)
    const line = still.json.cart.items.find((i: any) => i.variant_id === l.rows[0].id)
    await api("DELETE", `/store/carts/${cartId}/line-items/${line.id}`)
  })

  it("payment: providers per region, one collection per cart, session replaced on re-init", async () => {
    const providers = await api("GET", `/store/payment-providers?region_id=${regionId}`)
    assert.ok(providers.json.payment_providers.some((p: any) => p.id === "pp_system_default"))
    const a = await api("POST", "/store/payment-collections", { cart_id: cartId })
    assert.equal(a.status, 201)
    const b = await api("POST", "/store/payment-collections", { cart_id: cartId })
    assert.equal(b.json.payment_collection.id, a.json.payment_collection.id)
    const s1 = await api("POST", `/store/payment-collections/${a.json.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" })
    assert.equal(s1.status, 201)
    assert.equal(s1.json.payment_collection.payment_sessions.length, 1)
    const s2 = await api("POST", `/store/payment-collections/${a.json.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" })
    assert.equal(s2.json.payment_collection.payment_sessions.length, 1)
    const cart = await api("GET", `/store/carts/${cartId}`)
    assert.equal(cart.json.cart.payment_collection.payment_sessions[0].provider_id, "pp_system_default")
  })

  it("complete: order carries addresses, payment and Lupus totals", async () => {
    const done = await api("POST", `/store/carts/${cartId}/complete`)
    assert.equal(done.status, 201)
    assert.equal(done.json.type, "order")
    const order = done.json.order
    orderId = order.id
    assert.equal(order.email, email)
    assert.equal(order.shipping_address.company, "Acme")
    assert.equal(order.billing_address.first_name, "Sam")
    assert.equal(order.payment_status, "authorized")
    assert.equal(order.payment_collections[0].payments[0].provider_id, "pp_system_default")
    assert.equal(order.items[0].product_title, `SF Shirt ${T}`)
    assert.equal(order.items[0].variant_title, "M")
    assert.equal(order.items[0].total, 5000)
    assert.equal(order.fulfillment_status, "not_fulfilled")
    const again = await api("GET", `/store/orders/${orderId}`)
    assert.equal(again.json.order.id, orderId)
    const dupe = await api("POST", `/store/carts/${cartId}/complete`)
    assert.equal(dupe.status, 400)
  })

  it("customer: register, profile fill-in with the token, addresses and own orders", async () => {
    const reg = await api("POST", "/auth/customer/emailpass/register", { email, password: "sf-pass-1234" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const profile = await api("POST", "/store/customers", { email, first_name: "Sam", last_name: "Front", phone: "555" }, token)
    assert.ok([200, 201].includes(profile.status))
    assert.equal(profile.json.customer.first_name, "Sam")
    const login = await api("POST", "/auth/customer/emailpass", { email, password: "sf-pass-1234" })
    assert.equal(login.status, 200)
    token = login.json.token
    const me = await api("GET", "/store/customers/me", undefined, token)
    assert.equal(me.json.customer.email, email)
    assert.equal(me.json.customer.last_name, "Front")
    assert.ok(Array.isArray(me.json.customer.addresses))
    const addr = await api("POST", "/store/customers/me/addresses", { first_name: "Sam", last_name: "Front", address_1: "1 Main", city: "Town", country_code: "dk", postal_code: "1000", is_default_shipping: true }, token)
    assert.equal(addr.status, 201)
    const me2 = await api("GET", "/store/customers/me", undefined, token)
    assert.equal(me2.json.customer.addresses.length, 1)
    assert.equal(me2.json.customer.addresses[0].is_default_shipping, true)
    const orders = await api("GET", "/store/orders?limit=10", undefined, token)
    assert.equal(orders.status, 200)
    assert.ok(orders.json.orders.some((o: any) => o.id === orderId))
    assert.equal((await api("GET", "/store/orders")).status, 401)
    const locales = await api("GET", "/store/locales")
    assert.ok(locales.json.locales.every((l: any) => l.code && l.name))
  })

  it("cart: a cart created while signed in belongs to the customer and a guest cart can be transferred", async () => {
    const mine = await api("POST", "/store/carts", { region_id: regionId }, token)
    assert.equal(mine.status, 201)
    created.carts.push(mine.json.cart.id)
    assert.ok(mine.json.cart.customer_id, "the signed-in customer is attached")
    assert.equal(mine.json.cart.email, email)
    const guest = await api("POST", "/store/carts", { region_id: regionId })
    created.carts.push(guest.json.cart.id)
    assert.equal(guest.json.cart.customer_id, null)
    assert.equal((await api("POST", `/store/carts/${guest.json.cart.id}/customer`, {})).status, 401, "transfer needs a token")
    const moved = await api("POST", `/store/carts/${guest.json.cart.id}/customer`, {}, token)
    assert.equal(moved.status, 200)
    assert.equal(moved.json.cart.customer_id, mine.json.cart.customer_id)
  })

  it("order transfer: the requester asks, the current owner approves or refuses with the emailed token", async () => {
    const emailB = `sf-b-${T}@example.com`
    const regB = await api("POST", "/auth/customer/emailpass/register", { email: emailB, password: "sf-pass-1234", first_name: "Bea", last_name: "Taker" })
    assert.equal(regB.status, 200)
    const tokenB = regB.json.token
    try {
      // the owner cannot request their own order; an unknown order is a 404
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/request`, {}, token)).status, 400)
      assert.equal((await api("POST", "/store/orders/order_missing/transfer/request", {}, tokenB)).status, 404)

      const req = await api("POST", `/store/orders/${orderId}/transfer/request`, {}, tokenB)
      assert.equal(req.status, 201)
      assert.equal(req.json.order.id, orderId)
      assert.equal(req.json.order.email, "s***@example.com", "the order email is masked for the requester")
      assert.equal(Object.keys(req.json.order).length, 2, "nothing else about the order is returned")
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/request`, {}, tokenB)).status, 400, "one pending request at a time")

      const mail = await pool.query(`SELECT data FROM notification WHERE to_address=$1 AND template='order-transfer-requested' ORDER BY created_at DESC LIMIT 1`, [email])
      const transferToken = (typeof mail.rows[0].data === "string" ? JSON.parse(mail.rows[0].data) : mail.rows[0].data).token
      assert.ok(transferToken)

      // wrong token and wrong party are refused
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/accept`, { token: "nope" }, token)).status, 400)
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/accept`, { token: transferToken }, tokenB)).status, 404, "the requester cannot approve their own request")

      const accepted = await api("POST", `/store/orders/${orderId}/transfer/accept`, { token: transferToken }, token)
      assert.equal(accepted.status, 200)
      assert.equal(accepted.json.order.email, emailB)
      const mineB = await api("GET", "/store/orders", undefined, tokenB)
      assert.ok(mineB.json.orders.some((o: any) => o.id === orderId))
      const mineA = await api("GET", "/store/orders", undefined, token)
      assert.ok(!mineA.json.orders.some((o: any) => o.id === orderId))
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/accept`, { token: transferToken }, token)).status, 404, "a token works once")

      // the original owner asks to get it back; the new owner declines
      const back = await api("POST", `/store/orders/${orderId}/transfer/request`, {}, token)
      assert.equal(back.status, 201)
      const mail2 = await pool.query(`SELECT data FROM notification WHERE to_address=$1 AND template='order-transfer-requested' ORDER BY created_at DESC LIMIT 1`, [emailB])
      const token2 = (typeof mail2.rows[0].data === "string" ? JSON.parse(mail2.rows[0].data) : mail2.rows[0].data).token
      const declined = await api("POST", `/store/orders/${orderId}/transfer/decline`, { token: token2 }, tokenB)
      assert.equal(declined.status, 200)
      assert.equal(declined.json.order.email, emailB, "a declined request leaves the owner unchanged")

      // the requester can withdraw a request
      const again = await api("POST", `/store/orders/${orderId}/transfer/request`, {}, token)
      assert.equal(again.status, 201)
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/cancel`, {}, tokenB)).status, 404, "only the requester can cancel")
      assert.equal((await api("POST", `/store/orders/${orderId}/transfer/cancel`, {}, token)).status, 200)
    } finally {
      await pool.query(`DELETE FROM "order" WHERE id=$1`, [orderId]).catch(() => undefined)
      await pool.query(`DELETE FROM notification WHERE to_address = ANY($1)`, [[email, emailB]]).catch(() => undefined)
      await pool.query(`DELETE FROM customer WHERE email=$1`, [emailB]).catch(() => undefined)
      await pool.query(`DELETE FROM provider_identity WHERE entity_id=$1`, [emailB]).catch(() => undefined)
    }
  })
})
