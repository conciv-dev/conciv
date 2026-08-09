---
name: code-review
description: Review conciv pull requests against this repo's code, testing, and boundary laws.
---

# Reviewing conciv changes

Pre-release (v0) TypeScript monorepo: pnpm + turbo, SolidJS widget, strict TS. Review against the
rules below — they are the ones humans keep having to re-flag. Everything already enforced by a tool
(formatting, lint autofix) is not review material.

## Code laws

- Functions, not classes. Sole exception: `BaseTextAdapter` in
  `packages/harness/src/_shared/text-adapter.ts`, which the library's typing forces.
- No IIFEs.
- ZERO code comments in TS/JS. The `conciv/no-comments` lint rule autofix-deletes them, so code must
  be self-explanatory; only tool directives (`@ts-`, `eslint-`) survive. Never ask for a comment,
  docstring, or JSDoc, and never flag a change for lacking one.
- TypeScript is strict. Flag `any`, `as` casts, `@ts-ignore`, and non-null assertions (`!`).
- Barrel files (an `index.ts` that only re-exports), abbreviated identifier names, and `else`
  branches where an early return works.
- Hand-rolled runtime state (a new `Map`/`Set` cache) that shadows state a library already tracks —
  ask whether the library API covers it instead.
- Hand-rolled primitives (retry loops, debounce, event listeners) where a utility already exists
  (`@tanstack/pacer`, `solid-primitives`).
- oxfmt owns style (no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120) and runs in a commit hook. Do not comment on formatting.

## SolidJS

- Destructuring props breaks reactivity — must use `splitProps`.
- Raw `createSignal`/`createEffect` where `solid-primitives` (`makeEventListener`, timers) fits.
- Writes to stores or collections inside a subscription, effect, or render body cause re-render
  storms; writes belong in event handlers.
- `useContext()` called inline as a JSX prop value.

## Testing

- Widget UI is tested in a REAL browser (Playwright/Chromium). Flag any jsdom/happy-dom
  introduction.
- Web-first assertions only (`await expect(locator)...`). Flag `expect.poll` and hand-written
  polling loops.
- Widget integration tests use `browser.newPage()`, never `browser.newContext()` — contexts leak and
  spike CPU/memory.
- Never wait for Playwright `networkidle` on a page with the live widget: its SSE stream keeps the
  network busy forever. `domcontentloaded` or a UI signal instead.
- No tests under `apps/examples/*` — example apps are demos. Behavior is verified by the owning
  package's tests, `@conciv/extension-testkit`, or an `e2e/` consumer app.
- Every Solid package's `vitest.config.ts` must pin `test: {environment: 'node'}`, or
  `vite-plugin-solid` injects jsdom and the run exits 1 with all tests passing.
- Assertions use native locators (`getByRole`, `getByText`). Flag test-ids and CSS
  implementation-detail selectors.
- Stubs or mocks of internal modules, and test code or debug flags left in product source.

## Boundaries and security

- zod validates every HTTP boundary (`readValidatedBody`). Flag a new route without it.
- The core dev server binds `127.0.0.1` only.
- Never log or commit credentials/tokens.
- Loosening the command gate policy in `packages/core/src/chat/gate.ts` — keep it conservative.
- Vendored third-party code, or patches to dependencies.

## Whiteboard landmine

- Whiteboard is TanStack DB over libSQL. Never write to the db inside a collection subscription, an
  effect, or a render body — it triggers a re-render storm. Writes belong in event handlers only.
  Flag any db write reachable from a subscription callback.

## Widget bundle

- The widget bundle must externalize every `@conciv/extension/*` subpath and the shared Ark/Solid
  deps. A second bundled copy splits the Solid/Ark context and extension popovers render at 0,0.
  Flag any change that bundles a second copy or weakens the mount-externals build test.

## TanStack Router

- Files under `src/routes/` use route-scoped APIs only: `Route.useSearch()`, `Route.useNavigate()`,
  `Route.useParams()`, `Route.useLoaderData()`, or `getRouteApi('/path')` in a split component. Bare
  `useSearch`/`useNavigate`/`useParams`/`useLoaderData` imports there are a lint error.
- Hand-parsing `window.location` or mining `useRouterState().matches` — ask the router
  (`router.matchRoutes`), and read shared params with `useSearch({strict: false})`.
- `validateSearch` must never throw: every zod field carries `.default()` or `.optional()` AND
  `.catch()`.

## Architecture

- Special-casing a specific CLI or harness in core or widget code — harnesses go through the
  capability-typed `HarnessAdapter` contract (`packages/protocol/src/harness-types.ts`).
- Host-absolute paths passed as a harness cwd; workdirs are sandbox-virtual and default to
  `/workspace`.
- Capability flags that add a second half-way code path where one correct path should exist.

## Process

- A PR should link the issue it closes.
- A flaky-test "fix" that only bumps a timeout or adds a retry is not acceptable. The mechanism gets
  fixed, or named explicitly in the PR.

## Tone

This is a pre-release v0 codebase with no external users. Internal API reshapes that update all call
sites are expected and welcome. Do not request back-compat shims, deprecation paths, or version
guards. Do not flag missing changesets on non-release PRs, and do not flag inherited issues in
touched files that the PR did not introduce.
