-- P17: product-level attributes shown on the admin product detail "Attributes" card
-- (Lupus product: height/width/length/weight/mid_code/hs_code/origin_country/material).
ALTER TABLE product ADD COLUMN IF NOT EXISTS height FLOAT;
ALTER TABLE product ADD COLUMN IF NOT EXISTS width FLOAT;
ALTER TABLE product ADD COLUMN IF NOT EXISTS length FLOAT;
ALTER TABLE product ADD COLUMN IF NOT EXISTS mid_code TEXT;
ALTER TABLE product ADD COLUMN IF NOT EXISTS hs_code TEXT;
ALTER TABLE product ADD COLUMN IF NOT EXISTS origin_country TEXT;
ALTER TABLE product ADD COLUMN IF NOT EXISTS material TEXT;
