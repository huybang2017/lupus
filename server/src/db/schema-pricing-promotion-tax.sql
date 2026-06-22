-- Full-logic port of pricing / promotion / tax DML.
-- Refs:
--   upstream/packages/modules/pricing/src/models/price.ts, price-set.ts, price-list.ts
--   upstream/packages/modules/promotion/src/models/promotion.ts, application-method.ts (type/allocation/target), promotion-rule.ts
--   upstream/packages/modules/tax/src/models/tax-region.ts, tax-rate.ts (is_combinable, default), tax-rate-rule.ts
-- All amounts are BIGINT minor units. Rates are FLOAT percent (e.g. 25.0 = 25%).

CREATE TABLE IF NOT EXISTS price_set (
  id TEXT PRIMARY KEY DEFAULT ('ps_' || encode(gen_random_bytes(12), 'hex')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS price (
  id TEXT PRIMARY KEY DEFAULT ('price_' || encode(gen_random_bytes(12), 'hex')),
  price_set_id TEXT NOT NULL REFERENCES price_set(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  min_quantity INTEGER,
  max_quantity INTEGER,
  price_list_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_price_set_currency ON price(price_set_id, currency_code) WHERE deleted_at IS NULL;

-- Link variant -> price_set (Lupus keeps this via price_set money mapping; lupus makes it explicit)
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS price_set_id TEXT REFERENCES price_set(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS price_list (
  id TEXT PRIMARY KEY DEFAULT ('pl_' || encode(gen_random_bytes(12), 'hex')),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft')),
  type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale','override')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS promotion (
  id TEXT PRIMARY KEY DEFAULT ('promo_' || encode(gen_random_bytes(12), 'hex')),
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft')),
  is_automatic BOOLEAN NOT NULL DEFAULT FALSE,
  -- application method flattened (Lupus: separate application_method table)
  application_type TEXT NOT NULL CHECK (application_type IN ('percentage','fixed','buyget')),
  application_target TEXT NOT NULL DEFAULT 'order' CHECK (application_target IN ('order','items','shipping_methods')),
  application_allocation TEXT CHECK (application_allocation IN ('each','across')),
  application_value FLOAT,
  application_currency TEXT,
  application_max_quantity INTEGER,
  -- buyget fields (buy_rules_min_quantity)
  buy_min_quantity INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS promotion_target_rule (
  id TEXT PRIMARY KEY DEFAULT ('prule_' || encode(gen_random_bytes(12), 'hex')),
  promotion_id TEXT NOT NULL REFERENCES promotion(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL, -- e.g. 'product_id', 'customer_group_id'
  operator TEXT NOT NULL DEFAULT 'in', -- 'in' | 'eq' | 'ne'
  values JSONB NOT NULL, -- JSON array of strings
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_promotion (
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  promotion_id TEXT NOT NULL REFERENCES promotion(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cart_id, promotion_id)
);

CREATE TABLE IF NOT EXISTS line_item_adjustment (
  id TEXT PRIMARY KEY DEFAULT ('lia_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT REFERENCES cart(id) ON DELETE CASCADE,
  line_item_id TEXT REFERENCES cart_line_item(id) ON DELETE CASCADE,
  promotion_id TEXT REFERENCES promotion(id) ON DELETE SET NULL,
  code TEXT,
  amount BIGINT NOT NULL, -- negative discount in minor units
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adj_line ON line_item_adjustment(line_item_id);

CREATE TABLE IF NOT EXISTS tax_region (
  id TEXT PRIMARY KEY DEFAULT ('txreg_' || encode(gen_random_bytes(12), 'hex')),
  country_code TEXT NOT NULL,
  province_code TEXT,
  provider_id TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_region ON tax_region(country_code, COALESCE(province_code,'')) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tax_rate (
  id TEXT PRIMARY KEY DEFAULT ('txr_' || encode(gen_random_bytes(12), 'hex')),
  tax_region_id TEXT NOT NULL REFERENCES tax_region(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate FLOAT, -- percent, e.g. 25.0
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_combinable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_default_region ON tax_rate(tax_region_id) WHERE is_default = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS line_item_tax_line (
  id TEXT PRIMARY KEY DEFAULT ('litl_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT REFERENCES cart(id) ON DELETE CASCADE,
  line_item_id TEXT REFERENCES cart_line_item(id) ON DELETE CASCADE,
  description TEXT,
  code TEXT,
  rate FLOAT NOT NULL,
  provider_id TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_tax_line (
  id TEXT PRIMARY KEY DEFAULT ('smtl_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT REFERENCES cart(id) ON DELETE CASCADE,
  shipping_method_id TEXT REFERENCES cart_shipping_method(id) ON DELETE CASCADE,
  description TEXT,
  code TEXT,
  rate FLOAT NOT NULL,
  provider_id TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory: on-hand per location simplified (Lupus: stock_location + inventory_item + reservation)
CREATE TABLE IF NOT EXISTS inventory_level (
  variant_id TEXT PRIMARY KEY REFERENCES product_variant(id) ON DELETE CASCADE,
  stocked_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stocked_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
