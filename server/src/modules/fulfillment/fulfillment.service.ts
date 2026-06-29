import { pool } from "../../db"
import { locationsService } from "./locations.service"

// Port of Lupus fulfillment flows: create-fulfillment, create-shipment, cancel-fulfillment,
// mark-as-delivered (core-flows/src/order/workflows/*). Lifecycle enforced exactly:
// open -> shipped (shipped_at) -> delivered (delivered_at); cancel allowed before delivery.
// Items validated against order lines (no over-fulfillment), mirroring Lupus's checks.
export class FulfillmentService {
  /** Kept for callers that create an option with a single amount; the full model lives in LocationsService. */
  async createShippingOption(input: { name: string; amount: number; currency_code: string; provider_id?: string; country_code?: string; fulfillment_set_id?: string; shipping_profile_id?: string; is_return?: boolean; rules?: { attribute: string; operator: string; value: string }[] }) {
    return locationsService.createShippingOption({ ...input, price_type: "flat" })
  }

  /** List options valid for a cart: country/zone match + rule conditions (weight/subtotal/qty). */
  async optionsForCart(cartId: string) {
    const cart = await pool.query(
      `SELECT c.currency_code, c.region_id, c.sales_channel_id, ca.country_code, ca.postal_code, ca.province, ca.city,
              COALESCE((SELECT SUM(oli.quantity) FROM cart_line_item oli WHERE oli.cart_id=c.id AND oli.deleted_at IS NULL),0)::int AS qty,
              COALESCE((SELECT SUM(oli.quantity*oli.unit_price) FROM cart_line_item oli WHERE oli.cart_id=c.id AND oli.deleted_at IS NULL),0)::int AS subtotal,
              COALESCE((SELECT SUM(CASE WHEN p.weight IS NULL THEN 0 ELSE p.weight * oli.quantity END) FROM cart_line_item oli LEFT JOIN product_variant v ON v.id=oli.variant_id LEFT JOIN product p ON p.id=COALESCE(oli.product_id, v.product_id) WHERE oli.cart_id=c.id AND oli.deleted_at IS NULL),0) AS weight
       FROM cart c LEFT JOIN cart_address ca ON ca.cart_id=c.id AND ca.kind='shipping' WHERE c.id=$1`,
      [cartId]
    )
    if (!cart.rows[0]) throw Object.assign(new Error("Cart not found"), { statusCode: 404 })
    const c = cart.rows[0]
    return this.optionsForContext(c.currency_code, (c.country_code ?? "").toLowerCase(), c.postal_code ?? "", {
      weight: Number(c.weight),
      subtotal: Number(c.subtotal),
      quantity: Number(c.qty),
    }, { region_id: c.region_id, sales_channel_id: c.sales_channel_id, province: c.province ?? "", city: c.city ?? "" })
  }

  /** Same option list as optionsForCart, sourced from an order (currency, shipping address, lines). */
  async optionsForOrder(orderId: string) {
    const order = await pool.query(
      `SELECT o.currency_code, o.region_id, o.sales_channel_id, ca.country_code, ca.postal_code, ca.province, ca.city,
              COALESCE((SELECT SUM(oli.quantity) FROM order_line_item oli WHERE oli.order_id=o.id),0)::int AS qty,
              COALESCE((SELECT SUM(oli.quantity*oli.unit_price) FROM order_line_item oli WHERE oli.order_id=o.id),0)::int AS subtotal,
              COALESCE((SELECT SUM(CASE WHEN p.weight IS NULL THEN 0 ELSE p.weight * oli.quantity END) FROM order_line_item oli LEFT JOIN product_variant v ON v.id=oli.variant_id LEFT JOIN product p ON p.id=COALESCE(oli.product_id, v.product_id) WHERE oli.order_id=o.id),0) AS weight
       FROM "order" o LEFT JOIN order_address ca ON ca.order_id=o.id AND ca.kind='shipping' WHERE o.id=$1`,
      [orderId]
    )
    if (!order.rows[0]) throw Object.assign(new Error("Order not found"), { statusCode: 404 })
    const o = order.rows[0]
    return this.optionsForContext(o.currency_code, (o.country_code ?? "").toLowerCase(), o.postal_code ?? "", {
      weight: Number(o.weight),
      subtotal: Number(o.subtotal),
      quantity: Number(o.qty),
    }, { region_id: o.region_id, sales_channel_id: o.sales_channel_id, province: o.province ?? "", city: o.city ?? "" })
  }

