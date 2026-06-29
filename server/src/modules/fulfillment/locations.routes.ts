import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import {
  SHIPPING_OPTION_TYPE_FILTERS,
  SHIPPING_OPTION_TYPE_Q_COLUMNS,
  SHIPPING_OPTION_TYPE_SORT,
  SHIPPING_PROFILE_FILTERS,
  SHIPPING_PROFILE_Q_COLUMNS,
  SHIPPING_PROFILE_SORT,
  STOCK_LOCATION_FILTERS,
  STOCK_LOCATION_Q_COLUMNS,
  STOCK_LOCATION_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { locationsService as svc } from "./locations.service"

// Admin endpoints of the "Locations & Shipping" settings area (stock locations, fulfillment
// sets, service zones, fulfillment providers, shipping options / types / profiles).
export const locationsRouter = Router()

const wrap =
  (fn: (req: any, res: any) => Promise<unknown>) =>
  async (req: any, res: any, next: any) => {
    try {
      await fn(req, res)
    } catch (e) {
      next(e)
    }
  }

const metadata = z.record(z.string(), z.unknown()).nullish()
const address = z
  .object({
    address_1: z.string().nullish(),
    address_2: z.string().nullish(),
    city: z.string().nullish(),
    country_code: z.string().length(2).nullish(),
    postal_code: z.string().nullish(),
    province: z.string().nullish(),
    company: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .partial()

// ------------------------------------------------------------------ stock locations

locationsRouter.get(
  "/admin/stock-locations",
  requireAuth,
  wrap(async (req, res) => {
    const { body } = await runList({
      req,
      table: "stock_location",
      alias: "sl",
      select: "sl.*",
      base: "sl.deleted_at IS NULL",
      specs: STOCK_LOCATION_FILTERS,
      q: { columns: STOCK_LOCATION_Q_COLUMNS },
      order: STOCK_LOCATION_SORT,
      defaultOrder: "sl.created_at DESC",
      key: "stock_locations",
    })
    sendList(res, { ...body, stock_locations: await svc.decorateList(body.stock_locations as any[]) })
  })
)

const createLocationBody = z
  .object({ name: z.string(), address: address.nullish(), metadata })
  .merge(address)

locationsRouter.post(
  "/admin/stock-locations",
  requireAuth,
  wrap(async (req, res) => {
    res.status(201).json({ stock_location: await svc.createLocation(createLocationBody.parse(req.body)) })
  })
)

locationsRouter.get(
  "/admin/stock-locations/:id",
  requireAuth,
  wrap(async (req, res) => {
    res.json({ stock_location: await svc.retrieveLocation(req.params.id) })
  })
)

locationsRouter.post(
  "/admin/stock-locations/:id",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name: z.string().optional(), address: address.nullish(), metadata }).merge(address).parse(req.body)
    res.json({ stock_location: await svc.updateLocation(req.params.id, body) })
  })
)

locationsRouter.delete(
  "/admin/stock-locations/:id",
  requireAuth,
  wrap(async (req, res) => {
    await svc.deleteLocation(req.params.id)
    res.json({ id: req.params.id, object: "stock_location", deleted: true })
  })
)

locationsRouter.post(
  "/admin/stock-locations/:id/sales-channels",
  requireAuth,
  wrap(async (req, res) => {
    const body = z
      .object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional(), sales_channel_ids: z.array(z.string()).optional() })
      .parse(req.body)
    const stock_location = await svc.updateSalesChannels(req.params.id, { add: body.add ?? body.sales_channel_ids, remove: body.remove })
    res.json({ stock_location, stock_location_id: req.params.id, linked: (body.add ?? body.sales_channel_ids ?? []).length })
  })
)

locationsRouter.post(
  "/admin/stock-locations/:id/fulfillment-providers",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).parse(req.body)
    res.json({ stock_location: await svc.updateProviders(req.params.id, body) })
  })
)

locationsRouter.post(
  "/admin/stock-locations/:id/fulfillment-sets",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name: z.string(), type: z.string().optional() }).parse(req.body)
    await svc.createFulfillmentSet(req.params.id, body)
    res.status(201).json({ stock_location: await svc.retrieveLocation(req.params.id) })
  })
)

// ------------------------------------------------------------------ fulfillment sets / service zones

locationsRouter.delete(
  "/admin/fulfillment-sets/:id",
  requireAuth,
  wrap(async (req, res) => {
    await svc.deleteFulfillmentSet(req.params.id)
    res.json({ id: req.params.id, object: "fulfillment_set", deleted: true })
  })
)

const geoZone = z.object({
  id: z.string().optional(),
  type: z.enum(["country", "province", "city", "postal"]),
  country_code: z.string().length(2),
  province_code: z.string().nullish(),
  city: z.string().nullish(),
  postal_expression: z.array(z.string()).nullish(),
})

