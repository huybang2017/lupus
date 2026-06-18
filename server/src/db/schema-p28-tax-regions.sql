-- P28: Lupus "Tax Regions" parity: provinces are child regions of a country, tax rates can carry
-- override rules (product / product type / shipping option) and the cart remembers which shipping
-- option a shipping method came from so shipping overrides can apply.

ALTER TABLE tax_region ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES tax_region(id) ON DELETE CASCADE;
ALTER TABLE tax_region ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE tax_region ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE tax_region ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- province regions that already exist hang below their country region
UPDATE tax_region c SET parent_id = p.id
FROM tax_region p
WHERE c.parent_id IS NULL AND c.province_code IS NOT NULL AND p.province_code IS NULL
  AND p.country_code = c.country_code AND p.deleted_at IS NULL AND c.deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tax_region_parent ON tax_region(parent_id) WHERE deleted_at IS NULL;

ALTER TABLE tax_rate ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE tax_rate ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE tax_rate ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS tax_rate_rule (
  id TEXT PRIMARY KEY DEFAULT ('txrr_' || encode(gen_random_bytes(12), 'hex')),
  tax_rate_id TEXT NOT NULL REFERENCES tax_rate(id) ON DELETE CASCADE,
  reference TEXT NOT NULL CHECK (reference IN ('product', 'product_type', 'shipping_option')),
  reference_id TEXT NOT NULL,
  metadata JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rate_rule ON tax_rate_rule(tax_rate_id, reference, reference_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tax_rate_rule_ref ON tax_rate_rule(reference, reference_id) WHERE deleted_at IS NULL;

ALTER TABLE cart_shipping_method ADD COLUMN IF NOT EXISTS shipping_option_id TEXT;
