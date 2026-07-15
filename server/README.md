# lupus-backend — Node thuần port từ Lupus

Không phụ thuộc framework nào. Stack: Express + `pg` + Zod + JWT.

## Đã convert: Product + Auth/Customer/Region + Cart/Checkout + Order/Payment

| Upstream (checkout ở repo root) | Lupus (`server`) |
|---|---|
| `packages/modules/product/src/models/*.ts` (`model.define`) | `src/db/schema.sql` (`CREATE TABLE product...`) |
| `ProductModuleService` + base service của upstream + `@InjectManager/@EmitEvents` (4271 dòng) | `src/modules/product/product.service.ts` (class thường + `pg` Pool, transaction bằng `BEGIN/COMMIT`) |
| `upstream/src/api/store/products/*` (kiểu request của framework, `req.scope`, workflow) | `src/modules/product/product.routes.ts` (Express Router + Zod) |
| `packages/modules/auth/.../auth-identity.ts` + `provider-identity.ts`, `auth-module.ts` (~1260 dòng, multi-provider + MFA + verification + cache) | `src/db/schema-auth-customer-region.sql` + `src/modules/auth/auth.service.ts` (emailpass + bcrypt + JWT, transaction SQL) |
| `packages/modules/customer/.../customer.ts` (unique email+has_account, groups, addresses) | `src/modules/customer/customer.service.ts` (giữ unique + soft-delete, bỏ groups/event bus) |
| `packages/modules/region/.../region.ts`, `country.ts` | `src/modules/region/region.service.ts` (currency/country lowercase + dedupe) |
| `packages/modules/cart/.../cart.ts` (237 dòng), `line-item.ts` (BigNumber computed totals), `core-flows/src/cart` (promotion/tax/inventory workflows) | `src/db/schema-cart.sql` + `src/modules/cart/cart.service.ts` (totals = pure function `calcTotals`, giá resolve từ `money_amount` theo currency, merge qty) |
| `packages/modules/order/.../order.ts` (status enum, claims/exchanges), checkout `createOrderWorkflow` (~10 steps + compensation) | `src/db/schema-order-payment.sql` + `src/modules/order/order.service.ts` (1 SQL transaction: snapshot cart → order + payment_collection, ROLLBACK thay compensation) |
| `packages/modules/payment/.../payment-collection.ts` (providers, sessions, webhooks) | `src/modules/order/payment.service.ts` (manual authorize/capture/refund, guard status) |
| Lupus auth middleware + session | `src/middleware/require-auth.ts` (`Bearer <jwt>` → `req.auth`) |
| `joiner-config`, remote query, event bus | Bỏ — join bằng SQL trực tiếp khi cần |

Endpoints: Product (`GET/POST /store/products`, `POST/DELETE /admin/products`), Auth (`POST /auth/register`, `POST /auth/login`), Customer (`GET /store/customers/me`, `POST /store/customers`, `GET /admin/customers`), Region (`GET /store/regions`, `POST /admin/regions`), Cart (`POST/GET /store/carts`, `POST /store/carts/:id/line-items`, `POST .../line-items/:lineId` update qty, `DELETE .../line-items/:lineId`, `POST .../shipping-methods`, `POST .../addresses/:kind` + auto tax refresh, `POST .../promotions`, `DELETE .../promotions/:code`, `POST .../transfer`), Checkout/Order (`POST /store/carts/:id/complete`, `GET /store/orders/:id`, `GET /admin/orders`, `POST /admin/orders/:id/cancel`), Payment (`POST /admin/payments/:collectionId/authorize|capture|refund`), Catalog admin (`POST/GET /admin/promotions`, `POST /admin/tax-regions`, `POST /admin/price-lists`, `POST /admin/inventory/:variantId`). Admin routes yêu cầu `Authorization: Bearer`.

Chạy:

