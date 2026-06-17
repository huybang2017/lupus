-- P16: Product domain parity with real Lupus.
-- Refs: upstream/packages/modules/product/src/models/product-variant.ts, product-image.ts,
--       upstream/packages/modules/pricing/src/models/price.ts (base price per variant+currency).
-- Adds variant fields Lupus has that this schema was missing (manage_inventory,
-- allow_backorder, dimensions, rank, thumbnail), image ordering/metadata, a real
-- variant<->image pivot (closes the admin "batch" stub endpoints), a uniqueness
-- guarantee for "base" (non price-list) prices per variant+currency, and migrates
-- existing variant prices off the legacy money_amount table onto price/price_set
-- (money_amount itself is kept, read-only, for a future removal pass).

ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS manage_inventory BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS allow_backorder BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS variant_rank INTEGER;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS origin_country TEXT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS mid_code TEXT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS hs_code TEXT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS weight FLOAT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS length FLOAT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS height FLOAT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS width FLOAT;
ALTER TABLE product_variant ADD COLUMN IF NOT EXISTS thumbnail TEXT;

ALTER TABLE product_image ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_image ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Backfill rank for any pre-existing images using creation order (idempotent: a
-- second run just re-derives the same order since created_at doesn't change).
UPDATE product_image pi SET rank = sub.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY created_at) AS rn
  FROM product_image
) sub
WHERE pi.id = sub.id AND pi.rank = 0;

-- variant <-> image association (per-variant gallery subset, e.g. "red" swatch photos).
-- Previously absent: the admin batch endpoints for this validated ids then discarded
-- the write (no table to persist to).
CREATE TABLE IF NOT EXISTS product_variant_image (
  variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL REFERENCES product_image(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (variant_id, image_id)
);

-- One "base" (non price-list) price per variant+currency, so an upsert has a
-- well-defined conflict target (mirrors Lupus: base prices live in the variant's
-- own price_set with price_list_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_variant_currency_base
  ON price(price_set_id, currency_code)
  WHERE price_list_id IS NULL AND deleted_at IS NULL;

-- One-time data migration: money_amount -> price_set/price. Idempotent (guarded by
-- NOT EXISTS so re-running this file is safe). money_amount itself is NOT dropped
-- here; it becomes a deprecated, read-only legacy table until a later pass confirms
-- nothing reads it anymore.
DO $$
DECLARE
  v RECORD;
  new_ps_id TEXT;
BEGIN
  FOR v IN SELECT id FROM product_variant WHERE price_set_id IS NULL AND deleted_at IS NULL LOOP
    INSERT INTO price_set DEFAULT VALUES RETURNING id INTO new_ps_id;
    UPDATE product_variant SET price_set_id = new_ps_id WHERE id = v.id;
  END LOOP;
END $$;

INSERT INTO price (price_set_id, currency_code, amount, min_quantity, max_quantity, price_list_id)
SELECT v.price_set_id, LOWER(ma.currency_code), ma.amount, NULL, NULL, NULL
FROM money_amount ma
JOIN product_variant v ON v.id = ma.variant_id
WHERE v.price_set_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM price p
    WHERE p.price_set_id = v.price_set_id
      AND p.currency_code = LOWER(ma.currency_code)
      AND p.price_list_id IS NULL
      AND p.deleted_at IS NULL
  );

COMMENT ON TABLE money_amount IS 'Deprecated: superseded by price/price_set. Read-only legacy data, kept until a later removal pass confirms no remaining readers.';
