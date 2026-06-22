-- Port of customer-group, gift-card (product is_giftcard + gift-cardable totals), draft-order.
-- Refs: modules/customer/customer-group.ts + pivot, promotion buyget already done,
-- draft-order workflows (create draft order directly as order with is_draft_order=true).

CREATE TABLE IF NOT EXISTS customer_group (
  id TEXT PRIMARY KEY DEFAULT ('cusgrp_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customer_group_customer (
  customer_group_id TEXT NOT NULL REFERENCES customer_group(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_group_id, customer_id)
);

-- price rule per customer group (Lupus price-rules / price-preference): explicit override
CREATE TABLE IF NOT EXISTS group_price (
  id TEXT PRIMARY KEY DEFAULT ('gp_' || encode(gen_random_bytes(12), 'hex')),
  customer_group_id TEXT NOT NULL REFERENCES customer_group(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_group_id, variant_id, currency_code)
);

CREATE TABLE IF NOT EXISTS gift_card (
  id TEXT PRIMARY KEY DEFAULT ('gift_' || encode(gen_random_bytes(12), 'hex')),
  code TEXT NOT NULL UNIQUE,
  value BIGINT NOT NULL CHECK (value >= 0),
  balance BIGINT NOT NULL CHECK (balance >= 0),
  currency_code TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gift_card_transaction (
  id TEXT PRIMARY KEY DEFAULT ('giftx_' || encode(gen_random_bytes(12), 'hex')),
  gift_card_id TEXT NOT NULL REFERENCES gift_card(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES "order"(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS is_draft_order BOOLEAN NOT NULL DEFAULT FALSE;
