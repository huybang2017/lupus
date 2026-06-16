-- P6b: province on cart addresses (tax narrowing parity).
ALTER TABLE cart_address ADD COLUMN IF NOT EXISTS province TEXT;
