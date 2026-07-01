# Test-Runner as the First Standalone Extension — and the API Gaps It Forces

Date: 2026-06-23
Status: SUPERSEDED. Its API-gap portion is rebased onto the landed split in `2026-06-24-extension-api-gaps-design.md` (the generic API, fixture-proven). The test-runner migration itself remains a LATER layer to spec on top of that, once the gaps land. Do not execute this doc as-is.
Builds on: `2026-06-23-extension-api-rewrite-design.md` (slots, `defineExtension`, `defineTool`, strip transform)

## Goal

Migrate the existing test-runner into the first fully in-house standalone extension, and grow the extension core API by exactly what that migration needs.

The hard, non-negotiable goal:

> **Zero test-runner code remains in `@conciv/core` or `@conciv/widget` (and none in `@conciv/protocol`, `@conciv/tools`, `@conciv/tool-ui`, `@conciv/harness`, `@conciv/cli`).** Every part — the agent tool, the server routes, the SSE stream, the runner lifecycle, the system-prompt text, the result card UI, the CLI subcommand, and the user config — lives only in the test-runner extension. The test card still renders in chat, streams live, and exposes its Open / Fix actions. No feature regresses.

Core stays thin: it knows nothing about test-running. It exposes a generic extension API (declare config, register namespaced HTTP routes, own server-side stateful objects, inject context into tools, open client transports, clean up). The test-runner extension owns the `@conciv/test-runner` dependency.

This validates the rewritten extension API against a real, full-featured extension: the parts that already fit (tool + card + prompt) prove the contract; the parts that do not fit define the API gaps below.

## What the test-runner is today (the surface to relocate)

| Concern                                                                                                             | Current location                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent tool `conciv_test` (`list`/`run`/`status`) def                                                                | `tools/src/test.ts`                                                                                                                                                 |
| Tool → runner binding (`ctx.test`)                                                                                  | `core/src/app.ts:84`, `tools/src/server.ts` (`concivTestServerTool`), `tools/src/types.ts:12` (`ConcivToolContext.test`), `tools/src/defs.ts`, `tools/src/tools.ts` |
| SSE stream + 5 routes (`/api/test-runner/*`)                                                                        | `core/src/api/test-runner/test-runner.ts`                                                                                                                           |
| Runner lifecycle (`getRunner(cfg.testRunner).create(cwd)`)                                                          | `core/src/app.ts:3,8,47-51,56,76`; `core/package.json` dep on `@conciv/test-runner`                                                                                 |
| `testRunner` config field                                                                                           | `core/src/config.ts`, `protocol/src/config-types.ts`                                                                                                                |
| Runner-domain types (`TestEvent`, `TestRunResult`, `TestRunnerManager`, `TestRunnerAdapter`, `isRunnerUnavailable`) | `protocol/src/test-types.ts`, `protocol/src/runner-types.ts`                                                                                                        |
| 422 mapping for runner-unavailable                                                                                  | `core/src/api/errors.ts:2,9` (imports `isRunnerUnavailable`)                                                                                                        |
| Host seam `subscribeTestRunner?`                                                                                    | `protocol/src/tool-view-types.ts:23`, wired in `widget/src/chat-panel.tsx:459`                                                                                      |
| Result card UI (live + static)                                                                                      | `tool-ui/src/cards/test.tsx` (real, in `builtinToolCards`); `widget/src/test-card.tsx` (browser-IT seam)                                                            |
| Card registration                                                                                                   | `tool-ui/src/index.tsx` (`testTool`, `builtinToolCards`), `tool-ui/src/cards/test.stories.tsx`                                                                      |
| Per-tool "now" title (`conciv_test` → "Running tests")                                                              | `tool-ui/src/now-title.ts:65`                                                                                                                                       |
| System-prompt line                                                                                                  | `harness/src/claude/system-prompt.ts:9`                                                                                                                             |
| **CLI subcommand `conciv tools test list/status/run/open/stop`**                                                    | `cli/src/test.ts` (hits all 6 routes directly), registered in `cli/src/tools.ts:4,11`                                                                               |

