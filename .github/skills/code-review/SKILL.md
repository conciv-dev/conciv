---
name: code-review
description: Review conciv pull requests against this repo's code, SolidJS, styling, testing, and boundary laws.
---

# Reviewing conciv changes

Pre-release (v0) TypeScript monorepo: pnpm + turbo, SolidJS widget and ui-kits, React only in `apps/site`,
strict TS. Review against the rules below: they are the ones humans keep having to re-flag. Everything
already enforced by a tool (formatting, lint autofix) is not review material.

## Code laws

- Functions, not classes. Sole exception: the local `DelegatingTextAdapter` subclass behind
  `makeTextAdapter` in `packages/harness/src/_shared/text-adapter.ts`, which the library's typing
  forces (`BaseTextAdapter` is the imported base class it extends).
- No IIFEs unless explicitly required.
- ZERO code comments in TS/JS. The `conciv/no-comments` lint rule autofix-deletes them, so code must
  be self-explanatory; only tool directives (`@ts-`, `eslint-`) survive. Never ask for a comment,
  docstring, or JSDoc, and never flag a change for lacking one.
- TypeScript is strict. Flag `any`, `as` casts, `@ts-ignore`, and non-null assertions (`!`). Prefer
  generics; a type-only dependency import should become a generic parameter instead. Ad-hoc typed
  JSON reads (`const x: T = await res.json()`) belong in a generic helper.
- Barrel files (an `index.ts` that only re-exports), abbreviated identifier names, `hub`/`manager`/
  `util` grab-bag naming, and `else` branches where an early return, ternary, or map works.
- Functional style: `map`/`reduce`/`flatMap` over `forEach` plus mutation or push ladders. Collection
  shaping (group, key, partition, map values) uses `es-toolkit`, not hand-built accumulator loops.
- No em dashes anywhere in code, string literals and test names included. Lint does not catch this.
- New long-lived runtime state is a red flag: a module-level `new Map`/`new Set`, array registry,
  cache, seen-list, or status flag that shadows what a library (TanStack AI/DB/Query, Ark, a store)
  already tracks. Ask which library API holds that fact. A transient `[...new Set(items)]` dedupe and
  test-side bookkeeping are fine.
- Hand-rolled primitives (retry loops, debounce, throttle, timers, event listeners) where a library
  covers it: `@tanstack/pacer` / `@tanstack/solid-pacer` for pacing, `@solid-primitives/*` for
  listeners and timers.
- Library way first. A local mechanism built beside a library flow (a parallel queue, gate, claim
  table, router) is the defect, even if it keeps a nicer UX; gaps go through the library's own
  extension points.
- Swallowed errors: `catch {}`, `.catch(() => undefined)`, an unawaited `void promise` whose failure
  is lost. Errors are surfaced, logged, or rethrown; a deliberate ignore is narrow and explicit.
- oxfmt owns style (no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120)
  and runs in a commit hook. Do not comment on formatting.

## Package shape

- A package's `src/` root holds only its public entry files (one per `exports` entry); internals live
  in folders by concern. Exports are an explicit list, never `"./*"`.
- A new package or a diff that adds many tiny files (3 to 10 lines each) usually means hand-rolled
  parallels of a library or needless splits: ask to delete or merge.
- No relative paths across workspace packages (`../../../packages/x/...`). Cross-package paths come
  from package resolution (`import.meta.resolve`, `require.resolve('@pkg/name/package.json')`,
  exports subpaths).
- No test code, test-only exports, `data-testid`, debug flags, or `window.__X__` hooks in product
  source. No mutable singletons for tests to overwrite (`export const x = {value: 15}`).

## SolidJS

- Destructuring props breaks reactivity: use `splitProps`.
- Raw `createSignal`/`createEffect` in new code is flagged. Expected alternatives: `createMemo` for
  derived values, `createResource` + `<Suspense>` for async, `<Show when={...}>` to gate on a value
  that may not exist yet, `@tanstack/solid-query` for server state, `@solid-primitives/*` for DOM
  listeners and timers. A bare signal or effect needs a stated reason in the PR.
