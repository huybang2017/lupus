import { pool } from "../../db"

// Lupus "Regions": name, currency, automatic taxes, tax inclusive pricing, countries (a country
// belongs to one region) and the payment providers available there.
// Refs: upstream/packages/modules/region (country uniqueness), core-flows create-regions /
// update-regions (payment providers, is_tax_inclusive -> price preference attribute region_id).

const bad = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode })
}

const ISO_2 =
  "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB UM US UY UZ VU VE VN VG VI WF EH YE ZM ZW"
const VALID = new Set(ISO_2.split(" ").map((c) => c.toLowerCase()))
/** Every ISO 3166-1 alpha-2 code a region can hold (lowercase). */
export const COUNTRY_CODES: string[] = [...VALID]
const names = new Intl.DisplayNames(["en"], { type: "region" })
const countryName = (iso: string) => {
  try {
    return names.of(iso.toUpperCase()) ?? iso.toUpperCase()
  } catch {
    return iso.toUpperCase()
  }
}

/** Providers a region can offer (`GET /admin/payments/payment-providers`): the built-in one plus any seen on payments. */
export async function paymentProviderIds(): Promise<string[]> {
  const seen = await pool.query(
    `SELECT DISTINCT provider_id FROM ((SELECT provider_id FROM payment WHERE deleted_at IS NULL) UNION (SELECT provider_id FROM payment_session WHERE deleted_at IS NULL)) p`
  )
  return [...new Set(["manual", ...seen.rows.map((r: any) => r.provider_id).filter(Boolean)])]
}

export interface RegionInput {
  name?: string
  currency_code?: string
  automatic_taxes?: boolean
  is_tax_inclusive?: boolean
  countries?: string[]
  payment_providers?: string[]
  metadata?: Record<string, unknown> | null
}

export class RegionAdminService {
  async hydrateMany(rows: any[]) {
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const [countries, providers, prefs] = await Promise.all([
      pool.query(`SELECT region_id, iso_2 FROM region_country WHERE region_id = ANY($1) AND deleted_at IS NULL ORDER BY iso_2`, [ids]),
      pool.query(`SELECT region_id, provider_id FROM region_payment_provider WHERE region_id = ANY($1) ORDER BY provider_id`, [ids]),
      pool.query(`SELECT value, is_tax_inclusive FROM price_preference WHERE attribute = 'region_id' AND value = ANY($1) AND deleted_at IS NULL`, [ids]),
    ])
    const inclusive = new Map<string, boolean>(prefs.rows.map((p: any) => [p.value, !!p.is_tax_inclusive]))
    return rows.map((r) => ({
      ...r,
      countries: countries.rows
        .filter((c: any) => c.region_id === r.id)
        .map((c: any) => ({ iso_2: c.iso_2, display_name: countryName(c.iso_2), name: countryName(c.iso_2).toUpperCase() })),
      payment_providers: providers.rows.filter((p: any) => p.region_id === r.id).map((p: any) => ({ id: p.provider_id, is_enabled: true })),
      is_tax_inclusive: inclusive.get(r.id) ?? false,
    }))
  }

