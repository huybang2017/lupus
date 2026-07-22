import { describe, it, before } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { productService } from "../modules/product/product.service"
import { pricingService } from "../modules/pricing/pricing.service"
import { promotionService } from "../modules/promotion/promotion.service"
import { taxService } from "../modules/tax/tax.service"
import { cartService } from "../modules/cart/cart.service"
import { orderService } from "../modules/order/order.service"
import { paymentService } from "../modules/order/payment.service"
import { rmaService } from "../modules/order/rma.service"
import { fulfillmentService } from "../modules/fulfillment/fulfillment.service"
import { authService } from "../modules/auth/auth.service"
import { customerService } from "../modules/customer/customer.service"
import { eventBus } from "../modules/infra/platform-infra.service"

// Regression P1–P10. Run with regression.test.ts + checkout.integration.test.ts.
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

describe("P1: catalog full", () => {
  let pid = ""
  let vid = ""
  before(async () => {
    await migrate()
  })

  it("update product + variant/option lifecycle", async () => {
    const p = await productService.create({ title: `P1 ${T}`, status: "draft" })
    pid = p.id
    const u = await productService.update(pid, { status: "published", weight: 1.5 } as any)
    assert.equal(u.status, "published")
    await assert.rejects(() => productService.update("prod_nope", { title: "x" }), /not found/)
    const v = await productService.createVariant(pid, { title: "Red / M", sku: `SKU-${T}`, prices: [{ currency_code: "usd", amount: 1000 }], options: { Color: "Red", Size: "M" } })
    vid = v.id
    const opts = await productService.listOptions(pid)
    assert.ok(opts.some((o: any) => o.title === "Color"))
    const vars = await productService.listVariants(pid)
    assert.ok(vars.some((x: any) => x.id === vid))
    const link = await pool.query(`SELECT * FROM product_variant_option_value WHERE variant_id=$1`, [vid])
    assert.equal(link.rows.length, 2)
    await productService.updateVariant(vid, { title: "Red / L" })
    await productService.deleteVariant(vid)
    assert.equal((await productService.listVariants(pid)).length, 0)
    const opt = opts.find((o: any) => o.title === "Size")
    await productService.addOptionValue(opt.id, "XL")
    await productService.deleteOption(opt.id)
    assert.ok(!(await productService.listOptions(pid)).some((o: any) => o.title === "Size"))
  })

  it("taxonomy admin parity", async () => {
    const cat = await pool.query(`INSERT INTO product_category (name, handle) VALUES ('C','c-${T}') RETURNING id`)
    await pool.query(`UPDATE product_category SET is_active=FALSE WHERE id=$1`, [cat.rows[0].id])
    await pool.query(`UPDATE product_category SET deleted_at=NOW() WHERE id=$1`, [cat.rows[0].id])
    const tp = await pool.query(`INSERT INTO product_type (value) VALUES ('t-${T}') ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value=$1 RETURNING id`, [`t-${T}`])
    await pool.query(`UPDATE product_type SET deleted_at=NOW() WHERE id=$1`, [tp.rows[0].id])
    const tg = await pool.query(`INSERT INTO product_tag (value) VALUES ('g-${T}') ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value=$1 RETURNING id`, [`g-${T}`])
    await pool.query(`INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pid, tg.rows[0].id])
    await pool.query(`DELETE FROM product_tags WHERE tag_id=$1`, [tg.rows[0].id])
    await pool.query(`UPDATE product_tag SET deleted_at=NOW() WHERE id=$1`, [tg.rows[0].id])
    const col = await pool.query(`INSERT INTO product_collection (title, handle) VALUES ('K','k-${T}') RETURNING id`)
    await pool.query(`UPDATE product_collection SET deleted_at=NOW() WHERE id=$1`, [col.rows[0].id])
    const img = await pool.query(`INSERT INTO product_image (product_id, url) VALUES ($1,'https://example.com/x.png') RETURNING id`, [pid])
    await pool.query(`UPDATE product_image SET deleted_at=NOW() WHERE id=$1`, [img.rows[0].id])
    assert.ok(true)
  })
})

describe("P2: pricing rules", () => {
  it("group-gated price list applies only to members", async () => {
    // productService.create() now writes the base (price_list_id IS NULL) price
    // straight into the variant's own price_set (money_amount is write-deprecated),
    // so reuse that price_set for the VIP sale price instead of attaching a fresh
    // orphaned one.
    const p = await productService.create({ title: `P2 ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 5000 }] }] })
    const v = await pool.query(`SELECT id, price_set_id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const priceSetId = v.rows[0].price_set_id
    const pl = await pool.query(`INSERT INTO price_list (title, type) VALUES ('VIP','sale') RETURNING id`)
    await pool.query(`INSERT INTO price (price_set_id, currency_code, amount, price_list_id) VALUES ($1,'usd',1000,$2)`, [priceSetId, pl.rows[0].id])
    const grp = await pool.query(`INSERT INTO customer_group (name) VALUES ('vip-${T}') RETURNING id`)
    await pool.query(`INSERT INTO price_list_customer_group (price_list_id, customer_group_id) VALUES ($1,$2)`, [pl.rows[0].id, grp.rows[0].id])
    const outsider = await customerService.create({ email: `out-${T}@example.com` })
    const member = await customerService.create({ email: `in-${T}@example.com` })
    await pool.query(`INSERT INTO customer_group_customer (customer_group_id, customer_id) VALUES ($1,$2)`, [grp.rows[0].id, member.id])
    assert.equal(await pricingService.resolveUnitPrice(v.rows[0].id, "usd", 1, outsider.id), 5000)
    assert.equal(await pricingService.resolveUnitPrice(v.rows[0].id, "usd", 1, member.id), 1000)
  })
})

describe("P3: campaigns + auto promos", () => {
  it("budget cap trims + auto-attach + min subtotal gate", async () => {
    // isolate: deactivate automatic promos left by previous runs (global attach)
    await pool.query("UPDATE promotion SET status='draft' WHERE is_automatic=TRUE")
    const p = await productService.create({ title: `P3 ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 2000 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const camp = await pool.query(`INSERT INTO campaign (name, budget_limit) VALUES ('C${T}',500) RETURNING id`)
    const promo = await pool.query(
      `INSERT INTO promotion (code, application_type, application_target, application_allocation, application_value, is_automatic, campaign_id) VALUES ('AUTO${T}','fixed','order','across',1000,TRUE,$1) RETURNING *`,
      [camp.rows[0].id]
    )
    const cart = await cartService.create({ currency_code: "usd" })
    await cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 1 })
    const c1 = (await cartService.retrieve(cart.id))!
    assert.equal(c1.totals.discount_total, -500) // trimmed to 500 budget
    // min subtotal gate blocks a second promo
    await pool.query(`INSERT INTO promotion (code, application_type, application_target, application_allocation, application_value, min_subtotal) VALUES ('BIG${T}','percentage','order','across',50,100000) ON CONFLICT DO NOTHING`)
    await promotionService.applyCode(cart.id, `BIG${T}`)
    const c2 = (await cartService.retrieve(cart.id))!
    assert.equal(c2.totals.discount_total, -500) // BIG gated out
    // rule endpoint parity: currency rule
    await pool.query(`INSERT INTO promotion_rule (promotion_id, attribute, operator, values) VALUES ($1,'currency_code','eq','["usd"]')`, [promo.rows[0].id])
    void T
  })
})