- Never fabricate fallback ids (`?? ''`, `|| 'local'`) or invent capability flags to work around
  async state; gate with `<Show>` / `createResource`.
- Writes to stores, collections, or the db inside a subscription, effect, or render body cause
  re-render storms; writes belong in event handlers.
- Side effects (sends, mutations) fired during render rather than from an event handler.
- Hooks in JSX attribute position (`<Pane connect={useConnect()} />`): Solid compiles attributes
  into getters, so the hook re-runs ownerless on every read. Capture the hook in the component body.
- `useContext()` called inline as a JSX prop value.
- A host JSX expression that reads a coarse shared signal or registry directly re-creates its
  subtree on every unrelated write; the lookup goes through a `createMemo`.
- Views are presentation: cross-cutting state and side effects live in one context model
  (`createXModel` + `XProvider` + `useX`), not threaded through props.
- Reach for Ark UI primitives before hand-rolling menus, popovers, listboxes, tooltips, collapsibles.
  Icon-only buttons use `TooltipIconButton`, text buttons use `Button` (both from
  `packages/ui-kit-system`). Do not override Ark's `[hidden]`/visibility contract with CSS.

## React (`apps/site` only)

- No `useEffect` / `useLayoutEffect`. Side effects run from event handlers, derived values are
  computed during render, on-mount motion uses declarative `motion` props.
- View state (tabs, filters, open panels) lives in the URL via TanStack Router search params, not
  `useState`.
- shadcn components, not hand-rolled equivalents.

## Styling (UnoCSS)

- Component styles go through `packages/uno-preset` (keyframes, `anim-*` shortcuts, rules, preflights).
  A new `.css` file in a ui-kit `src/` is a blocker; only token/theme sheets are `.css`.
- Piles of arbitrary props (`[overflow-x:hidden]`, `[display:-webkit-box]`) where a preset utility
  exists (`truncate`, `line-clamp-N`).
- Every value derives from existing design tokens (`var()` chains, `calc()`, `color-mix()`, the
  existing easing and duration tokens). A new literal or sibling token needs justification. Raw `px`
  only for hairline geometry.
- Spacing uses padding or `gap`; margin only when nothing else expresses it. Never padding or gap on a
  zag-animated collapsible content element itself.
- Animations end with `motion-reduce:` handling.

## Testing

- Test file budget: a package keeps one node test file and one browser or e2e test file
  (`conciv/test-file-budget`, default max 2, per-package overrides in `.oxlintrc.json`). Flag ANY new
  test file in a PR, even where the package is currently exempt: new tests are `describe` blocks
  added to the package's existing test file. Fixtures are not test files.
- A test file reads top-down like a spec: imports, one shared boot, `describe` per feature, `it`
  named by user-visible behaviour, short arrange/act/assert; helper functions hoisted at the bottom.
  Tests go through the package's public entries, never test-only exports.
- Widget UI is tested in a REAL browser (Playwright/Chromium). Flag any jsdom/happy-dom introduction.
- No mocks or stubs of anything: `vi.fn`, `vi.mock`, `vi.doMock`, `vi.stubGlobal`, fake modules,
  external packages included. Use real servers on port 0, real browsers, real in-memory drivers that
  share the production path.
- No CSS or DOM implementation details in tests: `toHaveCSS`, `toHaveStyle`, `getComputedStyle`,
  `getAnimations()`, `getBoundingClientRect`, `scrollWidth`/`clientWidth` reads, `page.evaluate` that
  reads or builds DOM,
  `.class` or `#id` locators, `data-testid`. Assert with `getByRole`/`getByText`/`getByLabel` and real
  user actions. A test that checks CSS should be deleted, not fixed.
- No unit tests that restate config or a dependency's behaviour (a zod schema's `.catch()`, a pacer,
  a state-by-event transition table). Unit tests only for real algorithms; behaviour gets browser tests.
- Web-first assertions only (`await expect(locator)...`). Flag `expect.poll`, hand-written polling
  loops, and fixed sleeps.
- Timeouts sized to the real operation; flag a raised suite or step timeout.
- Widget integration tests use `browser.newPage()`, never `browser.newContext()`: contexts leak and
  spike CPU/memory. Whatever a test creates it closes in teardown.
