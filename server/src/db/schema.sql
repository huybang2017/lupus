-- Plain-SQL port of Lupus DML models (simplified).
-- Source reference: upstream/packages/modules/product/src/models/*.ts
-- Lupus DML `model.define` -> CREATE TABLE. No MikroORM, no decorators.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS product (
  id TEXT PRIMARY KEY DEFAULT ('prod_' || encode(gen_random_bytes(12), 'hex')),
  title TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  subtitle TEXT,
  description TEXT,
  is_giftcard BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','published','rejected')),
  thumbnail TEXT,
  weight FLOAT,
  discountable BOOLEAN NOT NULL DEFAULT TRUE,
  external_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_product_status ON product(status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS product_variant (
  id TEXT PRIMARY KEY DEFAULT ('variant_' || encode(gen_random_bytes(12), 'hex')),
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  ean TEXT,
  upc TEXT,
  inventory_quantity INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_variant_product ON product_variant(product_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS product_option (
  id TEXT PRIMARY KEY DEFAULT ('opt_' || encode(gen_random_bytes(12), 'hex')),
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_option_value (
  id TEXT PRIMARY KEY DEFAULT ('optval_' || encode(gen_random_bytes(12), 'hex')),
  option_id TEXT NOT NULL REFERENCES product_option(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS money_amount (
  id TEXT PRIMARY KEY DEFAULT ('ma_' || encode(gen_random_bytes(12), 'hex')),
  variant_id TEXT REFERENCES product_variant(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
