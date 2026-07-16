import { describe, it, before } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { authService } from "../modules/auth/auth.service"
import { regionService } from "../modules/region/region.service"
import { productService } from "../modules/product/product.service"
import { cartService } from "../modules/cart/cart.service"
import { orderService } from "../modules/order/order.service"
import { paymentService } from "../modules/order/payment.service"
import { fulfillmentService } from "../modules/fulfillment/fulfillment.service"
import { promotionService } from "../modules/promotion/promotion.service"

async function sql() {
  for (const file of [
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
    await pool.query(await readFile(file, "utf8")).catch((e: any) => {
      if (!String(e?.message ?? "").includes("already exists")) throw e
    })
  }
}

describe("checkout flow", () => {
  let variantId: string
  let cartId: string
  let orderId: string
  let collectionId: string

  before(async () => {
    await sql()
    await pool.query("DELETE FROM cart").catch(() => undefined)
    // isolate from automatic promotions created by other suites (they attach globally)
    await pool.query("UPDATE promotion SET status='draft' WHERE is_automatic=TRUE").catch(() => undefined)
  })

  it("registers a customer", async () => {
    const email = `test-${Date.now()}@example.com`
    const r = await authService.register(email, "password123", "Test", "User")
    assert.ok(r.token)
  })

  it("creates region with tax + product with price + inventory + promo", async () => {
    const region = await regionService.create({ name: "EU", currency_code: "eur", countries: ["de"] })
    await pool.query(`INSERT INTO tax_region (country_code) VALUES ('de') ON CONFLICT DO NOTHING`)
    const tr = await pool.query(`SELECT id FROM tax_region WHERE country_code='de'`)
    await pool.query(`INSERT INTO tax_rate (tax_region_id, code, name, rate, is_default) VALUES ($1,'VAT','VAT',19,true) ON CONFLICT DO NOTHING`, [tr.rows[0].id])
    const product = await productService.create({
      title: `Shirt ${Date.now()}`,
      status: "published",
      variants: [{ title: "M", prices: [{ currency_code: "eur", amount: 2000 }] }],
    })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [product.id])
    variantId = v.rows[0].id
    await pool.query(`INSERT INTO inventory_level (variant_id, stocked_quantity) VALUES ($1,100) ON CONFLICT (variant_id) DO UPDATE SET stocked_quantity=100`, [variantId])
    await pool.query(
      `INSERT INTO promotion (code, application_type, application_target, application_allocation, application_value) VALUES ('SAVE10','percentage','order','across',10) ON CONFLICT DO NOTHING`
    )
    const cart = await cartService.create({ region_id: region.id, currency_code: "EUR", email: "buyer@example.com" })
    cartId = cart.id
    assert.ok(cartId)
  })

  it("adds item, applies promo + address, checks totals math", async () => {
    await cartService.addItem(cartId, { variant_id: variantId, quantity: 2 })
    await promotionService.applyCode(cartId, "SAVE10")
    await cartService.setAddress(cartId, "shipping", { country_code: "DE", city: "Berlin" } as any)
    const cart = (await cartService.retrieve(cartId))!
    assert.equal(cart.totals.subtotal, 4000)
    assert.equal(cart.totals.discount_total, -400)
    assert.ok(cart.totals.tax_total > 0)
    assert.equal(cart.totals.total, 4000 - 400 + cart.totals.tax_total + cart.totals.shipping)
  })

  it("checks out, pays, fulfills", async () => {
    await cartService.setShipping(cartId, "Standard", 500)
    const order = await orderService.createFromCart(cartId)
    orderId = order.id
    collectionId = (await pool.query(`SELECT payment_collection_id FROM "order" WHERE id=$1`, [orderId])).rows[0].payment_collection_id
    await paymentService.authorize(collectionId)
    await paymentService.capture(collectionId)
    const lines = await pool.query(`SELECT id, quantity FROM order_line_item WHERE order_id=$1`, [orderId])
    const f = await fulfillmentService.createFulfillment(orderId, lines.rows.map((l: any) => ({ line_item_id: l.id, quantity: l.quantity })))
    await fulfillmentService.markShipped(f.id)
    await fulfillmentService.markDelivered(f.id)
    const done = await orderService.retrieve(orderId)
    assert.equal(done!.status, "completed")
    await pool.end().catch(() => undefined)
  })
})