```bash
cd server
cp .env.template .env
npm install
psql $DATABASE_URL -f src/db/schema.sql -f src/db/schema-auth-customer-region.sql -f src/db/schema-cart.sql -f src/db/schema-order-payment.sql -f src/db/schema-pricing-promotion-tax.sql -f src/db/schema-cart-totals-patch.sql -f src/db/schema-order-totals-patch.sql -f src/db/schema-fulfillment-returns.sql -f src/db/schema-fulfillment-patch.sql -f src/db/schema-channels-locations.sql -f src/db/schema-groups-giftcard-draft.sql -f src/db/schema-admin-store-notif.sql -f src/db/schema-infra.sql
npm run dev # :9001
```

## Logic đúng theo Lupus (đợt 2 — full totals)

- Pricing (`pricing.service.ts`, ref `modules/pricing` + price-list): base `money_amount` theo currency, override bằng price-list active trong window, tôn trọng min/max quantity, sale lấy thấp nhất, override thay thế.
- Promotion (`promotion.service.ts`, ref `application-method.ts` type/allocation + `promotion-rule.ts`): `percentage` round từng line, `fixed/each` per-unit capped, `fixed/across` chia tỉ lệ có bù penny lẻ, `buyget` free unit rẻ nhất khi đủ `buy_min_quantity`, rule `product_id in/eq/ne`, enforce status/window/`usage_limit`, recompute sau mỗi mutation như `update-cart-promotions`.
- Tax (`tax.service.ts`, ref `update-tax-lines.ts` + `get-item-tax-lines` + `tax-rate.ts`): resolve country từ shipping address → region countries, default rate luôn apply, non-combinable chỉ lấy cao nhất, combinable cộng dồn, exclusive `round((subtotal-discount)*rate%)`, inclusive tách thuế, persist `line_item_tax_line`/`shipping_tax_line` để audit.
- Inventory (`inventory.service.ts`, ref `confirm-variant-inventory`): untracked = unlimited, còn lại check `stocked-reserved`, checkout trừ kho trong transaction.
- Checkout (`order.service.ts`, ref `complete-cart.ts` + `create-order.ts`): re-verify tồn kho, snapshot items + discount + tax vào order, tạo `payment_collection` đúng total, carry promotion `usage_count+1`, `ROLLBACK` thay compensation.

## Vòng đời sau mua (đợt 3)

- Fulfillment (`fulfillment.service.ts`, ref `modules/fulfillment/fulfillment.ts` + `create-fulfillment`/`create-shipment`/`mark-delivered`/`cancel-fulfillment`): lifecycle open → shipped → delivered, cancel trước delivery, chặn over-fulfillment từng line như Lupus.
- Order change / return / exchange / claim (`order-change.service.ts`, ref `order-change.ts` + confirm/decline/cancel workflows): request (pending/requested + version+1) → confirm (apply add/remove/update-qty vào `order_line_item` trong transaction, recompute totals, refund nếu có) | decline | cancel.
- Payment provider (`payment-session.service.ts`, ref `create-payment-session` + provider interface): registry `registerPaymentProvider`, ship sẵn `manual` (tương đương `pp_system_default`), session pending → authorized đồng bộ `payment_collection`.
- Endpoints: `POST /admin/shipping-options`, `POST /admin/orders/:id/fulfillments`, `POST /admin/fulfillments/:id/ship|deliver|cancel`, `GET /admin/orders/:id/fulfillments`, `POST /admin/orders/:id/changes`, `POST /admin/order-changes/:id/confirm|decline|cancel`, `GET /admin/orders/:id/changes`, `POST /admin/refund-reasons`, `POST /admin/payment-collections/:id/sessions`, `POST /admin/payment-sessions/:id/authorize`.

## Cụm vận hành + nền tảng (đợt 4 — đủ flow)