locationsRouter.post(
  "/admin/fulfillment-sets/:id/service-zones",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name: z.string(), geo_zones: z.array(geoZone).optional() }).parse(req.body)
    const zoneId = await svc.createServiceZone(req.params.id, body)
    res.status(201).json({ fulfillment_set: await svc.retrieveFulfillmentSet(req.params.id), service_zone: await svc.retrieveServiceZone(zoneId) })
  })
)

locationsRouter.get(
  "/admin/fulfillment-sets/:setId/service-zones/:zoneId",
  requireAuth,
  wrap(async (req, res) => {
    const zone = await svc.retrieveServiceZone(req.params.zoneId)
    if (zone.fulfillment_set_id !== req.params.setId) {
      throw Object.assign(new Error(`Service zone with id ${req.params.zoneId} was not found on fulfillment set ${req.params.setId}`), { statusCode: 404 })
    }
    res.json({ service_zone: zone })
  })
)

locationsRouter.post(
  "/admin/fulfillment-sets/:setId/service-zones/:zoneId",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name: z.string().nullish(), geo_zones: z.array(geoZone).optional() }).parse(req.body)
    await svc.updateServiceZone(req.params.setId, req.params.zoneId, body)
    res.json({ fulfillment_set: await svc.retrieveFulfillmentSet(req.params.setId) })
  })
)

locationsRouter.delete(
  "/admin/fulfillment-sets/:setId/service-zones/:zoneId",
  requireAuth,
  wrap(async (req, res) => {
    await svc.deleteServiceZone(req.params.setId, req.params.zoneId)
    res.json({ id: req.params.zoneId, object: "service_zone", deleted: true, parent: await svc.retrieveFulfillmentSet(req.params.setId) })
  })
)

// ------------------------------------------------------------------ fulfillment providers

locationsRouter.get(
  "/admin/fulfillment-providers",
  requireAuth,
  wrap(async (req, res) => {
    const q = z.object({ stock_location_id: z.string().optional() }).passthrough().parse(req.query)
    const fulfillment_providers = await svc.listProvidersFor(q.stock_location_id)
    res.json({ fulfillment_providers, count: fulfillment_providers.length, offset: 0, limit: fulfillment_providers.length })
  })
)

locationsRouter.get(
  "/admin/fulfillment-providers/:id/options",
  requireAuth,
  wrap(async (req, res) => {
    const fulfillment_options = svc.providerOptions(req.params.id)
    res.json({ fulfillment_options, count: fulfillment_options.length, offset: 0, limit: fulfillment_options.length })
  })
)

// ------------------------------------------------------------------ shipping options

const priceBody = z.object({
  currency_code: z.string().length(3).nullish(),
  region_id: z.string().nullish(),
  amount: z.number(),
  rules: z.array(z.object({ attribute: z.string(), operator: z.string(), value: z.union([z.string(), z.number()]) })).optional(),
})
const ruleBody = z.object({ attribute: z.string(), operator: z.string().optional(), value: z.union([z.string(), z.boolean(), z.number()]).transform(String) })
const optionBody = z.object({
  name: z.string().optional(),
  price_type: z.enum(["flat", "calculated"]).optional(),
  provider_id: z.string().optional(),
  service_zone_id: z.string().nullish(),
  shipping_profile_id: z.string().nullish(),
  type_id: z.string().nullish(),
  type: z.object({ label: z.string(), code: z.string(), description: z.string().nullish() }).nullish(),
  data: z.record(z.string(), z.any()).nullish(),
  prices: z.array(priceBody).optional(),
  rules: z.array(ruleBody).optional(),
  amount: z.number().int().nonnegative().optional(),
  currency_code: z.string().length(3).optional(),
  country_code: z.string().length(2).nullish(),
  fulfillment_set_id: z.string().nullish(),
  is_return: z.boolean().optional(),
  service_zone_name: z.string().nullish(),
})

