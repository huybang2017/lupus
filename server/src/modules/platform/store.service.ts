import { pool } from "../../db"

// Lupus "Store": name, supported currencies (exactly one default, optional tax inclusive pricing
// per currency) and the default region / sales channel / stock location.
// Refs: upstream/packages/modules/store (update validates one default currency) and
// upstream/packages/core/core-flows/src/store/workflows/update-stores.ts (is_tax_inclusive -> price preference).

const bad = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}

export interface SupportedCurrencyInput {
  currency_code: string
  is_default?: boolean
  is_tax_inclusive?: boolean
}

export interface StoreUpdateInput {
  name?: string
  metadata?: Record<string, unknown> | null
  supported_currencies?: SupportedCurrencyInput[]
  default_sales_channel_id?: string | null
  default_region_id?: string | null
  default_location_id?: string | null
  locales?: string[]
}

export class StoreService {
  /** The store the dashboard manages: the oldest one (created on demand). */
  async firstId(): Promise<string> {
    const { rows } = await pool.query(`SELECT id FROM store ORDER BY created_at LIMIT 1`)
    if (rows[0]) return rows[0].id
    const created = await pool.query(`INSERT INTO store (name) VALUES ('Default Store') RETURNING id`)
    return created.rows[0].id
  }

  /** A store with no currency yet supports USD (the default), like a fresh Lupus install. */
  private async ensureCurrencies(id: string): Promise<void> {
    const has = await pool.query(`SELECT 1 FROM store_currency WHERE store_id = $1 LIMIT 1`, [id])
    if (has.rows[0]) return
    await pool.query(`INSERT INTO store_currency (store_id, currency_code, is_default) VALUES ($1,'usd',TRUE) ON CONFLICT DO NOTHING`, [id])
  }

  async retrieve(id: string) {
    const s = await pool.query(`SELECT * FROM store WHERE id = $1`, [id])
    if (!s.rows[0]) bad(`Store with id ${id} was not found`, 404)
    await this.ensureCurrencies(id)
    const [locales, currencies, prefs] = await Promise.all([
      pool.query(`SELECT locale_code FROM store_locale WHERE store_id = $1`, [id]),
      pool.query(
        `SELECT sc.currency_code, sc.is_default, c.name, c.symbol, c.symbol_native, c.decimal_digits
         FROM store_currency sc LEFT JOIN currency c ON c.code = sc.currency_code
         WHERE sc.store_id = $1 ORDER BY sc.is_default DESC, sc.currency_code`,
        [id]
      ),
      pool.query(`SELECT value, is_tax_inclusive FROM price_preference WHERE attribute = 'currency_code' AND deleted_at IS NULL`),
    ])
    const inclusive = new Map<string, boolean>(prefs.rows.map((p: any) => [String(p.value).toLowerCase(), !!p.is_tax_inclusive]))
    return {
      ...s.rows[0],
      locales: locales.rows.map((r: any) => r.locale_code),
      supported_currencies: currencies.rows.map((c: any) => ({
        currency_code: c.currency_code,
        is_default: !!c.is_default,
        is_tax_inclusive: inclusive.get(c.currency_code) ?? false,
        currency: c.name ? { code: c.currency_code, name: c.name, symbol: c.symbol, symbol_native: c.symbol_native, decimal_digits: c.decimal_digits } : null,
      })),
    }
  }

