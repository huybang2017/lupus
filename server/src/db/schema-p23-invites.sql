-- P23: invites carry updated_at ("Accepted on <date>" in the Users > Invite screen).
ALTER TABLE invite ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