- Sales channel + publish (`schema-channels-locations.sql`, ref `sales-channel.ts` + link module): CRUD channel, gắn product (`product_sales_channel`), cart/order mang `sales_channel_id`, add-to-cart chặn product chưa publish vào channel.
- Stock location + đa kho (`stock_location`, `inventory_item`, `variant_inventory_item`, `inventory_level_location`, `reservation_item` ref `reservation-item.ts`): levels theo location, reserve trừ `reserved_quantity`, fulfill trừ kho, `allow_backorder` bypass, fallback bảng `inventory_level` đơn kho cũ.
- Customer group (`schema-groups-giftcard-draft.sql`): group + gán customer + `group_price` override; pricing ưu tiên group thấp nhất trước price-list (đúng price-preference).
- Gift card: tạo mã, redeem trừ balance trong transaction + `gift_card_transaction` audit, check expiry/disabled.
- Draft order: tạo order `is_draft_order=true` từ items + giá (custom hoặc `money_amount`), confirm chuyển thành order thường.
- User/Invite/RBAC (`schema-admin-store-notif.sql`, ref `user.ts`, `invite.ts`, `rbac/*`): admin register qua auth_identity emailpass, invite token 7 ngày, role + policy + inheritance, `requirePolicy` check (bootstrap mở, sau đó enforce, `admin` bypass).
- Store/settings/api-key: `GET /admin/store` (tự seed), `POST /admin/api-keys` (publishable/secret).
- Notification: `POST/GET /admin/notifications` (log provider: persist + console).
- Endpoints: sales-channels, stock-locations + link, inventory-items + link-variant, reservations + fulfill, customer-groups + prices, gift-cards + redeem, draft-orders + confirm, users/invites/roles, store, api-keys, notifications.

## Hạ tầng còn lại (đợt 5 — full)

- File (`file.service.ts`, ref `providers/file-local` + `file-s3` interface): registry `registerFileProvider`, ship sẵn `local` (`./uploads`, serve `/uploads`, cap 10MB), record `file_record`. S3 cắm thêm bằng cùng interface.
- Search (`search.service.ts`, ref `providers/search-postgres`): GIN `idx_product_search` + `ts_rank` trên title/description/handle, chỉ published. `GET /store/search/products?q=`.
- Event bus (`platform-infra.service.ts`, ref `event-bus-local`): outbox `event_outbox` + fan-out in-process `onEvent`; đã đấu `order.placed` → notification + analytics, `product.created` emit.
- Workflow engine (`runWorkflow`, ref workflow-orchestration): `complete-cart` ghi `workflow_execution` từng step (validate → payment-collection → order → emit), xem tại `GET /admin/workflows/executions`; fail ghi error.
- Locking (`lockingService`, ref `locking-postgres`): `pg_advisory_xact_lock` theo key.
- Cache (`cacheService`, ref caching module): in-memory TTL.
- Currency (`currency.service.ts`, ref `modules/currency`): seed usd/eur/gbp/dkk/sek/jpy/vnd + list. `GET /store/currencies`.
- Analytics (`analytics.service.ts`, ref `analytics-local`): track event, revenue theo ngày, top products.
- Uploads serve tĩnh tại `/uploads`.

## Providers ngoài + Admin UI + Integration (đợt 6 — gộp hết)

