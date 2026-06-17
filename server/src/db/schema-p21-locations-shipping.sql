-- P21: Lupus "Locations & Shipping" parity.
--  * stock location carries a full address (address_2, province, company, phone)
--  * shipping option types are a real table (they used to live in process memory)
--  * a shipping option belongs to a service zone, has a type, an "enabled in store" flag
--    and prices per currency / region with optional cart-item-total conditions
--  * stock locations are connected to fulfillment providers through a link table
--  * shipping profiles can hold metadata

ALTER TABLE stock_location ADD COLUMN IF NOT EXISTS address_2 TEXT;
ALTER TABLE stock_location ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE stock_location ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE stock_location ADD COLUMN IF NOT EXISTS company TEXT;

CREATE TABLE IF NOT EXISTS shipping_option_type (
  id TEXT PRIMARY KEY DEFAULT ('sotype_' || encode(gen_random_bytes(12), 'hex')),
  label TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS service_zone_id TEXT REFERENCES service_zone(id) ON DELETE SET NULL;
ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS shipping_option_type_id TEXT REFERENCES shipping_option_type(id) ON DELETE SET NULL;
ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS enabled_in_store BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_shipping_option_zone ON shipping_option(service_zone_id) WHERE deleted_at IS NULL;

-- prices of a flat-rate option: one per currency or region, optionally conditional on the
-- cart item total ([{attribute:'item_total', operator:'gte'|'lte'|..., value}])
CREATE TABLE IF NOT EXISTS shipping_option_price (
  id TEXT PRIMARY KEY DEFAULT ('sop_' || encode(gen_random_bytes(12), 'hex')),
  shipping_option_id TEXT NOT NULL REFERENCES shipping_option(id) ON DELETE CASCADE,
  currency_code TEXT,
  region_id TEXT,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (currency_code IS NOT NULL OR region_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_shipping_option_price_option ON shipping_option_price(shipping_option_id) WHERE deleted_at IS NULL;

-- options created before this migration had a single amount + currency: keep them priced
INSERT INTO shipping_option_price (shipping_option_id, currency_code, amount)
SELECT so.id, LOWER(so.currency_code), so.amount FROM shipping_option so
WHERE so.deleted_at IS NULL AND so.price_type = 'flat'
  AND NOT EXISTS (SELECT 1 FROM shipping_option_price p WHERE p.shipping_option_id = so.id);

CREATE TABLE IF NOT EXISTS stock_location_fulfillment_provider (
  stock_location_id TEXT NOT NULL REFERENCES stock_location(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stock_location_id, provider_id)
);

-- providers used to be kept in stock_location.metadata.fulfillment_provider_ids
INSERT INTO stock_location_fulfillment_provider (stock_location_id, provider_id)
SELECT sl.id, pid FROM stock_location sl,
  LATERAL jsonb_array_elements_text(COALESCE(sl.metadata->'fulfillment_provider_ids', '[]'::jsonb)) AS pid
WHERE sl.deleted_at IS NULL
ON CONFLICT DO NOTHING;

ALTER TABLE shipping_profile ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE shipping_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
