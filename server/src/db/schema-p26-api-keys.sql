-- P26: Lupus API keys parity: secret keys are shown once (only a hash is kept), keys record who revoked
-- them and when they were last used.

ALTER TABLE api_key ADD COLUMN IF NOT EXISTS redacted TEXT;
ALTER TABLE api_key ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE api_key ADD COLUMN IF NOT EXISTS revoked_by TEXT;
ALTER TABLE api_key ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- publishable keys stay readable; their redacted form is what lists show next to the copy button
UPDATE api_key SET redacted = left(token, 3) || '...' || right(token, 4)
WHERE type = 'publishable' AND redacted IS NULL;

-- secret keys that were stored in clear text are redacted and hashed (the old default gave them a pk_ prefix)
UPDATE api_key SET redacted = 'sk_...' || right(token, 4), token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
WHERE type = 'secret' AND redacted IS NULL;