  /**
   * Shared option query for cart and order contexts. An option is offered when it is enabled in the
   * store, is not a return option, one of its prices applies (region or currency, plus the cart item
   * total conditions), its service zone covers the shipping address, its fulfillment set ships (not
   * pickup) from a location connected to the sales channel, and its weight/quantity rules hold.
   * The returned `amount` is the price that applies to this context.
   */
  private async optionsForContext(
    currency: string,
    country: string,
    postal: string,
    ctx: Record<string, number>,
    extra: { region_id?: string | null; sales_channel_id?: string | null; province?: string; city?: string } = {}
  ) {
    const opts = await pool.query(
      `SELECT so.* FROM shipping_option so WHERE so.deleted_at IS NULL AND so.is_return = FALSE AND so.enabled_in_store = TRUE ORDER BY so.created_at`
    )
    const out = []
    for (const o of opts.rows) {
      if (o.service_zone_id) {
        if (!(await this.zoneServes(o.service_zone_id, country, extra.province ?? "", extra.city ?? "", postal, extra.sales_channel_id ?? null))) continue
      } else if (!(await this.legacyZoneServes(o, country, postal))) continue

      const price = await this.priceFor(o, currency, extra.region_id ?? null, ctx.subtotal ?? 0)
      if (!price) continue

      const rules = await pool.query(`SELECT * FROM shipping_option_rule WHERE shipping_option_id=$1`, [o.id])
      let ok = true
      for (const r of rules.rows) {
        if (r.attribute === "product_id") continue // evaluated per-line at checkout; skip for listing
        const actual = ctx[r.attribute]
        const want = Number(r.value)
        if (actual == null || Number.isNaN(want)) { ok = false; break }
        if (
          (r.operator === "eq" && !(actual === want)) || (r.operator === "ne" && !(actual !== want)) ||
          (r.operator === "gt" && !(actual > want)) || (r.operator === "gte" && !(actual >= want)) ||
          (r.operator === "lt" && !(actual < want)) || (r.operator === "lte" && !(actual <= want))
        ) { ok = false; break }
      }
      if (ok) {
        // every price of the option with its item_total conditions (the storefront's free-shipping nudge reads them)
        const priceRows = (await pool.query(`SELECT * FROM shipping_option_price WHERE shipping_option_id = $1 AND deleted_at IS NULL`, [o.id])).rows
        const prices = priceRows.map((p: any) => ({
          id: p.id,
          amount: Number(p.amount),
          currency_code: String(p.currency_code ?? currency).toLowerCase(),
          region_id: p.region_id ?? null,
          price_rules: (Array.isArray(p.rules) ? p.rules : []).map((r: any) => ({ attribute: r.attribute ?? "item_total", operator: r.operator, value: String(r.value) })),
        }))
        out.push({ ...o, amount: price.amount, currency_code: price.currency_code, calculated_price: { calculated_amount: price.amount, currency_code: price.currency_code }, prices })
      }
    }
    return out
  }