- Widget integration tests exercise the PREBUILT bundle
  (`packages/embed/dist/conciv-widget.global.js`), built first with
  `pnpm turbo run build --filter=@conciv/embed`.
- Never wait for Playwright `networkidle` on a page with the live widget: its SSE stream keeps the
  network busy forever. `domcontentloaded` or a UI signal instead.
- No tests under `apps/examples/*` (example apps are demos), except the handful of demo tests in
  `apps/examples/tanstack-start`. Behaviour is verified by the owning package's tests,
  `@conciv/extension-testkit`, or an `e2e/` consumer app.
- Every Solid package's `vitest.config.ts` pins `test: {environment: 'node'}`, or `vite-plugin-solid`
  injects jsdom and the run exits 1 with all tests passing.
- A bug fix ships with a regression test that fails without the fix.
- A flaky-test "fix" that only bumps a timeout or adds a retry is not acceptable. The mechanism gets
  fixed, or named explicitly in the PR.

## Boundaries and security

- Every untrusted input is zod-validated where it enters, not just request bodies. RPC procedures
  declare their input schema with `oc.input(...)` in `packages/contract/src/contract.ts`; a plain
  Hono route parses each untrusted piece it reads (body, route params, query, headers) through a zod
  schema (e.g. `NativeFileSchema.safeParse(c.req.param('file'))` in
  `packages/core/src/api/native-page.ts`). Flag a new route or procedure that consumes any of them
  unvalidated.
- The core dev server binds `127.0.0.1` only.
- Never log or commit credentials/tokens.
- Loosening the command gate policy in `packages/core/src/chat/gate.ts`: keep it conservative.
- Vendored third-party code, or patches to dependencies.

## Whiteboard landmine

- Whiteboard is TanStack DB over libSQL. Never write to the db inside a collection subscription, an
  effect, or a render body: it triggers a re-render storm. Flag any db write reachable from a
  subscription callback.

## Widget bundle

- The widget bundle must externalize every `@conciv/extension/*` subpath and the shared Ark/Solid
  deps. A second bundled copy splits the Solid/Ark context and extension popovers render at 0,0.
  Flag any change that bundles a second copy or weakens the mount-externals build test.

## TanStack Router

- Files under `src/routes/` use route-scoped APIs only: `Route.useSearch()`, `Route.useNavigate()`,
  `Route.useParams()`, `Route.useLoaderData()`, or `getRouteApi('/path')` in a split component.
- Hand-parsing `window.location` or mining `useRouterState().matches`: ask the router
  (`router.matchRoutes`), and read shared params with `useSearch({strict: false})`.
- `validateSearch` must never throw: every zod field carries `.default()` or `.optional()` AND
  `.catch()`. Search schemas live in `*-schemas.ts` files.

## Architecture

- Special-casing a specific CLI or harness in core or widget code: harnesses go through the
  capability-typed `HarnessAdapter` contract (`packages/protocol/src/harness-types.ts`).
- Spawning or decoding a CLI directly instead of running turns through `chat()` with the published
  `@tanstack/ai-*` adapter.
- Host-absolute paths passed as a harness cwd; workdirs are sandbox-virtual and default to
  `/workspace`.
- Capability flags or options that add a second half-way code path where one correct path should exist.
- New public API surface (new extension slots, props, exports) the PR does not justify.

## Fallow

- `pnpm exec fallow audit --changed-since main --format json` findings marked INTRODUCED block the
  merge; CI runs the same audit.
- Before calling an export dead, trace it: `pnpm exec fallow dead-code --trace 'file.ts:Symbol'`.
  Packages listed under `publicPackages` in `.fallowrc.json` are public API and never "unused", and
  "USED but file unreachable" means a missing entry point, not dead code.

## Process

- A PR should link the issue it closes.

## Tone

This is a pre-release v0 codebase with no external users. Internal API reshapes that update all call
sites are expected and welcome. Do not request back-compat shims, deprecation paths, or version
guards. Changeset coverage is enforced by CI, so do not flag it. Do not flag inherited issues in
touched files that the PR did not introduce, with one exception: swallowed errors in a touched file
are flagged whoever wrote them.
