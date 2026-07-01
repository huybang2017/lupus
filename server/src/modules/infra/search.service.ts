import { pool } from "../../db"

// Port of providers/search-postgres (pg tsvector rank over the product catalog).
// Lupus syncs index via search-index worker; lupus queries the GIN index directly
// (idx_product_search in schema-infra.sql), same ranking semantics.
export class SearchService {
  async searchProducts(q: string, limit = 20) {
    const { rows } = await pool.query(
      `SELECT *, ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(handle,'')), plainto_tsquery('english', $1)) AS rank
       FROM product
       WHERE deleted_at IS NULL AND status='published'
         AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(handle,'')) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC LIMIT $2`,
      [q, Math.min(limit, 50)]
    )
    return rows
  }
}

export const searchService = new SearchService()
