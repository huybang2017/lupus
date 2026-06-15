-- P1: variant<->option-value pivot (Lupus variant.options map).
CREATE TABLE IF NOT EXISTS product_variant_option_value (
  variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
  option_value_id TEXT NOT NULL REFERENCES product_option_value(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (variant_id, option_value_id)
);
