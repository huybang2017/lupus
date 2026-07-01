import { createHash } from "crypto"
import { pool } from "../../db"

// Port of event-bus-local (persist + in-process fan-out; redis transport dropped),
// workflow-engine persistence (workflow_execution log), locking-postgres
// (pg_advisory_xact_lock), and the caching module (in-memory TTL).
// Event names mirror Lupus: order.placed, product.created, customer.created, etc.

type Handler = (payload: any) => void | Promise<void>
const handlers = new Map<string, Handler[]>()

export function onEvent(name: string, handler: Handler) {
  handlers.set(name, [...(handlers.get(name) ?? []), handler])
}

export class EventBusService {
  async emit(name: string, payload: Record<string, unknown> = {}) {
    await pool.query(`INSERT INTO event_outbox (name, payload) VALUES ($1,$2)`, [name, JSON.stringify(payload)])
    // configurable-notifications parity: enabled template for this event fires automatically
    try {
      const tpl = await pool.query(`SELECT * FROM notification_template WHERE event_name=$1 AND is_enabled=TRUE`, [name])
      for (const t of tpl.rows) {
        const to = String((payload as any).email ?? (payload as any).to ?? "unknown")
        const subject = String(t.subject || name).replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => String((payload as any)[k] ?? ""))
        const body = String(t.template || "").replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => String((payload as any)[k] ?? ""))
        await pool.query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,$2,$3,$4,'sent')`, [to, t.channel, t.template ? name : name, JSON.stringify({ subject, body, ...payload })])
      }
    } catch (e) {
      console.error(`[event:${name}] template dispatch failed`, e)
    }
    for (const h of handlers.get(name) ?? []) {
      try {
        await h(payload)
      } catch (e) {
        console.error(`[event:${name}] handler failed`, e)
      }
    }
  }

  async list(limit = 100) {
    const { rows } = await pool.query(`SELECT * FROM event_outbox ORDER BY created_at DESC LIMIT $1`, [Math.min(limit, 200)])
    return rows
  }
}

export const eventBus = new EventBusService()

// Default subscribers (mirror Lupus's notification-on-order-placed wiring)
onEvent("order.placed", async (p: any) => {
  await pool.query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','order-placed',$2,'sent')`, [
    p.email ?? "unknown",
    JSON.stringify({ order_id: p.order_id }),
  ]).catch(() => undefined)
  await pool.query(`INSERT INTO analytics_event (event, actor, properties) VALUES ('order.placed',$1,$2)`, [
    p.email ?? null,
    JSON.stringify({ order_id: p.order_id, total: p.total ?? null }),
  ]).catch(() => undefined)
})

export async function runWorkflow<T>(workflowId: string, input: unknown, fn: (recordStep: (name: string, data?: unknown) => void) => Promise<T>): Promise<T> {
  const { rows } = await pool.query(`INSERT INTO workflow_execution (workflow_id, input) VALUES ($1,$2) RETURNING id`, [
    workflowId,
    JSON.stringify(input ?? {}),
  ])
  const execId = rows[0].id as string
  const steps: { name: string; at: string; data?: unknown }[] = []
  try {
    const out = await fn((name, data) => steps.push({ name, at: new Date().toISOString(), data }))
    await pool.query(`UPDATE workflow_execution SET status='succeeded', steps=$2, output=$3, finished_at=NOW() WHERE id=$1`, [
      execId,
      JSON.stringify(steps),
      JSON.stringify(out ?? {}),
    ])
    return out
  } catch (e: any) {
    await pool.query(`UPDATE workflow_execution SET status='failed', steps=$2, error=$3, finished_at=NOW() WHERE id=$1`, [
      execId,
      JSON.stringify(steps),
      String(e?.message ?? e),
    ])
    throw e
  }
}

export class LockingService {
  /** Transaction-scoped advisory lock (same semantics as locking-postgres provider). */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hash = createHash("sha256").update(key).digest()
    const lockId = hash.readBigInt64BE(0)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockId.toString()])
      const out = await fn()
      await client.query("COMMIT")
      return out
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}

export const lockingService = new LockingService()

const cache = new Map<string, { value: unknown; expires: number }>()

export const cacheService = {
  get<T>(key: string): T | undefined {
    const hit = cache.get(key)
    if (!hit || hit.expires < Date.now()) {
      cache.delete(key)
      return undefined
    }
    return hit.value as T
  },
  set(key: string, value: unknown, ttlSeconds = 60) {
    cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 })
  },
  invalidate(key: string) {
    cache.delete(key)
  },
}
