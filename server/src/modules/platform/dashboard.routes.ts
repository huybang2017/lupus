import { Router } from "express"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"

// GET /admin/dashboard: everything the admin home page shows, computed in one round trip.
// Sales are counted per currency (the store's default unless ?currency= says otherwise), for the last
// `days` days and for the same number of days before that so every figure can show its change.
export const dashboardRouter = Router()

const RANGES = [7, 30, 90]
const LOW_STOCK_AT = 5

const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 1000) / 10)

dashboardRouter.get("/admin/dashboard", requireAuth, async (req, res, next) => {
  try {
    const asked = Number(Array.isArray(req.query.days) ? req.query.days[0] : req.query.days)
    const days = RANGES.includes(asked) ? asked : 30

    const used = await pool.query(`SELECT currency_code, COUNT(*)::int AS c FROM "order" WHERE deleted_at IS NULL AND is_draft_order = FALSE GROUP BY currency_code ORDER BY c DESC`)
    const currencies: string[] = used.rows.map((r: any) => String(r.currency_code).toLowerCase())
    const storeDefault = await pool.query(`SELECT currency_code FROM store_currency WHERE is_default = TRUE LIMIT 1`)
    const wanted = String(Array.isArray(req.query.currency) ? req.query.currency[0] : (req.query.currency ?? "")).toLowerCase()
    const currency = currencies.includes(wanted) ? wanted : (currencies.includes(storeDefault.rows[0]?.currency_code) ? storeDefault.rows[0].currency_code : (currencies[0] ?? storeDefault.rows[0]?.currency_code ?? "usd"))

    const live = `o.deleted_at IS NULL AND o.is_draft_order = FALSE AND o.status <> 'canceled' AND LOWER(o.currency_code) = $1`
    const window = (from: string, to: string) => `o.created_at >= NOW() - INTERVAL '${from} days' AND o.created_at < NOW() - INTERVAL '${to} days'`
    const kpi = async (from: number, to: number) => {
      const r = await pool.query(
        `SELECT COALESCE(SUM(o.total),0)::bigint AS revenue, COUNT(*)::int AS orders,
                COALESCE(SUM(LEAST(COALESCE(pc.refunded_amount,0), o.total)),0)::bigint AS refunds
         FROM "order" o LEFT JOIN payment_collection pc ON pc.id = o.payment_collection_id
         WHERE ${live} AND ${window(String(from), String(to))}`,
        [currency]
      )
      const customers = await pool.query(`SELECT COUNT(*)::int AS c FROM customer WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '${from} days' AND created_at < NOW() - INTERVAL '${to} days'`)
      const revenue = Number(r.rows[0].revenue)
      const orders = Number(r.rows[0].orders)
      return { revenue, orders, aov: orders === 0 ? 0 : Math.round(revenue / orders), refunds: Number(r.rows[0].refunds), customers: Number(customers.rows[0].c) }
    }
    const [now, before] = await Promise.all([kpi(days, 0), kpi(days * 2, days)])
    const kpis = Object.fromEntries((Object.keys(now) as (keyof typeof now)[]).map((k) => [k, { value: now[k], previous: before[k], change: pct(now[k], before[k]) }]))

    const series = await pool.query(
      `SELECT d::date AS day,
              COALESCE(SUM(o.total),0)::bigint AS revenue, COUNT(o.id)::int AS orders
       FROM generate_series((NOW() - INTERVAL '${days - 1} days')::date, NOW()::date, INTERVAL '1 day') d
       LEFT JOIN "order" o ON o.created_at::date = d::date AND ${live}
       GROUP BY d ORDER BY d`,
      [currency]
    )

    const top = await pool.query(
      `SELECT li.product_id, COALESCE(p.title, li.title) AS title, p.thumbnail,
              SUM(li.quantity)::int AS units, SUM(li.quantity * li.unit_price)::bigint AS revenue
       FROM order_line_item li
       JOIN "order" o ON o.id = li.order_id
       LEFT JOIN product p ON p.id = li.product_id
       WHERE ${live} AND ${window(String(days), "0")}
       GROUP BY li.product_id, COALESCE(p.title, li.title), p.thumbnail
       ORDER BY revenue DESC LIMIT 5`,
      [currency]
    )

    const channels = await pool.query(
      `SELECT COALESCE(sc.name, 'No sales channel') AS name, COALESCE(SUM(o.total),0)::bigint AS revenue, COUNT(*)::int AS orders
       FROM "order" o LEFT JOIN sales_channel sc ON sc.id = o.sales_channel_id
       WHERE ${live} AND ${window(String(days), "0")}
       GROUP BY sc.name ORDER BY revenue DESC LIMIT 6`,
      [currency]
    )

    const recent = await pool.query(
      `SELECT o.id, o.display_id, o.email, o.total, o.currency_code, o.status, o.created_at, pc.status AS payment_status,
              COALESCE(NULLIF(TRIM(CONCAT(cu.first_name, ' ', cu.last_name)), ''), o.email) AS customer_name,
              CASE
                WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.delivered_at IS NOT NULL) THEN 'delivered'
                WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.shipped_at IS NOT NULL) THEN 'shipped'
                WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL) THEN 'fulfilled'
                ELSE 'not_fulfilled' END AS fulfillment_status
       FROM "order" o
       LEFT JOIN payment_collection pc ON pc.id = o.payment_collection_id
       LEFT JOIN customer cu ON cu.id = o.customer_id
       WHERE o.deleted_at IS NULL AND o.is_draft_order = FALSE
       ORDER BY o.created_at DESC LIMIT 8`
    )

    const inPeriod = window(String(days), "0")
    const fulfillmentCase = `CASE
      WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.delivered_at IS NOT NULL) THEN 'delivered'
      WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.shipped_at IS NOT NULL) THEN 'shipped'
      WHEN EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL) THEN 'fulfilled'
      ELSE 'not_fulfilled' END`
    const countBy = (rows: any[]) => rows.map((r: any) => ({ key: r.k ?? "unknown", count: Number(r.c) }))

    const paymentBreakdown = await pool.query(
      `SELECT COALESCE(pc.status, 'not_paid') AS k, COUNT(*)::int AS c FROM "order" o LEFT JOIN payment_collection pc ON pc.id = o.payment_collection_id
       WHERE ${live} AND ${inPeriod} GROUP BY 1 ORDER BY c DESC`,
      [currency]
    )
    const fulfillmentBreakdown = await pool.query(`SELECT ${fulfillmentCase} AS k, COUNT(*)::int AS c FROM "order" o WHERE ${live} AND ${inPeriod} GROUP BY 1 ORDER BY c DESC`, [currency])

    // 0 = Sunday ... 6 = Saturday
    const weekdays = await pool.query(
      `SELECT d AS dow, COALESCE(x.orders, 0)::int AS orders, COALESCE(x.revenue, 0)::bigint AS revenue
       FROM generate_series(0, 6) d
       LEFT JOIN (SELECT EXTRACT(DOW FROM o.created_at)::int AS dow, COUNT(*) AS orders, SUM(o.total) AS revenue FROM "order" o WHERE ${live} AND ${inPeriod} GROUP BY 1) x ON x.dow = d
       ORDER BY d`,
      [currency]
    )

    const countries = await pool.query(
      `SELECT UPPER(a.country_code) AS country, COUNT(*)::int AS orders, COALESCE(SUM(o.total),0)::bigint AS revenue
       FROM "order" o JOIN order_address a ON a.order_id = o.id AND a.kind = 'shipping' AND a.country_code IS NOT NULL
       WHERE ${live} AND ${inPeriod} GROUP BY 1 ORDER BY revenue DESC LIMIT 5`,
      [currency]
    )

    // customers who bought in the period and had already bought before it come back
    const buyers = await pool.query(
      `SELECT COUNT(DISTINCT o.customer_id)::int AS buyers,
              COUNT(DISTINCT o.customer_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM "order" p WHERE p.customer_id = o.customer_id AND p.deleted_at IS NULL AND p.is_draft_order = FALSE AND p.status <> 'canceled'
                  AND p.created_at < NOW() - INTERVAL '${days} days'))::int AS returning
       FROM "order" o WHERE ${live} AND ${inPeriod} AND o.customer_id IS NOT NULL`,
      [currency]
    )

    const carts = await pool.query(
      `SELECT COUNT(*)::int AS created,
              COUNT(*) FILTER (WHERE c.completed_at IS NOT NULL)::int AS completed,
              COUNT(*) FILTER (WHERE c.completed_at IS NULL AND EXISTS (SELECT 1 FROM cart_line_item li WHERE li.cart_id = c.id AND li.deleted_at IS NULL))::int AS abandoned
       FROM cart c WHERE c.deleted_at IS NULL AND c.created_at >= NOW() - INTERVAL '${days} days'`
    )

    const discounts = await pool.query(
      `SELECT COALESCE(SUM(o.discount_total),0)::bigint AS total, COUNT(*) FILTER (WHERE o.discount_total <> 0)::int AS orders,
              COALESCE(SUM(o.subtotal),0)::bigint AS gross
       FROM "order" o WHERE ${live} AND ${inPeriod}`,
      [currency]
    )

    const lowItems = await pool.query(
      `SELECT ii.id, COALESCE(ii.title, ii.sku) AS title, ii.sku, SUM(l.stocked_quantity - l.reserved_quantity)::int AS available
       FROM inventory_item ii JOIN inventory_level_location l ON l.inventory_item_id = ii.id
       WHERE ii.deleted_at IS NULL GROUP BY ii.id HAVING SUM(l.stocked_quantity - l.reserved_quantity) <= $1
       ORDER BY available ASC, ii.created_at DESC LIMIT 5`,
      [LOW_STOCK_AT]
    )

    const one = async (sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].c)
    const attention = {
      awaiting_payment: await one(
        `SELECT COUNT(*)::int AS c FROM "order" o JOIN payment_collection pc ON pc.id = o.payment_collection_id
         WHERE o.deleted_at IS NULL AND o.is_draft_order = FALSE AND o.status <> 'canceled' AND pc.status IN ('not_paid','awaiting','authorized')`
      ),
      to_fulfill: await one(
        `SELECT COUNT(*)::int AS c FROM "order" o
         WHERE o.deleted_at IS NULL AND o.is_draft_order = FALSE AND o.status <> 'canceled'
           AND NOT EXISTS (SELECT 1 FROM fulfillment f WHERE f.order_id = o.id AND f.deleted_at IS NULL AND f.canceled_at IS NULL)`
      ),
      open_returns: await one(`SELECT COUNT(*)::int AS c FROM return_request WHERE deleted_at IS NULL AND status IN ('requested','pending','received')`),
      draft_orders: await one(`SELECT COUNT(*)::int AS c FROM "order" WHERE deleted_at IS NULL AND is_draft_order = TRUE AND status <> 'canceled'`),
      low_stock: await one(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT inventory_item_id FROM inventory_level_location GROUP BY inventory_item_id
           HAVING SUM(stocked_quantity - reserved_quantity) <= $1) s`,
        [LOW_STOCK_AT]
      ),
      draft_products: await one(`SELECT COUNT(*)::int AS c FROM product WHERE deleted_at IS NULL AND status = 'draft'`),
    }

    const totals = {
      products: await one(`SELECT COUNT(*)::int AS c FROM product WHERE deleted_at IS NULL`),
      customers: await one(`SELECT COUNT(*)::int AS c FROM customer WHERE deleted_at IS NULL`),
      orders: await one(`SELECT COUNT(*)::int AS c FROM "order" WHERE deleted_at IS NULL AND is_draft_order = FALSE`),
    }

    res.json({
      days,
      currency,
      currencies,
      low_stock_at: LOW_STOCK_AT,
      kpis,
      series: series.rows.map((r: any) => ({ day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10), revenue: Number(r.revenue), orders: Number(r.orders) })),
      top_products: top.rows.map((r: any) => ({ product_id: r.product_id, title: r.title, thumbnail: r.thumbnail ?? null, units: Number(r.units), revenue: Number(r.revenue) })),
      channels: channels.rows.map((r: any) => ({ name: r.name, revenue: Number(r.revenue), orders: Number(r.orders) })),
      recent_orders: recent.rows,
      payment_breakdown: countBy(paymentBreakdown.rows),
      fulfillment_breakdown: countBy(fulfillmentBreakdown.rows),
      weekdays: weekdays.rows.map((r: any) => ({ dow: Number(r.dow), orders: Number(r.orders), revenue: Number(r.revenue) })),
      countries: countries.rows.map((r: any) => ({ country: r.country, orders: Number(r.orders), revenue: Number(r.revenue) })),
      customers: {
        buyers: Number(buyers.rows[0].buyers),
        returning: Number(buyers.rows[0].returning),
        repeat_rate: Number(buyers.rows[0].buyers) === 0 ? 0 : Math.round((Number(buyers.rows[0].returning) / Number(buyers.rows[0].buyers)) * 1000) / 10,
      },
      carts: {
        created: Number(carts.rows[0].created),
        completed: Number(carts.rows[0].completed),
        abandoned: Number(carts.rows[0].abandoned),
        conversion_rate: Number(carts.rows[0].created) === 0 ? 0 : Math.round((Number(carts.rows[0].completed) / Number(carts.rows[0].created)) * 1000) / 10,
      },
      discounts: {
        total: Math.abs(Number(discounts.rows[0].total)),
        orders: Number(discounts.rows[0].orders),
        share: Number(discounts.rows[0].gross) === 0 ? 0 : Math.round((Math.abs(Number(discounts.rows[0].total)) / (Number(discounts.rows[0].gross) + Math.abs(Number(discounts.rows[0].total)))) * 1000) / 10,
      },
      low_stock_items: lowItems.rows.map((r: any) => ({ id: r.id, title: r.title, sku: r.sku, available: Number(r.available) })),
      attention,
      totals,
    })
  } catch (e) {
    next(e)
  }
})
