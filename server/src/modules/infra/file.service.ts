import { promises as fs } from "fs"
import path from "path"
import { pool } from "../../db"

// Port of Lupus file providers (providers/file-local + file-s3 interface).
// FileProvider mirrors Lupus's FileService upload/get/delete contract.
// Local provider writes under ./uploads (served by express.static); S3-compatible
// providers plug in via registerFileProvider (same shape as Lupus's provider system).
export interface FileProvider {
  id: string
  upload(filename: string, content: Buffer, mimeType?: string): Promise<{ url: string }>
  delete(url: string): Promise<void>
}

const uploadsDir = path.join(process.cwd(), "uploads")

const localProvider: FileProvider = {
  id: "local",
  async upload(filename: string, content: Buffer) {
    await fs.mkdir(uploadsDir, { recursive: true })
    const safe = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    await fs.writeFile(path.join(uploadsDir, safe), content)
    return { url: `/uploads/${safe}` }
  },
  async delete(url: string) {
    if (!url.startsWith("/uploads/")) {
      return
    }
    await fs.unlink(path.join(uploadsDir, path.basename(url))).catch(() => undefined)
  },
}

const providers = new Map<string, FileProvider>([["local", localProvider]])

export function registerFileProvider(p: FileProvider) {
  providers.set(p.id, p)
}

export function uploadsStaticDir() {
  return uploadsDir
}

export class FileService {
  async upload(base: { filename: string; content_base64: string; mime_type?: string; provider_id?: string }) {
    const provider = providers.get(base.provider_id ?? "local")
    if (!provider) {
      throw Object.assign(new Error(`Unknown file provider ${base.provider_id}`), { statusCode: 400 })
    }
    const content = Buffer.from(base.content_base64, "base64")
    if (content.length > 10 * 1024 * 1024) {
      throw Object.assign(new Error("File too large (max 10MB)"), { statusCode: 400 })
    }
    const { url } = await provider.upload(base.filename, content, base.mime_type)
    const { rows } = await pool.query(
      `INSERT INTO file_record (url, filename, mime_type, size_bytes, provider_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [url, base.filename, base.mime_type ?? null, content.length, provider.id]
    )
    return rows[0]
  }

  async list(limit = 50) {
    const { rows } = await pool.query(`SELECT * FROM file_record WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`, [Math.min(limit, 100)])
    return rows
  }

  async remove(id: string) {
    const { rows } = await pool.query(`SELECT * FROM file_record WHERE id=$1 AND deleted_at IS NULL`, [id])
    if (!rows[0]) {
      throw Object.assign(new Error("File not found"), { statusCode: 404 })
    }
    await providers.get(rows[0].provider_id)?.delete(rows[0].url).catch(() => undefined)
    await pool.query(`UPDATE file_record SET deleted_at=NOW() WHERE id=$1`, [id])
  }
}

export const fileService = new FileService()
