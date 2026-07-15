import { pool } from "../../db"

// Port of Lupus tax flow (update-tax-lines workflow + get-item-tax-lines step + tax module).
// Resolution: country from cart shipping address (fallback: region countries[0]).
// Rates: default rate always applies; non-combinable rates: highest wins; combinable stack.
// Exclusive: tax = round((line_subtotal - discount) * rate/100).
// Inclusive (line.is_tax_inclusive): tax = round(gross - gross/(1+rate/100)).
// Shipping taxed the same way on shipping amount. Tax lines persisted for audit.
export interface TaxLine {
  code: string
  rate: number
  provider_id: string
}

export interface TaxTarget {
  product_id?: string | null
  product_type_id?: string | null
  shipping_option_id?: string | null
}

interface PoolRate {
  code: string
  rate: number
  is_default: boolean
  is_combinable: boolean
  rules: { reference: string; reference_id: string }[]
}

const RULE_WEIGHT: Record<string, number> = { product: 3, shipping_option: 3, product_type: 2 }

function ruleMatches(rule: { reference: string; reference_id: string }, target: TaxTarget) {
  if (rule.reference === "product") return !!target.product_id && rule.reference_id === target.product_id
  if (rule.reference === "product_type") return !!target.product_type_id && rule.reference_id === target.product_type_id
  if (rule.reference === "shipping_option") return !!target.shipping_option_id && rule.reference_id === target.shipping_option_id
  return false
}

export class TaxService {
  /**
   * The rates that can apply at an address: the province region when one exists (and the address names
   * that province), otherwise the country region. Legacy province/postal narrowing rules still win.
   */
  async ratePool(address: { country: string | null; province?: string | null; postal?: string | null }): Promise<PoolRate[]> {
    const countryCode = address.country
    if (!countryCode) {
      return []
    }
    const cc = countryCode.toLowerCase()
    const province = address.province?.toLowerCase() ?? null
    const postal = address.postal ?? null
    const regions = await pool.query(
      `SELECT tr.id, tr.province_code,
        (SELECT COUNT(*) FROM tax_region_rule r WHERE r.tax_region_id = tr.id AND
          ((r.reference='province' AND LOWER(r.reference_id)=$2) OR
           (r.reference='postal' AND $3::text IS NOT NULL AND $3::text ILIKE r.reference_id || '%'))) AS rule_hits
       FROM tax_region tr WHERE LOWER(tr.country_code)=$1 AND tr.deleted_at IS NULL
       ORDER BY rule_hits DESC`,
      [cc, province, postal]
    )
    if (regions.rows.length === 0) {
      return []
    }
    const topHits = Number(regions.rows[0].rule_hits)
    let scoped: any[]
    if (topHits > 0) {
      scoped = regions.rows.filter((r: any) => Number(r.rule_hits) === topHits)
    } else {
      const provinceRegion = province
        ? regions.rows.find((r: any) => r.province_code && (String(r.province_code).toLowerCase() === province || String(r.province_code).toLowerCase() === `${cc}-${province}`))
        : null
      scoped = provinceRegion ? [provinceRegion] : regions.rows.filter((r: any) => !r.province_code)
      if (scoped.length === 0) scoped = regions.rows
    }
    const rates = await pool.query(
      `SELECT id, code, rate, is_default, is_combinable, tax_region_id FROM tax_rate
       WHERE tax_region_id = ANY($1) AND deleted_at IS NULL AND rate IS NOT NULL`,
      [scoped.map((r: any) => r.id)]
    )
    const rules = rates.rows.length
      ? await pool.query(`SELECT tax_rate_id, reference, reference_id FROM tax_rate_rule WHERE tax_rate_id = ANY($1) AND deleted_at IS NULL`, [rates.rows.map((r: any) => r.id)])
      : { rows: [] as any[] }
    return rates.rows.map((r: any) => ({
      code: r.code,
      rate: Number(r.rate),
      is_default: !!r.is_default,
      is_combinable: !!r.is_combinable,
      rules: rules.rows.filter((x: any) => x.tax_rate_id === r.id).map((x: any) => ({ reference: x.reference, reference_id: x.reference_id })),
    }))
  }

  /**
   * Which of the region's rates apply to one line or shipping method: an override whose rules match
   * replaces the default rate (unless it is combinable, then it is added on top of it).
   * Product tax codes pin rates by code when present.
   */
  pickRates(rates: PoolRate[], target: TaxTarget = {}, productTaxCodes: string[] = []): TaxLine[] {
    let candidates = rates
    // product tax codes pin rates: keep only matching codes (the whole pool when none match)
    if (productTaxCodes.length > 0) {
      const pinned = candidates.filter((r) => productTaxCodes.includes(r.code))
      if (pinned.length > 0) candidates = pinned
    }
    const defaults = candidates.filter((r) => r.is_default)
    const overrides = candidates.filter((r) => !r.is_default && r.rules.length > 0)
    const legacyExtras = candidates.filter((r) => !r.is_default && r.rules.length === 0)
    const matched = overrides.filter((o) => o.rules.some((rule) => ruleMatches(rule, target)))
    const weight = (o: PoolRate) => Math.max(...o.rules.filter((rule) => ruleMatches(rule, target)).map((rule) => RULE_WEIGHT[rule.reference] ?? 1))
    const bestOverride = matched.filter((o) => !o.is_combinable).sort((a, b) => weight(b) - weight(a) || b.rate - a.rate)[0]
    const chosen: PoolRate[] = [...(bestOverride ? [bestOverride] : defaults), ...matched.filter((o) => o.is_combinable)]
    // rates without rules that are not the default behave as they always did: highest non-combinable, all combinable
    chosen.push(...legacyExtras.filter((r) => !r.is_combinable).sort((a, b) => b.rate - a.rate).slice(0, 1), ...legacyExtras.filter((r) => r.is_combinable))
    return chosen.map((r) => ({ code: r.code, rate: r.rate, provider_id: "system" }))
  }