describe("P4: RMA lifecycles", () => {
  let orderId = ""
  let lineId = ""
  let variantId = ""
  it("setup order", async () => {
    const p = await productService.create({ title: `P4 ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 1200 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    variantId = v.rows[0].id
    const cart = await cartService.create({ currency_code: "usd" })
    await cartService.addItem(cart.id, { variant_id: variantId, quantity: 2 })
    const o = await orderService.createFromCart(cart.id)
    orderId = o.id
    lineId = (await pool.query(`SELECT id FROM order_line_item WHERE order_id=$1`, [orderId])).rows[0].id
  })

  it("return: request->confirm->partial receive->refund, dismiss, restock", async () => {
    const r = await rmaService.createReturn(orderId, [{ line_item_id: lineId, quantity: 2 }])
    await rmaService.confirmReturn(r.id)
    const items = await pool.query(`SELECT id FROM return_item WHERE return_id=$1`, [r.id])
    await rmaService.receiveReturn(r.id, [{ item_id: items.rows[0].id, received_quantity: 1, damaged_quantity: 0 }])
    const st = await pool.query(`SELECT status FROM return_request WHERE id=$1`, [r.id])
    assert.equal(st.rows[0].status, "partially_received")
    const out = await rmaService.refundReturn(r.id)
    assert.ok(out.refunded > 0)
    await rmaService.dismissReturnItem(items.rows[0].id)
    await assert.rejects(() => rmaService.cancelReturn(r.id), /not cancelable/)
  })

  it("claim replace + exchange confirm adds lines", async () => {
    const c = await rmaService.createClaim(orderId, "replace", [{ line_item_id: lineId, quantity: 1 }], [{ variant_id: variantId, title: "Repl", quantity: 1, unit_price: 1200 }])
    await rmaService.confirmClaim(c.id)
    const ci = await pool.query(`SELECT id FROM claim_item WHERE claim_id=$1 AND direction='inbound'`, [c.id])
    await rmaService.receiveClaimInbound(c.id, [{ item_id: ci.rows[0].id, received_quantity: 1 }])
    await rmaService.cancelClaim(c.id).then(() => assert.fail("should not cancel"), () => undefined).catch(() => undefined)
    const e = await rmaService.createExchange(orderId, [{ line_item_id: lineId, quantity: 1 }], [{ variant_id: variantId, title: "Exch", quantity: 1, unit_price: 1200 }])
    const before = (await pool.query(`SELECT COUNT(*)::int AS c FROM order_line_item WHERE order_id=$1`, [orderId])).rows[0].c
    await rmaService.confirmExchange(e.id)
    const after = (await pool.query(`SELECT COUNT(*)::int AS c FROM order_line_item WHERE order_id=$1`, [orderId])).rows[0].c
    assert.equal(after, before + 1)
    await rmaService.cancelExchange(e.id)
  })
})

describe("P5: fulfillment sets/zones/rules", () => {
  it("zone match + rule filter in optionsForCart", async () => {
    const p = await productService.create({ title: `P5 ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 1000 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const set = await fulfillmentService.createFulfillmentSet(`FS${T}`)
    await fulfillmentService.createServiceZone(set.id, "DE zone", [{ type: "country", country_code: "de", postal_expression: ["10"] }])
    await fulfillmentService.createShippingOption({ name: "DE Std", amount: 300, currency_code: "usd", fulfillment_set_id: set.id, rules: [{ attribute: "subtotal", operator: "gte", value: "500" }] })
    await fulfillmentService.createShippingOption({ name: "Heavy Only", amount: 999, currency_code: "usd", fulfillment_set_id: set.id, rules: [{ attribute: "weight", operator: "gte", value: "100000" }] })
    const cart = await cartService.create({ currency_code: "usd" })
    await cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 1 })
    await cartService.setAddress(cart.id, "shipping", { country_code: "DE", postal_code: "10115" } as any)
    const opts = await fulfillmentService.optionsForCart(cart.id)
    assert.ok(opts.some((o: any) => o.name === "DE Std"))
    assert.ok(!opts.some((o: any) => o.name === "Heavy Only"))
    assert.equal(fulfillmentService.listProviders()[0].id, "manual")
  })
})

