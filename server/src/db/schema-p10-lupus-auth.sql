-- P10: Lupus-compatible auth tables — MFA factors/challenges/recovery codes + email verification.
-- Lupus parity: auth module MFA (start -> verify/enable -> challenge on login -> disable),
-- recovery codes (generate once, single-use), verification request/confirm for identities.
CREATE TABLE IF NOT EXISTS auth_mfa_factor (
  id TEXT PRIMARY KEY DEFAULT ('authmfa_' || encode(gen_random_bytes(12), 'hex')),
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'totp',
  label TEXT,
  secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','enabled','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_mfa_challenge (
  id TEXT PRIMARY KEY DEFAULT ('authch_' || encode(gen_random_bytes(12), 'hex')),
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  auth_provider TEXT NOT NULL DEFAULT 'emailpass',
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_mfa_recovery_code (
  id TEXT PRIMARY KEY DEFAULT ('authrc_' || encode(gen_random_bytes(12), 'hex')),
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_verification (
  id TEXT PRIMARY KEY DEFAULT ('authv_' || encode(gen_random_bytes(12), 'hex')),
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_factor_identity ON auth_mfa_factor(auth_identity_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_identity ON auth_mfa_challenge(auth_identity_id);