  /** Rates for an address with no specific line in mind (kept for callers that only know the address). */
  async resolveRates(
    address: { country: string | null; province?: string | null; postal?: string | null },
    productTaxCodes: string[] = []
  ): Promise<TaxLine[]> {
    return this.pickRates(await this.ratePool(address), {}, productTaxCodes)
  }

  listProviders() {
    return [{ id: "system", is_enabled: true }]
  }

  async refreshForCart(cartId: string): Promise<void> {
    await pool.query(`DELETE FROM line_item_tax_line WHERE cart_id=$1`, [cartId])
    await pool.query(`DELETE FROM shipping_tax_line WHERE cart_id=$1`, [cartId])
    const cart = await pool.query(
      `SELECT c.*, ca.country_code, ca.province, ca.postal_code FROM cart c LEFT JOIN cart_address ca ON ca.cart_id=c.id AND ca.kind='shipping' WHERE c.id=$1`,
      [cartId]
    )
    if (!cart.rows[0]) {
      return
    }
    let country: string | null = cart.rows[0].country_code
    const province: string | null = (cart.rows[0].province as string | null) ?? null
    const postal: string | null = cart.rows[0].postal_code
    if (!country && cart.rows[0].region_id) {
      const rc = await pool.query(`SELECT iso_2 FROM region_country WHERE region_id=$1 AND deleted_at IS NULL LIMIT 1`, [
        cart.rows[0].region_id,
      ])
      country = rc.rows[0]?.iso_2 ?? null
    }
    if (!cart.rows[0].region_id) {
      // region.automatic_taxes=false equivalent: skip when no region
    }
    const ratePool = await this.ratePool({ country, province, postal })
    if (ratePool.length === 0) {
      return
    }
    const lines = await pool.query(
      `SELECT li.id, p.id AS product_id, p.type_id AS product_type_id, p.tax_code
       FROM cart_line_item li
       LEFT JOIN product_variant v ON v.id = li.variant_id
       LEFT JOIN product p ON p.id = COALESCE(li.product_id, v.product_id)
       WHERE li.cart_id=$1 AND li.deleted_at IS NULL`,
      [cartId]
    )
    for (const l of lines.rows) {
      const rates = this.pickRates(ratePool, { product_id: l.product_id, product_type_id: l.product_type_id }, l.tax_code ? [l.tax_code] : [])
      for (const r of rates) {
        await pool.query(
          `INSERT INTO line_item_tax_line (cart_id, line_item_id, description, code, rate, provider_id) VALUES ($1,$2,$3,$4,$5,'system')`,
          [cartId, l.id, r.code, r.code, r.rate]
        )
      }
    }
    const ships = await pool.query(`SELECT id, shipping_option_id FROM cart_shipping_method WHERE cart_id=$1`, [cartId])
    for (const s of ships.rows) {
      for (const r of this.pickRates(ratePool, { shipping_option_id: s.shipping_option_id })) {
        await pool.query(
          `INSERT INTO shipping_tax_line (cart_id, shipping_method_id, description, code, rate, provider_id) VALUES ($1,$2,$3,$4,$5,'system')`,
          [cartId, s.id, r.code, r.code, r.rate]
        )
      }
    }
  }

  /** Compute tax totals from persisted lines — mirrors get-translated-tax-lines math. */
  async computeTotals(cartId: string): Promise<{ itemTax: number; shippingTax: number }> {
    const lines = await pool.query(
      `SELECT li.id, li.quantity, li.unit_price, li.is_tax_inclusive,
              COALESCE((SELECT SUM(amount) FROM line_item_adjustment WHERE line_item_id=li.id),0)::int AS discount
       FROM cart_line_item li WHERE li.cart_id=$1 AND li.deleted_at IS NULL`,
      [cartId]
    )
    const lineRates = await pool.query(`SELECT line_item_id, rate FROM line_item_tax_line WHERE cart_id=$1`, [cartId])
    const byLine = new Map<string, number[]>()
    for (const r of lineRates.rows) {
      byLine.set(r.line_item_id, [...(byLine.get(r.line_item_id) ?? []), Number(r.rate)])
    }
    let itemTax = 0
    for (const l of lines.rows) {
      const gross = l.quantity * l.unit_price + Number(l.discount) // discount negative
      for (const rate of byLine.get(l.id) ?? []) {
        if (l.is_tax_inclusive) {
          itemTax += Math.round(gross - gross / (1 + rate / 100))
        } else {
          itemTax += Math.round(Math.max(gross, 0) * (rate / 100))
        }
      }
    }
    const ships = await pool.query(
      `SELECT s.id, GREATEST(s.amount + COALESCE((SELECT SUM(a.amount) FROM shipping_method_adjustment a WHERE a.shipping_method_id = s.id), 0), 0) AS amount
       FROM cart_shipping_method s WHERE s.cart_id=$1`,
      [cartId]
    )
    const shipRates = await pool.query(`SELECT shipping_method_id, rate FROM shipping_tax_line WHERE cart_id=$1`, [cartId])
    const byShip = new Map<string, number[]>()
    for (const r of shipRates.rows) {
      byShip.set(r.shipping_method_id, [...(byShip.get(r.shipping_method_id) ?? []), Number(r.rate)])
    }
    let shippingTax = 0
    for (const s of ships.rows) {
      for (const rate of byShip.get(s.id) ?? []) {
        shippingTax += Math.round(Number(s.amount) * (rate / 100))
      }
    }
    return { itemTax, shippingTax }
  }
}

export const taxService = new TaxService()