`@conciv/test-runner` (the runner adapters vitest/jest/node-test/playwright + the child driver) already is a standalone package. It stays; the extension depends on it. Its public API (`getRunner`, `TestRunnerManager`, the `ChildRunnerSpec` seam) is unchanged.

## What already fits the API (validates the contract)

- **Tool + card co-location:** `defineTool({name:'conciv_test', inputSchema}).render(TestCard)`. `collectToolRenderers` registers the card by name; `mount.tsx:78` already spreads extension renderers ahead of built-ins (`[...collectToolRenderers(extensions()), ...builtinToolCards]`), so the extension card overrides any built-in by name.
- **Server tool merge:** `collectServerContributions` merges the extension tool onto `/api/mcp` and drains `systemPrompt`.
- **System prompt:** declarative `systemPrompt` field on `defineExtension` (kept declarative — see Gap 2).

The card UI moves package; the by-name dispatch is untouched.

## Boot lifecycle — the load-bearing correction

The base spec's `.server()` returns a contribution that the **plugin booter** drains before the engine starts: `boot.ts:23` does `loadServerContributions(root).then((extensions) => start({extensions}))`. But `makeApp` (which constructs `const app = new H3()` and has `opts.cwd` in scope) runs **inside** `start()` (`engine.ts:69`). So at the moment a `.server()` factory runs today, **the h3 app does not exist yet** — there is no route handle to register against, and the per-request MCP context (`mcp.ts:38`, rebuilt per request) cannot reach a runner created in the booter.

This forces a two-phase server lifecycle. The engine receives the extension **builders** (not pre-drained contributions), and runs each `.server()` factory in the right phase:

1. **Prompt phase (boot, before the prompt file is written).** The engine still needs each extension's static `systemPrompt` to assemble `paths.systemPrompt` (`engine.ts:34-35`). The declarative `systemPrompt` field is read here without running `.server()`.
2. **App phase (inside `makeApp`, where `app` + `cwd` exist).** Each `.server((server) => ...)` factory runs here. `server.route` is bound to the live `app`; the factory builds its runner, registers its namespaced routes, and returns `{context, dispose}`. The engine collects:
   - each extension tool's bound `execute` (closing over `context`) → handed to `registerMcpRoutes`, which calls `execute(args, context)` per request. Because `makeApp` runs once and `makeCtx` (per request) closes over the same per-extension `context` map, the route handler and the tool handler share one runner instance — the property that makes "agent runs tests → live card sees the stream" work.
   - each `dispose` → stored on the engine; `engine.stop` (`engine.ts:79`) awaits them before `server.close()`, so child processes are torn down (today `collectServerContributions` discards everything but `tools`/`systemPrompt`, and nothing calls dispose).

`ExtensionServerTool.execute` changes from `(input) => Promise<unknown>` to `(input, context) => Promise<unknown>`; `mcp.ts` passes the owning extension's context. `collectServerContributions` is replaced by this two-phase wiring inside `makeApp`/`engine`.

## API gaps the migration forces

### Gap 1 — typed per-extension config

Extensions declare a zod config schema on `defineExtension`; the user sets values namespaced by extension name; both factories receive the parsed (defaults-applied) typed config. Core routes a config blob by name and never reads its contents.

```ts
defineExtension({
  name: 'test-runner',
  configSchema: z.object({
    runner: z.enum(['vitest', 'jest', 'node-test', 'playwright']).default('vitest'),
  }),
  tools: [testTool],
})
```

`defineExtension` becomes generic over the schema and projects `z.output` (post-default):

```ts
function defineExtension<Schema extends z.ZodTypeAny = z.ZodNever, Tools extends ToolBuilder<any, any>[] = []>(
  meta: {name: string; configSchema?: Schema; tools?: [...Tools]; ...},
): ExtensionBuilder<ConfigOf<Schema>, Tools, {}, {}>
// ConfigOf<Schema> = [Schema] extends [z.ZodNever] ? Record<never, never> : z.output<Schema>
```