- Stripe (`external-providers.ts`, ref `providers/payment-stripe`): PaymentIntents authorize uncaptured → capture → refund qua REST, đăng ký provider `stripe`. Cần `STRIPE_SECRET_KEY`, thiếu thì báo 501 rõ ràng, manual vẫn chạy.
- SendGrid (ref `providers/notification-sendgrid`): gửi mail qua REST + luôn persist `notification`; chưa có key thì log-fallback.
- S3 (ref `providers/file-s3`): PUT SigV4 chuẩn AWS, đăng ký provider `s3`. Cần `S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY/REGION`.
- Redis (ref `caching-redis` + `locking-redis`): `redisCache` get/set + `redisLock` SET NX PX + release Lua, fallback về in-memory/postgres lock khi chưa có `REDIS_URL`.
- OAuth GitHub/Google (ref `auth-github`/`auth-google`/`auth-oidc`): đổi code → email → link `provider_identity` + JWT. `POST /auth/github`, `POST /auth/google`, `POST /auth/notify` (gửi mail + PostHog).
- PostHog (ref `analytics-posthog`): capture + persist local.
- Biến môi trường mới trong `.env.template`. Khởi động gọi `registerExternalProviders()` trong `src/index.ts`.
- Admin UI: dashboard React thuần tại `/app` (`client`, plain React 18 + Vite + react-router, **không dùng framework nào**). Login tại `/app/login`, JWT lưu `lupus_admin_token`. Console tĩnh cũ còn ở `/console`.
- Storefront: React 18 + Vite tại `storefront`, zero phụ thuộc framework, plain fetch API. Chạy `cd storefront && npm run dev` → `:8000`, proxy API `:9001`.
- Integration test: `src/tests/checkout.integration.test.ts` (node:test + tsx) chạy full flow register → region/tax → product/price/inventory/promo → cart totals math → checkout → authorize/capture → fulfill → delivered. Chạy trên DB riêng:
```bash
# tạo DB test 1 lần (psql không có sẵn thì dùng node pg như đã làm: CREATE DATABASE lupus_test)
DATABASE_URL=postgres://postgres:postgres@localhost/lupus_test JWT_SECRET=test npm run test:integration
```
Kết quả hiện tại: 4/4 pass. Lưu ý: không chạy test lên DB của app lupus sibling (project `lupus`, nằm ngoài thư mục này) vì trùng tên bảng `order`; tên database do app đó sở hữu và nằm ngoài phạm vi app này.

## Regression toàn flow (đợt 7 — đối chiếu đủ/thiếu)

Đối chiếu 35 modules + 37 nhóm core-flows Lupus → lupus (chi tiết file nào map vào đâu xem comment đầu mỗi file):

| Lupus | Lupus | Trạng thái |
|---|---|---|
| product, product-category, pricing, price-list | `product.*`, `missing-pieces` categories/collections/tags/images, `pricing.*`, `catalog-admin` price-lists | Đủ, test pass |
| cart, line-item, promotion, tax, inventory, reservation | `cart.*` (totals đầy đủ), `promotion.*`, `tax.*`, `inventory.*`, `location-inventory.*` | Đủ, test pass |
| order, payment, payment-collection, fulfillment, shipping-options, shipping-profile, return-reason | `order.*`, `post-purchase.*`, `fulfillment.*`, `missing-pieces` profiles | Đủ, test pass |
| auth (+github/google/oidc), customer, customer-group, region, currency | `auth.*`, `oauth.*`, `customer.*`, `groups-*`, `region.*`, `currency-*` | Đủ, test pass |
| sales-channel, stock-location, link-modules | `channels/*` (publish gate, links) | Đủ, test pass |
| user, invite, rbac, store, settings (prefs), api-key, notification (+sendgrid) | `platform/*`, `missing-pieces` prefs/api-key-link | Đủ, test pass |
| file (+s3), search-postgres, event-bus, workflow-engine, locking, caching (+redis), analytics (+posthog), payment-stripe, translation | `infra/*`, `providers/*`, `missing-pieces` translations | Đủ, test pass |
| gift-card, draft-order | `groups-*`, `missing-pieces` cart gift-cards, `order` snapshot | Đủ, test pass |
| Admin dashboard React | `client` plain React 18 + Vite, zero phụ thuộc framework, completely rewritten | Đủ, build 251KB JS / 5.9KB CSS |
| MFA/TOTP, email verification, password-reset tokens | `mfa.service.ts` + `lupus-auth.routes.ts` (P11–P12) | Đủ |
| Claim riêng biệt (dạng return đặc biệt) | Gộp vào order-change `claim` | Gộp, đủ hành vi |

