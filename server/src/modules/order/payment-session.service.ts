import { pool } from "../../db"

// Port of Lupus payment provider flow (payment-session + provider interface +
// create-payment-session workflow). Providers implement authorize(c, amount) etc.
// Lupus ships the 'manual' provider with identical semantics to pp_system_default;
// Stripe/etc. plug in by implementing PaymentProvider and registering below.
export interface PaymentProvider {
  id: string
  authorize(collectionId: string, amount: number): Promise<void>
  capture(paymentId: string): Promise<void>
}

function systemProvider(id: string): PaymentProvider {
  return {
    id,
    async authorize(collectionId: string, amount: number) {
      const { pool: p } = await import("../../db")
      await p.query(
        `INSERT INTO payment (payment_collection_id, provider_id, amount, currency_code, status)
         SELECT $1, $3, $2, currency_code, 'authorized' FROM payment_collection WHERE id=$1`,
        [collectionId, amount, id]
      )
    },
    async capture() {
      return
    },
  }
}

// "manual" is the legacy id, "pp_system_default" the id Lupus storefronts use for the same provider
export const SYSTEM_PROVIDER_ID = "pp_system_default"
const providers = new Map<string, PaymentProvider>([
  ["manual", systemProvider("manual")],
  [SYSTEM_PROVIDER_ID, systemProvider(SYSTEM_PROVIDER_ID)],
])

export function listPaymentProviderIds(): string[] {
  return [...providers.keys()]
}

export function registerPaymentProvider(p: PaymentProvider) {
  providers.set(p.id, p)
}

export class PaymentSessionService {
  async createSession(collectionId: string, providerId = "manual") {
    if (!providers.has(providerId)) {
      throw Object.assign(new Error(`Unknown provider ${providerId}`), { statusCode: 400 })
    }
    const { rows } = await pool.query(
      `INSERT INTO payment_session (payment_collection_id, provider_id, status) VALUES ($1,$2,'pending') RETURNING *`,
      [collectionId, providerId]
    )
    return rows[0]
  }

  async authorizeSession(sessionId: string) {
    const s = await pool.query(`SELECT * FROM payment_session WHERE id=$1 AND deleted_at IS NULL`, [sessionId])
    if (!s.rows[0] || s.rows[0].status !== "pending") {
      throw Object.assign(new Error("Session is not authorizable"), { statusCode: 400 })
    }
    const c = await pool.query(`SELECT amount FROM payment_collection WHERE id=$1`, [s.rows[0].payment_collection_id])
    await providers.get(s.rows[0].provider_id)!.authorize(s.rows[0].payment_collection_id, c.rows[0].amount)
    await pool.query(`UPDATE payment_session SET status='authorized', updated_at=NOW() WHERE id=$1`, [sessionId])
    await pool.query(`UPDATE payment_collection SET authorized_amount=$2, status='authorized' WHERE id=$1`, [
      s.rows[0].payment_collection_id,
      c.rows[0].amount,
    ])
  }
}

export const paymentSessionService = new PaymentSessionService()
