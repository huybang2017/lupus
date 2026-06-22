-- Port of fulfillment + order-change/return DML.
-- Refs: modules/fulfillment (fulfillment prefix ful, shipping_option, service_zone/geo_zone,
-- fulfillment_set), modules/order order-change.ts (ordch, status pending/confirmed/declined/canceled),
-- order-change-action.ts (action add/remove/update item), claim/exchange/return simplified to
-- return_request + exchange tables. Lupus keeps claims/exchanges/returns as separate
-- entities with their own workflows; lupus models them as order_change rows + items.

CREATE TABLE IF NOT EXISTS shipping_option (
  id TEXT PRIMARY KEY DEFAULT ('so_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  price_type TEXT NOT NULL DEFAULT 'flat' CHECK (price_type IN ('flat','calculated')),
  provider_id TEXT NOT NULL DEFAULT 'manual',
  service_zone_name TEXT,
  country_code TEXT,
  amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'usd',
  is_return BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fulfillment (
  id TEXT PRIMARY KEY DEFAULT ('ful_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL DEFAULT 'default',
  provider_id TEXT NOT NULL DEFAULT 'manual',
  shipping_option_id TEXT REFERENCES shipping_option(id) ON DELETE SET NULL,
  packed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON fulfillment(order_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fulfillment_item (
  id TEXT PRIMARY KEY DEFAULT ('fulit_' || encode(gen_random_bytes(12), 'hex')),
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment(id) ON DELETE CASCADE,
  line_item_id TEXT NOT NULL REFERENCES order_line_item(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_change (
  id TEXT PRIMARY KEY DEFAULT ('ordch_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  change_type TEXT, -- 'edit' | 'return' | 'exchange' | 'claim'
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','requested','confirmed','declined','canceled','executed')),
  version INTEGER NOT NULL DEFAULT 1,
  requested_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_change_order ON order_change(order_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS order_change_action (
  id TEXT PRIMARY KEY DEFAULT ('ordca_' || encode(gen_random_bytes(12), 'hex')),
  order_change_id TEXT NOT NULL REFERENCES order_change(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'add_item' | 'remove_item' | 'update_qty'
  line_item_id TEXT REFERENCES order_line_item(id) ON DELETE SET NULL,
  variant_id TEXT,
  title TEXT,
  quantity INTEGER,
  unit_price BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refund_reason (
  id TEXT PRIMARY KEY DEFAULT ('rr_' || encode(gen_random_bytes(12), 'hex')),
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