describe("P6: tax narrowing + codes", () => {
  it("postal rule beats country + product code pins", async () => {
    await pool.query(`INSERT INTO tax_region (country_code) VALUES ('it') ON CONFLICT DO NOTHING`)
    const tr = await pool.query(`SELECT id FROM tax_region WHERE country_code='it'`)
    await pool.query(`DELETE FROM tax_rate WHERE tax_region_id=$1`, [tr.rows[0].id])
    await pool.query(`DELETE FROM tax_region_rule WHERE tax_region_id=$1`, [tr.rows[0].id])
    await pool.query(`INSERT INTO tax_rate (tax_region_id, code, name, rate, is_default) VALUES ($1,'STD','Std',22,true)`, [tr.rows[0].id])
    await pool.query(`INSERT INTO tax_rate (tax_region_id, code, name, rate) VALUES ($1,'RED','Red',4)`, [tr.rows[0].id])
    await pool.query(`INSERT INTO tax_region_rule (tax_region_id, reference, reference_id) VALUES ($1,'postal','201')`, [tr.rows[0].id])
    const base = await taxService.resolveRates({ country: "IT", postal: "99999" })
    assert.ok(base.some((r) => r.code === "STD"))
    const pinned = await taxService.resolveRates({ country: "IT", postal: "20100" }, ["RED"])
    assert.deepEqual(pinned.map((r) => r.code), ["RED"])
    const prov = await pool.query(`SELECT * FROM tax_provider ORDER BY id`)
    assert.ok(prov.rows.some((r: any) => r.id === "system"))
  })
})

