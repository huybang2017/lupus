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
