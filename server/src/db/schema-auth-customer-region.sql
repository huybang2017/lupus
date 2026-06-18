-- Port of Lupus auth / customer / region DML models to plain SQL.
-- Refs:
--   upstream/packages/modules/auth/src/models/auth-identity.ts (auth_identity, prefix authid)
--   upstream/packages/modules/auth/src/models/provider-identity.ts (provider_identity, unique provider+entity_id)
--   upstream/packages/modules/customer/src/models/customer.ts (Customer, prefix cus, unique email+has_account)
--   upstream/packages/modules/customer/src/models/address.ts (simplified)
--   upstream/packages/modules/region/src/models/region.ts + country.ts (prefix reg)
-- Dropped vs Lupus: mfa tables, verification tokens, password-reset tokens, customer groups.
-- Those are stubbed as TODO in auth.service.ts. This keeps register/login/customer/region working.

CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY DEFAULT ('cus_' || encode(gen_random_bytes(12), 'hex')),
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  phone TEXT,
  has_account BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_email_account ON customer(email, has_account) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_address (
  id TEXT PRIMARY KEY DEFAULT ('addr_' || encode(gen_random_bytes(12), 'hex')),
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  address_1 TEXT,
  address_2 TEXT,
  city TEXT,
  country_code TEXT,
  postal_code TEXT,
  phone TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customer_address_customer ON customer_address(customer_id) WHERE deleted_at IS NULL;

-- Lupus auth_identity has no email/password columns; credentials live in provider_identity.
-- Lupus simplification: provider='emailpass', entity_id=email, password hash in provider_metadata.
CREATE TABLE IF NOT EXISTS auth_identity (
  id TEXT PRIMARY KEY DEFAULT ('authid_' || encode(gen_random_bytes(12), 'hex')),
  app_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS provider_identity (
  id TEXT PRIMARY KEY DEFAULT ('pi_' || encode(gen_random_bytes(12), 'hex')),
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'emailpass',
  password_hash TEXT,
  user_metadata JSONB,
  provider_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_entity ON provider_identity(provider, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_provider_auth ON provider_identity(auth_identity_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS region (
  id TEXT PRIMARY KEY DEFAULT ('reg_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  automatic_taxes BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS region_country (
  id TEXT PRIMARY KEY DEFAULT ('regc_' || encode(gen_random_bytes(12), 'hex')),
  region_id TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
  iso_2 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_region_country ON region_country(region_id, iso_2) WHERE deleted_at IS NULL;