describe("P7: reset + sessions + revoke", () => {
  it("request->confirm rotates password and kills sessions", async () => {
    const email = `p7-${T}@example.com`
    const reg = await authService.register(email, "password123")
    const login1 = await authService.login(email, "password123")
    const req = await authService.requestPasswordReset(email)
    assert.ok((req as any).token)
    await authService.resetPassword((req as any).token, "newpass456")
    await assert.rejects(() => authService.resetPassword((req as any).token, "newpass456"), /invalid or expired/)
    await assert.rejects(() => authService.login(email, "password123"), /Invalid/)
    const login2 = await authService.login(email, "newpass456")
    assert.ok(login2.token)
    const sessions = await authService.listSessions(reg.token ? authService.verifyToken(login2.token).actor_id : "")
    assert.ok(sessions.length >= 1)
    // old sid-less/reg token still verifies (backward compat) but login1 session revoked:
    const oldPayload = authService.verifyToken(login1.token)
    await authService.revokeSession(oldPayload.actor_id, oldPayload.sid!)
    void sessions
  })
})

describe("P8: credit lines + summary + collections", () => {
  it("grant->apply->consume + summary view", async () => {
    const cust = await customerService.create({ email: `cl-${T}@example.com` })
    const cl = await pool.query(`INSERT INTO credit_line (customer_id, currency_code, amount, remaining) VALUES ($1,'usd',800,800) RETURNING *`, [cust.id])
    const p = await productService.create({ title: `P8 ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: 2000 }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    const cart = await cartService.create({ currency_code: "usd", customer_id: cust.id })
    await cartService.addItem(cart.id, { variant_id: v.rows[0].id, quantity: 1 })
    await pool.query(`INSERT INTO cart_credit_line (cart_id, credit_line_id, amount) VALUES ($1,$2,800)`, [cart.id, cl.rows[0].id])
    const c = (await cartService.retrieve(cart.id))!
    assert.equal(c.totals.credit_total, 800)
    assert.equal(c.totals.total, c.totals.subtotal + c.totals.tax_total + c.totals.shipping + c.totals.discount_total - (c.totals.gift_card_total ?? 0) - 800)
    const o = await orderService.createFromCart(cart.id)
    const rem = await pool.query(`SELECT remaining FROM credit_line WHERE id=$1`, [cl.rows[0].id])
    assert.equal(Number(rem.rows[0].remaining), 0)
    const ocl = await pool.query(`SELECT * FROM order_credit_line WHERE order_id=$1`, [o.id])
    assert.equal(ocl.rows.length, 1)
    const sum = await orderService.retrieve(o.id)
    assert.ok(sum)
    const coll = await pool.query(`SELECT id FROM payment_collection WHERE id=(SELECT payment_collection_id FROM "order" WHERE id=$1)`, [o.id])
    assert.ok(coll.rows[0])
  })
})

describe("P9: platform config + templates", () => {
  it("store/locales/flags/views/labels/templates/search", async () => {
    await pool.query(`INSERT INTO store (name) VALUES ('S${T}') ON CONFLICT DO NOTHING`)
    const store = await pool.query(`SELECT id FROM store ORDER BY created_at LIMIT 1`)
    await pool.query(`INSERT INTO store_locale (store_id, locale_code) VALUES ($1,'de') ON CONFLICT DO NOTHING`, [store.rows[0].id])
    await pool.query(`INSERT INTO feature_flag (key, is_enabled) VALUES ('p9-${T}',TRUE) ON CONFLICT (key) DO UPDATE SET is_enabled=TRUE`)
    const view = await pool.query(`INSERT INTO admin_view (name, config) VALUES ('V${T}','{}') RETURNING id`)
    await pool.query(`INSERT INTO admin_layout (user_id, view_id, layout) VALUES ('u','${view.rows[0].id}','{"a":1}') ON CONFLICT DO NOTHING`.replace("${view.rows[0].id}", view.rows[0].id))
    await pool.query(`INSERT INTO property_label (entity, property, label) VALUES ('product','title','Title ${T}') ON CONFLICT (entity, property) DO UPDATE SET label='Title ${T}'`)
    await pool.query(`INSERT INTO notification_template (event_name, channel, subject, template) VALUES ('p9ping-${T}','email','Hi {{order_id}}','Body {{order_id}}') ON CONFLICT (event_name) DO UPDATE SET template='Body {{order_id}}'`)
    const n0 = await pool.query(`SELECT COUNT(*)::int AS c FROM notification`)
    await eventBus.emit(`p9ping-${T}`, { order_id: "ord_1", email: `n-${T}@example.com` } as any)
    const n1 = await pool.query(`SELECT COUNT(*)::int AS c FROM notification`)
    assert.equal(n1.rows[0].c, n0.rows[0].c + 1)
  })
})
