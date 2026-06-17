-- P24: Lupus "Regions" parity: the payment providers available in a region.
-- (tax inclusive pricing lives in price_preference rows with attribute = 'region_id')

CREATE TABLE IF NOT EXISTS region_payment_provider (
  region_id TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (region_id, provider_id)
);

-- every existing region could already be paid for with the built-in provider
INSERT INTO region_payment_provider (region_id, provider_id)
SELECT r.id, 'manual' FROM region r
WHERE r.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM region_payment_provider p WHERE p.region_id = r.id)
ON CONFLICT DO NOTHING;
