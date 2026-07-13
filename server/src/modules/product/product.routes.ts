import { Router } from "express"
import { z } from "zod"
import { productService } from "./product.service"
import { requireAuth } from "../../middleware/require-auth"
import { publishableChannels } from "../platform/publishable-key"
import { listStoreProducts, retrieveStoreProduct } from "./store-products"

// Plain port of Lupus API routes (upstream/src/api/store/products/*).
// Lupus: `export async function GET(req, res)` with framework request/response wrappers, req.scope.resolve + workflows.
// Here: plain Express Router + Zod validation + direct service call. No container, no workflow engine.

export const productRouter = Router()

// Store routes never trust a caller-supplied status (Lupus's Store API only ever
// returns published products) — listPublic/retrievePublic hard-code it server-side.
// Lupus shape: { products, count, offset, limit } with filters (id, handle, collection_id,
// category_id, type_id, tag_id, q), `order`, and `region_id` for variants[].calculated_price.
productRouter.get("/store/products", async (req, res, next) => {
  try {
    res.json(await listStoreProducts(req, publishableChannels(req)))
  } catch (e) {
    next(e)
  }
})

productRouter.get("/store/products/:id", async (req, res, next) => {
  try {
    const product = await retrieveStoreProduct(req, req.params.id, publishableChannels(req))
    if (!product) {
      res.status(404).json({ message: "Product not found" })
      return
    }
    res.json({ product })
  } catch (e) {
    next(e)
  }
})

const priceSchema = z.object({
  currency_code: z.string(),
  amount: z.number().int().nonnegative(),
  min_quantity: z.number().int().nonnegative().nullable().optional(),
  max_quantity: z.number().int().nonnegative().nullable().optional(),
})

const variantFullSchema = z.object({
  title: z.string().min(1),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  ean: z.string().nullable().optional(),
  upc: z.string().nullable().optional(),
  manage_inventory: z.boolean().optional(),
  allow_backorder: z.boolean().optional(),
  variant_rank: z.number().int().optional(),
  origin_country: z.string().nullable().optional(),
  mid_code: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  hs_code: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  length: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  prices: z.array(priceSchema),
  options: z.record(z.string()).optional(),
  inventory_items: z.array(z.object({ inventory_item_id: z.string(), required_quantity: z.number().int().positive().optional() })).optional(),
})

const optionFullSchema = z.object({ title: z.string().min(1), values: z.array(z.string()) })

// ---- POST /admin/products: single-call create (Lupus createProductsWorkflow shape) ----
const createSchema = z.object({
  title: z.string().min(1),
  handle: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  is_giftcard: z.boolean().optional(),
  status: z.enum(["draft", "proposed", "published", "rejected"]).optional(),
  thumbnail: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  discountable: z.boolean().optional(),
  external_id: z.string().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  collection_id: z.string().nullable().optional(),
  type_id: z.string().nullable().optional(),
  shipping_profile_id: z.string().nullable().optional(),
  height: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  length: z.number().nullable().optional(),
  mid_code: z.string().nullable().optional(),
  hs_code: z.string().nullable().optional(),
  origin_country: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  images: z.array(z.object({ url: z.string() })).optional(),
  options: z.array(optionFullSchema).optional(),
  variants: z.array(variantFullSchema).optional(),
  categories: z.array(z.object({ id: z.string() })).optional(),
  tags: z.array(z.object({ id: z.string().optional(), value: z.string().optional() })).optional(),
  sales_channels: z.array(z.object({ id: z.string() })).optional(),
})

productRouter.post("/admin/products", requireAuth, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body)
    const product = await productService.createFull(input)
    res.status(201).json({ product })
  } catch (e) {
    next(e)
  }
})

