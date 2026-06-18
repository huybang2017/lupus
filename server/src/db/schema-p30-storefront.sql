-- p30: storefront parity (Lupus Next.js starter needs these fields on the store API)
ALTER TABLE cart ADD COLUMN IF NOT EXISTS locale TEXT;
ALTER TABLE cart_address ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE cart_address ADD COLUMN IF NOT EXISTS address_2 TEXT;
ALTER TABLE cart_shipping_method ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE payment_collection ADD COLUMN IF NOT EXISTS cart_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_collection_cart ON payment_collection(cart_id) WHERE cart_id IS NOT NULL;
ALTER TABLE order_line_item ADD COLUMN IF NOT EXISTS variant_title TEXT;
ALTER TABLE order_line_item ADD COLUMN IF NOT EXISTS variant_sku TEXT;