  async update(id: string, input: StoreUpdateInput) {
    const cur = (await pool.query(`SELECT * FROM store WHERE id = $1`, [id])).rows[0]
    if (!cur) bad(`Store with id ${id} was not found`, 404)
    await this.ensureCurrencies(id)

    let currencies: SupportedCurrencyInput[] | null = null
    if (input.supported_currencies) {
      currencies = input.supported_currencies.map((c) => ({ ...c, currency_code: c.currency_code.toLowerCase() }))
      if (new Set(currencies.map((c) => c.currency_code)).size !== currencies.length) bad("A currency can only be added once")
      if (currencies.length === 0) bad("The store needs at least one supported currency")
      if (currencies.filter((c) => c.is_default).length !== 1) bad("Store must have exactly one default currency")
      const known = await pool.query(`SELECT code FROM currency WHERE code = ANY($1)`, [currencies.map((c) => c.currency_code)])
      const ok = new Set(known.rows.map((r: any) => r.code))
      const missing = currencies.filter((c) => !ok.has(c.currency_code)).map((c) => c.currency_code)
      if (missing.length) bad(`Unknown currency: ${missing.join(", ")}`)
      const removed = (
        await pool.query(`SELECT currency_code FROM store_currency WHERE store_id = $1`, [id])
      ).rows
        .map((r: any) => r.currency_code as string)
        .filter((code) => !currencies!.some((c) => c.currency_code === code))
      if (removed.length) {
        const used = await pool.query(`SELECT name, currency_code FROM region WHERE deleted_at IS NULL AND LOWER(currency_code) = ANY($1) LIMIT 1`, [removed])
        if (used.rows[0]) bad(`Currency ${String(used.rows[0].currency_code).toUpperCase()} is used by the region ${used.rows[0].name}; change the region first`)
      }
    }
    const supported = currencies
      ? currencies.map((c) => c.currency_code)
      : (await pool.query(`SELECT currency_code FROM store_currency WHERE store_id = $1`, [id])).rows.map((r: any) => r.currency_code as string)

    if (input.default_region_id) {
      const r = await pool.query(`SELECT currency_code FROM region WHERE id = $1 AND deleted_at IS NULL`, [input.default_region_id])
      if (!r.rows[0]) bad(`Region ${input.default_region_id} was not found`, 404)
      if (!supported.includes(String(r.rows[0].currency_code).toLowerCase())) bad("The default region's currency must be a supported currency of the store")
    }
    if (input.default_sales_channel_id) {
      const r = await pool.query(`SELECT 1 FROM sales_channel WHERE id = $1 AND deleted_at IS NULL`, [input.default_sales_channel_id])
      if (!r.rows[0]) bad(`Sales channel ${input.default_sales_channel_id} was not found`, 404)
    }
    if (input.default_location_id) {
      const r = await pool.query(`SELECT 1 FROM stock_location WHERE id = $1 AND deleted_at IS NULL`, [input.default_location_id])
      if (!r.rows[0]) bad(`Stock location ${input.default_location_id} was not found`, 404)
    }
    if (input.name !== undefined && !input.name.trim()) bad("name cannot be empty")

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const sets: string[] = []
      const params: any[] = []
      const set = (c: string, v: unknown) => {
        params.push(v)
        sets.push(`${c} = $${params.length}`)
      }
      if (input.name !== undefined) set("name", input.name.trim())
      if (input.metadata !== undefined) set("metadata", input.metadata)
      if (input.default_sales_channel_id !== undefined) set("default_sales_channel_id", input.default_sales_channel_id)
      if (input.default_region_id !== undefined) set("default_region_id", input.default_region_id)
      if (input.default_location_id !== undefined) set("default_location_id", input.default_location_id)
      sets.push("updated_at = NOW()")
      params.push(id)
      await client.query(`UPDATE store SET ${sets.join(", ")} WHERE id = $${params.length}`, params)

      if (currencies) {
        await client.query(`DELETE FROM store_currency WHERE store_id = $1`, [id])
        // the unique "one default" index needs the default row last
        for (const c of [...currencies].sort((a, b) => Number(!!a.is_default) - Number(!!b.is_default))) {
          await client.query(`INSERT INTO store_currency (store_id, currency_code, is_default) VALUES ($1,$2,$3)`, [id, c.currency_code, !!c.is_default])
        }
        for (const c of currencies) {
          if (c.is_tax_inclusive === undefined) continue
          const pref = await client.query(`SELECT id FROM price_preference WHERE attribute = 'currency_code' AND value = $1 AND deleted_at IS NULL`, [c.currency_code])
          if (pref.rows[0]) {
            await client.query(`UPDATE price_preference SET is_tax_inclusive = $2, updated_at = NOW() WHERE id = $1`, [pref.rows[0].id, c.is_tax_inclusive])
          } else {
            await client.query(`INSERT INTO price_preference (attribute, value, is_tax_inclusive) VALUES ('currency_code', $1, $2)`, [c.currency_code, c.is_tax_inclusive])
          }
        }
      }
      for (const loc of input.locales ?? []) {
        await client.query(`INSERT INTO store_locale (store_id, locale_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, loc.toLowerCase()])
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
    return this.retrieve(id)
  }

  /** Codes of the currencies prices can be set in. */
  async supportedCurrencyCodes(): Promise<string[]> {
    const id = await this.firstId()
    await this.ensureCurrencies(id)
    const { rows } = await pool.query(`SELECT currency_code FROM store_currency WHERE store_id = $1 ORDER BY is_default DESC, currency_code`, [id])
    return rows.map((r: any) => r.currency_code)
  }
}

export const storeService = new StoreService()