// ---- POST /admin/products/:id: single-call update, id-based diffing for nested arrays ----
const updateSchema = z.object({
  title: z.string().min(1).optional(),
  handle: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "proposed", "published", "rejected"]).optional(),
  thumbnail: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  discountable: z.boolean().optional(),
  external_id: z.string().nullable().optional(),
  collection_id: z.string().nullable().optional(),
  type_id: z.string().nullable().optional(),
  shipping_profile_id: z.string().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  height: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  length: z.number().nullable().optional(),
  mid_code: z.string().nullable().optional(),
  hs_code: z.string().nullable().optional(),
  origin_country: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  images: z.array(z.object({ id: z.string().optional(), url: z.string() })).optional(),
  options: z.array(optionFullSchema.extend({ id: z.string().optional() })).optional(),
  variants: z.array(variantFullSchema.extend({ id: z.string().optional(), prices: z.array(priceSchema).optional() })).optional(),
  categories: z.array(z.object({ id: z.string() })).optional(),
  tags: z.array(z.object({ id: z.string().optional(), value: z.string().optional() })).optional(),
  sales_channels: z.array(z.object({ id: z.string() })).optional(),
})

productRouter.post("/admin/products/:id", requireAuth, async (req, res, next) => {
  try {
    // Reserved sub-paths owned by the catalog-compat router (registered later):
    // let them fall through instead of treating them as product ids.
    if (req.params.id === "export" || req.params.id === "imports" || req.params.id === "import" || req.params.id === "batch") {
      next("route")
      return
    }
    res.json({ product: await productService.updateFull(req.params.id, updateSchema.parse(req.body)) })
  } catch (e) {
    next(e)
  }
})

productRouter.delete("/admin/products/:id", requireAuth, async (req, res, next) => {
  try {
    await productService.softDelete(req.params.id)
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})

const variantSchema = z.object({
  title: z.string().min(1),
  sku: z.string().optional(),
  prices: z.array(z.object({ currency_code: z.string(), amount: z.number().int().nonnegative() })).optional(),
  options: z.record(z.string()).optional(),
})

productRouter.get("/admin/products/:id/variants", requireAuth, async (req, res, next) => {
  try {
    res.json({ variants: await productService.listVariants(req.params.id) })
  } catch (e) {
    next(e)
  }
})

productRouter.post("/admin/products/:id/variants", requireAuth, async (req, res, next) => {
  try {
    res.status(201).json({ variant: await productService.createVariant(req.params.id, variantSchema.parse(req.body)) })
  } catch (e) {
    next(e)
  }
})

productRouter.post("/admin/variants/:id", requireAuth, async (req, res, next) => {
  try {
    const patch = z.object({ title: z.string().optional(), sku: z.string().nullable().optional() }).parse(req.body)
    res.json({ variant: await productService.updateVariant(req.params.id, patch) })
  } catch (e) {
    next(e)
  }
})

productRouter.delete("/admin/variants/:id", requireAuth, async (req, res, next) => {
  try {
    await productService.deleteVariant(req.params.id)
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})

productRouter.get("/admin/products/:id/options", requireAuth, async (req, res, next) => {
  try {
    res.json({ options: await productService.listOptions(req.params.id) })
  } catch (e) {
    next(e)
  }
})

productRouter.post("/admin/products/:id/options", requireAuth, async (req, res, next) => {
  try {
    const { title, values } = z.object({ title: z.string().min(1), values: z.array(z.string()).optional() }).parse(req.body)
    res.status(201).json({ option: await productService.createOption(req.params.id, title, values ?? []) })
  } catch (e) {
    next(e)
  }
})

productRouter.post("/admin/product-options/:id/values", requireAuth, async (req, res, next) => {
  try {
    const { value } = z.object({ value: z.string().min(1) }).parse(req.body)
    res.status(201).json({ value: await productService.addOptionValue(req.params.id, value) })
  } catch (e) {
    next(e)
  }
})

productRouter.delete("/admin/product-options/:id", requireAuth, async (req, res, next) => {
  try {
    await productService.deleteOption(req.params.id)
    res.json({ id: req.params.id, deleted: true })
  } catch (e) {
    next(e)
  }
})
