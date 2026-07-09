import type { Request } from "express"
import { pool } from "../../db"

// Lupus store translations: a request carrying `x-lupus-locale` gets translated field values from the
// translation table (entity, entity_id, field, locale_code) laid over the stored ones.

/** The locale of the request, lower-cased; null when the header is absent or malformed. */
export function requestLocale(req: Request): string | null {
  const header = req.headers["x-lupus-locale"]
  const value = Array.isArray(header) ? header[0] : header
  return value && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(value) ? value.toLowerCase().replace("_", "-") : null
}

/** Exact locale first, then its language ("pt-br" falls back to "pt"). */
function candidates(locale: string): string[] {
  const language = locale.split("-")[0]
  return language === locale ? [locale] : [locale, language]
}

type Row = Record<string, any>

export async function translateRows<T extends Row>(rows: T[], entity: string, fields: string[], locale: string | null): Promise<T[]> {
  if (!locale || rows.length === 0) {
    return rows
  }
  const wanted = candidates(locale)
  const { rows: found } = await pool.query(
    `SELECT entity_id, field, text, locale_code FROM translation WHERE entity=$1 AND locale_code = ANY($2) AND entity_id = ANY($3) AND field = ANY($4)`,
    [entity, wanted, rows.map((r) => r.id), fields]
  )
  if (found.length === 0) {
    return rows
  }
  // for one entity + field the exact locale wins over the language fallback
  const best = new Map<string, { text: string; rank: number }>()
  for (const f of found) {
    const key = `${f.entity_id}|${f.field}`
    const rank = wanted.indexOf(f.locale_code)
    const current = best.get(key)
    if (!current || rank < current.rank) {
      best.set(key, { text: f.text, rank })
    }
  }
  return rows.map((row) => {
    const patch: Row = {}
    for (const field of fields) {
      const hit = best.get(`${row.id}|${field}`)
      if (hit && hit.text) {
        patch[field] = hit.text
      }
    }
    return Object.keys(patch).length ? { ...row, ...patch } : row
  })
}
