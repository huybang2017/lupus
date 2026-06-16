ALTER TABLE payment ADD COLUMN IF NOT EXISTS refunded_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_status_check;
ALTER TABLE payment ADD CONSTRAINT payment_status_check CHECK (status IN ('pending','authorized','captured','refunded','partially_refunded','canceled','failed'));
