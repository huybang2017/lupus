# AGENTS.md (lupus admin)

React 18 + Vite + TypeScript admin dashboard for the lupus backend (`server`, port 9001). Zero framework dependencies; it talks to the backend through the Admin API only.

## Commands

```bash
cd client
npm run dev      # http://localhost:5099/app/, proxies /auth /admin /store /hooks /uploads to :9001
npm run build    # vite build only
npm run preview
```

There is **no `lint`, `test` or `typecheck` script** — `dev`, `build` and `preview` are the only scripts, and `build` is a bare `vite build` that does **not** type check. Run `npx tsc --noEmit` by hand before claiming a change compiles.

## Layout

Feature-sliced by layer; **all cross-folder imports use the `@/` alias** (`@/...` -> `src/...`). No relative imports between folders — `rg 'from "\.' src` must return nothing. The alias is declared twice and **both must be kept in sync**: `tsconfig.json` (`compilerOptions.paths`) and `vite.config.mts` (`resolve.alias`). Full rules in `src/README.md`.

- `src/app/` - composition root. `app.tsx` wires providers around the router; `router/routes.tsx` and `router/settings-routes.tsx` hold the route tables.
- `src/providers/` - React context: `auth-provider` (JWT + user), `protected-route`, `theme-provider`, plus the shared `query-client` singleton.
- `src/entities/` - the declarative resource registry (`resources.tsx`), the metadata that drives the generic list/detail screens.
- `src/pages/` - route screens sliced by domain (`auth`, `catalog`, `customers`, `dashboard`, `fulfillment`, `orders`, `pricing`, `profile`, `promotions`, `resource`, `settings`).
- `src/widgets/` - composed UI: `shell`, `table`, `form`, `filters`, `confirm`, `detail`, `wizard`, `cells`, `ui`.
- `src/shared/` - framework-agnostic helpers: `api`, `hooks`, `filters`, `formatting`, `i18n` (static ISO country data, not i18next), `utils`, `pricing`, `styles`.

Two `shared/` pieces are load-bearing and easy to break:

- `shared/api/client.ts` is the only fetch wrapper. It attaches the bearer token, JSON-encodes bodies, throws `ApiError` (carrying `status`) on a non-2xx and returns `null` for `204`. Go through it rather than calling `fetch` directly.
- `shared/filters/list-filters.ts` is deliberately React-free: the same pure functions run during URL parsing, inside react-query keys and against row objects, so one filter means one thing in all three places. Keep it that way.

`settings-routes.tsx` mounts the whole `/settings/*` subtree and reuses `ResourceListPage`/`ResourceDetailPage`, so most settings screens need no route entry of their own.

## The resource registry

`entities/resources.tsx` declares **47 resources**. Each entry names its `slug`, `listPath`/`detailPath`, table `columns`, form `fields`, `filters` and row/global `actions`; `pages/resource/*` renders them generically behind the `r/:slug` and `r/:slug/:id` routes. Adding an entry there yields list + detail + create screens for free — prefer that over a bespoke page.

- `customDetail: "<kind>"` opts a resource out of the generic detail screen into a hand-written one dispatched in `pages/resource/resource-detail-page.tsx`.
- **The status vocabularies at the top of that file must stay in step with `server/src/modules/infra/list-filter-specs.ts`.** They mirror the server's CHECK constraints and filter whitelists; a value the server does not accept is silently dropped, which surfaces as a filter chip that quietly does nothing. This invariant is load-bearing — when you add a status server-side, update `resources.tsx` in the same change.
- Only declare a filter the list endpoint actually accepts as a query param, for the same reason.

## Conventions

- Styling is mostly inline `style={{}}` reading CSS custom properties (`var(--fg-base)`, `var(--card-border)`, ...) declared once in `shared/styles/index.css`. Tailwind 3 + PostCSS are wired up and used for utility classes, but the design tokens live in that stylesheet, not in `tailwind.config.js`.
- Theming is a `.dark` class toggled on `<html>` by `providers/theme-provider.tsx` (default `dark`, persisted in `localStorage`); `tailwind.config.js` sets `darkMode: "class"`.
- The JWT lives in `localStorage` under `lupus_admin_token` (`shared/api/client.ts`), so it is readable by any script on the page. Only `react-router-dom`, `@tanstack/react-query`, Radix primitives and `lucide-react` are actually imported from `src` today; `react-table`, `react-hook-form`, `zod`, `i18next` and `framer-motion` are declared but unused.
- Long-standing files still terminate statements with semicolons, which the project-wide "no semicolons" rule forbids. That debt is unresolved — do not propagate it into new files, and do not mass-rewrite existing files as drive-by changes.
- Dev on 5099 with `base: "/app/"`; production builds are served by the backend at `/app`, so every API path must stay same-origin and relative. `BrowserRouter` uses `basename="/app"`.

## Testing

No test runner lives in this package. The contract this dashboard depends on is the backend's `/admin/*` surface, covered by `cd server && npm run test:all` — `test:dashboard`, `test:gaps`, `test:filters`, `test:filters-catalog` and `test:list-query` are the ones that fail first when a screen's query or filter contract drifts. Those tests need a reachable PostgreSQL. Unlike the storefront, the admin client has no `data-testid` contract to preserve, so rename freely. For UI checks run the backend and the client dev server together and prefer a throwaway database — the shared dev database holds hundreds of leftover test rows.
