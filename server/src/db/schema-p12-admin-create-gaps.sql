-- P12: columns needed by the admin create wizards (Lupus v2 parity).
-- inventory_item: full attribute set (title/description/dimensions/material).
-- campaign: identifier (Lupus campaign_identifier).
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS length DOUBLE PRECISION;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS height DOUBLE PRECISION;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS width DOUBLE PRECISION;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS mid_code TEXT;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS identifier TEXT UNIQUE;
