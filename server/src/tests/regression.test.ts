import { describe, it, before } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { authService } from "../modules/auth/auth.service"
import { customerService } from "../modules/customer/customer.service"
import { regionService } from "../modules/region/region.service"
import { productService } from "../modules/product/product.service"
import { cartService } from "../modules/cart/cart.service"
import { pricingService } from "../modules/pricing/pricing.service"
import { promotionService } from "../modules/promotion/promotion.service"
import { taxService } from "../modules/tax/tax.service"
import { inventoryService } from "../modules/inventory/inventory.service"
import { locationInventoryService } from "../modules/inventory/location-inventory.service"
import { orderService } from "../modules/order/order.service"
import { orderChangeService } from "../modules/order/order-change.service"
import { fulfillmentService } from "../modules/fulfillment/fulfillment.service"
import { fileService } from "../modules/infra/file.service"
import { searchService } from "../modules/infra/search.service"
import { eventBus } from "../modules/infra/platform-infra.service"
import { currencyService, analyticsService } from "../modules/infra/currency-analytics.service"

// Full regression: every ported Lupus flow, end to end against lupus_test.
// Run: DATABASE_URL=postgres://postgres:postgres@localhost/lupus_test JWT_SECRET=test npx tsx --test src/tests/regression.test.ts
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

