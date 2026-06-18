-- Port of sales-channel, stock-location, inventory (multi-location) DML.
-- Refs: modules/sales-channel/sales-channel.ts, modules/stock-location/stock-location.ts (+address),
-- modules/inventory/inventory-item.ts, inventory-level.ts, reservation-item.ts (resitem, allow_backorder).

CREATE TABLE IF NOT EXISTS sales_channel (
  id TEXT PRIMARY KEY DEFAULT ('sc_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  description TEXT,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- product <-> sales_channel publish mapping (Lupus: product_sales_channel pivot + link module)
CREATE TABLE IF NOT EXISTS product_sales_channel (
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  sales_channel_id TEXT NOT NULL REFERENCES sales_channel(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, sales_channel_id)
);

ALTER TABLE cart ADD COLUMN IF NOT EXISTS sales_channel_id TEXT REFERENCES sales_channel(id) ON DELETE SET NULL;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS sales_channel_id TEXT REFERENCES sales_channel(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS stock_location (
  id TEXT PRIMARY KEY DEFAULT ('sloc_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  address_1 TEXT,
  city TEXT,
  country_code TEXT,
  postal_code TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- sales_channel <-> stock_location link (Lupus link module: linkSalesChannelsToStockLocation)
CREATE TABLE IF NOT EXISTS sales_channel_stock_location (
  sales_channel_id TEXT NOT NULL REFERENCES sales_channel(id) ON DELETE CASCADE,
  stock_location_id TEXT NOT NULL REFERENCES stock_location(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sales_channel_id, stock_location_id)
);

CREATE TABLE IF NOT EXISTS inventory_item (
  id TEXT PRIMARY KEY DEFAULT ('iitem_' || encode(gen_random_bytes(12), 'hex')),
  sku TEXT,
  origin_country TEXT,
  hs_code TEXT,
  requires_shipping BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- variant <-> inventory_item link (Lupus: product-variant-inventory-item link)
CREATE TABLE IF NOT EXISTS variant_inventory_item (
  variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id) ON DELETE CASCADE,
  required_quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (variant_id, inventory_item_id)
);

-- Multi-location levels (replaces single-location inventory_level.variant_id PK usage;
-- legacy table kept, new code reads location levels first, falls back to legacy)
CREATE TABLE IF NOT EXISTS inventory_level_location (
  inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES stock_location(id) ON DELETE CASCADE,
  stocked_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stocked_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  incoming_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (inventory_item_id, location_id)
);

CREATE TABLE IF NOT EXISTS reservation_item (
  id TEXT PRIMARY KEY DEFAULT ('resitem_' || encode(gen_random_bytes(12), 'hex')),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES stock_location(id) ON DELETE CASCADE,
  line_item_id TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  allow_backorder BOOLEAN NOT NULL DEFAULT FALSE,
  external_id TEXT,
  description TEXT,
  created_by TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reservation_line ON reservation_item(line_item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservation_location ON reservation_item(location_id) WHERE deleted_at IS NULL;