  /** The service zone's areas cover the address, the set is a shipping set and its location sells to the channel. */
  private async zoneServes(zoneId: string, country: string, province: string, city: string, postal: string, channelId: string | null): Promise<boolean> {
    const z = await pool.query(
      `SELECT fs.type, fs.stock_location_id FROM service_zone sz JOIN fulfillment_set fs ON fs.id = sz.fulfillment_set_id AND fs.deleted_at IS NULL
       WHERE sz.id = $1 AND sz.deleted_at IS NULL`,
      [zoneId]
    )
    if (!z.rows[0] || z.rows[0].type !== "shipping") return false
    if (channelId && z.rows[0].stock_location_id) {
      const linked = await pool.query(`SELECT 1 FROM sales_channel_stock_location WHERE stock_location_id = $1 AND sales_channel_id = $2`, [z.rows[0].stock_location_id, channelId])
      if (!linked.rows[0]) return false
    }
    const c = country.toLowerCase()
    if (!c) return false
    const geo = await pool.query(`SELECT * FROM geo_zone WHERE service_zone_id = $1 AND deleted_at IS NULL`, [zoneId])
    const prov = province.toLowerCase().replace(/^[a-z]{2}-/, "")
    return geo.rows.some((g: any) => {
      if (String(g.country_code).toLowerCase() !== c) return false
      if (g.type === "country") return true
      if (g.type === "province") return String(g.province_code ?? "").toLowerCase().replace(/^[a-z]{2}-/, "") === prov
      if (g.type === "city") return String(g.city ?? "").toLowerCase() === city.toLowerCase()
      if (g.type === "postal") {
        const exprs: string[] = g.postal_expression ? (typeof g.postal_expression === "string" ? JSON.parse(g.postal_expression) : g.postal_expression) : []
        return exprs.some((e) => postal.toLowerCase().startsWith(String(e).toLowerCase().replace(/\*$/, "")))
      }
      return false
    })
  }

  /** Options made before service zones existed: optional country and a fulfillment set whose geo zones match. */
  private async legacyZoneServes(o: any, country: string, postal: string): Promise<boolean> {
    if (!o.country_code || o.country_code === country) return true
    if (!o.fulfillment_set_id) return false
    const r = await pool.query(
      `SELECT 1 FROM service_zone sz JOIN geo_zone gz ON gz.service_zone_id = sz.id
       WHERE sz.fulfillment_set_id = $1 AND gz.deleted_at IS NULL AND sz.deleted_at IS NULL
         AND LOWER(gz.country_code) = LOWER(COALESCE($2,''))
         AND (gz.postal_expression IS NULL OR $3 ILIKE ANY (SELECT '%' || jsonb_array_elements_text(gz.postal_expression::jsonb) || '%')) LIMIT 1`,
      [o.fulfillment_set_id, country, postal]
    )
    return !!r.rows[0]
  }

  /** The price that applies: a region price beats a currency price; more conditions beat fewer; then the cheapest. */
  private async priceFor(o: any, currency: string, regionId: string | null, itemTotal: number): Promise<{ amount: number; currency_code: string } | null> {
    if (o.price_type !== "flat") return null
    const rows = (await pool.query(`SELECT * FROM shipping_option_price WHERE shipping_option_id = $1 AND deleted_at IS NULL`, [o.id])).rows
    if (rows.length === 0) {
      return o.currency_code && String(o.currency_code).toLowerCase() === currency.toLowerCase() ? { amount: Number(o.amount), currency_code: o.currency_code } : null
    }
    const holds = (rules: any[]) =>
      (rules ?? []).every((r) => {
        const want = Number(r.value)
        return (
          (r.operator === "gte" && itemTotal >= want) || (r.operator === "lte" && itemTotal <= want) ||
          (r.operator === "gt" && itemTotal > want) || (r.operator === "lt" && itemTotal < want) || (r.operator === "eq" && itemTotal === want)
        )
      })
    const fits = rows
      .filter((p: any) => (p.region_id ? p.region_id === regionId : String(p.currency_code).toLowerCase() === currency.toLowerCase()))
      .filter((p: any) => holds(p.rules))
      .sort((a: any, b: any) => Number(!!b.region_id) - Number(!!a.region_id) || (b.rules?.length ?? 0) - (a.rules?.length ?? 0) || Number(a.amount) - Number(b.amount))
    const best = fits[0]
    if (!best) return null
    return { amount: Number(best.amount), currency_code: best.currency_code ?? currency.toLowerCase() }
  }

  async createFulfillmentSet(name: string, type = "shipping", stockLocationId?: string) {
    const { rows } = await pool.query(`INSERT INTO fulfillment_set (name, type, stock_location_id) VALUES ($1,$2,$3) RETURNING *`, [name, type, stockLocationId ?? null])
    return rows[0]
  }

