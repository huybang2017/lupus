import cors from "cors"
import express from "express"
import { existsSync } from "fs"
import { join } from "path"
import { authRouter } from "./modules/auth/auth.routes"
import { lupusAuthRouter } from "./modules/auth/lupus-auth.routes"
import { catalogCompatRouter } from "./modules/catalog/lupus-catalog-compat.routes"
import { customersCompatRouter } from "./modules/customer/lupus-customers-compat.routes"
import { draftCompatRouter } from "./modules/order/lupus-draft-compat.routes"
import { fulfillmentCompatRouter } from "./modules/fulfillment/lupus-fulfillment-compat.routes"
import { locationsRouter } from "./modules/fulfillment/locations.routes"
import { storeAdminRouter } from "./modules/platform/store.routes"
import { ordersCompatRouter } from "./modules/order/lupus-orders-compat.routes"
import { rmaCompatRouter } from "./modules/order/lupus-rma-compat.routes"
import { platformCompatRouter } from "./modules/platform/lupus-platform-compat.routes"
import { pricingCompatRouter } from "./modules/pricing/lupus-pricing-compat.routes"
import { cartRouter } from "./modules/cart/cart.routes"
import { storeCompatRouter } from "./modules/cart/lupus-store-compat.routes"
import { catalogAdminRouter } from "./modules/catalog/catalog-admin.routes"
import { channelLocationRouter } from "./modules/channels/channel-location.routes"
import { customerRouter } from "./modules/customer/customer.routes"
import { groupsGiftcardDraftRouter } from "./modules/groups/groups-giftcard-draft.routes"
import { missingPiecesRouter } from "./modules/catalog/missing-pieces.routes"
import { uploadsStaticDir } from "./modules/infra/file.service"
import { infraRouter } from "./modules/infra/infra.routes"
import { oauthRouter } from "./modules/providers/oauth.routes"
import { orderRouter } from "./modules/order/order.routes"
import { postPurchaseRouter } from "./modules/order/post-purchase.routes"
import { rmaRouter } from "./modules/order/rma.routes"
import { adminPlatformRouter } from "./modules/platform/admin-platform.routes"
import { productRouter } from "./modules/product/product.routes"
import { regionRouter } from "./modules/region/region.routes"
import { regionAdminRouter } from "./modules/region/region-admin.routes"
import { reasonsRouter } from "./modules/reasons/reasons.routes"
import { apiKeysRouter } from "./modules/platform/api-keys.routes"
import { dashboardRouter } from "./modules/platform/dashboard.routes"
import { entityMetadataRouter } from "./modules/infra/entity-metadata.routes"
import { taxAdminRouter } from "./modules/tax/tax-admin.routes"
import { workflowExecutionsRouter } from "./modules/platform/workflow-executions"
import { publishableKey } from "./modules/platform/publishable-key"
import { productTaxonomyRouter } from "./modules/catalog/product-taxonomy.routes"

export function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(
    cors({
      origin: [process.env.STORE_CORS ?? "", process.env.ADMIN_CORS ?? ""].filter(Boolean),
      credentials: true,
    })
  )

  app.get("/health", (_req, res) => res.json({ ok: true }))
  app.use("/store", publishableKey)
  app.use("/uploads", express.static(uploadsStaticDir()))

  // Admin dashboard: built @dtc/admin (real Lupus dashboard) when present,
  // otherwise the legacy static ops console. SPA fallback serves index.html
  // for client-side routes under /app/*.
  const adminDist = [join(__dirname, "../../client/dist"), join(process.cwd(), "client/dist"), join(process.cwd(), "../client/dist")].find(
    (d) => existsSync(join(d, "index.html"))
  )
  if (adminDist) {
    app.use("/app", express.static(adminDist))
    app.get("/app", (_req, res) => res.sendFile(join(adminDist, "index.html")))
    app.get("/app/*", (req, res, next) => {
      if (req.path.startsWith("/app/assets/")) {
        next()
        return
      }
      res.sendFile(join(adminDist, "index.html"))
    })
  } else {
    app.use("/app", express.static("public/app"))
  }
  app.use("/console", express.static("public/app"))

  // Module routers (each module owns its tables + service + routes, no DI container):
  app.use(productRouter)
  app.use(authRouter)
  app.use(lupusAuthRouter)
  app.use(customerRouter)
  app.use(regionAdminRouter)
  app.use(regionRouter)
  app.use(cartRouter)
  app.use(orderRouter)
  app.use(locationsRouter)
  app.use(storeAdminRouter)
  app.use(reasonsRouter)
  app.use(apiKeysRouter)
  app.use(dashboardRouter)
  app.use(entityMetadataRouter)
  app.use(taxAdminRouter)
  app.use(workflowExecutionsRouter)
  app.use(productTaxonomyRouter)
  app.use(postPurchaseRouter)
  app.use(rmaRouter)
  app.use(catalogAdminRouter)
  app.use(channelLocationRouter)
  app.use(groupsGiftcardDraftRouter)
  app.use(missingPiecesRouter)
  app.use(adminPlatformRouter)
  app.use(infraRouter)
  app.use(oauthRouter)

  // Lupus-compat routers (dashboard parity; only NEW paths, registered last):
  app.use(catalogCompatRouter)
  app.use(ordersCompatRouter)
  app.use(rmaCompatRouter)
  app.use(customersCompatRouter)
  app.use(draftCompatRouter)
  app.use(fulfillmentCompatRouter)
  app.use(pricingCompatRouter)
  app.use(platformCompatRouter)
  app.use(storeCompatRouter)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err?.statusCode ?? 400
    res.status(status).json({ message: err?.message ?? "Unknown error" })
  })
  return app
}
