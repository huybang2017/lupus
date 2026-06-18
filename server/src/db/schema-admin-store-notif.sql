-- Port of user/invite, RBAC, store/settings, notification, file/search stubs.
-- Refs: modules/user (user prefix user, invite), modules/rbac (role/policy + inheritance),
-- modules/store (store + currencies/locales), modules/notification (notification + provider),
-- modules/api-key (publishable/secret keys for store/admin auth).

CREATE TABLE IF NOT EXISTS admin_user (
  id TEXT PRIMARY KEY DEFAULT ('user_' || encode(gen_random_bytes(12), 'hex')),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invite (
  id TEXT PRIMARY KEY DEFAULT ('invite_' || encode(gen_random_bytes(12), 'hex')),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT (encode(gen_random_bytes(24), 'hex')),
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- admin_user <-> auth_identity link (Lupus: actor mapping for admin sessions)
CREATE TABLE IF NOT EXISTS admin_user_auth (
  admin_user_id TEXT NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  auth_identity_id TEXT NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_user_id, auth_identity_id)
);

CREATE TABLE IF NOT EXISTS rbac_role (
  id TEXT PRIMARY KEY DEFAULT ('role_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rbac_policy (
  id TEXT PRIMARY KEY DEFAULT ('pol_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rbac_role_policy (
  role_id TEXT NOT NULL REFERENCES rbac_role(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL REFERENCES rbac_policy(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, policy_id)
);

CREATE TABLE IF NOT EXISTS rbac_role_parent (
  role_id TEXT NOT NULL REFERENCES rbac_role(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES rbac_role(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, parent_id)
);

CREATE TABLE IF NOT EXISTS admin_user_role (
  admin_user_id TEXT NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES rbac_role(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_user_id, role_id)
);

CREATE TABLE IF NOT EXISTS store (
  id TEXT PRIMARY KEY DEFAULT ('store_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL DEFAULT 'Default Store',
  default_sales_channel_id TEXT REFERENCES sales_channel(id) ON DELETE SET NULL,
  default_region_id TEXT REFERENCES region(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_key (
  id TEXT PRIMARY KEY DEFAULT ('key_' || encode(gen_random_bytes(12), 'hex')),
  token TEXT NOT NULL UNIQUE DEFAULT ('pk_' || encode(gen_random_bytes(24), 'hex')),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('publishable','secret')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY DEFAULT ('notif_' || encode(gen_random_bytes(12), 'hex')),
  to_address TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'email' | 'sms'
  template TEXT NOT NULL,
  data JSONB,
  provider_id TEXT NOT NULL DEFAULT 'log',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
