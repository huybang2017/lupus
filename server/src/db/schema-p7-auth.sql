-- P7: password-reset tokens, auth sessions, Stripe webhook events log.
-- Lupus parity: auth password-reset token flow (request -> consume once, expiry),
-- session tracking per login, payment webhook idempotency (stripe event ids).
CREATE TABLE IF NOT EXISTS password_reset_token (
  id TEXT PRIMARY KEY DEFAULT ('prt_' || encode(gen_random_bytes(12), 'hex')),
  token TEXT NOT NULL UNIQUE DEFAULT (encode(gen_random_bytes(24), 'hex')),
  provider_identity_id TEXT NOT NULL REFERENCES provider_identity(id) ON DELETE CASCADE,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_session (
  id TEXT PRIMARY KEY DEFAULT ('sess_' || encode(gen_random_bytes(12), 'hex')),
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'emailpass',
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_webhook_event (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
