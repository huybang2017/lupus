CREATE TABLE IF NOT EXISTS order_shipping_method (
  id TEXT PRIMARY KEY DEFAULT ('osm_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  shipping_option_id TEXT REFERENCES shipping_option(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_shipping_method_order ON order_shipping_method(order_id);
