-- Local-only bank simulator used by the storefront demo. These accounts are
-- fictional and must never be confused with real banking credentials.

CREATE TABLE IF NOT EXISTS demo_bank_account (
  id TEXT PRIMARY KEY DEFAULT ('dbank_' || encode(gen_random_bytes(12), 'hex')),
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL UNIQUE,
  account_holder TEXT NOT NULL,
  expiry_month SMALLINT NOT NULL DEFAULT 12 CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year SMALLINT NOT NULL DEFAULT 2030 CHECK (expiry_year BETWEEN 2024 AND 2099),
  pin_hash TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'vnd',
  balance BIGINT NOT NULL CHECK (balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE demo_bank_account
  ADD COLUMN IF NOT EXISTS expiry_month SMALLINT NOT NULL DEFAULT 12 CHECK (expiry_month BETWEEN 1 AND 12);

ALTER TABLE demo_bank_account
  ADD COLUMN IF NOT EXISTS expiry_year SMALLINT NOT NULL DEFAULT 2030 CHECK (expiry_year BETWEEN 2024 AND 2099);

CREATE INDEX IF NOT EXISTS idx_demo_bank_account_bank
  ON demo_bank_account(bank_code) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS demo_bank_transaction (
  id TEXT PRIMARY KEY DEFAULT ('dbtxn_' || encode(gen_random_bytes(12), 'hex')),
  account_id TEXT NOT NULL REFERENCES demo_bank_account(id),
  order_id TEXT NOT NULL REFERENCES "order"(id),
  payment_collection_id TEXT NOT NULL UNIQUE REFERENCES payment_collection(id),
  reference TEXT NOT NULL UNIQUE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO demo_bank_account
  (bank_code, bank_name, account_number, account_holder, expiry_month, expiry_year, pin_hash, currency_code, balance)
VALUES
  ('MB', 'MB Bank', '1000000001', 'NGUYEN VAN DEMO', 12, 2030, crypt('123456', gen_salt('bf')), 'vnd', 5000000),
  ('VCB', 'Vietcombank', '2000000001', 'TRAN THI DEMO', 9, 2029, crypt('123456', gen_salt('bf')), 'vnd', 8000000),
  ('BIDV', 'BIDV', '3000000001', 'LE VAN DEMO', 6, 2031, crypt('123456', gen_salt('bf')), 'vnd', 12000000),
  ('TCB', 'Techcombank', '4000000001', 'PHAM THI DEMO', 3, 2030, crypt('123456', gen_salt('bf')), 'vnd', 20000000)
ON CONFLICT (account_number) DO UPDATE SET
  bank_code = EXCLUDED.bank_code,
  bank_name = EXCLUDED.bank_name,
  account_holder = EXCLUDED.account_holder,
  expiry_month = EXCLUDED.expiry_month,
  expiry_year = EXCLUDED.expiry_year,
  pin_hash = EXCLUDED.pin_hash,
  currency_code = EXCLUDED.currency_code,
  is_active = TRUE,
  updated_at = NOW();
