-- Full-logic patch: discount snapshot columns Lupus keeps on orders (adjustment totals).
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS discount_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE order_line_item ADD COLUMN IF NOT EXISTS discount_total BIGINT NOT NULL DEFAULT 0;
