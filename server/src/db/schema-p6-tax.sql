-- P6: tax providers registry, per-product tax codes, region rules (province/postal).
-- Lupus parity: tax region rules narrow a region (province/postal match wins over
-- country-only), products carry tax codes resolved to specific rates.
CREATE TABLE IF NOT EXISTS tax_provider (
  id TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO tax_provider (id) VALUES ('system') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS tax_region_rule (
  id TEXT PRIMARY KEY DEFAULT ('txrule_' || encode(gen_random_bytes(12), 'hex')),
  tax_region_id TEXT NOT NULL REFERENCES tax_region(id) ON DELETE CASCADE,
  reference TEXT NOT NULL, -- 'province' | 'postal'
  reference_id TEXT NOT NULL, -- province code or postal prefix
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE tax_region ADD COLUMN IF NOT EXISTS province_code TEXT;
-- (province_code may already exist from earlier schema; IF NOT EXISTS keeps it idempotent)
