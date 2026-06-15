-- P4: dedicated RMA lifecycle (Lupus returns/claims/exchanges parity).
-- return_request: requested -> confirmed -> partially_received -> received (+ refunded flag)
-- claim: inbound (damaged return leg) + outbound (replacement leg, fulfilled via fulfillment)
-- exchange: inbound + outbound legs; each leg has items + optional shipping amount.
CREATE TABLE IF NOT EXISTS return_request (
  id TEXT PRIMARY KEY DEFAULT ('ret_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_change_id TEXT REFERENCES order_change(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','partially_received','received','canceled','dismissed')),
  refund_amount BIGINT NOT NULL DEFAULT 0,
  refunded BOOLEAN NOT NULL DEFAULT FALSE,
  reason_id TEXT REFERENCES refund_reason(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS return_item (
  id TEXT PRIMARY KEY DEFAULT ('ritem_' || encode(gen_random_bytes(12), 'hex')),
  return_id TEXT NOT NULL REFERENCES return_request(id) ON DELETE CASCADE,
  line_item_id TEXT NOT NULL REFERENCES order_line_item(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  received_quantity INTEGER NOT NULL DEFAULT 0,
  damaged_quantity INTEGER NOT NULL DEFAULT 0,
  reason_id TEXT REFERENCES refund_reason(id) ON DELETE SET NULL,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim (
  id TEXT PRIMARY KEY DEFAULT ('claim_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_change_id TEXT REFERENCES order_change(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'refund' CHECK (type IN ('refund','replace')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','received','canceled','dismissed')),
  refund_amount BIGINT NOT NULL DEFAULT 0,
  refunded BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS claim_item (
  id TEXT PRIMARY KEY DEFAULT ('citem_' || encode(gen_random_bytes(12), 'hex')),
  claim_id TEXT NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  line_item_id TEXT REFERENCES order_line_item(id) ON DELETE SET NULL,
  variant_id TEXT,
  title TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price BIGINT NOT NULL DEFAULT 0,
  received_quantity INTEGER NOT NULL DEFAULT 0,
  reason_id TEXT REFERENCES refund_reason(id) ON DELETE SET NULL,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange (
  id TEXT PRIMARY KEY DEFAULT ('exch_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_change_id TEXT REFERENCES order_change(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','received','canceled','dismissed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS exchange_item (
  id TEXT PRIMARY KEY DEFAULT ('eitem_' || encode(gen_random_bytes(12), 'hex')),
  exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  line_item_id TEXT REFERENCES order_line_item(id) ON DELETE SET NULL,
  variant_id TEXT,
  title TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price BIGINT NOT NULL DEFAULT 0,
  received_quantity INTEGER NOT NULL DEFAULT 0,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
