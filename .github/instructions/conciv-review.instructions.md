---
applyTo: '**'
---

# Review instructions for the conciv monorepo

Pre-release (v0) TypeScript monorepo: pnpm + turbo, SolidJS widget, strict TS. When reviewing, focus
on the rules below — they are the ones humans keep having to re-flag.

## Flag these

### Code style

- Classes anywhere. This repo uses functions only (sole exception: `BaseTextAdapter` in
  `packages/harness/src/_shared/text-adapter.ts`).
- IIFEs.
- Any code comment in TS/JS. Comments are lint-deleted here; code must be self-explanatory. Only
  tool directives (`@ts-`, `eslint-`) are allowed.
- `any`, type assertions (`as`), `@ts-ignore`, non-null assertions (`!`).
- Barrel files (`index.ts` that only re-exports), abbreviated identifier names, `else` branches
  where an early return works.
- Hand-rolled runtime state (new `Map`/`Set` caches) that shadows state a library already tracks —
  ask whether the library API covers it instead.
- Hand-rolled primitives (retry loops, debounce, event listeners) where an existing utility exists
  (`@tanstack/pacer`, `solid-primitives`).

### SolidJS

- Destructuring props (breaks reactivity) — must use `splitProps`.
- Raw `createSignal`/`createEffect` where `solid-primitives` (`makeEventListener`, timers) fits.
- Writes to stores/collections inside a subscription, effect, or render body (re-render storms) —
  writes belong in event handlers.
- `useContext()` called inline as a JSX prop value.

### TanStack Router (files under `src/routes/`)

- Bare `useSearch`/`useNavigate`/`useParams`/`useLoaderData` imports — must use route-scoped APIs
  (`Route.useSearch()` etc. or `getRouteApi`).
- Hand-parsing `window.location` or mining `useRouterState().matches`.
- `validateSearch` schemas where a zod field lacks `.default()`/`.optional()` AND `.catch()` — the
  validator must never throw.

### Testing

- Any jsdom/happy-dom usage — widget UI is tested in a real browser (Playwright/Chromium) only.
- `expect.poll` — banned entirely; only web-first assertions (`await expect(locator)...`).
- `browser.newContext()` in widget integration tests — must be `browser.newPage()`.
- Waiting for `networkidle` on a page with the live widget (SSE keeps it busy forever).
- Tests added under `apps/examples/*`.
- Test-ids or CSS-implementation-detail selectors — assertions use `getByRole`/`getByText`.
- Stubs/mocks of internal modules; test code or debug flags in product source.
- Solid package `vitest.config.ts` missing `test: {environment: 'node'}`.

### Security & boundaries

- New HTTP routes without zod validation (`readValidatedBody`).
- Dev servers binding anything other than `127.0.0.1`.
- Loosening the command gate policy in `packages/core/src/chat/gate.ts` — keep it conservative.
- Committed credentials/tokens.
- Vendored third-party code, or patches to dependencies.

### Architecture

- Special-casing a specific CLI/harness in core or widget code — harnesses go through the
  capability-typed `HarnessAdapter` contract (`packages/protocol/src/harness-types.ts`).
- Host-absolute paths passed as harness cwd (workdirs are sandbox-virtual, default `/workspace`).
- Bundling `@conciv/extension/*` subpaths or shared Ark/Solid deps into the widget bundle instead of
  externalizing them.
- Capability flags that add a second half-way code path where one correct path should exist.

## Do not flag

- Formatting (semicolons, quotes, spacing) — oxfmt owns this.
- Missing code comments or JSDoc — intentional, comments are banned.
- Backwards-compatibility breaks — v0 pre-release, no external users; reshaping APIs with all call
  sites updated is expected.
- Missing changesets on non-release PRs.
- Inherited issues in touched files that the PR did not introduce.
