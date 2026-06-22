-- Missing-pieces port: product taxonomy, images, shipping profiles, translation,
-- dashboard settings, api-key<->channel link, order address snapshot, cart gift cards.
-- Refs: modules/product models (category/collection/tag/type/image),
-- modules/fulfillment shipping-profile.ts, modules/translation (locale/settings/translation),
-- modules/settings (view-configuration/property-labels/user-preference/layout),
-- link modules (api-key<->sales-channel, product<->category via pivot).

CREATE TABLE IF NOT EXISTS product_category (
  id TEXT PRIMARY KEY DEFAULT ('pcat_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  parent_category_id TEXT REFERENCES product_category(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_category_product (
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES product_category(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS product_collection (
  id TEXT PRIMARY KEY DEFAULT ('pcol_' || encode(gen_random_bytes(12), 'hex')),
  title TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE product ADD COLUMN IF NOT EXISTS collection_id TEXT REFERENCES product_collection(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS product_tag (
  id TEXT PRIMARY KEY DEFAULT ('ptag_' || encode(gen_random_bytes(12), 'hex')),
  value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES product_tag(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE IF NOT EXISTS product_type (
  id TEXT PRIMARY KEY DEFAULT ('ptyp_' || encode(gen_random_bytes(12), 'hex')),
  value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE product ADD COLUMN IF NOT EXISTS type_id TEXT REFERENCES product_type(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS product_image (
  id TEXT PRIMARY KEY DEFAULT ('img_' || encode(gen_random_bytes(12), 'hex')),
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shipping_profile (
  id TEXT PRIMARY KEY DEFAULT ('sp_' || encode(gen_random_bytes(12), 'hex')),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE shipping_option ADD COLUMN IF NOT EXISTS shipping_profile_id TEXT REFERENCES shipping_profile(id) ON DELETE SET NULL;
ALTER TABLE product ADD COLUMN IF NOT EXISTS shipping_profile_id TEXT REFERENCES shipping_profile(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS translation_locale (
  code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS translation (
  id TEXT PRIMARY KEY DEFAULT ('trs_' || encode(gen_random_bytes(12), 'hex')),
  locale_code TEXT NOT NULL REFERENCES translation_locale(code) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(locale_code, entity, entity_id, field)
);

CREATE TABLE IF NOT EXISTS user_preference (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS api_key_sales_channel (
  api_key_id TEXT NOT NULL REFERENCES api_key(id) ON DELETE CASCADE,
  sales_channel_id TEXT NOT NULL REFERENCES sales_channel(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (api_key_id, sales_channel_id)
);

CREATE TABLE IF NOT EXISTS order_address (
  id TEXT PRIMARY KEY DEFAULT ('oaddr_' || encode(gen_random_bytes(12), 'hex')),
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('shipping','billing')),
  first_name TEXT,
  last_name TEXT,
  address_1 TEXT,
  city TEXT,
  country_code TEXT,
  postal_code TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, kind)
);

-- gift card applied at cart level (Lupus gift-cardable totals: reduce payable)
CREATE TABLE IF NOT EXISTS cart_gift_card (
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  gift_card_id TEXT NOT NULL REFERENCES gift_card(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cart_id, gift_card_id)
);