  async createServiceZone(setId: string, name: string, geoZones: { type: string; country_code: string; province_code?: string; city?: string; postal_expression?: string[] }[] = []) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const z = await client.query(`INSERT INTO service_zone (fulfillment_set_id, name) VALUES ($1,$2) RETURNING *`, [setId, name])
      for (const g of geoZones) {
        await client.query(
          `INSERT INTO geo_zone (service_zone_id, type, country_code, province_code, city, postal_expression) VALUES ($1,$2,$3,$4,$5,$6)`,
          [z.rows[0].id, g.type, g.country_code.toLowerCase(), g.province_code?.toLowerCase() ?? null, g.city ?? null, g.postal_expression ? JSON.stringify(g.postal_expression) : null]
        )
      }
      await client.query("COMMIT")
      return z.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  listProviders() {
    return locationsService.listProviders()
  }

  async createFulfillment(orderId: string, items: { line_item_id: string; quantity: number }[], shippingOptionId?: string) {
    const order = await pool.query(`SELECT id FROM "order" WHERE id=$1 AND deleted_at IS NULL AND status <> 'canceled'`, [orderId])
    if (!order.rows[0]) {
      throw Object.assign(new Error("Fulfillable order not found"), { statusCode: 404 })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const f = await client.query(
        `INSERT INTO fulfillment (order_id, shipping_option_id) VALUES ($1,$2) RETURNING *`,
        [orderId, shippingOptionId ?? null]
      )
      for (const it of items) {
        const line = await client.query(`SELECT quantity FROM order_line_item WHERE id=$1`, [it.line_item_id])
        if (!line.rows[0]) {
          throw Object.assign(new Error(`Order line ${it.line_item_id} not found`), { statusCode: 404 })
        }
        const already = await client.query(
          `SELECT COALESCE(SUM(fi.quantity),0)::int AS q FROM fulfillment_item fi
           JOIN fulfillment f ON f.id=fi.fulfillment_id WHERE f.order_id=$1 AND fi.line_item_id=$2 AND f.canceled_at IS NULL`,
          [orderId, it.line_item_id]
        )
        if (already.rows[0].q + it.quantity > line.rows[0].quantity) {
          throw Object.assign(new Error(`Over-fulfillment for line ${it.line_item_id}`), { statusCode: 400 })
        }
        await client.query(`INSERT INTO fulfillment_item (fulfillment_id, line_item_id, quantity) VALUES ($1,$2,$3)`, [
          f.rows[0].id,
          it.line_item_id,
          it.quantity,
        ])
      }
      await client.query("COMMIT")
      return f.rows[0]
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async markShipped(id: string) {
    const r = await pool.query(`UPDATE fulfillment SET shipped_at=NOW() WHERE id=$1 AND canceled_at IS NULL AND shipped_at IS NULL RETURNING order_id`, [id])
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Fulfillment cannot be shipped"), { statusCode: 400 })
    }
    const { eventBus } = await import("../infra/platform-infra.service")
    await eventBus.emit("fulfillment.shipped", { fulfillment_id: id, order_id: r.rows[0]?.order_id }).catch(() => undefined)
  }

  async markDelivered(id: string) {
    const r = await pool.query(
      `UPDATE fulfillment SET delivered_at=NOW() WHERE id=$1 AND shipped_at IS NOT NULL AND canceled_at IS NULL AND delivered_at IS NULL RETURNING order_id`,
      [id]
    )
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Fulfillment cannot be delivered (ship first)"), { statusCode: 400 })
    }
    const { eventBus } = await import("../infra/platform-infra.service")
    await eventBus.emit("fulfillment.delivered", { fulfillment_id: id, order_id: r.rows[0]?.order_id }).catch(() => undefined)
  }

  async cancel(id: string) {
    const r = await pool.query(`UPDATE fulfillment SET canceled_at=NOW() WHERE id=$1 AND delivered_at IS NULL AND canceled_at IS NULL`, [id])
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Fulfillment cannot be canceled"), { statusCode: 400 })
    }
  }

  async listForOrder(orderId: string) {
    const { rows } = await pool.query(`SELECT * FROM fulfillment WHERE order_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [orderId])
    return rows
  }
}

export const fulfillmentService = new FulfillmentService()
