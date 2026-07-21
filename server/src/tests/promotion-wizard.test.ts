import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "fs/promises"
import { pool } from "../db"
import { buildApp } from "../app"
import { cartService } from "../modules/cart/cart.service"
import { productService } from "../modules/product/product.service"
import { promotionService } from "../modules/promotion/promotion.service"

// Lupus create-promotion wizard parity: the nested application_method payload, rule
// attributes/value options, and the discount engine behind each promotion template
// (amount/percentage off products or order, buy X get Y, free shipping) plus
// eligibility rules (customer group, region, country, sales channel).
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

let seq = 0
const code = (label: string) => `W${label}${T}${seq++}`

describe("promotion wizard parity", () => {
  const email = `promo-wizard-${T}@example.com`
  let token = ""

  const makeProduct = async (title: string, price: number) => {
    const p = await productService.create({ title: `${title} ${T}`, status: "published", variants: [{ title: "V", prices: [{ currency_code: "usd", amount: price }] }] })
    const v = await pool.query(`SELECT id FROM product_variant WHERE product_id=$1 LIMIT 1`, [p.id])
    return { productId: p.id as string, variantId: v.rows[0].id as string }
  }
  const makeCart = async (items: { variantId: string; quantity: number }[]) => {
    const cart = await cartService.create({ currency_code: "usd", email: `c-${T}-${seq++}@example.com` })
    for (const i of items) await cartService.addItem(cart.id, { variant_id: i.variantId, quantity: i.quantity })
    return cart.id as string
  }
  const create = (body: any) => api("POST", "/admin/promotions", body, token)
  const standard = (c: string, method: any, extra: any = {}) =>
    create({ code: c, type: "standard", status: "active", is_automatic: false, rules: [], application_method: method, ...extra })

  before(async () => {
    await migrate()
    const app = buildApp()
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    base = `http://127.0.0.1:${server.address().port}`
    const reg = await api("POST", "/auth/user/emailpass/register", { email, password: "wizard-pass-1" })
    assert.equal(reg.status, 200)
    token = reg.json.token
    const role = await pool.query(`INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`)
    const u = await pool.query(`SELECT id FROM admin_user WHERE email=$1`, [email])
    if (u.rows[0]) await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id])
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pool.end().catch(() => undefined)
  })

  it("creates a promotion from the wizard payload and returns Lupus's shape", async () => {
    const c = code("shape")
    const res = await standard(c, { type: "fixed", target_type: "order", allocation: "across", value: 500, currency_code: "usd" }, {
      is_tax_inclusive: true,
      limit: 5,
      rules: [{ attribute: "region.id", operator: "in", values: ["reg_x"] }],
    })
    assert.equal(res.status, 201)
    const p = res.json.promotion
    assert.equal(p.type, "standard")
    assert.equal(p.status, "active")
    assert.equal(p.is_tax_inclusive, true)
    assert.equal(p.usage_limit, 5)
    assert.equal(p.application_method.type, "fixed")
    assert.equal(p.application_method.target_type, "order")
    assert.equal(p.application_method.allocation, "across")
    assert.equal(p.application_method.currency_code, "usd")
    assert.equal(p.rules.length, 1)
    assert.equal(p.rules[0].attribute, "region.id")
    assert.deepEqual(p.rules[0].values, ["reg_x"])
  })

  it("rejects payloads Lupus rejects", async () => {
    const c = code("bad")
    const fixedNoCurrency = await standard(c + "a", { type: "fixed", target_type: "order", allocation: "across", value: 5 })
    assert.equal(fixedNoCurrency.status, 400)
    const over = await standard(c + "b", { type: "percentage", target_type: "order", allocation: "across", value: 150 })
    assert.equal(over.status, 400)
    const noMax = await standard(c + "c", { type: "percentage", target_type: "items", allocation: "each", value: 10 })
    assert.equal(noMax.status, 400, "each/once need a maximum quantity")
    const acrossMax = await standard(c + "d", { type: "percentage", target_type: "order", allocation: "across", value: 10, max_quantity: 2 })
    assert.equal(acrossMax.status, 400, "across forbids a maximum quantity")
    const buyGetNoRules = await create({
      code: c + "e", type: "buyget", status: "active", rules: [],
      application_method: { type: "percentage", target_type: "items", value: 100, apply_to_quantity: 1, max_quantity: 1, buy_rules_min_quantity: 2 },
    })
    assert.equal(buyGetNoRules.status, 400, "buy-get needs buy and target conditions")
    const badRule = await standard(c + "f", { type: "percentage", target_type: "order", allocation: "across", value: 10 }, { rules: [{ attribute: "region.id", operator: "in", values: [] }] })
    assert.equal(badRule.status, 400, "a rule needs at least one value")
    const ok = await standard(c + "g", { type: "percentage", target_type: "order", allocation: "across", value: 10 })
    assert.equal(ok.status, 201)
    const dup = await standard(c + "g", { type: "percentage", target_type: "order", allocation: "across", value: 10 })
    assert.equal(dup.status, 409)
  })

  it("serves rule attributes and value options like Lupus", async () => {
    const attrs = (rt: string, q: string) => api("GET", `/admin/promotions/rule-attribute-options/${rt}?${q}`, undefined, token)
    const rules = await attrs("rules", "promotion_type=standard&application_method_type=fixed&application_method_target_type=order")
    assert.deepEqual(rules.json.attributes.map((a: any) => a.id), ["customer_group", "region", "country", "sales_channel", "currency_code"])
    const currency = rules.json.attributes.find((a: any) => a.id === "currency_code")
    assert.equal(currency.required, true, "a fixed amount needs a currency")
    assert.equal(currency.disguised, true)
    const pct = await attrs("rules", "promotion_type=standard&application_method_type=percentage&application_method_target_type=order")
    assert.equal(pct.json.attributes.find((a: any) => a.id === "currency_code").required, false)

    const target = await attrs("target-rules", "promotion_type=buyget&application_method_type=percentage&application_method_target_type=items")
    assert.deepEqual(target.json.attributes.map((a: any) => a.id), ["product", "product_category", "product_collection", "product_type", "product_tag", "apply_to_quantity"])
    const buy = await attrs("buy-rules", "promotion_type=buyget&application_method_type=percentage&application_method_target_type=items")
    assert.equal(buy.json.attributes.at(-1).id, "buy_rules_min_quantity")
    assert.deepEqual(buy.json.attributes[0].operators.map((o: any) => o.label), ["In", "Equals", "Not In"])

    const prod = await makeProduct("OptionProd", 100)
    const values = await api("GET", `/admin/promotions/rule-value-options/target-rules/product?q=${encodeURIComponent("optionprod " + T)}`, undefined, token)
    assert.deepEqual(values.json.values.map((v: any) => v.value), [prod.productId])
    const byValue = await api("GET", `/admin/promotions/rule-value-options/target-rules/product?value=${prod.productId}`, undefined, token)
    assert.equal(byValue.json.count, 1)
    const countries = await api("GET", "/admin/promotions/rule-value-options/rules/country?q=vietnam", undefined, token)
    assert.deepEqual(countries.json.values, [{ value: "vn", label: "Vietnam" }])
  })

  it("percentage off products honours target rules, 'each' max quantity and 'once'", async () => {
    const a = await makeProduct("PctA", 1000)
    const b = await makeProduct("PctB", 2000)
    const cat = await pool.query(`INSERT INTO product_category (name, handle) VALUES ($1,$2) RETURNING id`, [`Cat ${T}`, `cat-${T}`])
    await pool.query(`INSERT INTO product_category_product (product_id, category_id) VALUES ($1,$2)`, [a.productId, cat.rows[0].id])

    // 10% off products in the category, at most 2 units of each line
    const c1 = code("each")
    await standard(c1, { type: "percentage", target_type: "items", allocation: "each", value: 10, max_quantity: 2, target_rules: [{ attribute: "items.product.categories.id", operator: "in", values: [cat.rows[0].id] }] })
    const cart1 = await makeCart([{ variantId: a.variantId, quantity: 3 }, { variantId: b.variantId, quantity: 1 }])
    await promotionService.applyCode(cart1, c1)
    assert.equal((await cartService.retrieve(cart1))!.totals.discount_total, -200, "10% of 2 units of A only (B is outside the category)")

    // Not In flips it: everything except the category
    const c2 = code("notin")
    await standard(c2, { type: "percentage", target_type: "items", allocation: "each", value: 10, max_quantity: 5, target_rules: [{ attribute: "items.product.categories.id", operator: "ne", values: [cat.rows[0].id] }] })
    const cart2 = await makeCart([{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }])
    await promotionService.applyCode(cart2, c2)
    assert.equal((await cartService.retrieve(cart2))!.totals.discount_total, -200, "only B is discounted")

    // once: the limit is shared by the whole cart, priciest units first
    const c3 = code("once")
    await standard(c3, { type: "fixed", target_type: "items", allocation: "once", value: 300, max_quantity: 2, currency_code: "usd" })
    const cart3 = await makeCart([{ variantId: a.variantId, quantity: 2 }, { variantId: b.variantId, quantity: 2 }])
    await promotionService.applyCode(cart3, c3)
    assert.equal((await cartService.retrieve(cart3))!.totals.discount_total, -600, "300 off on only two units cart-wide")
  })

  it("amount off order spreads across lines and amount off products applies per unit", async () => {
    const a = await makeProduct("AmtA", 1000)
    const b = await makeProduct("AmtB", 3000)
    const c1 = code("across")
    await standard(c1, { type: "fixed", target_type: "order", allocation: "across", value: 400, currency_code: "usd" })
    const cart1 = await makeCart([{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }])
    await promotionService.applyCode(cart1, c1)
    assert.equal((await cartService.retrieve(cart1))!.totals.discount_total, -400)

    const c2 = code("eachfix")
    await standard(c2, { type: "fixed", target_type: "items", allocation: "each", value: 100, max_quantity: 3, currency_code: "usd", target_rules: [{ attribute: "items.product.id", operator: "in", values: [a.productId] }] })
    const cart2 = await makeCart([{ variantId: a.variantId, quantity: 5 }, { variantId: b.variantId, quantity: 1 }])
    await promotionService.applyCode(cart2, c2)
    assert.equal((await cartService.retrieve(cart2))!.totals.discount_total, -300, "100 off on at most 3 units of A")
  })

  it("buy X get Y: buy rules unlock it, apply_to_quantity target units get the discount", async () => {
    const tee = await makeProduct("Tee", 1000)
    const cap = await makeProduct("Cap", 400)
    const c = code("buyget")
    const res = await create({
      code: c, type: "buyget", status: "active", rules: [],
      application_method: {
        type: "percentage", target_type: "items", value: 100, apply_to_quantity: 1, max_quantity: 5, buy_rules_min_quantity: 2,
        buy_rules: [{ attribute: "items.product.id", operator: "in", values: [tee.productId] }],
        target_rules: [{ attribute: "items.product.id", operator: "in", values: [cap.productId] }],
      },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.promotion.type, "buyget")
    assert.equal(res.json.promotion.application_method.buy_rules_min_quantity, 2)
    assert.equal(res.json.promotion.application_method.apply_to_quantity, 1)
    assert.equal(res.json.promotion.application_method.buy_rules.length, 1)

    const notEnough = await makeCart([{ variantId: tee.variantId, quantity: 1 }, { variantId: cap.variantId, quantity: 1 }])
    await promotionService.applyCode(notEnough, c)
    assert.equal((await cartService.retrieve(notEnough))!.totals.discount_total, 0, "only 1 tee in the cart")

    const unlocked = await makeCart([{ variantId: tee.variantId, quantity: 2 }, { variantId: cap.variantId, quantity: 3 }])
    await promotionService.applyCode(unlocked, c)
    assert.equal((await cartService.retrieve(unlocked))!.totals.discount_total, -400, "one cap free (buy 2 tees once)")

    const twice = await makeCart([{ variantId: tee.variantId, quantity: 4 }, { variantId: cap.variantId, quantity: 3 }])
    await promotionService.applyCode(twice, c)
    assert.equal((await cartService.retrieve(twice))!.totals.discount_total, -800, "buying 4 tees unlocks two free caps")
  })

  it("free shipping zeroes the shipping total and shipping tax follows", async () => {
    const p = await makeProduct("Ship", 1000)
    const c = code("ship")
    const res = await standard(c, { type: "percentage", target_type: "shipping_methods", allocation: "across", value: 100 })
    assert.equal(res.status, 201)
    const cartId = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await pool.query(`INSERT INTO cart_shipping_method (cart_id, name, amount) VALUES ($1,'Std',700)`, [cartId])
    assert.equal((await cartService.retrieve(cartId))!.totals.shipping, 700)
    await promotionService.applyCode(cartId, c)
    const t = (await cartService.retrieve(cartId))!.totals as any
    assert.equal(t.shipping, 0)
    assert.equal(t.shipping_discount_total, -700)
    assert.equal(t.total, 1000, "the item price only")
  })

  it("eligibility rules: customer group, region, country and sales channel", async () => {
    const p = await makeProduct("Elig", 1000)
    const grp = await pool.query(`INSERT INTO customer_group (name) VALUES ($1) RETURNING id`, [`Grp ${T}`])
    const cus = await pool.query(`INSERT INTO customer (email) VALUES ($1) RETURNING id`, [`elig-${T}@example.com`])
    await pool.query(`INSERT INTO customer_group_customer (customer_group_id, customer_id) VALUES ($1,$2)`, [grp.rows[0].id, cus.rows[0].id])
    const method = { type: "percentage", target_type: "order", allocation: "across", value: 10 }

    const cg = code("grp")
    await standard(cg, method, { rules: [{ attribute: "customer.groups.id", operator: "in", values: [grp.rows[0].id] }] })
    const guest = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await promotionService.applyCode(guest, cg)
    assert.equal((await cartService.retrieve(guest))!.totals.discount_total, 0, "a guest is not in the group")
    const member = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await pool.query(`UPDATE cart SET customer_id=$2 WHERE id=$1`, [member, cus.rows[0].id])
    await promotionService.applyCode(member, cg)
    assert.equal((await cartService.retrieve(member))!.totals.discount_total, -100)

    const notGroup = code("notgrp")
    await standard(notGroup, method, { rules: [{ attribute: "customer.groups.id", operator: "ne", values: [grp.rows[0].id] }] })
    const m2 = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await pool.query(`UPDATE cart SET customer_id=$2 WHERE id=$1`, [m2, cus.rows[0].id])
    await promotionService.applyCode(m2, notGroup)
    assert.equal((await cartService.retrieve(m2))!.totals.discount_total, 0, "members are excluded by Not In")

    const reg = await pool.query(`INSERT INTO region (name, currency_code) VALUES ($1,'usd') RETURNING id`, [`Reg ${T}`])
    const cr = code("reg")
    await standard(cr, method, { rules: [{ attribute: "region.id", operator: "eq", values: reg.rows[0].id }] })
    const inRegion = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await pool.query(`UPDATE cart SET region_id=$2 WHERE id=$1`, [inRegion, reg.rows[0].id])
    await promotionService.applyCode(inRegion, cr)
    assert.equal((await cartService.retrieve(inRegion))!.totals.discount_total, -100)
    const noRegion = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await promotionService.applyCode(noRegion, cr)
    assert.equal((await cartService.retrieve(noRegion))!.totals.discount_total, 0)

    const cc = code("country")
    await standard(cc, method, { rules: [{ attribute: "shipping_address.country_code", operator: "in", values: ["vn"] }] })
    const vn = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await cartService.setAddress(vn, "shipping", { country_code: "VN", address_1: "1 Street" })
    await promotionService.applyCode(vn, cc)
    assert.equal((await cartService.retrieve(vn))!.totals.discount_total, -100)
    const us = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await cartService.setAddress(us, "shipping", { country_code: "US", address_1: "1 Street" })
    await promotionService.applyCode(us, cc)
    assert.equal((await cartService.retrieve(us))!.totals.discount_total, 0)

    const sc = await pool.query(`INSERT INTO sales_channel (name) VALUES ($1) RETURNING id`, [`SC ${T}`])
    const cs = code("chan")
    await standard(cs, method, { rules: [{ attribute: "sales_channel_id", operator: "in", values: [sc.rows[0].id] }] })
    const other = await makeCart([{ variantId: p.variantId, quantity: 1 }])
    await promotionService.applyCode(other, cs)
    assert.equal((await cartService.retrieve(other))!.totals.discount_total, 0, "default channel is not the rule's channel")
  })

  it("creates a new campaign inline and links an existing one", async () => {
    const c = code("camp")
    const res = await standard(c, { type: "percentage", target_type: "order", allocation: "across", value: 10 }, {
      campaign: { name: `Camp ${T}`, campaign_identifier: `camp-${T}`, description: "d", budget: { type: "usage", limit: 10 } },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.promotion.campaign.name, `Camp ${T}`)
    assert.equal(res.json.promotion.campaign.budget.type, "usage")
    assert.equal(res.json.promotion.campaign.budget.limit, 10)
    assert.equal(res.json.promotion.campaign.campaign_identifier, `camp-${T}`)

    const linked = await standard(code("camp2"), { type: "percentage", target_type: "order", allocation: "across", value: 10 }, { campaign_id: res.json.promotion.campaign_id })
    assert.equal(linked.status, 201)
    assert.equal(linked.json.promotion.campaign.id, res.json.promotion.campaign_id)

    const dupIdentifier = await standard(code("camp3"), { type: "percentage", target_type: "order", allocation: "across", value: 10 }, {
      campaign: { name: `Camp dup ${T}`, campaign_identifier: `camp-${T}`, budget: { type: "usage" } },
    })
    assert.equal(dupIdentifier.status, 409, "campaign identifiers are unique")
    const rolledBack = await pool.query(`SELECT 1 FROM campaign WHERE name = $1`, [`Camp dup ${T}`])
    assert.equal(rolledBack.rows.length, 0, "a failed create leaves no campaign behind")
  })

  it("edits a promotion with Lupus's payload and validates the result", async () => {
    const c = code("edit")
    const made = await standard(c, { type: "fixed", target_type: "items", allocation: "each", value: 500, currency_code: "usd", max_quantity: 2 }, { is_tax_inclusive: false })
    const id = made.json.promotion.id
    const upd = (body: any) => api("POST", `/admin/promotions/${id}`, body, token)

    const first = await upd({ status: "inactive", is_automatic: true, is_tax_inclusive: true, code: c + "x", application_method: { value: 750, allocation: "once", max_quantity: 4 } })
    assert.equal(first.status, 200)
    const p = first.json.promotion
    assert.equal(p.status, "inactive", "inactive is a real status now")
    assert.equal(p.is_automatic, true)
    assert.equal(p.is_tax_inclusive, true)
    assert.equal(p.code, (c + "x").toLowerCase())
    assert.equal(p.application_method.value, 750)
    assert.equal(p.application_method.allocation, "once")
    assert.equal(p.application_method.max_quantity, 4)

    assert.equal((await upd({ application_method: { allocation: "each", max_quantity: null } })).status, 400, "each needs a maximum quantity")
    assert.equal((await upd({ application_method: { type: "percentage", value: 150 } })).status, 400, "percentages stop at 100")
    const toPct = await upd({ application_method: { type: "percentage", value: 15 } })
    assert.equal(toPct.status, 200)
    assert.equal(toPct.json.promotion.application_method.type, "percentage")
    assert.equal(toPct.json.promotion.is_tax_inclusive, true, "the tax flag is left alone until the user turns it off")
    const toAcross = await upd({ application_method: { allocation: "across" } })
    assert.equal(toAcross.json.promotion.application_method.max_quantity, null, "across drops the maximum quantity")
    const back = await upd({ application_method: { type: "fixed", value: 100, currency_code: null } })
    assert.equal(back.status, 400, "a fixed amount cannot lose its currency")

    const other = await standard(code("edit2"), { type: "percentage", target_type: "order", allocation: "across", value: 5 })
    const clash = await upd({ code: other.json.promotion.code })
    assert.equal(clash.status, 409)
  })

  it("lists conditions with labels and the disguised rows (currency, quantities)", async () => {
    const prod = await makeProduct("Labelled", 100)
    const c = code("labels")
    const res = await create({
      code: c, type: "buyget", status: "active", rules: [{ attribute: "sales_channel_id", operator: "ne", values: ["sc_missing"] }],
      application_method: {
        type: "percentage", target_type: "items", value: 100, apply_to_quantity: 2, max_quantity: 4, buy_rules_min_quantity: 3, currency_code: "usd",
        buy_rules: [{ attribute: "items.product.id", operator: "in", values: [prod.productId] }],
        target_rules: [{ attribute: "items.product.id", operator: "eq", values: prod.productId }],
      },
    })
    assert.equal(res.status, 201)
    const id = res.json.promotion.id
    const list = async (rt: string) => (await api("GET", `/admin/promotions/${id}/${rt}`, undefined, token)).json.rules

    const rules = await list("rules")
    const currency = rules.find((r: any) => r.attribute === "currency_code")
    assert.equal(currency.disguised, true)
    assert.equal(currency.operator_label, "Equals")
    assert.deepEqual(currency.values.map((v: any) => v.value), ["usd"])
    const channel = rules.find((r: any) => r.attribute === "sales_channel_id")
    assert.equal(channel.attribute_label, "Sales Channel")
    assert.equal(channel.operator_label, "Not In")

    const buy = await list("buy-rules")
    assert.equal(buy[0].attribute, "buy_rules_min_quantity")
    assert.equal(buy[0].values, 3)
    assert.equal(buy[0].field_type, "number")
    const product = buy.find((r: any) => r.attribute === "items.product.id")
    assert.equal(product.attribute_label, "Product")
    assert.deepEqual(product.values, [{ value: prod.productId, label: `Labelled ${T}` }])

    const target = await list("target-rules")
    assert.equal(target[0].attribute, "apply_to_quantity")
    assert.equal(target[0].values, 2)

    // editing the disguised fields goes through the update payload, the rest through the rule batch
    const upd = await api("POST", `/admin/promotions/${id}`, { application_method: { apply_to_quantity: 5, buy_rules_min_quantity: 6 } }, token)
    assert.equal(upd.status, 200)
    assert.equal((await list("target-rules"))[0].values, 5)
    assert.equal((await list("buy-rules"))[0].values, 6)
    const batch = await api("POST", `/admin/promotions/${id}/buy-rules/batch`, { delete: [product.id] }, token)
    assert.equal(batch.status, 200)
    assert.equal((await list("buy-rules")).filter((r: any) => !r.disguised).length, 0)
  })
})
