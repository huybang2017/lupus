-- P3: promotion campaigns + budgets + promotion rules (eligibility) + currency cap.
-- Lupus parity: promotion.campaign (budget usage/spend caps), promotion.rules
-- (min subtotal / customer group eligibility), is_automatic promos.
CREATE TABLE IF NOT EXISTS campaign (
  id TEXT PRIMARY KEY DEFAULT ('camp_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  description TEXT,
  currency_code TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  budget_limit INTEGER, -- max total discount (minor units) across all usages
  budget_used INTEGER NOT NULL DEFAULT 0,
  usage_limit INTEGER, -- max number of orders using this campaign
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE promotion ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES campaign(id) ON DELETE SET NULL;
ALTER TABLE promotion ADD COLUMN IF NOT EXISTS min_subtotal INTEGER; -- eligibility: cart subtotal floor (minor units)
ALTER TABLE promotion ADD COLUMN IF NOT EXISTS customer_group_id TEXT REFERENCES customer_group(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS promotion_rule (
  id TEXT PRIMARY KEY DEFAULT ('prorule_' || encode(gen_random_bytes(12), 'hex')),
  promotion_id TEXT NOT NULL REFERENCES promotion(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL, -- 'customer_group_id' | 'min_subtotal' | 'currency_code'
  operator TEXT NOT NULL DEFAULT 'eq', -- 'eq' | 'ne' | 'gte' | 'lte' | 'in'
  values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
