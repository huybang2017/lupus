-- Port of infra modules: file, search-postgres, event-bus outbox, workflow-engine
-- persistence, locking-postgres, caching, currency, analytics-local.
-- Refs: providers/file-local, providers/file-s3 (interface), providers/search-postgres
-- (pg tsvector), modules/event-bus-local, workflow-engine tables, modules/currency/currency.ts,
-- providers/analytics-local.

CREATE TABLE IF NOT EXISTS file_record (
  id TEXT PRIMARY KEY DEFAULT ('file_' || encode(gen_random_bytes(12), 'hex')),
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  provider_id TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- search-postgres provider equivalent: GIN index over product catalog
CREATE INDEX IF NOT EXISTS idx_product_search ON product USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(handle,'')));

-- event-bus outbox (local provider persists; redis fan-out replaced by in-process handlers)
CREATE TABLE IF NOT EXISTS event_outbox (
  id TEXT PRIMARY KEY DEFAULT ('evt_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbox_name ON event_outbox(name);

-- workflow-engine persistence: every named workflow run recorded (input/steps/output)
CREATE TABLE IF NOT EXISTS workflow_execution (
  id TEXT PRIMARY KEY DEFAULT ('wfe_' || encode(gen_random_bytes(12), 'hex')),
  workflow_id TEXT NOT NULL,
  input JSONB,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','compensated')),
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wfe_workflow ON workflow_execution(workflow_id);

CREATE TABLE IF NOT EXISTS currency (
  code TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  symbol_native TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  decimal_digits INTEGER NOT NULL DEFAULT 2
);

CREATE TABLE IF NOT EXISTS analytics_event (
  id TEXT PRIMARY KEY DEFAULT ('ana_' || encode(gen_random_bytes(12), 'hex')),
  event TEXT NOT NULL,
  actor TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_event(event);