locationsRouter.get(
  "/admin/shipping-options",
  requireAuth,
  wrap(async (req, res) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
        service_zone_id: z.string().optional(),
        stock_location_id: z.string().optional(),
        shipping_profile_id: z.string().optional(),
        is_return: z.enum(["true", "false"]).optional(),
        q: z.string().optional(),
      })
      .passthrough()
      .parse(req.query)
    const where = ["so.deleted_at IS NULL"]
    const params: any[] = []
    const add = (sql: string, v: unknown) => {
      params.push(v)
      where.push(sql.replace("?", `$${params.length}`))
    }
    if (q.service_zone_id) add("so.service_zone_id = ?", q.service_zone_id)
    if (q.shipping_profile_id) add("so.shipping_profile_id = ?", q.shipping_profile_id)
    if (q.is_return) add("so.is_return = ?", q.is_return === "true")
    if (q.q) add("so.name ILIKE ?", `%${q.q.replace(/[\\%_]/g, "\\$&")}%`)
    if (q.stock_location_id) {
      add("so.service_zone_id IN (SELECT sz.id FROM service_zone sz JOIN fulfillment_set fs ON fs.id = sz.fulfillment_set_id WHERE fs.stock_location_id = ?)", q.stock_location_id)
    }
    const count = await pool.query(`SELECT COUNT(*)::int AS c FROM shipping_option so WHERE ${where.join(" AND ")}`, params)
    const rows = await pool.query(`SELECT so.id FROM shipping_option so WHERE ${where.join(" AND ")} ORDER BY so.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.limit, q.offset])
    const shipping_options = []
    for (const r of rows.rows) shipping_options.push(await svc.retrieveShippingOption(r.id))
    res.json({ shipping_options, count: count.rows[0].c, offset: q.offset, limit: q.limit })
  })
)

locationsRouter.post(
  "/admin/shipping-options",
  requireAuth,
  wrap(async (req, res) => {
    const body = optionBody.parse(req.body)
    res.status(201).json({ shipping_option: await svc.createShippingOption(body as any) })
  })
)

locationsRouter.get(
  "/admin/shipping-options/:id",
  requireAuth,
  wrap(async (req, res) => {
    res.json({ shipping_option: await svc.retrieveShippingOption(req.params.id) })
  })
)

locationsRouter.post(
  "/admin/shipping-options/:id",
  requireAuth,
  wrap(async (req, res) => {
    const body = optionBody.parse(req.body)
    res.json({ shipping_option: await svc.updateShippingOption(req.params.id, body as any) })
  })
)

locationsRouter.delete(
  "/admin/shipping-options/:id",
  requireAuth,
  wrap(async (req, res) => {
    await svc.deleteShippingOption(req.params.id)
    res.json({ id: req.params.id, object: "shipping_option", deleted: true })
  })
)

// ------------------------------------------------------------------ shipping option types

locationsRouter.get(
  "/admin/shipping-option-types",
  requireAuth,
  wrap(async (req, res) => {
    const { body } = await runList({
      req,
      table: "shipping_option_type",
      alias: "t",
      select: "t.*",
      base: "t.deleted_at IS NULL",
      specs: SHIPPING_OPTION_TYPE_FILTERS,
      q: { columns: SHIPPING_OPTION_TYPE_Q_COLUMNS },
      order: SHIPPING_OPTION_TYPE_SORT,
      defaultOrder: "t.created_at DESC",
      key: "shipping_option_types",
    })
    sendList(res, body)
  })
)

locationsRouter.post(
  "/admin/shipping-option-types",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ label: z.string(), code: z.string(), description: z.string().nullish() }).parse(req.body)
    res.status(201).json({ shipping_option_type: await svc.createType(body) })
  })
)

locationsRouter.get(
  "/admin/shipping-option-types/:id",
  requireAuth,
  wrap(async (req, res) => {
    res.json({ shipping_option_type: await svc.retrieveType(req.params.id) })
  })
)

locationsRouter.post(
  "/admin/shipping-option-types/:id",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ label: z.string().optional(), code: z.string().optional(), description: z.string().nullish() }).parse(req.body)
    res.json({ shipping_option_type: await svc.updateType(req.params.id, body) })
  })
)

locationsRouter.delete(
  "/admin/shipping-option-types/:id",
  requireAuth,
  wrap(async (req, res) => {
    await svc.deleteType(req.params.id)
    res.json({ id: req.params.id, object: "shipping_option_type", deleted: true })
  })
)

// ------------------------------------------------------------------ shipping profiles

locationsRouter.get(
  "/admin/shipping-profiles",
  requireAuth,
  wrap(async (req, res) => {
    const { body } = await runList({
      req,
      table: "shipping_profile",
      alias: "sp",
      select: "sp.*",
      base: "sp.deleted_at IS NULL",
      specs: SHIPPING_PROFILE_FILTERS,
      q: { columns: SHIPPING_PROFILE_Q_COLUMNS },
      order: SHIPPING_PROFILE_SORT,
      defaultOrder: "sp.created_at DESC",
      key: "shipping_profiles",
    })
    sendList(res, body)
  })
)

locationsRouter.post(
  "/admin/shipping-profiles",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name: z.string(), type: z.string().default("default"), metadata }).parse(req.body)
    res.status(201).json({ shipping_profile: await svc.createProfile(body) })
  })
)

locationsRouter.get(
  "/admin/shipping-profiles/:id",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM shipping_profile WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
    if (!rows[0]) throw Object.assign(new Error(`Shipping profile with id ${req.params.id} was not found`), { statusCode: 404 })
    res.json({ shipping_profile: rows[0] })
  })
)

locationsRouter.post(
  "/admin/shipping-profiles/:id",
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name: z.string().optional(), type: z.string().optional(), metadata }).parse(req.body)
    res.json({ shipping_profile: await svc.updateProfile(req.params.id, body) })
  })
)

locationsRouter.delete(
  "/admin/shipping-profiles/:id",
  requireAuth,
  wrap(async (req, res) => {
    await svc.deleteProfile(req.params.id)
    res.json({ id: req.params.id, object: "shipping_profile", deleted: true })
  })
)
