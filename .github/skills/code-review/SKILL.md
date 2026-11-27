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
  `makeTextAdapter` in `packages/harness/src/adapters/adapters.ts`, which the library's typing
  forces (`BaseTextAdapter` is the imported base class it extends).
- No IIFEs unless explicitly required.
- ZERO code comments in TS/JS. The `conciv/no-comments` lint rule autofix-deletes them, so code must
  be self-explanatory; only tool directives (`@ts-`, `eslint-`) survive. Never ask for a comment,
  docstring, or JSDoc, and never flag a change for lacking one.
- TypeScript is strict. Flag `any`, `as` casts, `@ts-ignore`, and non-null assertions (`!`). Prefer
  generics; a type-only dependency import should become a generic parameter instead. Ad-hoc typed
  JSON reads (`const x: T = await res.json()`) belong in a generic helper.
- Internal barrel files (an `index.ts` that only re-exports; a public entry listed in `exports` may), abbreviated identifier names, `hub`/`manager`/
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
  Plugin packages (`packages/plugins/*`) use opencode's flat plugin layout.
- A new package or a diff that adds many tiny files (3 to 10 lines each) usually means hand-rolled
  parallels of a library or needless splits: ask to delete or merge.
- No relative paths across workspace packages (`../../../packages/x/...`). Cross-package paths come
  from package resolution (`import.meta.resolve`, `require.resolve('@pkg/name/package.json')`,
  exports subpaths).
- No test code, test-only exports, `data-testid`, debug flags, or `window.__X__` hooks in product
  source. No mutable singletons for tests to overwrite (`export const x = {value: 15}`).

## Effect

- A resource that must be closed (socket, process, watcher, subscription) is made with `Effect.acquireRelease`
  inside a `Scope`; closing the scope is the teardown. No hand-written cleanup lists.
- Background work lives in a fiber container: `FiberHandle` (one replaceable slot: a timer, the current attempt),
  `FiberSet` (many), `FiberMap` (one per key). No bare forks, no hand-made `Map` of fibers.
- Shared state other code reads is a `SubscriptionRef` (a `Ref` when nobody watches it); one-shot waits are a
  `Deferred`; one-at-a-time sections are `Semaphore(1)`; shared resources by key are an `RcMap`.
- A state machine is a pure `transitionX(state, event) -> {state, effects}` file plus an Effect driver file beside it
  (opencode `x-machine.ts` + `x.ts`); the driver runs effects, the machine owns delays.
- Retries, repeats and back-off are a `Schedule` (`Effect.retry` / `Effect.repeat`) or the machine's own delays;
  deadlines are `Effect.timeout`. No `setTimeout` loops.
- `Effect.forEach` runs one item at a time by default. Independent I/O over many items passes a bounded
  `concurrency` (a number); `'unbounded'` only over a list the code itself bounds; the default where order matters.
  `discard: true` when the results are not used. `Effect.all` for a fixed tuple or struct.
- A big or endless sequence is a `Stream`. Consuming it with a limit or an accumulation is a `Sink`
  (`Sink.foldWeighted` / `Sink.foldUntil` for a byte or count cap, `Sink.zip` for two results in one pass), never a
  counter in `Stream.mapAccum` followed by `Stream.runCollect`.
- Fan-out of events is a `PubSub`; hand-off of work to one taker is a `Queue`. Batching and de-duplicating calls is
  `Request` + `RequestResolver`; memoized lookups with a lifetime are a `Cache`.
- Services are `Context` + `Layer`; tests swap a real in-memory layer, never a mock. Tests move time with
  `TestClock`, never a real wait.
- Observability: every service function is `Effect.fn('package.area.verb')` (a named span); request-scoped ids go on
  the span with `Effect.annotateCurrentSpan` (`sessionId`, `plugin`); Effect code logs with `Effect.log` /
  `logWarning` / `logError` (they land as span events), never `console.*`.
- Files copied from opencode (in `packages/backend-app-api/src`, `packages/frontend-plugin-api/src` and
  `packages/frontend-defaults/src/runtime/{plugin,persistence}`) keep opencode's names and shapes, including `Service.verb` span names
  and its own Effect patterns; the laws above apply to conciv's own code and to conciv's edits inside a copy.
- Effect code called from Solid goes through one bridge (`ManagedRuntime` in, `SubscriptionRef` out read with
  `fromRef`), not ad hoc `runPromise` calls in components.

