-- P11: product category manual ordering for the admin Categories > Organize page.
-- Backfills existing rows with stable ranks derived from created_at, then orders
-- category lists by (rank, created_at).
ALTER TABLE product_category ADD COLUMN IF NOT EXISTS rank INT NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(rank, 0) ORDER BY created_at ASC, id ASC) - 1 AS rn
  FROM product_category
  WHERE deleted_at IS NULL
)
UPDATE product_category c
SET rank = o.rn
FROM ordered o
WHERE c.id = o.id AND c.rank = 0;

CREATE INDEX IF NOT EXISTS idx_product_category_rank ON product_category (rank ASC, created_at DESC);
