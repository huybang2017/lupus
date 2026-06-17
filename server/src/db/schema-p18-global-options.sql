-- Global product options (Lupus v2 "is_exclusive = false"): reusable option templates
-- (title + values) not owned by a single product. Options created inside a product stay
-- exclusive to it.
ALTER TABLE product_option ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE product_option ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_option_global_title
  ON product_option (lower(title)) WHERE product_id IS NULL AND deleted_at IS NULL;

-- Option values are ranked (Lupus "Rank" list in the edit-option drawer).
ALTER TABLE product_option_value ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0;
