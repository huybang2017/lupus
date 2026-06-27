import { Router } from "express"
import { z } from "zod"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import {
  PRODUCT_TAG_FILTERS,
  PRODUCT_TAG_Q_COLUMNS,
  PRODUCT_TAG_SORT,
  PRODUCT_TYPE_FILTERS,
  PRODUCT_TYPE_Q_COLUMNS,
  PRODUCT_TYPE_SORT,
} from "../infra/list-filter-specs"
import { runList, sendList } from "../infra/list-query"
import { requirePolicy } from "../platform/admin-platform.routes"
import { productTaxonomyService as svc, taxonomyShape, type TaxonomyKind } from "./product-taxonomy.service"

// Admin endpoints for Settings > Product Types and Product Tags.
export const productTaxonomyRouter = Router()

const metadata = z.record(z.string(), z.unknown()).nullish()

function mount(kind: TaxonomyKind, path: string, key: string, alias: string, specs: any, qColumns: string[], sort: Record<string, string>) {
  const table = kind === "type" ? "product_type" : "product_tag"

  productTaxonomyRouter.get(`/admin/${path}`, requireAuth, async (req, res, next) => {
    try {
      const { body } = await runList({
        req,
        table,
        alias,
        select: `${alias}.*`,
        base: `${alias}.deleted_at IS NULL`,
        specs,
        q: { columns: qColumns },
        order: sort,
        defaultOrder: `${alias}.created_at DESC`,
        maxLimit: 200,
        key: `${key}s`,
        enrich: taxonomyShape,
      })
      sendList(res, body)
    } catch (e) {
      next(e)
    }
  })

  productTaxonomyRouter.get(`/admin/${path}/:id`, requireAuth, async (req, res, next) => {
    try {
      res.json({ [key]: await svc.retrieve(kind, req.params.id) })
    } catch (e) {
      next(e)
    }
  })

  productTaxonomyRouter.post(`/admin/${path}`, requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      await requirePolicy(req, "settings:write")
      const input = z.object({ value: z.string().min(1), metadata }).parse(req.body ?? {})
      res.status(201).json({ [key]: await svc.create(kind, input) })
    } catch (e) {
      next(e)
    }
  })

  productTaxonomyRouter.post(`/admin/${path}/:id`, requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      await requirePolicy(req, "settings:write")
      const input = z.object({ value: z.string().optional(), metadata }).parse(req.body ?? {})
      res.json({ [key]: await svc.update(kind, req.params.id, input) })
    } catch (e) {
      next(e)
    }
  })

  productTaxonomyRouter.delete(`/admin/${path}/:id`, requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      await requirePolicy(req, "settings:write")
      await svc.remove(kind, req.params.id)
      res.json({ id: req.params.id, object: key, deleted: true })
    } catch (e) {
      next(e)
    }
  })
}

mount("type", "product-types", "product_type", "t", PRODUCT_TYPE_FILTERS, PRODUCT_TYPE_Q_COLUMNS, PRODUCT_TYPE_SORT)
mount("tag", "product-tags", "product_tag", "tg", PRODUCT_TAG_FILTERS, PRODUCT_TAG_Q_COLUMNS, PRODUCT_TAG_SORT)