Regression: `src/tests/regression.test.ts` (16 tests) + `checkout.integration.test.ts` (4 tests) + `regression-p2.test.ts` (12 tests P1–P9) + `lupus-auth.test.ts` (10 tests: providers/login/register/refresh/users-me/reset/MFA/verification/session/invite/policy-isolation) = **42/42 pass** trên `lupus_test` (chạy tuần tự vì auto-promo attach toàn cục):
```bash
DATABASE_URL=postgres://postgres:postgres@localhost/lupus_test JWT_SECRET=test npm run test:all
# = test:integration && test:regression && test:p2 && test:auth && test:gaps (53 tests)
```
Regression các đợt bắt được bug thật: tạo cart bỏ rơi `sales_channel_id` (P11), thiếu cột `provider_id` ở query tax (đợt 5), sai param claim receive (đợt 7), type param postal `$3::text` (đợt 7), nhiễu auto-promo giữa các file test (đợt 11, sửa bằng cô lập + chạy tuần tự).

## Bổ sung full coverage (P1–P10)

- **P1 catalog**: update product, variant CRUD + prices, options CRUD + values + variant-option pivot, categories/tags/collections/types full admin (get/update/delete), image delete. (~100 endpoints, xem danh sách dưới)
- **P2 pricing**: price-list customer-group rules (chỉ member mới hưởng), variant base prices set/get, price-list list/delete.
- **P3 promotion**: campaigns (budget spend + usage caps, auto-trim), automatic promos auto-attach, eligibility rules (min subtotal, customer group, currency), promo update/delete, campaign CRUD.
- **P4 RMA riêng**: returns (request/confirm/partial receive/restock/refund/dismiss/cancel), claims (inbound+outbound replace, receive), exchanges (confirm cộng lines, dismiss) + store request endpoints.
- **P5 fulfillment**: fulfillment sets, service zones + geo zones (country/province/city/postal), shipping option rules (weight/subtotal/quantity), `GET /store/carts/:id/shipping-options` lọc theo zone+rules, providers list.
- **P6 tax**: region rules (province/postal narrowing), product tax codes pinning, tax providers list, province trên cart address.
- **P7 auth**: password reset (request/confirm, revoke sessions), sessions list/revoke, sid trong JWT + enforce ở middleware, Stripe webhook receiver (verify bằng re-fetch + idempotency).
- **P8 order**: credit lines (grant/apply/consume trong totals + checkout), order summary, payment collections list/get.
- **P9 platform**: store update + locales, feature flags, views/layouts/property-labels, notification templates (auto-dispatch theo event + `{{var}}`), search-index rebuild, events `order.canceled/payment.captured|refunded/fulfillment.shipped|delivered`.
- **P10 admin UI**: console tĩnh `/app` phủ ~30 resource (xem + tạo product/promo + order summary), không build step. (Đã thay bằng dashboard React thật ở P12 — console cũ còn ở `/console`.)
- **P11 Lupus-compat auth**: `GET /auth/:actor/providers`, `POST /auth/:actor/:provider` (login GET+POST), register, reset-password (201) + update (JWT hoặc reset token), `POST /auth/token/refresh`, `POST/DELETE /auth/session`, `GET /admin/users/me`, `POST /admin/invites/accept?token=`. Dùng JWT mode cho dashboard (`__AUTH_TYPE__=jwt`).
- **P12 MFA + verification** (`schema-p10-lupus-auth.sql`, `mfa.service.ts`): TOTP RFC 6238 bằng node:crypto (không thêm dep), factors start/verify/disable, challenge khi login, recovery codes single-use (hash SHA-256), verification request/confirm qua notification.
- **P13 dashboard parity**: 282 endpoints dashboard cần đã port vào 7 `lupus-*-compat.routes.ts` (catalog 32, orders 30, RMA 52, customers 44, fulfillment 36, pricing 20, platform 60+) + draft-orders full + store API (`lupus-store-compat.routes.ts`: carts update/customer/taxes, customers/me, orders transfer, catalog reads, payment-collections/sessions, shipping calculate, search). List nào cũng `{items,count,offset,limit}`.
- **P14 admin thật**: `client` (`@dtc/admin`) — plain React 18 + Vite + react-router, **zero framework deps**. Generic Resource-driven CRUD phủ 40+ resources (danh sách + detail + tạo + sửa + xóa + actions riêng theo nhóm). Build ra `dist/` (250KB JS, 5.9KB CSS). Dev: `npm run dev` trong workspace `@dtc/admin` (proxy API tới :9001).
- **P15 smoke**: `audit/smoke-dashboard.ts` — 54 checks HTTP thật (auth → CRUD → envelopes → `/app` plain HTML + fallback). Route audit: **580 method-routes lupus vs 487 Lupus, missing = 0 thật** (3 dòng còn lại là literal `rules/buy-rules/target-rules` đã cover bởi `:ruleType`).
- **P16 category rank** (`schema-p11-category-rank.sql`, thêm vào `db:migrate` + 4 test files): cột `product_category.rank`, update/create chấp nhận `rank` (+ `parent_category_id` ở update), list sắp xếp `rank ASC, created_at DESC`, trả envelope `{product_categories,count,offset,limit}`. Phục vụ trang Categories > Organize của admin.
- **P17 create-wizard gaps** (`schema-p12-admin-create-gaps.sql`): `inventory_item` thêm title/description/weight/length/height/width/mid_code/material, `campaign.identifier` UNIQUE; inventory create/update nhận full attributes + metadata + levels; campaign create/update nhận identifier; price-list create nhận description/status + thêm update endpoint; promotion create nhận status/campaign_id; sales-channel create nhận is_disabled, detail trả products thật + thêm remove endpoint. Admin có 12 wizard/detail pages riêng (products, draft-orders, inventory, reservations, customers, customer-groups, promotions, campaigns, price-lists, tax-regions, tax-rates, sales-channels) qua `createPage` trong registry.

