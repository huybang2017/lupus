-- P27: Lupus "Workflows" parity: every execution has a transaction id and an updated_at.

ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE workflow_execution SET transaction_id = COALESCE(input->>'transaction_id', id) WHERE transaction_id IS NULL;
ALTER TABLE workflow_execution ALTER COLUMN transaction_id SET DEFAULT ('trx_' || encode(gen_random_bytes(10), 'hex'));
CREATE INDEX IF NOT EXISTS idx_wfe_transaction ON workflow_execution(transaction_id);
