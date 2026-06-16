-- P9: store locales, feature flags, dashboard views/layouts, notification templates.
-- Lupus parity: store locales, feature-flags toggles, admin views + layout config +
-- property labels (dashboard customization), configurable notification templates per event.
CREATE TABLE IF NOT EXISTS store_locale (
  store_id TEXT NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  locale_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, locale_code)
);

CREATE TABLE IF NOT EXISTS feature_flag (
  key TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_view (
  id TEXT PRIMARY KEY DEFAULT ('view_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_layout (
  user_id TEXT NOT NULL,
  view_id TEXT NOT NULL REFERENCES admin_view(id) ON DELETE CASCADE,
  layout JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, view_id)
);

CREATE TABLE IF NOT EXISTS property_label (
  id TEXT PRIMARY KEY DEFAULT ('plabel_' || encode(gen_random_bytes(12), 'hex')),
  entity TEXT NOT NULL,
  property TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity, property)
);

CREATE TABLE IF NOT EXISTS notification_template (
  id TEXT PRIMARY KEY DEFAULT ('ntpl_' || encode(gen_random_bytes(12), 'hex')),
  event_name TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
