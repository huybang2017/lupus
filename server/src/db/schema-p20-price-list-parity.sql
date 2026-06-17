-- P20: price list parity with Lupus's price-list admin flow.
--  * metadata (edited from the detail page) and updated_at (sortable / filterable)
--  * prices of a deleted price list must never leak into price resolution

ALTER TABLE price_list ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE price_list ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- earlier deletes only soft-deleted the list itself; retire their prices too
UPDATE price SET deleted_at = NOW()
WHERE price_list_id IS NOT NULL AND deleted_at IS NULL
  AND price_list_id IN (SELECT id FROM price_list WHERE deleted_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_price_list ON price(price_list_id) WHERE deleted_at IS NULL;
