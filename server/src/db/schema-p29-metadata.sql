-- P29: Lupus lets you edit metadata on every entity; these tables had no column for it.
ALTER TABLE product_collection ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE product_category ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE product_option ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE promotion ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS metadata JSONB;
