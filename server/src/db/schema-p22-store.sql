-- P22: Lupus "Store" parity.
--  * supported currencies (exactly one default) and per-currency tax inclusive pricing
--  * default stock location
--  * a fuller ISO currency catalogue to add from

ALTER TABLE store ADD COLUMN IF NOT EXISTS default_location_id TEXT REFERENCES stock_location(id) ON DELETE SET NULL;

-- tax inclusive pricing lives in price preferences (attribute = 'currency_code')
CREATE TABLE IF NOT EXISTS price_preference (
  id TEXT PRIMARY KEY DEFAULT ('pp_' || encode(gen_random_bytes(12), 'hex')),
  attribute TEXT,
  value TEXT,
  is_tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS store_currency (
  store_id TEXT NOT NULL REFERENCES store(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, currency_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_default_currency ON store_currency(store_id) WHERE is_default;

INSERT INTO currency (code, symbol, symbol_native, name, decimal_digits) VALUES
  ('aed','AED','د.إ','United Arab Emirates Dirham',2), ('ars','AR$','$','Argentine Peso',2),
  ('aud','AU$','$','Australian Dollar',2), ('bgn','BGN','лв.','Bulgarian Lev',2),
  ('brl','R$','R$','Brazilian Real',2), ('cad','CA$','$','Canadian Dollar',2),
  ('chf','CHF','CHF','Swiss Franc',2), ('clp','CL$','$','Chilean Peso',0),
  ('cny','CN¥','CN¥','Chinese Yuan',2), ('cop','CO$','$','Colombian Peso',0),
  ('czk','Kč','Kč','Czech Republic Koruna',2), ('egp','EGP','ج.م.','Egyptian Pound',2),
  ('hkd','HK$','$','Hong Kong Dollar',2), ('huf','Ft','Ft','Hungarian Forint',2),
  ('idr','Rp','Rp','Indonesian Rupiah',0), ('ils','₪','₪','Israeli New Sheqel',2),
  ('inr','Rs','টকা','Indian Rupee',2), ('krw','₩','₩','South Korean Won',0),
  ('mxn','MX$','$','Mexican Peso',2), ('myr','RM','RM','Malaysian Ringgit',2),
  ('ngn','₦','₦','Nigerian Naira',2), ('nok','Nkr','kr','Norwegian Krone',2),
  ('nzd','NZ$','$','New Zealand Dollar',2), ('php','₱','₱','Philippine Peso',2),
  ('pln','zł','zł','Polish Zloty',2), ('ron','RON','RON','Romanian Leu',2),
  ('sar','SR','ر.س.','Saudi Riyal',2), ('sgd','S$','$','Singapore Dollar',2),
  ('thb','฿','฿','Thai Baht',2), ('try','TL','TL','Turkish Lira',2),
  ('twd','NT$','NT$','New Taiwan Dollar',2), ('zar','R','R','South African Rand',2)
ON CONFLICT (code) DO NOTHING;

-- stores that existed before: support the currencies of their regions (plus USD), USD by default
INSERT INTO store_currency (store_id, currency_code)
SELECT s.id, c.code FROM store s
CROSS JOIN (
  SELECT cu.code FROM currency cu
  WHERE cu.code = 'usd' OR cu.code IN (SELECT LOWER(r.currency_code) FROM region r WHERE r.deleted_at IS NULL)
) c
WHERE NOT EXISTS (SELECT 1 FROM store_currency sc WHERE sc.store_id = s.id)
ON CONFLICT DO NOTHING;

UPDATE store_currency SET is_default = TRUE
WHERE currency_code = 'usd'
  AND NOT EXISTS (SELECT 1 FROM store_currency d WHERE d.store_id = store_currency.store_id AND d.is_default);
