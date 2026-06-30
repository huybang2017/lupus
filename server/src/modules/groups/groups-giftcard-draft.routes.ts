import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"

// Port of customer-group, gift-card, draft-order endpoints.
// Gift-card redeem mirrors Lupus gift-cardable totals: balance decremented in tx,
// transaction row per redeem; draft orders are orders with is_draft_order=true that
// convert to real orders on confirm (status pending, completed_at unset until paid).
export const groupsGiftcardDraftRouter = Router()

groupsGiftcardDraftRouter.post("/admin/customer-groups", requireAuth, async (req, res, next) => {
  try {
    const { name, metadata } = z.object({ name: z.string(), metadata: z.record(z.any()).nullish() }).parse(req.body)
    const { rows } = await pool.query(`INSERT INTO customer_group (name, metadata) VALUES ($1,$2) RETURNING *`, [
      name,
      metadata ? JSON.stringify(metadata) : null,
    ])
    res.status(201).json({ customer_group: rows[0] })
  } catch (e) {
    next(e)
  }
})

// Port of linkCustomersToCustomerGroupWorkflow (sdk.admin.customerGroup.batchCustomers
// -> POST /admin/customer-groups/:id/customers with { add, remove }).
// The legacy { customer_ids } body is still accepted as an alias for { add }.
groupsGiftcardDraftRouter.post("/admin/customer-groups/:id/customers", requireAuth, async (req, res, next) => {
  try {
    const { add, remove, customer_ids } = z
      .object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional(), customer_ids: z.array(z.string()).optional() })
      .parse(req.body)
    const toAdd = [...(add ?? []), ...(customer_ids ?? [])]
    const group = await pool.query(`SELECT * FROM customer_group WHERE id=$1 AND deleted_at IS NULL`, [req.params.id])
    if (!group.rows[0]) {
      throw Object.assign(new Error(`Customer group with id: ${req.params.id} not found`), { statusCode: 404 })
    }
    for (const cid of toAdd) {
      await pool.query(`INSERT INTO customer_group_customer (customer_group_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, cid])
    }
    for (const cid of remove ?? []) {
      await pool.query(`DELETE FROM customer_group_customer WHERE customer_group_id=$1 AND customer_id=$2`, [req.params.id, cid])
    }
    const members = await pool.query(
      `SELECT c.* FROM customer c JOIN customer_group_customer p ON p.customer_id=c.id WHERE p.customer_group_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at`,
      [req.params.id]
    )
    res.json({ customer_group: { ...group.rows[0], customers: members.rows } })
  } catch (e) {
    next(e)
  }
})

groupsGiftcardDraftRouter.post("/admin/customer-groups/:id/prices", requireAuth, async (req, res, next) => {
  try {
    const { variant_id, currency_code, amount } = z.object({ variant_id: z.string(), currency_code: z.string().length(3), amount: z.number().int().nonnegative() }).parse(req.body)
    await pool.query(
      `INSERT INTO group_price (customer_group_id, variant_id, currency_code, amount) VALUES ($1,$2,$3,$4)
       ON CONFLICT (customer_group_id, variant_id, currency_code) DO UPDATE SET amount=$4`,
      [req.params.id, variant_id, currency_code.toLowerCase(), amount]
    )
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

groupsGiftcardDraftRouter.post("/admin/gift-cards", requireAuth, async (req, res, next) => {
  try {
    const { code, value, currency_code, ends_at } = z.object({ code: z.string().min(1), value: z.number().int().positive(), currency_code: z.string().length(3), ends_at: z.string().datetime().optional() }).parse(req.body)
    const { rows } = await pool.query(
      `INSERT INTO gift_card (code, value, balance, currency_code, ends_at) VALUES ($1,$2,$2,$3,$4) RETURNING *`,
      [code.toUpperCase(), value, currency_code.toLowerCase(), ends_at ?? null]
    )
    res.status(201).json({ gift_card: rows[0] })
  } catch (e) {
    next(e)
  }
})

groupsGiftcardDraftRouter.post("/store/gift-cards/:code/redeem", async (req, res, next) => {
  try {
    const { order_id, amount } = z.object({ order_id: z.string(), amount: z.number().int().positive() }).parse(req.body)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const g = await client.query(`SELECT * FROM gift_card WHERE code=$1 AND deleted_at IS NULL FOR UPDATE`, [req.params.code.toUpperCase()])
      const card = g.rows[0]
      if (!card || card.is_disabled || (card.ends_at && new Date(card.ends_at) < new Date())) {
        throw Object.assign(new Error("Gift card invalid or expired"), { statusCode: 400 })
      }
      if (card.balance < amount) {
        throw Object.assign(new Error("Insufficient gift card balance"), { statusCode: 400 })
      }
      await client.query(`UPDATE gift_card SET balance = balance - $2 WHERE id=$1`, [card.id, amount])
      await client.query(`INSERT INTO gift_card_transaction (gift_card_id, order_id, amount) VALUES ($1,$2,$3)`, [card.id, order_id, -amount])
      await client.query("COMMIT")
      res.json({ code: card.code, redeemed: amount })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    next(e)
  }
})

groupsGiftcardDraftRouter.post("/admin/draft-orders/:id/confirm", requireAuth, async (req, res, next) => {
  try {
    const r = await pool.query(`UPDATE "order" SET is_draft_order=FALSE WHERE id=$1 AND is_draft_order=TRUE`, [req.params.id])
    if (r.rowCount === 0) {
      throw Object.assign(new Error("Draft order not found"), { statusCode: 404 })
    }
    res.json({ id: req.params.id, confirmed: true })
  } catch (e) {
    next(e)
  }
})
