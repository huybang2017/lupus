-- P5: fulfillment sets, service zones, geo zones, shipping option rules/conditions.
-- Lupus parity: fulfillment_set -> service_zone -> geo_zone (country/province/postal),
-- shipping_option.rules (weight/price/product conditions: eq/gt/lt/gte/lte).
CREATE TABLE IF NOT EXISTS fulfillment_set (
  id TEXT PRIMARY KEY DEFAULT ('fset_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'shipping',
  stock_location_id TEXT REFERENCES stock_location(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS service_zone (
  id TEXT PRIMARY KEY DEFAULT ('serz_' || encode(gen_random_bytes(12), 'hex')),
  fulfillment_set_id TEXT NOT NULL REFERENCES fulfillment_set(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS geo_zone (
  id TEXT PRIMARY KEY DEFAULT ('gz_' || encode(gen_random_bytes(12), 'hex')),
  service_zone_id TEXT NOT NULL REFERENCES service_zone(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('country','province','city','postal')),
  country_code TEXT NOT NULL,
  province_code TEXT,
  city TEXT,
  postal_expression TEXT, -- JSON array of prefixes / patterns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shipping_option_rule (
  id TEXT PRIMARY KEY DEFAULT ('sor_' || encode(gen_random_bytes(12), 'hex')),
  shipping_option_id TEXT NOT NULL REFERENCES shipping_option(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL, -- 'weight' | 'subtotal' | 'quantity' | 'product_id'
  operator TEXT NOT NULL CHECK (operator IN ('eq','ne','gt','gte','lt','lte','in')),
  value TEXT NOT NULL, -- scalar or JSON array for 'in'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS fulfillment_set_id TEXT REFERENCES fulfillment_set(id) ON DELETE SET NULL;