When `configSchema` is absent, `Config` defaults to `Record<never, never>` (not `never`), so `server.config` is `{}`. User config lives under `extensions['test-runner']` in the conciv config; the host parses it with `schema.parse` (defaults applied) before invoking the factories. `cfg.testRunner` is **deleted** from core/protocol config.

### Gap 2 — server factory: context in, namespaced routes out, cleanup return

`.server()` changes from `() => ServerContribution` to `(server) => ServerResult`. It runs in the App phase (above). It receives a `server` API and returns the context it injects into its tools plus an optional cleanup.

```ts
.server((server) => {                       // server: { config: Config; cwd: string; route: ServerRoute }
  const runner = getRunner(server.config.runner).create(server.cwd)
  server.route.sse('/stream', (emit) => {   // path is namespaced to /api/ext/test-runner/stream
    emit(runner.emitSnapshot())
    return runner.subscribeRaw(emit)
  })
  server.route.get('/list', (event) => runner.list(failedQuery(event)))
  server.route.get('/status', () => runner.status())
  server.route.get('/ui', () => runner.openUiServer())
  server.route.post('/run', (event) => runner.run(runArgs(event)))     // RunArgsSchema: patterns, testNamePattern, failedOnly
  server.route.post('/stop', async () => { await runner.stop(); return {ok: true} })
  return { context: {runner}, dispose: () => runner.stop() }
})
```

