-- Full-logic patch: tax-inclusive flag Lupus keeps on line items (line-item.ts is_tax_inclusive).
ALTER TABLE cart_line_item ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE;
