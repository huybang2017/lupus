-- P19: promotion parity with Lupus's create-promotion flow.
--  * is_tax_inclusive / apply_to_quantity on the application method
--  * allocation may be 'once' (limit applied across the whole cart)
--  * buy rules are real rows (which items unlock a buy-X-get-Y promotion)
--  * shipping method adjustments (free shipping / shipping discounts)

ALTER TABLE promotion ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE promotion ADD COLUMN IF NOT EXISTS application_apply_to_quantity INTEGER;

-- the original CHECK only allowed ('each','across'); drop whatever it is called and re-add
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'promotion'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%application_allocation%'
  LOOP
    EXECUTE format('ALTER TABLE promotion DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE promotion ADD CONSTRAINT promotion_application_allocation_check
  CHECK (application_allocation IS NULL OR application_allocation IN ('each','across','once'));

CREATE TABLE IF NOT EXISTS promotion_buy_rule (
  id TEXT PRIMARY KEY DEFAULT ('pbrule_' || encode(gen_random_bytes(12), 'hex')),
  promotion_id TEXT NOT NULL REFERENCES promotion(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'in',
  values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotion_buy_rule_promo ON promotion_buy_rule(promotion_id);

CREATE TABLE IF NOT EXISTS shipping_method_adjustment (
  id TEXT PRIMARY KEY DEFAULT ('sma_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  shipping_method_id TEXT NOT NULL REFERENCES cart_shipping_method(id) ON DELETE CASCADE,
  promotion_id TEXT REFERENCES promotion(id) ON DELETE CASCADE,
  code TEXT,
  amount BIGINT NOT NULL, -- negative
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sma_cart ON shipping_method_adjustment(cart_id);

-- an edited promotion can be switched off (Lupus: draft / active / inactive)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'promotion'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE promotion DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE promotion ADD CONSTRAINT promotion_status_check CHECK (status IN ('draft','active','inactive'));
