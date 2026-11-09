import "dotenv/config"
import { Pool } from "pg"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.template to .env")
}

// Managed Postgres (Supabase, Neon...) needs TLS; enable with DATABASE_SSL=true.
const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined

export const pool = new Pool({ connectionString, ssl })

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params)
  return res.rows as T[]
}
