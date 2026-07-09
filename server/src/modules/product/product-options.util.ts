// Shared by product.service.ts and lupus-catalog-compat.routes.ts — previously two
// independent copies of the same find-or-create-and-link logic (maintenance risk).
export interface Queryable {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>
}

/** Link option values to a variant by option title -> value (Lupus variant.options map). */
export async function assignVariantOptions(
  queryable: Queryable,
  productId: string,
  variantId: string,
  options: Record<string, string>
): Promise<void> {
  for (const [title, value] of Object.entries(options)) {
    const o = await queryable.query(`SELECT id FROM product_option WHERE product_id = $1 AND title = $2 AND deleted_at IS NULL`, [productId, title])
    let optionId = o.rows[0]?.id as string | undefined
    if (!optionId) {
      const created = await queryable.query(`INSERT INTO product_option (product_id, title) VALUES ($1,$2) RETURNING id`, [productId, title])
      optionId = created.rows[0].id
    }
    const ov = await queryable.query(`SELECT id FROM product_option_value WHERE option_id = $1 AND value = $2 AND deleted_at IS NULL`, [optionId, value])
    let valueId = ov.rows[0]?.id as string | undefined
    if (!valueId) {
      const created = await queryable.query(`INSERT INTO product_option_value (option_id, value) VALUES ($1,$2) RETURNING id`, [optionId, value])
      valueId = created.rows[0].id
    }
    await queryable.query(
      `INSERT INTO product_variant_option_value (variant_id, option_value_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [variantId, valueId]
    )
  }
}
