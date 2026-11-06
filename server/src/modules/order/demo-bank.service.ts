import type { PoolClient } from "pg"
import { z } from "zod"
import { pool } from "../../db"

export const DEMO_BANK_PROVIDER_ID = "pp_demo_bank"

export const demoBankCredentialsSchema = z.object({
  bank_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/),
  account_number: z.string().trim().regex(/^\d{8,19}$/),
  account_holder: z.string().trim().min(2).max(100),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int().min(2024).max(2099),
  pin: z.string().regex(/^\d{6}$/),
})

export type DemoBankCredentials = z.infer<typeof demoBankCredentialsSchema>

export type DemoBank = {
  code: string
  name: string
  accounts: Array<{
    account_number: string
    account_holder: string
    expiry_month: number
    expiry_year: number
    balance: number
    currency_code: string
  }>
}

export async function listDemoBanks(): Promise<DemoBank[]> {
  const { rows } = await pool.query(
    `SELECT bank_code, bank_name, account_number, account_holder, expiry_month, expiry_year, balance, currency_code
     FROM demo_bank_account WHERE is_active=TRUE ORDER BY bank_name, account_number`
  )
  const banks = new Map<string, DemoBank>()
  for (const row of rows) {
    const bank: DemoBank = banks.get(row.bank_code) ?? { code: row.bank_code, name: row.bank_name, accounts: [] }
    bank.accounts.push({
      account_number: row.account_number,
      account_holder: row.account_holder,
      expiry_month: Number(row.expiry_month),
      expiry_year: Number(row.expiry_year),
      balance: Number(row.balance),
      currency_code: row.currency_code,
    })
    banks.set(row.bank_code, bank)
  }
  return [...banks.values()]
}

export async function captureDemoBankPayment(
  client: PoolClient,
  input: {
    credentials: DemoBankCredentials
    paymentCollectionId: string
    paymentSessionId: string
    orderId: string
    displayId: number
    amount: number
    currencyCode: string
  }
) {
  const credentials = demoBankCredentialsSchema.parse(input.credentials)
  const amount = Number(input.amount)
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw Object.assign(new Error("Số tiền thanh toán không hợp lệ."), { statusCode: 400 })
  }
  if (input.currencyCode.toLowerCase() !== "vnd") {
    throw Object.assign(new Error("Thanh toán thẻ ngân hàng hiện chỉ hỗ trợ VND."), { statusCode: 400 })
  }

  const collection = await client.query(
    `SELECT status FROM payment_collection WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
    [input.paymentCollectionId]
  )
  if (!collection.rows[0]) {
    throw Object.assign(new Error("Không tìm thấy phiên thanh toán."), { statusCode: 404 })
  }
  if (collection.rows[0].status === "captured") {
    throw Object.assign(new Error("Đơn hàng đã được thanh toán trước đó."), { statusCode: 409 })
  }

  const accountResult = await client.query(
    `SELECT id, bank_code, bank_name, account_number, account_holder, expiry_month, expiry_year, balance, currency_code,
            pin_hash = crypt($3, pin_hash) AS pin_valid
     FROM demo_bank_account
     WHERE bank_code=$1 AND account_number=$2 AND is_active=TRUE
     FOR UPDATE`,
    [credentials.bank_code, credentials.account_number, credentials.pin]
  )
  const account = accountResult.rows[0]
  if (!account || !account.pin_valid) {
    throw Object.assign(new Error("Ngân hàng, số tài khoản hoặc mã PIN không chính xác."), { statusCode: 400 })
  }
  const normalizeHolder = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("vi-VN")
  if (
    normalizeHolder(credentials.account_holder) !== normalizeHolder(String(account.account_holder)) ||
    credentials.expiry_month !== Number(account.expiry_month) ||
    credentials.expiry_year !== Number(account.expiry_year)
  ) {
    throw Object.assign(new Error("Tên chủ thẻ hoặc ngày hết hạn không chính xác."), { statusCode: 400 })
  }
  if (String(account.currency_code).toLowerCase() !== input.currencyCode.toLowerCase()) {
    throw Object.assign(new Error("Tài khoản không hỗ trợ loại tiền của đơn hàng."), { statusCode: 400 })
  }
  const balanceBefore = Number(account.balance)
  if (balanceBefore < amount) {
    throw Object.assign(
      new Error(`Số dư tài khoản không đủ. Số dư hiện tại: ${balanceBefore.toLocaleString("vi-VN")} ₫.`),
      { statusCode: 400 }
    )
  }
  const balanceAfter = balanceBefore - amount
  const reference = `DEMO${input.displayId}`

  await client.query(`UPDATE demo_bank_account SET balance=$2, updated_at=NOW() WHERE id=$1`, [account.id, balanceAfter])
  const transaction = await client.query(
    `INSERT INTO demo_bank_transaction
       (account_id, order_id, payment_collection_id, reference, amount, balance_before, balance_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, reference, created_at`,
    [account.id, input.orderId, input.paymentCollectionId, reference, amount, balanceBefore, balanceAfter]
  )
  const paymentData = {
    transaction_id: transaction.rows[0].id,
    reference,
    bank_code: account.bank_code,
    bank_name: account.bank_name,
    account_holder: account.account_holder,
    account_number_last4: String(account.account_number).slice(-4),
    expiry_month: Number(account.expiry_month),
    expiry_year: Number(account.expiry_year),
    simulator: true,
  }
  await client.query(
    `INSERT INTO payment (payment_collection_id, provider_id, amount, currency_code, status, data)
     VALUES ($1,$2,$3,$4,'captured',$5)`,
    [input.paymentCollectionId, DEMO_BANK_PROVIDER_ID, amount, input.currencyCode, JSON.stringify(paymentData)]
  )
  const session = await client.query(
    `UPDATE payment_session SET status='captured', data=$2, updated_at=NOW()
     WHERE id=$1 AND provider_id=$3 AND status='pending' AND deleted_at IS NULL`,
    [input.paymentSessionId, JSON.stringify(paymentData), DEMO_BANK_PROVIDER_ID]
  )
  if (session.rowCount !== 1) {
    throw Object.assign(new Error("Phiên thanh toán thẻ không còn hiệu lực."), { statusCode: 409 })
  }
  await client.query(
    `UPDATE payment_collection
     SET authorized_amount=$2, captured_amount=$2, status='captured', completed_at=NOW(), updated_at=NOW()
     WHERE id=$1`,
    [input.paymentCollectionId, amount]
  )
  await client.query(`UPDATE "order" SET status='completed', updated_at=NOW() WHERE id=$1`, [input.orderId])

  return { transaction: transaction.rows[0], balance_after: balanceAfter }
}