## Không port / khác biệt có chủ ý (sau full parity)

- Workflow engine bất đồng bộ (redis/in-memory orchestrator): lupus chạy đồng bộ qua service, nhưng API run/subscribe/steps + bảng `workflow_execution` vẫn tương thích để dashboard workflow pages hoạt động.
- SSO redirect (github/google): endpoint callback tồn tại, trả 400 rõ ràng khi chưa cấu hình creds (OAuth direct-code flow cũ vẫn chạy ở `POST /auth/github|google`).
- Lupus Cloud (`/cloud/*`): stub disabled.
- Một số resource không có bảng gốc nên dùng process-local Map (ghi rõ trong code): `shipping_option_type`, refund-reasons riêng, tax-rate rules. Restart mất — chấp nhận được cho admin config phụ, sẽ chuyển sang bảng khi cần.
- Admin dashboard React: `client` plain React 18 + Vite, zero framework deps. Kiến trúc: `lib/` (api/list/csv/admin-path) + `theme/` (dark/light) + `auth/` + `components/ui|table|shell` + `routes/` + `resources/` (registry 40+ resources) + `hooks/useList` (pagination server-driven qua `parseList`). UI parity Lupus: sidebar sections, bảng + search + Export/Import/Create drawers + row menu + footer `X – Y of Z results / N of M pages`, command palette ⌘K, notifications drawer, settings section, Categories > Organize (drag + save rank). Detail riêng theo section Lupus: Product (General/Media/Options/Variants/Organization), Order (Summary/Items/Payments Capture-Refund/Fulfillments/Addresses + actions), Customer (Addresses/Groups). Riêng Draft Orders có wizard page `/r/draft-orders/create` (Region, Sales Channel, Customer/Email, Items theo variant, Shipping address) POST về `/admin/draft-orders` qua `createPage` trong registry. Dev: `http://localhost:5099/app/` (nhớ trailing slash do Vite base). Build: ~289KB JS / 8.9KB CSS.
