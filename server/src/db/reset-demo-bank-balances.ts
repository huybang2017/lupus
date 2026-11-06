import { pool } from "../db"

async function main() {
  const { rowCount } = await pool.query(
    `UPDATE demo_bank_account
     SET balance = CASE account_number
       WHEN '1000000001' THEN 5000000
       WHEN '2000000001' THEN 8000000
       WHEN '3000000001' THEN 12000000
       WHEN '4000000001' THEN 20000000
       ELSE balance
     END,
     updated_at=NOW()
     WHERE account_number IN ('1000000001','2000000001','3000000001','4000000001')`
  )
  console.log(`Reset ${rowCount ?? 0} demo bank balances.`)
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