  async retrieve(id: string) {
    const { rows } = await pool.query(`SELECT * FROM region WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) bad(`Region with id ${id} was not found`, 404)
    return (await this.hydrateMany(rows))[0]
  }

  private async checkCountries(countries: string[], selfId?: string) {
    const codes = [...new Set(countries.map((c) => c.toLowerCase()))]
    const unknown = codes.filter((c) => !VALID.has(c))
    if (unknown.length) bad(`Unknown country code: ${unknown.join(", ")}`)
    if (codes.length) {
      const taken = await pool.query(
        `SELECT rc.iso_2, r.name FROM region_country rc JOIN region r ON r.id = rc.region_id AND r.deleted_at IS NULL
         WHERE rc.deleted_at IS NULL AND rc.iso_2 = ANY($1) AND ($2::text IS NULL OR rc.region_id <> $2) LIMIT 1`,
        [codes, selfId ?? null]
      )
      if (taken.rows[0]) bad(`${countryName(taken.rows[0].iso_2)} is already part of the region "${taken.rows[0].name}"; a country can only belong to one region`)
    }
    return codes
  }

  private async checkProviders(providers: string[]) {
    const known = new Set(await paymentProviderIds())
    const missing = providers.filter((p) => !known.has(p))
    if (missing.length) bad(`Payment provider not found: ${missing.join(", ")}`, 404)
    return [...new Set(providers)]
  }

  private async checkCurrency(code: string) {
    const cur = code.toLowerCase()
    const ok = await pool.query(`SELECT 1 FROM currency WHERE code = $1`, [cur])
    if (!ok.rows[0]) bad(`Unknown currency: ${code}`)
    return cur
  }

  private async savePreference(client: { query: (t: string, p?: any[]) => Promise<any> }, regionId: string, inclusive: boolean) {
    const pref = await client.query(`SELECT id FROM price_preference WHERE attribute = 'region_id' AND value = $1 AND deleted_at IS NULL`, [regionId])
    if (pref.rows[0]) await client.query(`UPDATE price_preference SET is_tax_inclusive = $2, updated_at = NOW() WHERE id = $1`, [pref.rows[0].id, inclusive])
    else await client.query(`INSERT INTO price_preference (attribute, value, is_tax_inclusive) VALUES ('region_id', $1, $2)`, [regionId, inclusive])
  }

  async create(input: RegionInput & { name: string; currency_code: string }) {
    const name = input.name.trim()
    if (!name) bad("name is required")
    const currency = await this.checkCurrency(input.currency_code)
    const countries = await this.checkCountries(input.countries ?? [])
    const providers = await this.checkProviders(input.payment_providers ?? [])
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO region (name, currency_code, automatic_taxes, metadata) VALUES ($1,$2,$3,$4) RETURNING id`,
        [name, currency, input.automatic_taxes ?? true, input.metadata ?? null]
      )
      const id = rows[0].id as string
      for (const iso of countries) await client.query(`INSERT INTO region_country (region_id, iso_2) VALUES ($1,$2)`, [id, iso])
      for (const p of providers) await client.query(`INSERT INTO region_payment_provider (region_id, provider_id) VALUES ($1,$2)`, [id, p])
      if (input.is_tax_inclusive !== undefined) await this.savePreference(client, id, input.is_tax_inclusive)
      await client.query("COMMIT")
      return this.retrieve(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async update(id: string, input: RegionInput) {
    const cur = (await pool.query(`SELECT * FROM region WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0]
    if (!cur) bad(`Region with id ${id} was not found`, 404)
    if (input.name !== undefined && !input.name.trim()) bad("name cannot be empty")
    const currency = input.currency_code !== undefined ? await this.checkCurrency(input.currency_code) : undefined
    const countries = input.countries ? await this.checkCountries(input.countries, id) : undefined
    const providers = input.payment_providers ? await this.checkProviders(input.payment_providers) : undefined
    if (currency && currency !== String(cur.currency_code).toLowerCase()) {
      // the store's default region has to stay payable in a currency the store supports
      const store = await pool.query(`SELECT id FROM store WHERE default_region_id = $1`, [id])
      for (const s of store.rows) {
        const ok = await pool.query(`SELECT 1 FROM store_currency WHERE store_id = $1 AND currency_code = $2`, [s.id, currency])
        if (!ok.rows[0]) bad("The store's default region can only use a currency the store supports")
      }
    }
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
      if (currency) set("currency_code", currency)
      if (input.automatic_taxes !== undefined) set("automatic_taxes", input.automatic_taxes)
      if (input.metadata !== undefined) set("metadata", input.metadata)
      sets.push("updated_at = NOW()")
      params.push(id)
      await client.query(`UPDATE region SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
      if (countries) {
        await client.query(`UPDATE region_country SET deleted_at = NOW() WHERE region_id = $1 AND deleted_at IS NULL AND NOT (iso_2 = ANY($2))`, [id, countries])
        for (const iso of countries) {
          const has = await client.query(`SELECT 1 FROM region_country WHERE region_id = $1 AND iso_2 = $2 AND deleted_at IS NULL`, [id, iso])
          if (!has.rows[0]) await client.query(`INSERT INTO region_country (region_id, iso_2) VALUES ($1,$2)`, [id, iso])
        }
      }
      if (providers) {
        await client.query(`DELETE FROM region_payment_provider WHERE region_id = $1`, [id])
        for (const p of providers) await client.query(`INSERT INTO region_payment_provider (region_id, provider_id) VALUES ($1,$2)`, [id, p])
      }
      if (input.is_tax_inclusive !== undefined) await this.savePreference(client, id, input.is_tax_inclusive)
      await client.query("COMMIT")
      return this.retrieve(id)
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async remove(id: string) {
    const gone = await pool.query(`UPDATE region SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id])
    if (!gone.rows[0]) bad(`Region with id ${id} was not found`, 404)
    await pool.query(`UPDATE region_country SET deleted_at = NOW() WHERE region_id = $1 AND deleted_at IS NULL`, [id])
    await pool.query(`DELETE FROM region_payment_provider WHERE region_id = $1`, [id])
    await pool.query(`UPDATE price_preference SET deleted_at = NOW() WHERE attribute = 'region_id' AND value = $1 AND deleted_at IS NULL`, [id])
    await pool.query(`UPDATE shipping_option_price SET deleted_at = NOW() WHERE region_id = $1 AND deleted_at IS NULL`, [id])
    await pool.query(`UPDATE store SET default_region_id = NULL WHERE default_region_id = $1`, [id])
  }
}

export const regionAdminService = new RegionAdminService()
