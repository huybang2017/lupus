# Storefront architecture

Feature-sliced, layered. Folders are layers; each layer may only import from the
layers below it. All cross-folder imports use the `@/` alias (`@/...` -> `src/...`),
configured in `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`).

## Layers

| Layer | Responsibility |
| --- | --- |
| `app/` | Composition root. `app.tsx` wires providers around the router; `router/routes.tsx` holds the route table, which mirrors the starter's `app/[countryCode]/...` tree. No business logic. |
| `providers/` | React context providers: `region-provider` (the region of the first URL segment, set by `CountryGate`) and `modal-provider` (per-modal `close` callback for `Modal.Title`). |
| `entities/` | The domain data layer, one module per domain: `cart`, `customer`, `products`, `orders`, `regions`, `collections`, `categories`, `locales`, `fulfillment`, `payment`. Each owns its Store API calls and, for cart and customer, the external store that publishes them. |
| `pages/` | Route-level screens, sliced by domain: `catalog`, `cart`, `checkout`, `order`, `account`, `error`, plus `root-redirect`. One file per page, all named exports. |
| `widgets/` | Reusable composed UI blocks: `account`, `cart`, `categories`, `checkout`, `collections`, `common`, `home`, `layout`, `order`, `products`, `shipping`, `skeletons`, `store`. |
| `shared/` | Framework-agnostic helpers: `api` (fetch wrapper + runtime config), `hooks`, `formatting`, `navigation`, `storage`, `store`, `styles`, `types`, `utils`. |

## Import direction

```
app  ->  pages  ->  widgets  ->  shared
             \         \          ^
              \         -> entities
```

- Imports point **inward only**. `shared/` imports nothing from `app`, `pages`,
  `widgets` or `entities` — it is the base layer.
- `entities/` sits beside `widgets/`: it may be used by `pages/` and `widgets/`,
  but it does not import them back.
- `providers/` may be used by `app/`, `pages/` and `widgets/`; it depends only on
  `shared/`.
- Nothing imports from `app/` except `main.tsx`.

## Notes

- `entities/cart.ts` and `entities/customer.ts` hold cart and customer state in an
  external store consumed through `useSyncExternalStore` (`shared/store/create-store.ts`),
  **not** React context. This is the SPA stand-in for the starter's `revalidateTag` +
  server re-render: a mutation calls the Store API, then publishes to the store.
- `shared/navigation/router.tsx` stands in for `next/navigation`; data-layer code
  calls `redirect()` from `shared/navigation/navigation.ts`, which a bridge in
  `widgets/layout/root-layout.tsx` wires to the router's `navigate`.
- `widgets/layout/` holds the route layouts (`root-layout`, `country-gate`,
  `main-layout`, `checkout-layout`); they compose `pages/` but never the reverse.
- `data-testid` attributes are a smoke-test contract
  (`cd server && npm run test:storefront`). Do not rename or
  remove them.
- `shared/styles/index.css` is the single global stylesheet, imported once from
  `main.tsx`.