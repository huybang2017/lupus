-- Port of Lupus order + payment DML (packages/modules/order/src/models/order.ts,
-- packages/modules/payment/src/models/payment-collection.ts, payment.ts).
-- Simplified: single status enums, no claims/exchanges/returns, no multi-provider sessions,
-- no BigNumber computed totals (snapshot totals from cart at checkout).

CREATE TABLE IF NOT EXISTS payment_collection (
  id TEXT PRIMARY KEY DEFAULT ('pay_col_' || encode(gen_random_bytes(12), 'hex')),
  currency_code TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  authorized_amount BIGINT NOT NULL DEFAULT 0,
  captured_amount BIGINT NOT NULL DEFAULT 0,
  refunded_amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_paid' CHECK (status IN ('not_paid','awaiting','authorized','partially_authorized','captured','partially_captured','refunded','canceled','requires_more')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment (
  id TEXT PRIMARY KEY DEFAULT ('pay_' || encode(gen_random_bytes(12), 'hex')),
  payment_collection_id TEXT NOT NULL REFERENCES payment_collection(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL DEFAULT 'manual',
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','captured','refunded','canceled','failed')),
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "order" (
  id TEXT PRIMARY KEY DEFAULT ('order_' || encode(gen_random_bytes(12), 'hex')),
  display_id SERIAL,
  cart_id TEXT REFERENCES cart(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customer(id) ON DELETE SET NULL,
  region_id TEXT REFERENCES region(id) ON DELETE SET NULL,
  payment_collection_id TEXT REFERENCES payment_collection(id) ON DELETE SET NULL,
  email TEXT,
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','archived','canceled','requires_action')),
  subtotal BIGINT NOT NULL DEFAULT 0,
  shipping_total BIGINT NOT NULL DEFAULT 0,
  tax_total BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_line_item (
  id TEXT PRIMARY KEY DEFAULT ('ordli_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id TEXT,
  product_id TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_line_order ON order_line_item(order_id);