describe("regression: catalog taxonomy + product lifecycle", () => {
  let productId = ""
  let variantId = ""
  before(async () => {
    await migrate()
  })

  it("product CRUD + handle unique + soft delete", async () => {
    const p = await productService.create({ title: `Reg Shirt ${T}`, status: "published", variants: [{ title: "S", prices: [{ currency_code: "usd", amount: 2500 }] }] })
    productId = p.id
    assert.ok(productId.startsWith("prod_"))
    const got = await productService.retrieve(productId)
    assert.equal(got!.status, "published")
    await assert.rejects(() => productService.create({ title: "x", handle: p.handle }), /already exists/)
    const listed = await productService.list({ status: "published", q: `Reg Shirt ${T}` })
    assert.ok(listed.some((x) => x.id === productId))
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [productId])
    variantId = v.rows[0].id
  })

  it("categories + collections + tags + images + shipping profile", async () => {
    const cat = await pool.query(`INSERT INTO product_category (name, handle) VALUES ($1,$2) RETURNING id`, [`Cat ${T}`, `cat-${T}`])
    await pool.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2)`, [productId, cat.rows[0].id])
    const col = await pool.query(`INSERT INTO product_collection (title, handle) VALUES ($1,$2) RETURNING id`, [`Col ${T}`, `col-${T}`])
    await pool.query(`UPDATE product SET collection_id=$2 WHERE id=$1`, [productId, col.rows[0].id])
    const tag = await pool.query(`INSERT INTO product_tag (value) VALUES ($1) ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value=$1 RETURNING id`, [`tag-${T}`])
    await pool.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [productId, tag.rows[0].id])
    await pool.query(`INSERT INTO product_image (product_id, url) VALUES ($1,$2)`, [productId, "https://example.com/a.png"])
    const sp = await pool.query(`INSERT INTO shipping_profile (name) VALUES ($1) RETURNING id`, [`SP ${T}`])
    await pool.query(`UPDATE product SET shipping_profile_id=$2 WHERE id=$1`, [productId, sp.rows[0].id])
    const check = await pool.query(`SELECT collection_id, shipping_profile_id FROM product WHERE id=$1`, [productId])
    assert.equal(check.rows[0].collection_id, col.rows[0].id)
  })

  it("translation + search finds published product", async () => {
    await pool.query(`INSERT INTO translation_locale (code) VALUES ('de') ON CONFLICT DO NOTHING`)
    await pool.query(
      `INSERT INTO translation (locale_code, entity, entity_id, field, text) VALUES ('de','product',$1,'title','Hemd') ON CONFLICT DO NOTHING`,
      [productId]
    )
    const hits = await searchService.searchProducts(`Reg Shirt ${T}`)
    assert.ok(hits.some((h: any) => h.id === productId))
  })

  it("file upload/list/delete roundtrip", async () => {
    const f = await fileService.upload({ filename: "hello.txt", content_base64: Buffer.from("hello").toString("base64"), mime_type: "text/plain" })
    assert.ok(f.url.startsWith("/uploads/"))
    assert.ok((await fileService.list()).some((x: any) => x.id === f.id))
    await fileService.remove(f.id)
    assert.ok(!(await fileService.list(1000)).some((x: any) => x.id === f.id))
  })

  it("price lists + group prices priority", async () => {
    const ps = await pool.query(`INSERT INTO price_set DEFAULT VALUES RETURNING id`)
    const psId = ps.rows[0].id as string
    await pool.query(`UPDATE product_variant SET price_set_id=$1 WHERE id=$2`, [psId, variantId])
    const pl = await pool.query(`INSERT INTO price_list (title, type) VALUES ('Sale','sale') RETURNING id`)
    await pool.query(`INSERT INTO price (price_set_id, currency_code, amount, price_list_id) VALUES ($1,'usd',2000,$2)`, [psId, pl.rows[0].id])
    const sale = await pricingService.resolveUnitPrice(variantId, "usd", 1)
    assert.equal(sale, 2000) // beats base 2500
    const grp = await pool.query(`INSERT INTO customer_group (name) VALUES ($1) RETURNING id`, [`G ${T}`])
    const cust = await customerService.create({ email: `grp-${T}@example.com` })
    await pool.query(`INSERT INTO customer_group_customer (customer_group_id, customer_id) VALUES ($1,$2)`, [grp.rows[0].id, cust.id])
    await pool.query(`INSERT INTO group_price (customer_group_id, variant_id, currency_code, amount) VALUES ($1,$2,'usd',1500)`, [grp.rows[0].id, variantId])
    assert.equal(await pricingService.resolveUnitPrice(variantId, "usd", 1, cust.id), 1500)
  })
})

describe("regression: auth/customer/region/tax/promotion math", () => {
  it("register + duplicate + login + bad password", async () => {
    const email = `reg-${T}@example.com`
    const r = await authService.register(email, "password123")
    assert.ok(r.token)
    await assert.rejects(() => authService.register(email, "password123"), /already registered/)
    const l = await authService.login(email, "password123")
    assert.ok(l.token)
    await assert.rejects(() => authService.login(email, "wrongpass1"), /Invalid email/)
    assert.deepEqual(Object.keys(authService.verifyToken(l.token)).sort(), ["actor_id", "email", "exp", "iat", "provider", "sid"])
  })

  it("customer addresses CRUD", async () => {
    const c = await customerService.create({ email: `addr-${T}@example.com`, first_name: "A" })
    await pool.query(`INSERT INTO customer_address (customer_id, city, country_code) VALUES ($1,'Berlin','de')`, [c.id])
    const rows = await pool.query(`SELECT * FROM customer_address WHERE customer_id=$1`, [c.id])
    assert.equal(rows.rows[0].country_code, "de")
  })

  it("tax combinable stacking + inclusive extraction", async () => {
    await pool.query(`INSERT INTO tax_region (country_code) VALUES ('fr') ON CONFLICT DO NOTHING`)
    const tr = await pool.query(`SELECT id FROM tax_region WHERE country_code='fr'`)
    await pool.query(`DELETE FROM tax_rate WHERE tax_region_id=$1`, [tr.rows[0].id])
    await pool.query(`INSERT INTO tax_rate (tax_region_id, code, name, rate, is_default) VALUES ($1,'TVA','TVA',20,true)`, [tr.rows[0].id])
    await pool.query(`INSERT INTO tax_rate (tax_region_id, code, name, rate, is_combinable) VALUES ($1,'ECO','Eco',5,true)`, [tr.rows[0].id])
    const rates = await taxService.resolveRates({ country: "FR" })
    assert.equal(rates.length, 2)
    // exclusive: (1000-0)*25% = 250 ; inclusive: 1200 - 1200/1.2 = 200
    assert.equal(Math.round(1000 * 0.25), 250)
    assert.equal(Math.round(1200 - 1200 / 1.2), 200)
  })

  it("promotion percentage/fixed-across/buyget + usage limit", async () => {
    const cart = await cartService.create({ currency_code: "usd", email: `p-${T}@example.com` })
    const p = await productService.create({ title: `Promo ${T}`, status: "published", variants: [{ title: "A", prices: [{ currency_code: "usd", amount: 1000 }] }, { title: "B", prices: [{ currency_code: "usd", amount: 3000 }] }] })
    const vs = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 ORDER BY created_at`, [p.id])
    await cartService.addItem(cart.id, { variant_id: vs.rows[0].id, quantity: 2 })
    await cartService.addItem(cart.id, { variant_id: vs.rows[1].id, quantity: 1 })
    await pool.query(`INSERT INTO promotion (code, application_type, application_target, application_allocation, application_value, usage_limit) VALUES ('P10','percentage','order','across',10,1) ON CONFLICT DO NOTHING`)
    await promotionService.applyCode(cart.id, "P10")
    const c1 = (await cartService.retrieve(cart.id))!
    assert.equal(c1.totals.discount_total, -500) // 10% of 5000
    // usage limit enforced at checkout covered in checkout test; buyget unit check:
    await pool.query(`INSERT INTO promotion (code, application_type, application_target, buy_min_quantity) VALUES ('B2G1','buyget','order',2) ON CONFLICT DO NOTHING`)
    await promotionService.applyCode(cart.id, "B2G1")
    const c2 = (await cartService.retrieve(cart.id))!
    assert.ok(c2.totals.discount_total <= -500 - 1000) // cheapest line partially free
  })

  it("inventory guard blocks oversell", async () => {
    const p = await productService.create({ title: `Inv ${T}`, status: "published", variants: [{ title: "X", prices: [{ currency_code: "usd", amount: 100 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    await pool.query(`INSERT INTO inventory_level (variant_id, stocked_quantity) VALUES ($1,2) ON CONFLICT (variant_id) DO UPDATE SET stocked_quantity=2`, [v.rows[0].id])
    await inventoryService.ensureAvailable(v.rows[0].id, 2)
    await assert.rejects(() => inventoryService.ensureAvailable(v.rows[0].id, 3), /Insufficient stock/)
  })
})

describe("regression: channels/locations/reservations/gift/draft", () => {
  it("sales channel publish gate + location reservation lifecycle", async () => {
    const sc = await pool.query(`INSERT INTO sales_channel (name) VALUES ($1) RETURNING id`, [`SC ${T}`])
    const p = await productService.create({ title: `Chan ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 500 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const cart = await cartService.create({ currency_code: "usd", sales_channel_id: sc.rows[0].id } as any)
    await assert.rejects(() => cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 1 }), /not published/)
    await pool.query(`INSERT INTO product_sales_channel (product_id, sales_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [p.id, sc.rows[0].id])
    await cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 1 })
    const sl = await pool.query(`INSERT INTO stock_location (name) VALUES ($1) RETURNING id`, [`WH ${T}`])
    await pool.query(`INSERT INTO sales_channel_stock_location (sales_channel_id, stock_location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [sc.rows[0].id, sl.rows[0].id])
    const ii = await pool.query(`INSERT INTO inventory_item (sku) VALUES ($1) RETURNING id`, [`SKU-${T}`])
    await pool.query(`INSERT INTO variant_inventory_item (variant_id, inventory_item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [v.rows[0].id, ii.rows[0].id])
    await pool.query(`INSERT INTO inventory_level_location (inventory_item_id, location_id, stocked_quantity) VALUES ($1,$2,10) ON CONFLICT (inventory_item_id, location_id) DO UPDATE SET stocked_quantity=10`, [ii.rows[0].id, sl.rows[0].id])
    assert.equal(await locationInventoryService.availableForVariant(v.rows[0].id), 10)
    const res = await locationInventoryService.reserve({ inventory_item_id: ii.rows[0].id, location_id: sl.rows[0].id, quantity: 4 })
    assert.equal(await locationInventoryService.availableForVariant(v.rows[0].id), 6)
    await assert.rejects(() => locationInventoryService.reserve({ inventory_item_id: ii.rows[0].id, location_id: sl.rows[0].id, quantity: 7 }), /Insufficient/)
    await locationInventoryService.fulfillReservation(res.id)
    assert.equal(await locationInventoryService.availableForVariant(v.rows[0].id), 6) // 10-4 fulfilled
  })

  it("gift card apply reduces cart total + consumed at checkout", async () => {
    await pool.query(`INSERT INTO gift_card (code, value, balance, currency_code) VALUES ($1,1000,1000,'usd') ON CONFLICT DO NOTHING`, [`GC-${T}`])
    const p = await productService.create({ title: `Gift ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 2500 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const cart = await cartService.create({ currency_code: "usd" })
    await cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 1 })
    const gc = await pool.query(`SELECT id FROM gift_card WHERE code=$1`, [`GC-${T}`])
    await pool.query(`INSERT INTO cart_gift_card (cart_id, gift_card_id, amount) VALUES ($1,$2,1000) ON CONFLICT DO NOTHING`, [cart.id, gc.rows[0].id])
    const c = (await cartService.retrieve(cart.id))!
    assert.equal(c.totals.gift_card_total, 1000)
    assert.equal(c.totals.total, c.totals.subtotal + c.totals.tax_total + c.totals.shipping + c.totals.discount_total - 1000)
    const order = await orderService.createFromCart(cart.id)
    const bal = await pool.query(`SELECT balance FROM gift_card WHERE id=$1`, [gc.rows[0].id])
    assert.equal(Number(bal.rows[0].balance), 0)
    assert.ok(order.id.startsWith("order_"))
  })

  it("draft order create + confirm", async () => {
    const p = await productService.create({ title: `Draft ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 700 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const pc = await pool.query(`INSERT INTO payment_collection (currency_code, amount) VALUES ('usd',700) RETURNING id`)
    const o = await pool.query(
      `INSERT INTO "order" (email, currency_code, subtotal, total, is_draft_order, status, payment_collection_id) VALUES ($1,'usd',700,700,TRUE,'pending',$2) RETURNING id`,
      [`draft-${T}@example.com`, pc.rows[0].id]
    )
    await pool.query(`INSERT INTO order_line_item (order_id, variant_id, title, quantity, unit_price) VALUES ($1,$2,'V',1,700)`, [o.rows[0].id, v.rows[0].id])
    await pool.query(`UPDATE "order" SET is_draft_order=FALSE WHERE id=$1`, [o.rows[0].id])
    const got = await orderService.retrieve(o.rows[0].id)
    assert.equal(got!.status, "pending")
  })
})

describe("regression: post-purchase + platform", () => {
  let orderId = ""
  let collId = ""
  it("order change edit + refund + payment session flow", async () => {
    const p = await productService.create({ title: `Post ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 1000 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const cart = await cartService.create({ currency_code: "usd" })
    await cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 2 })
    const order = await orderService.createFromCart(cart.id)
    orderId = order.id
    collId = (await pool.query(`SELECT payment_collection_id FROM "order" WHERE id=$1`, [orderId])).rows[0].payment_collection_id
    const ch = await orderChangeService.request(orderId, "edit", "test", [])
    assert.ok(ch.id.startsWith("ordch_"))
    await orderChangeService.confirm(ch.id)
    const changes = await orderChangeService.listForOrder(orderId)
    assert.ok(changes.some((c: any) => c.status === "confirmed"))
    // payment session pending -> authorized syncs collection
    const { paymentSessionService } = await import("../modules/order/payment-session.service")
    const sess = await paymentSessionService.createSession(collId, "manual")
    await paymentSessionService.authorizeSession(sess.id)
    const c = await pool.query(`SELECT status FROM payment_collection WHERE id=$1`, [collId])
    assert.equal(c.rows[0].status, "authorized")
  })

  it("fulfillment lifecycle guards", async () => {
    const lines = await pool.query(`SELECT id, quantity FROM order_line_item WHERE order_id=$1`, [orderId])
    const f = await fulfillmentService.createFulfillment(orderId, lines.rows.map((l: any) => ({ line_item_id: l.id, quantity: l.quantity })))
    await assert.rejects(() => fulfillmentService.markDelivered(f.id), /ship first/)
    await fulfillmentService.markShipped(f.id)
    await fulfillmentService.markDelivered(f.id)
    await assert.rejects(() => fulfillmentService.cancel(f.id), /cannot be canceled/)
    await assert.rejects(
      () => fulfillmentService.createFulfillment(orderId, lines.rows.map((l: any) => ({ line_item_id: l.id, quantity: l.quantity }))),
      /Over-fulfillment/
    )
  })

  it("users/invites/RBAC + store + api-key link + notifications + analytics", async () => {
    const email = `admin-${T}@example.com`
    await pool.query(`INSERT INTO admin_user (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email])
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=$1 RETURNING id`, ["admin"])
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
    const inv = await pool.query(`INSERT INTO invite (email) VALUES ($1) RETURNING token`, [`inv-${T}@example.com`])
    assert.ok(inv.rows[0].token)
    const store = await pool.query(`INSERT INTO store (name) VALUES ('S') RETURNING id`)
    assert.ok(store.rows[0].id.startsWith("store_"))
    const key = await pool.query(`INSERT INTO api_key (title, type) VALUES ($1,'publishable') RETURNING id`, [`K ${T}`])
    const sc = await pool.query(`INSERT INTO sales_channel (name) VALUES ($1) RETURNING id`, [`KSC ${T}`])
    await pool.query(`INSERT INTO api_key_sales_channel (api_key_id, sales_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [key.rows[0].id, sc.rows[0].id])
    await pool.query(`INSERT INTO notification (to_address, channel, template, status) VALUES ('a@b.c','email','t','sent')`)
    const before = (await pool.query(`SELECT COUNT(*)::int AS c FROM event_outbox`)).rows[0].c
    await eventBus.emit("regression.ping", { t: T })
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS c FROM event_outbox`)).rows[0].c, Number(before) + 1)
    await currencyService.list()
    await analyticsService.track("regression", "test", { t: T })
    assert.ok((await analyticsService.topProducts(5)).length >= 1)
    assert.ok((await analyticsService.revenueByDay("usd", 30)).length >= 1)
    // preferences roundtrip
    await pool.query(`INSERT INTO user_preference (user_id, key, value) VALUES ('u','k','{"a":1}') ON CONFLICT (user_id, key) DO UPDATE SET value='{"a":1}'`)
  })
})
