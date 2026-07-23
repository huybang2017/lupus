# Admin dashboard architecture

Feature-sliced, layered. Folders are layers; each layer may only import from the
layers below it. All cross-folder imports use the `@/` alias (`@/...` -> `src/...`),
configured in `tsconfig.json` (`paths`) and `vite.config.mts` (`resolve.alias`).

## Layers

| Layer | Responsibility |
| --- | --- |
| `app/` | Composition root. `app.tsx` wires providers around the router; `router/routes.tsx` and `router/settings-routes.tsx` hold the route tables. No business logic. |
| `providers/` | React context providers (`auth-provider`, `protected-route`, `theme-provider`) plus the shared `query-client` singleton. |
| `pages/` | Route-level screens, sliced by domain feature: `auth`, `catalog`, `customers`, `dashboard`, `fulfillment`, `orders`, `pricing`, `profile`, `promotions`, `resource`, `settings`. |
| `entities/` | Domain metadata: `resources.tsx`, the declarative resource registry that drives the generic screens. |
| `widgets/` | Reusable composed UI blocks: `shell`, `table`, `form`, `filters`, `confirm`, `detail`, `wizard`, `cells`, `ui`. |
| `shared/` | Framework-agnostic helpers: `api`, `hooks`, `filters`, `formatting`, `i18n`, `utils`, `pricing`, `styles`. |

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
  `shared/` and `widgets/`.
- Nothing imports from `app/` except `main.tsx`.

## Notes

- `pages/resource/` holds the registry-driven generic list/detail/form screens
  behind the `r/:slug` and `r/:slug/:id` routes. Adding a resource to
  `entities/resources.tsx` gives you list + detail + create screens for free.
- Feature folders under `pages/` may import siblings and other feature folders;
  that is the one intentional exception to strict inward-only flow, since a
  route tree is inherently cross-cutting.
- `shared/styles/index.css` is the single global stylesheet, imported once from
  `main.tsx`.
