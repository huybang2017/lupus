-- P25: Lupus reference data parity: return reasons, refund reasons, product types, product tags.
--
-- The refund_reason table used to hold what Lupus calls return reasons (return_item.reason_id points
-- at it), while real refund reasons only lived in process memory. Split them: return reasons move to
-- their own table (same ids, so existing return rows keep their reason), refund_reason becomes the
-- real refund reason table.

DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.return_reason') IS NULL THEN
    CREATE TABLE return_reason (
      id TEXT PRIMARY KEY DEFAULT ('rr_' || encode(gen_random_bytes(12), 'hex')),
      value TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      parent_return_reason_id TEXT REFERENCES return_reason(id) ON DELETE SET NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- value is a slug of the old label, made unique with a suffix when two labels collide
    INSERT INTO return_reason (id, value, label, description, created_at, updated_at, deleted_at)
    SELECT id,
           CASE WHEN n = 1 THEN slug ELSE slug || '_' || n END,
           label, description, created_at, created_at, deleted_at
    FROM (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at, id) AS n
      FROM (
        SELECT *, COALESCE(NULLIF(trim(both '_' FROM lower(regexp_replace(label, '[^a-zA-Z0-9]+', '_', 'g'))), ''), 'reason') AS slug
        FROM refund_reason
      ) s
    ) numbered;

    FOR r IN
      SELECT c.conrelid::regclass AS tbl, c.conname,
             (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS col
      FROM pg_constraint c
      WHERE c.confrelid = 'refund_reason'::regclass AND c.contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
      EXECUTE format('ALTER TABLE %s ADD FOREIGN KEY (%I) REFERENCES return_reason(id) ON DELETE SET NULL', r.tbl, r.col);
    END LOOP;

    DELETE FROM refund_reason;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS return_reason_value_uq ON return_reason (value) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS return_reason_parent_idx ON return_reason (parent_return_reason_id) WHERE deleted_at IS NULL;

ALTER TABLE refund_reason ALTER COLUMN id SET DEFAULT ('refr_' || encode(gen_random_bytes(12), 'hex'));
ALTER TABLE refund_reason ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE refund_reason ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE refund_reason ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS refund_reason_code_uq ON refund_reason (code) WHERE deleted_at IS NULL;

-- every refund that goes through the admin keeps its reason and note
CREATE TABLE IF NOT EXISTS payment_refund (
  id TEXT PRIMARY KEY DEFAULT ('refund_' || encode(gen_random_bytes(12), 'hex')),
  payment_collection_id TEXT NOT NULL,
  payment_id TEXT,
  amount BIGINT NOT NULL,
  refund_reason_id TEXT REFERENCES refund_reason(id) ON DELETE SET NULL,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_refund_collection_idx ON payment_refund (payment_collection_id);

-- product types / tags: metadata + updated_at, and a value that can be reused after a delete
ALTER TABLE product_type ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE product_type ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE product_type DROP CONSTRAINT IF EXISTS product_type_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_type_value_uq ON product_type (value) WHERE deleted_at IS NULL;

ALTER TABLE product_tag ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE product_tag ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE product_tag DROP CONSTRAINT IF EXISTS product_tag_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_tag_value_uq ON product_tag (value) WHERE deleted_at IS NULL;
