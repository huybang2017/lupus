import { pool } from "../../db"

// Where each rule attribute's selectable values come from (Lupus: rule-query-configuration).
// Shared by the rule-value-options endpoint and the labelled rule lists of a promotion.

const ISO_COUNTRIES =
  "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB UM US UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(
    " "
  )

const SOURCES: Record<string, { table: string; value: string; label: string; softDelete: boolean }> = {
  customer_group: { table: "customer_group", value: "id", label: "name", softDelete: true },
  region: { table: "region", value: "id", label: "name", softDelete: true },
  sales_channel: { table: "sales_channel", value: "id", label: "name", softDelete: true },
  // the store's usable currencies: the ones its regions or prices actually use
  currency_code: {
    table: `(SELECT code, name FROM currency WHERE code IN (
      SELECT LOWER(currency_code) FROM region WHERE deleted_at IS NULL
      UNION SELECT LOWER(currency_code) FROM price WHERE deleted_at IS NULL)) AS cur`,
    value: "code",
    label: "name",
    softDelete: false,
  },
  product: { table: "product", value: "id", label: "title", softDelete: true },
  product_category: { table: "product_category", value: "id", label: "name", softDelete: true },
  product_collection: { table: "product_collection", value: "id", label: "title", softDelete: true },
  product_type: { table: "product_type", value: "id", label: "value", softDelete: true },
  product_tag: { table: "product_tag", value: "id", label: "value", softDelete: true },
}

const LEGACY_SOURCE_IDS: Record<string, string> = { customer_group_id: "customer_group", product_id: "product", currency: "currency_code" }

/** rule attribute (stored name, new or legacy) -> value source id */
const ATTRIBUTE_SOURCE: Record<string, string> = {
  "customer.groups.id": "customer_group",
  customer_group_id: "customer_group",
  "region.id": "region",
  region_id: "region",
  "shipping_address.country_code": "country",
  country_code: "country",
  sales_channel_id: "sales_channel",
  currency_code: "currency_code",
  "items.product.id": "product",
  product_id: "product",
  "items.product.categories.id": "product_category",
  "items.product.collection_id": "product_collection",
  product_collection_id: "product_collection",
  "items.product.type_id": "product_type",
  product_type_id: "product_type",
  "items.product.tags.id": "product_tag",
  product_tag_id: "product_tag",
}

export const sourceIdForAttribute = (attribute: string): string | undefined => ATTRIBUTE_SOURCE[attribute]

export interface RuleValue {
  value: string
  label: string
}

export async function queryRuleValues(
  rawSourceId: string,
  opts: { q?: string; limit?: number; offset?: number; wanted?: string[] | null }
): Promise<{ values: RuleValue[]; count: number; offset: number; limit: number }> {
  const id = LEGACY_SOURCE_IDS[rawSourceId] ?? rawSourceId
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)
  const needle = (opts.q ?? "").trim().toLowerCase()
  const wanted = opts.wanted ?? null

  if (id === "country") {
    const names = new Intl.DisplayNames(["en"], { type: "region" })
    let all = ISO_COUNTRIES.map((c) => ({ value: c.toLowerCase(), label: names.of(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label))
    if (wanted) all = all.filter((c) => wanted.map((w) => w.toLowerCase()).includes(c.value))
    if (needle) all = all.filter((c) => c.label.toLowerCase().includes(needle) || c.value === needle)
    return { values: all.slice(offset, offset + limit), count: all.length, offset, limit }
  }
  const src = SOURCES[id]
  if (!src) {
    return { values: [], count: 0, offset, limit }
  }
  const params: unknown[] = []
  const conds = [src.softDelete ? "deleted_at IS NULL" : "TRUE"]
  if (needle) {
    params.push(`%${needle}%`)
    conds.push(`LOWER(${src.label}) LIKE $${params.length}`)
  }
  if (wanted) {
    params.push(wanted)
    conds.push(`${src.value} = ANY($${params.length})`)
  }
  const where = `WHERE ${conds.join(" AND ")}`
  const total = await pool.query(`SELECT COUNT(*)::int AS c FROM ${src.table} ${where}`, params)
  const { rows } = await pool.query(
    `SELECT ${src.value} AS value, ${src.label} AS label FROM ${src.table} ${where} ORDER BY ${src.label} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  return { values: rows, count: total.rows[0].c, offset, limit }
}

/** ids -> display labels for one attribute (unknown ids keep themselves as the label). */
export async function labelRuleValues(attribute: string, ids: string[]): Promise<RuleValue[]> {
  const source = sourceIdForAttribute(attribute)
  if (!source || ids.length === 0) return ids.map((v) => ({ value: v, label: v }))
  const found = await queryRuleValues(source, { wanted: ids, limit: 100 })
  const byValue = new Map(found.values.map((v) => [String(v.value).toLowerCase(), v]))
  return ids.map((v) => ({ value: v, label: byValue.get(v.toLowerCase())?.label ?? v }))
}