## SolidJS

- Destructuring props breaks reactivity: use `splitProps`.
- Raw `createSignal`/`createEffect` in new code is flagged. Expected alternatives: `createMemo` for
  derived values, `createResource` + `<Suspense>` for async, `<Show when={...}>` to gate on a value
  that may not exist yet, `@tanstack/solid-query` for server state, `@solid-primitives/*` for DOM
  listeners and timers. A bare signal or effect is accepted only when the PR says why none of those
  fit and the maintainer agrees.
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
- A plugin other than the built-ins (page, terminal, iOS, which `packages/app/uno.config.ts` scans) builds its own
  sheet: `uno.config.ts` is `pluginSheetConfig(import.meta.url)` and the browser part adds `virtual:uno.css?inline`
  with `ctx.add(Style, css)`. Adding a plugin's `src` to the app's or frontend-defaults' `uno.config.ts` is a
  blocker.
- Piles of arbitrary props (`[overflow-x:hidden]`, `[display:-webkit-box]`) where a preset utility
  exists (`truncate`, `line-clamp-N`).
- Every value derives from existing design tokens (`var()` chains, `calc()`, `color-mix()`, the
  existing easing and duration tokens). A new literal or sibling token needs justification. Raw `px`
  only for hairline geometry.
- Spacing uses padding or `gap`; margin only when nothing else expresses it. Never padding or gap on a
  zag-animated collapsible content element itself.
- Animations end with `motion-reduce:` handling.

## Testing

- Test layout and budget (`conciv/test-file-budget`, AGENTS.md, Testing): every package has `test/unit`,
  `test/it`, `test/e2e`, `test/fixtures` and `test/utils`; a test file's name carries its folder's kind
  (`x.unit.test.ts`, `x.it.test.ts`, `x.e2e.test.tsx`); never more test files than source files; a test
  file is at most 1,000 lines. Flag a new test file where an existing journey fits: one `describe` per
  user flow, consecutive steps in one test. Fixtures are not test files.
- A test file reads top-down like a spec: imports, one shared boot, `describe` per feature, `it`
  named by user-visible behaviour, short arrange/act/assert; helper functions hoisted at the bottom.
  Tests go through the package's public entries, never test-only exports.
- Mounted behaviour (the shell or a plugin on screen) is tested in vitest browser mode with `@internal/frontend-test-utils` (`renderInTestApp`, `renderTestApp`, `createExtensionTester`) against the fake engine from `@internal/test-utils`; happy-dom only for code that mounts nothing. Flag jsdom, and flag a mounted test that does not use the test utilities. See AGENTS.md, Testing.
- Test utilities (`@conciv/backend-test-utils` and `@internal/engine-kit`, `@internal/frontend-test-utils`, the
  fake engine in `@internal/test-utils`, e2e helpers) run the real product path and fake only expensive
  externals (the model, CLIs). The engine kit's browser client uses the same transport and client as the
  product (browser rpc over the `/rpc-ws` socket, `@conciv/client`), never a parallel HTTP or hand-rolled
  path; the fake engine implements the real oRPC contract (`implement(contract)`). Intercepting a call to observe or fault it (`page.routeWebSocket`, `page.route`) is
  fine; swapping the transport is not. Flag a PR that changes a product transport or client without
  moving the test utilities onto it in the same PR, and any test that waits on or hooks a transport the
  product no longer uses.
- No mocks or stubs of anything: `vi.fn`, `vi.mock`, `vi.doMock`, `vi.stubGlobal`, fake modules,
  external packages included. Use real servers on port 0, real browsers, real in-memory drivers that
  share the production path.
- No CSS or DOM implementation details in tests: `toHaveCSS`, `toHaveStyle`, `getComputedStyle`,
  `getAnimations()`, `getBoundingClientRect`, `scrollWidth`/`clientWidth` reads, `page.evaluate` that
  reads or builds DOM,
  `.class` or `#id` locators, `data-testid`. Assert with `getByRole`/`getByText`/`getByLabel` and real
  user actions. A test that checks CSS should be deleted, not fixed.
- No unit tests that restate config or a dependency's behaviour (a zod schema's `.catch()`, a pacer).
  A behaviour is tested once, in the cheapest place that proves it: unit (functions, models, reducers,
  machines), then it, then e2e (AGENTS.md, Testing).
- Web-first assertions only (`await expect(locator)...`). Flag `expect.poll`, hand-written polling
  loops, and fixed sleeps.
