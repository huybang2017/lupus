-- Patch: order versioning (Lupus order.version) + payment sessions (provider flow).
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS payment_session (
  id TEXT PRIMARY KEY DEFAULT ('psess_' || encode(gen_random_bytes(12), 'hex')),
  payment_collection_id TEXT NOT NULL REFERENCES payment_collection(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','captured','canceled','failed','requires_more')),
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