**`systemPrompt` stays the declarative field** on `defineExtension` (no `server.systemPrompt()` — that would regress the base spec's removal of `systemPrompt.append`). The test-runner's prompt is static, so the declarative field is sufficient.

**`server.route` is a narrowed `{get, post, sse}` surface — never the raw h3 app handle.** Rationale and security (the review's central concern):

- **Namespacing.** Every path an extension registers is auto-prefixed to `/api/ext/<extension-name>/...`. The extension writes `/stream`; the host mounts `/api/ext/test-runner/stream`. This makes cross-extension collisions impossible and makes shadowing a core route (`/api/chat`, `/api/mcp`, `/api/page`, `/api/server`, `/api/editor`) structurally impossible — an extension cannot name a path outside its own namespace. (Migration: the CLI and client move from `/api/test-runner/*` to `/api/ext/test-runner/*`.)
- **No raw app handle.** A full `H3` handle would let an extension `app.use(...)` global middleware and observe every request (chat, MCP, approvals). The narrowed surface forecloses that.
- **`server.route.sse` is core's `sseStream` re-exported.** SSE responses bypass the global CORS middleware (`sse.ts:10` injects `corsHeadersFor` per-response). Forcing SSE through this one helper guarantees every extension stream carries the loopback CORS guard; extensions may **not** hand-roll a streamed `Response`. `get`/`post` register after `registerCors` (`app.ts:60`), so they inherit the global origin guard; the engine must register extension routes after CORS, and the clean-core regression asserts a non-loopback Origin is rejected on an extension route.

The single `runner` instance is shared by construction between the routes and the tool handler because both close over the same App-phase `.server()` invocation.

### Gap 3 — tools receive injected extension context (typed)

A tool's `.server(execute)` gains a second argument: the context the owning extension returns. The context type **is declared on the tool** (it cannot be inferred _from_ the extension, because the tool is constructed before the extension exists), and the extension's returned `context` is **checked** against the union of its tools' declared contexts.

```ts
const testTool = defineTool<typeof TestInput, {runner: TestRunnerManager}>({
  name: 'conciv_test',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput, // z.object({action: z.enum([...]), pattern: z.string().optional()})
  nowTitle: 'Running tests',
})
  .server((input, ctx) => {
    // ctx: {runner} — declared on the tool above
    if (input.action === 'list') return ctx.runner.list()
    if (input.action === 'run') return ctx.runner.run({patterns: input.pattern ? [input.pattern] : undefined})
    return ctx.runner.status()
  })
  .render(TestCard)
```

Typing (corrected after review):

- `defineTool<Schema, Ctx = unknown>` carries `Ctx` as an authored type parameter; `.server` is `(execute: (input: z.output<Schema>, ctx: Ctx) => ...)`. A phantom `__ctx?: Ctx` keeps `Ctx` recoverable from a `ToolBuilder`.
- `defineExtension` is **tuple-generic over `tools`** (`Tools extends ToolBuilder<any, any>[]`) so each tool's `Ctx` survives (a plain `ExtensionTool[]` erases it).
- `.server`'s returned `context` is constrained `Context extends Intersection<CtxOf<Tools>>` — the extension must provide **everything every tool needs** (intersection, not union; a tool consumes a structural subset).
- The real builder arity is therefore **four**: `ExtensionBuilder<Config, Tools, ServerContext, ClientValue>`.
- The current builder's `as unknown as ExtensionBuilder<...>` cast (`define-extension.ts:64`) must be removed so `tsc --strict` actually verifies each chained method's re-parameterized return; otherwise the generics are decorative.

Tools stay pure and unit-testable — dependencies are injected, not captured from a module singleton, and core never sees `runner`.

`nowTitle` on `defineTool` lets the active-call title self-describe. `now-title.ts`'s `nowTitle(part)` signature changes to receive the matched tool entry (the dispatcher already has the tools array); `chat-panel.tsx` `activeCallTitle` threads it. This removes the `case 'conciv_test'` from the central switch — the switch survives for the other built-in tools (retiring it fully is out of scope; `nowTitle` is the mechanism for later adoption).

### Gap 4 — client factory: context in, value + cleanup out

`.client()` already returns `{value, dispose}` but the factory receives nothing. It gains a `client` argument so it can open its own transport and expose a subscription through `value`, read by the card via `useContext`. This deletes `subscribeTestRunner` from `ToolViewCtx` (only that field — `openEditor` and `sendMessage` stay).

```ts
.client((client) => {                       // client: { apiBase; client: SessionClient; requestMeta }
  const source = new EventSource(`${client.apiBase}/api/ext/test-runner/stream`)
  const listeners = new Set<(e: TestEvent) => void>()
  source.addEventListener('message', (e) => {
    const parsed = TestEventSchema.safeParse(parseJson(e.data))   // untrusted frames; parseJson carried by the extension
    if (parsed.success) for (const fn of listeners) fn(parsed.data)
  })
  const subscribeTests = (onEvent: (e: TestEvent) => void) => {
    listeners.add(onEvent)
    return () => listeners.delete(onEvent)    // per-card teardown; NEVER source.close() (would kill a sibling card's stream)
  }
  return { value: { subscribeTests }, dispose: () => source.close() }
})
```

Lifecycle rules (the review's two real hazards):

- **`.client()` runs exactly once per panel**, not once per slot mount. Its `value` is shared across all of that panel's `ExtensionRuntimeContext.Provider`s — including the tool-card subtree. One EventSource per panel.
- **The tool card is rendered by `tool-ui`'s by-name dispatch, which the base spec places outside the slot/Component model.** The host must therefore wrap the chat/tool-card subtree in the same per-panel `ExtensionRuntimeContext.Provider` that wraps the slot Components, so the card's `useContext((c) => c.subscribeTests)` resolves. An IT asserts: one panel rendering both the live card and a status-slot Component opens exactly one EventSource.
- The card's run-end handler calls the per-card `unsubscribe()` (removes its listener) — never `source.close()` — preserving "a later run can't overwrite this card" on the shared stream. `dispose` (panel unmount + HMR) closes the source.

`useContext()` returns `ExtensionHostContext & ClientValue` **only because** the per-extension Provider merges _this extension's_ `value` into the bag (per-extension, never a global merge that would collide across extensions). The runtime context wiring (`runtime-context.ts`) must do this merge; today it carries `ExtensionHostContext` only.

## Type relocation — the dependency-cycle correction

The runner-domain types **cannot move into the extension**: `@conciv/test-runner` imports `TestEvent`/`TestRunResult`/`TestRunnerAdapter`/`TestRunnerManager`/`isRunnerUnavailable` from `@conciv/protocol` pervasively (`driver.ts`, `registry.ts`, `child-protocol.ts`, every adapter), and the extension depends on `@conciv/test-runner` — moving them to the extension inverts that into a cycle.

Resolution:

- **Runner-domain types + schemas move from `protocol` into `@conciv/test-runner`** (its natural home; it already owns the runner contract). The runner package re-points its imports; the extension imports them from `@conciv/test-runner`. Net: protocol sheds the runner domain, no cycle.
- **The client-consumed schemas (`TestEvent`, `TestEventSchema`) must live in a pure, node-free entrypoint** of `@conciv/test-runner` (e.g. `@conciv/test-runner/events`), never the main export that pulls the child-spawn driver. This is mandatory for the strip transform (next section).
- **`EditorOpenSchema`/`EditorOpen` are NOT test-runner** — they back the generic `conciv_open` / `/api/editor/open` route that **stays in core**. They currently sit in `protocol/src/test-types.ts:11`. Carve them into a `protocol/src/editor-types.ts`; re-point `core/src/api/editor/editor.ts` and `widget/src/chat-panel.tsx`.
- **`isRunnerUnavailable`/`runnerUnavailableError` move with the runner domain.** The 422 mapping currently in `core/src/api/errors.ts:9` (global handler) moves into the extension's route error handling — the `server.route` API maps a thrown runner-unavailable error to 422 within the extension's namespace, so core's global handler stops importing a runner symbol.

## Strip transform — client-safety (mandatory rules)

The babel `.server`-strip pass only fails on a surviving top-level `node:*` import (`strip-server.ts:50`). `@conciv/test-runner` and `h3` are **not** builtins, and the strip cannot see node imports reached transitively through them (base spec: transitive-util node imports are unsupported). So:

- The extension must import `getRunner` (and anything node) **only inside the `.server()` argument**, and import client schemas from the node-free `@conciv/test-runner/events` entrypoint. A single `import {getRunner, TestEventSchema} from '@conciv/test-runner'` would leave the import alive (because `TestEventSchema` is referenced client-side) and drag the node driver into the browser with **no build error**. Separate entrypoints prevent this.
- The **Build IT is a hard CI gate**, not just a test: the emitted client chunk must contain no `@conciv/test-runner` (main), `h3`, or `node:*` specifier; the server view must.

## Built-in pre-split build infrastructure (net-new, owned by a slice)

The base spec's "built-ins ship pre-split via a `browser`/`node` conditional `exports` map" does not exist yet — neither `@conciv/extension` nor `@conciv/test-runner` has a `browser` condition, and the strip transform only runs over consumer source, not `node_modules`. The extension package must build two views: a babel-`stripServerHalf`-processed `dist/extension.browser.js` and the full `dist/extension.js`, wired via a `"browser"` export condition the widget bundler honors. This is owned explicitly by the package slice and proven by the Build IT.

## The migrated extension package

Package name **`@conciv/extension-test-runner`** — this requires settling the existing lookalikes first: `packages/extension` (singular, the contract) and `packages/extensions` (plural, the legacy imperative catalog/discovery being removed by the base spec). The base spec already removes the plural package's contract; this work confirms `@conciv/extension` (singular) is the one true contract package and adopts the convention that every built-in extension is `@conciv/extension-<name>`. The naming decision is a prerequisite task, not an afterthought.

Contents:

- `extension.ts` — `defineExtension(...).server(...).client(...)` wiring runner, namespaced routes, config, tool context, SSE.
- `test-tool.ts` — `defineTool<…, {runner}>(...).server(execute).render(TestCard)`.
- `test-card.tsx` + supporting components — `TestCard`/`TestResults` moved verbatim from `tool-ui/src/cards/test.tsx`, rewired to read `subscribeTests` + `openEditor` via `useContext`. Carries its own `parseJson` and `resultText` (or imports the latter from `tool-ui`).
- `test.stories.tsx` — moved from tool-ui.
- `cli.ts` (or contributes the CLI command) — the `conciv tools test list/status/run/open/stop` subcommand, re-pointed to `/api/ext/test-runner/*`. **Behavior change to acknowledge:** these CLI commands now require the extension to be loaded; a clean-core install 404s them. (See Open items for whether the extension API exposes a CLI-contribution seam or the command ships with the extension package.)

`openEditor` stays a generic host primitive (it backs `conciv_open` and the file-read card too); the card reads it via `useContext`. It is NOT deleted from `ToolViewCtx`.

## Deletions (proving core/widget are clean)

- `core/src/api/test-runner/` (whole dir) + its registration in `app.ts:76`, the `getRunner`/`requireRunner`/`TestRunnerAdapter` imports (`app.ts:3,8,47-51,56`), the `ctx.test` MCP branch (`app.ts:84-88`), and the `@conciv/test-runner` dep in `core/package.json`.
- `isRunnerUnavailable` import + 422 mapping in `core/src/api/errors.ts:2,9` (moves into the extension).
- `testRunner` field in `core/src/config.ts` + `protocol/src/config-types.ts`.
- runner-domain types in `protocol/src/test-types.ts` + `protocol/src/runner-types.ts` (move to `@conciv/test-runner`), the `tsdown.config.ts` entries and `package.json` export subpaths for them, **except** `EditorOpenSchema` (carved into `editor-types.ts`, stays).
- `subscribeTestRunner?` from `protocol/src/tool-view-types.ts:23` and its wiring in `widget/src/chat-panel.tsx:459` (keep `openEditor`/`sendMessage`).
- `tools/src/test.ts`, `concivTestServerTool` + the `conciv_test` entries in `tools/src/server.ts`/`defs.ts`/`tools.ts`, and `ConcivToolContext.test` (`tools/src/types.ts:12`).
- `tool-ui/src/cards/test.tsx`, `test.stories.tsx`, the `testTool`/`TestCard` exports + `builtinToolCards` entry in `tool-ui/src/index.tsx`, the `conciv_test` case in `now-title.ts:65`.
- `widget/src/test-card.tsx` and the `mountTestCardForTest` / `__CONCIV_RENDER_TEST_CARD__` seam in `mount.tsx` (the browser IT moves to the extension and drives the real card).
- the test-runner line in `harness/src/claude/system-prompt.ts:9`.
- `cli/src/test.ts` + its registration in `cli/src/tools.ts:4,11` (moves to the extension).
- Test cleanup (existing tests referencing relocated symbols): `core/test/api/test-runner/*`, `core/test/helpers/server.ts:68` (`testRunner:'vitest'`), `core/test/config.test.ts`, relevant `core/test/api/mcp` + `chat` ITs, `tools/test/test-tool.it.test.ts`, `widget/test/widget.it.test.ts` (the `__CONCIV_RENDER_TEST_CARD__` driver), `protocol/test/define-runner.test.ts`, `cli/test/cli.it.test.ts:77`.

## Testing (real server, real browser, no mocks)

- **Clean-core regression (the proof of the goal):** boot core with zero extensions — no `/api/ext/test-runner/*` (or legacy `/api/test-runner/*`) route exists, no `testRunner` config key is read, the `tool-view-types`/`tools`/`tool-ui` public surfaces contain no test-runner symbol, and a non-loopback `Origin` on an extension route is rejected 403.
- **Node IT:** load the extension; `.server()` parses typed config; routes serve under `/api/ext/test-runner/*`; `conciv_test` executes over `/api/mcp` against the injected `runner`; `dispose` calls `runner.stop()` on `engine.stop`.
- **Browser IT (moved from widget):** the live card subscribes via `.client()` SSE, renders streaming rows + spinner + collapse, run-end teardown keeps a later run from overwriting, Fix/Open actions fire, static render parses `TestRunResultSchema`; one panel rendering the card + a status-slot Component opens exactly one EventSource; HMR re-run does not duplicate it (`dispose` fires).
- **Build IT (hard CI gate):** the extension's client chunk contains no `@conciv/test-runner` main / `h3` / `node:*` import; the server view does.
- **CLI IT:** with the extension loaded, `conciv tools test run` (with `patterns`/`testNamePattern`/`failedOnly`) and `list?failed=1`/`status`/`open`/`stop` hit `/api/ext/test-runner/*` and round-trip; without the extension, the command reports a clean "not available" (not a raw 404 stack).
- **Type tests:** `useContext(select)` narrows; the extension `context` is rejected at compile time if it omits a key a tool's declared `Ctx` requires.
- **Story:** the moved `test.stories.tsx` renders static + live states.

## Implementation slices

Deletions must co-land with the removal of their last consumer; the `subscribeTestRunner` deletion in particular cannot precede the card's relocation, or the build is red. The slices are therefore fewer and more atomic than a naive 1-API/2-API/3-move/4-delete split.

1. **API foundations (Gaps 1 + 3, server lifecycle).** `ExtensionBuilder<Config, Tools, ServerContext, ClientValue>` generics (drop the `as unknown as` cast), `defineTool<Schema, Ctx>`, `configSchema` on `defineExtension`, the two-phase server lifecycle in `engine`/`makeApp` (run `.server()` in the App phase, thread context into `mcp.ts` `execute(args, ctx)`, collect `dispose`), the namespaced `server.route` `{get, post, sse}` surface (sse = `sseStream`, namespace-enforced, registered after CORS). `nowTitle` on `defineTool` + `now-title.ts` threading. Unit + node IT against a fixture extension. No test-runner code touched yet.
2. **Client factory context (Gap 4).** `.client(client => ...)` argument, per-panel single-run lifecycle, per-extension `value` merge into `ExtensionRuntimeContext`, tool-card subtree wrapped by the per-panel Provider. Browser IT against a fixture. `subscribeTestRunner` is **not** deleted here (its consumer still exists).
3. **Protocol/type relocation.** Move runner-domain types + `isRunnerUnavailable` into `@conciv/test-runner` (node-free `events` entrypoint for client schemas); carve `EditorOpenSchema` into `protocol/editor-types.ts`; re-point all importers. Settle the package-naming convention.
4. **Atomic move + delete (the no-regression slice).** Create `@conciv/extension-test-runner` (with pre-split build), move the tool/card/stories/CLI/route wiring/422-mapping into it, register it as a built-in, AND in the same change delete every core/widget/protocol/tools/tool-ui/cli/harness copy + `subscribeTestRunner` + the test files. Run the clean-core regression. This slice is where "no regressions" and "zero residue" are jointly proven; it must land as one coherent change.
5. **Authoring surface (folds into base-spec slice 5).** Update `catalog.ts` templates/`validateSource`, the scaffold, and `SKILL.md` to the new contract additions: `configSchema`, the `.server((input, ctx))` injected context, `nowTitle`, and `server.route`/`sse`. The agent-tool IT asserts the new surface.

## Open items (resolved during planning, not blocking design)

1. Whether the extension API exposes a first-class **CLI-contribution seam** or built-in extensions just ship a CLI command file the CLI imports. (The test-runner needs `conciv tools test`.)
2. Exact `server.route` namespace prefix (`/api/ext/<name>/` proposed) and how the host derives `<name>` (extension `name` field, slugified).
3. Whether per-extension config is a flat `extensions['name']` map or nested under a reserved key; align with the plugin discovery config in the base spec.
4. Single home for runner-domain types: confirmed `@conciv/test-runner` (with a node-free `events` subpath) over the extension, to avoid the cycle.