- Timeouts sized to the real operation; flag a raised suite or step timeout.
- Time is never the signal a test passes or fails on. Flag any assertion whose meaning depends on a
  clock: a custom `timeout` that tells the fixed path from the broken one ("in view within 500ms"),
  a sleep before an assertion, or a duration compared against a budget outside the perf suite. The
  test orders itself on real signals instead: a held request released or answered, a stream event, a
  visible state change. It tells fixed from broken by a state only the broken path produces. If no
  such state exists, the PR says so; it does not invent a timeout.
- Widget integration tests use `browser.newPage()`, never `browser.newContext()`: contexts leak and
  spike CPU/memory. Whatever a test creates it closes in teardown.
- Widget integration tests exercise the PREBUILT bundle
  (`packages/app/dist/conciv-widget.global.js`), built first with
  `pnpm turbo run build --filter=@conciv/app`.
- Never wait for Playwright `networkidle` on a page with the live widget: its engine socket keeps the
  network busy forever. `domcontentloaded` or a UI signal instead.
- No tests under `apps/examples/*` (example apps are demos), except the handful of demo tests in
  `apps/examples/tanstack-start`. Behaviour is verified by the owning package's tests,
  its test utilities, or an `e2e/` consumer app.
- A package's tests are configured only through `concivTest(...)` in its `vitest.config.ts`, or in its
  `vite.config.ts` when the package has a Vite app config (never both); `test/unit` runs in node unless the package passes `environment: 'happy-dom'`.
  Flag a hand-written test project or environment.
- A bug fix ships with a regression test that fails without the fix.
- A flaky-test "fix" that only bumps a timeout or adds a retry is not acceptable. The mechanism gets
  fixed, or named explicitly in the PR.

## Boundaries and security

- Every untrusted input is zod-validated where it enters, not just request bodies. RPC procedures
  declare their input schema with `oc.input(...)` in `packages/protocol/src/contract.ts` (a plugin, in
  its own contract); a plain Hono route parses each untrusted piece it reads (body, route params, query,
  headers) through a zod schema (e.g. `ChunkFileSchema.safeParse(c.req.param('file'))` in
  `packages/backend-defaults/src/engine/api/widget-page.ts`). Flag a new route or procedure that consumes any of them
  unvalidated.
- The engine binds `127.0.0.1` only.
- Never log or commit credentials/tokens.
- Loosening the sandbox policy (`defineSandboxPolicy({default: 'ask'})` in `packages/backend-defaults/src/ai/chat-server.ts`)
  or the session permission rules (`packages/backend-defaults/src/engine/runtime/permission-cards.ts`): keep them
  conservative.
- Vendored third-party code, or patches to dependencies.

## Whiteboard landmine

- Whiteboard state is TanStack DB collections. Never write to the db inside a collection subscription, an
  effect, or a render body: it triggers a re-render storm. Flag any db write reachable from a
  subscription callback.

## Widget bundle

- The widget bundle must externalize the shared Ark/Solid deps. A second bundled copy splits the
  Solid/Ark context and plugin popovers render at 0,0.
  Flag any change that bundles a second copy or weakens the mount-externals build test.

## TanStack Router

- Files under `src/routes/` use route-scoped APIs only: `Route.useSearch()`, `Route.useNavigate()`,
  `Route.useParams()`, `Route.useLoaderData()`, or `getRouteApi('/path')` in a split component.
- Hand-parsing `window.location` or mining `useRouterState().matches`: ask the router
  (`router.matchRoutes`), and read shared params with `useSearch({strict: false})`.
- `validateSearch` must never throw: every zod field carries `.default()` or `.optional()` AND
  `.catch()`. Search schemas live in `*-schemas.ts` files.

## Architecture

- Special-casing a specific CLI or harness in engine or widget code: harnesses go through the
  capability-typed `HarnessAdapter` contract (`packages/harness/src/_shared/contract.ts`, capabilities in
  `packages/types/src/harness-types.ts`).
- Spawning or decoding a CLI directly instead of running turns through `chat()` with the published
  `@tanstack/ai-*` adapter.
- Host-absolute paths passed as a harness cwd; workdirs are sandbox-virtual and default to
  `/workspace`.
- Capability flags or options that add a second half-way code path where one correct path should exist.
- New public API surface (new registries, props, exports) the PR does not justify.

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
