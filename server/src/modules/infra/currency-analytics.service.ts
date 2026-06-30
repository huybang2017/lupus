import { pool } from "../../db"

// Port of modules/currency (code/symbol/decimals) + providers/analytics-local
// (track + revenue/top-products queries over orders).
const SEED: { code: string; symbol: string; symbol_native: string; name: string; decimal_digits: number }[] = [
  { code: "usd", symbol: "$", symbol_native: "$", name: "US Dollar", decimal_digits: 2 },
  { code: "eur", symbol: "€", symbol_native: "€", name: "Euro", decimal_digits: 2 },
  { code: "gbp", symbol: "£", symbol_native: "£", name: "British Pound", decimal_digits: 2 },
  { code: "dkk", symbol: "kr", symbol_native: "kr", name: "Danish Krone", decimal_digits: 2 },
  { code: "sek", symbol: "kr", symbol_native: "kr", name: "Swedish Krona", decimal_digits: 2 },
  { code: "jpy", symbol: "¥", symbol_native: "￥", name: "Japanese Yen", decimal_digits: 0 },
  { code: "vnd", symbol: "₫", symbol_native: "₫", name: "Vietnamese Dong", decimal_digits: 0 },
]

export class CurrencyService {
  async ensureSeeded() {
    for (const c of SEED) {
      await pool.query(
        `INSERT INTO currency (code, symbol, symbol_native, name, decimal_digits) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`,
        [c.code, c.symbol, c.symbol_native, c.name, c.decimal_digits]
      )
    }
  }

  async list() {
    await this.ensureSeeded()
    const { rows } = await pool.query(`SELECT * FROM currency ORDER BY code`)
    return rows
  }
}

export const currencyService = new CurrencyService()

export class AnalyticsService {
  async track(event: string, actor?: string, properties: Record<string, unknown> = {}) {
    const { rows } = await pool.query(`INSERT INTO analytics_event (event, actor, properties) VALUES ($1,$2,$3) RETURNING *`, [
      event,
      actor ?? null,
      JSON.stringify(properties),
    ])
    return rows[0]
  }

  async revenueByDay(currency?: string, days = 30) {
    const { rows } = await pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, currency_code, SUM(total)::bigint AS revenue, COUNT(*)::int AS orders
       FROM "order" WHERE deleted_at IS NULL AND status <> 'canceled' AND created_at >= NOW() - ($1 || ' days')::interval
       ${currency ? "AND currency_code=$2" : ""}
       GROUP BY 1, 2 ORDER BY 1 DESC`,
      currency ? [String(days), currency.toLowerCase()] : [String(days)]
    )
    return rows
  }

  async topProducts(limit = 10) {
    const { rows } = await pool.query(
      `SELECT oli.title, SUM(oli.quantity)::int AS qty, SUM(oli.quantity * oli.unit_price)::bigint AS revenue
       FROM order_line_item oli JOIN "order" o ON o.id=oli.order_id
       WHERE o.deleted_at IS NULL AND o.status <> 'canceled'
       GROUP BY oli.title ORDER BY revenue DESC LIMIT $1`,
      [Math.min(limit, 50)]
    )
    return rows
  }
}

export const analyticsService = new AnalyticsService()
