-- P2: price-list customer-group rules (Lupus price-list rules parity).
CREATE TABLE IF NOT EXISTS price_list_customer_group (
  price_list_id TEXT NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
  customer_group_id TEXT NOT NULL REFERENCES customer_group(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (price_list_id, customer_group_id)
);
