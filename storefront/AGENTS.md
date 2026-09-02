# AGENTS.md (lupus storefront)

React 19 + Vite + Tailwind 3 port of the upstream lupus Next.js starter (project `lupus`, outside this directory). Zero framework dependencies; it talks to the lupus backend (`server`, port 9001) through the Store API only.

## Commands

```bash
cd storefront
npm run dev      # http://localhost:8000, proxies /store /auth /admin /hooks /uploads to :9001 (override with VITE_API_PROXY)
npm run build    # type check + vite build
npm run typecheck
```

Optional env (Vite, `VITE_` prefix; see `.env.template`): `VITE_API_URL` (other backend origin), `VITE_PUBLISHABLE_KEY` (sent as `x-publishable-api-key`), `VITE_DEFAULT_REGION` (country for `/`, default `dk`).

## Layout

Feature-sliced by layer; **all cross-folder imports use the `@/` alias** (`@/...` -> `src/...`, set in `tsconfig.json` `paths` and `vite.config.ts` `resolve.alias`). No relative imports between folders. Full rules in `src/README.md`.

- `src/app/` - composition root. `app.tsx` wires providers around the router; `router/routes.tsx` is the route map of the starter's `app/[countryCode]/...` tree.
- `src/providers/` - React context: `region-provider` (region of the first URL segment, set by `CountryGate`), `modal-provider` (per-modal `close`).
- `src/entities/` - the domain data layer (`cart`, `customer`, `products`, `orders`, `regions`, `collections`, `categories`, `locales`, `fulfillment`, `payment`). Same function names as the starter's `lib/data/*`, but plain client code. Server actions became async functions; `revalidateTag` + server re-render became publishing to the `cartStore` / `customerStore` external store or `router.refresh()`.
- `src/pages/` - route screens sliced by domain (`catalog`, `cart`, `checkout`, `order`, `account`, `error`, `root-redirect`). One file per page, named exports only.
- `src/widgets/` - reusable composed UI, ported 1:1 from the starter's `modules/*` and flattened (`<name>/index.tsx` -> `<name>.tsx`). Keep component names aligned with the starter's `src/modules` so changes there can be diffed. `widgets/layout/` also holds the route layouts.
- `src/shared/` - framework-agnostic helpers: `api` (fetch wrapper + runtime config), `hooks`, `formatting`, `navigation`, `storage`, `store`, `styles`, `types`, `utils`.
- `tailwind-ui-preset.cjs` is a vendored copy of the upstream UI preset 2.21 (MIT); do not add the npm package.

## Conventions

- Amounts from the API are minor units; always format with `convertToLocale` (`shared/formatting/money.ts`).
- Server components of the starter became client components: data comes from `useAsync` (`shared/hooks/use-async.ts`), `notFound()` throws and `NotFoundBoundary` renders the 404.
- Cart and customer state is an external store read via `useSyncExternalStore` (`shared/store/create-store.ts`), not React context.
- `shared/navigation/router.tsx` stands in for `next/navigation`; `shared/navigation/navigation.ts` gives data-layer code `redirect()`. `shared/storage/storage.ts` keeps the JWT, cart id and locale in localStorage (the starter uses cookies; the token is therefore readable by page scripts).
- Payment: only the built-in provider (`pp_system_default`, legacy id `manual`). Card providers would go through `shared/constants.tsx` (`paymentInfoMap`, `isStripeLike`) and `widgets/checkout/payment*`.
- Email verification (`/verify-account`) and gift cards are not part of the lupus backend flow and were removed.

## Testing

No unit test runner. The Store API contract and the `data-testid` smoke-test contract are covered by `cd server && npm run test:storefront`; **do not rename or remove `data-testid` attributes**. For UI checks run the backend and storefront dev servers together; the shared dev database holds hundreds of leftover test rows, so for visual checks prefer a throwaway database.