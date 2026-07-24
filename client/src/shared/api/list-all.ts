import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";

/**
 * Walks a paginated admin list endpoint (max 100 rows per page) and returns every row.
 * `path` may already carry a query string.
 */
export async function listAll<T = any>(path: string, maxRows = 10000): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let offset = 0; offset < maxRows; offset += 100) {
    const d = await api(`${path}${sep}limit=100&offset=${offset}`);
    const page = parseList<T>(d, 100).items;
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}
