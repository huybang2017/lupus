import { pool } from "../../db"
import { CreateRegionInput, RegionDTO } from "./region.types"

// Port of RegionModuleService (packages/modules/region). Kept: currency lowercase,
// country iso_2 lowercase + dedupe, region->countries one-to-many.
// Dropped: payment provider config, remote links.
export class RegionService {
  async list(): Promise<RegionDTO[]> {
    const { rows } = await pool.query(`SELECT * FROM region WHERE deleted_at IS NULL ORDER BY created_at DESC`)
    const out: RegionDTO[] = []
    for (const r of rows) {
      const c = await pool.query(`SELECT iso_2 FROM region_country WHERE region_id = $1 AND deleted_at IS NULL`, [r.id])
      out.push({ ...r, countries: c.rows })
    }
    return out
  }

  async create(input: CreateRegionInput): Promise<RegionDTO> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `INSERT INTO region (name, currency_code, automatic_taxes) VALUES ($1,$2,$3) RETURNING *`,
        [input.name, input.currency_code.toLowerCase(), input.automatic_taxes ?? true]
      )
      const region = rows[0]
      const countries = [...new Set((input.countries ?? []).map((c) => c.toLowerCase()))]
      for (const iso_2 of countries) {
        await client.query(`INSERT INTO region_country (region_id, iso_2) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          region.id,
          iso_2,
        ])
      }
      await client.query("COMMIT")
      const c = await pool.query(`SELECT iso_2 FROM region_country WHERE region_id = $1`, [region.id])
      return { ...region, countries: c.rows }
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}

export const regionService = new RegionService()
