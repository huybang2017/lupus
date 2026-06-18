-- Port of Lupus cart DML (packages/modules/cart/src/models/cart.ts, line-item.ts, address.ts, shipping-method.ts).
-- Simplified totals: subtotal = SUM(unit_price*qty); tax/discount/promotion/credit-lines dropped
-- (Lupus computes BigNumber totals via core-flows adjusting for tax inclusive, promotions, gift cards).
-- Lupus keeps explicit columns so checkout math is a pure function in cart.service.ts.

CREATE TABLE IF NOT EXISTS cart (
  id TEXT PRIMARY KEY DEFAULT ('cart_' || encode(gen_random_bytes(12), 'hex')),
  region_id TEXT REFERENCES region(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customer(id) ON DELETE SET NULL,
  email TEXT,
  currency_code TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cart_address (
  id TEXT PRIMARY KEY DEFAULT ('caddr_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('shipping','billing')),
  first_name TEXT,
  last_name TEXT,
  address_1 TEXT,
  city TEXT,
  country_code TEXT,
  postal_code TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cart_id, kind)
);

CREATE TABLE IF NOT EXISTS cart_line_item (
  id TEXT PRIMARY KEY DEFAULT ('cali_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES product_variant(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  variant_title TEXT,
  variant_sku TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cart_line_cart ON cart_line_item(cart_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS cart_shipping_method (
  id TEXT PRIMARY KEY DEFAULT ('csm_' || encode(gen_random_bytes(12), 'hex')),
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
