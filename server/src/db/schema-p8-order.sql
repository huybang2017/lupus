-- P8: credit lines (Lupus cart/order credit_line parity), consumed at checkout
-- and snapshotted onto the order like adjustments.
CREATE TABLE IF NOT EXISTS credit_line (
  id TEXT PRIMARY KEY DEFAULT ('cl_' || encode(gen_random_bytes(12), 'hex')),
  customer_id TEXT REFERENCES customer(id) ON DELETE SET NULL,
  currency_code TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  remaining BIGINT NOT NULL CHECK (remaining >= 0),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cart_credit_line (
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  credit_line_id TEXT NOT NULL REFERENCES credit_line(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cart_id, credit_line_id)
);

CREATE TABLE IF NOT EXISTS order_credit_line (
  id TEXT PRIMARY KEY DEFAULT ('ocl_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  credit_line_id TEXT REFERENCES credit_line(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
