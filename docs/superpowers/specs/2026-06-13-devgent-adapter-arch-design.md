# devgent adapter architecture — design

**Date:** 2026-06-13
**Status:** approved (design); implementation plan to follow

## Coding conventions (HARD RULES — read first, non-negotiable)

These were learned painfully. Follow them from the first line of code; do not wait to be told.

1. **No type casts.** `as` is banned except `as const`. No angle-bracket casts. No `!` non-null
   assertions. No IIFEs. No `index.ts` barrels (name files after contents; subpath exports point
   at named files). Reach correctness via generics, discriminated unions, `satisfies`, and Zod.
2. **Zod for ALL parsed/untrusted data — never hand-roll guards.** Do NOT write `isRecord` /
   `JSON.parse(x) as T` / manual `typeof` field-poking to validate data.
   - HTTP request bodies → h3 `readValidatedBody(event, Schema)` (auto-400) or
     `readValidatedBody(event, Schema.safeParse)` when a malformed body must stay lenient.
     Query → `getValidatedQuery(event, Schema)`.
   - NDJSON / stream-json / on-disk JSON → `Schema.safeParse(JSON.parse(line))`.
   - Wire-type schemas live in `@devgent/protocol`; TS types are **inferred** (`z.infer`) — one
     source of truth. Route-local body schemas sit next to the route.
   - The ONLY guards allowed are non-data ones: narrowing a caught `Error`, or a
     dynamically-imported module's function surface (`z.custom`/`instanceof`). Everything that
     parses data uses Zod.
3. **`define*` factories for every interface/seam.** Each is generic: `defineX<T extends X>(x: T): T`.
   Every implementation is authored through its `define*` — never a bare object/function literal.
   Composed members are each their own named interface + factory (harness has
   `HarnessArgsBuilder`/`HarnessDecoder`/`HarnessHistory`, each with `defineHarnessArgs`/`...Decoder`/`...History`).
4. **All HTTP routes under `api/`**, grouped by domain. Route paths are `/api/...` (core is a
   standalone backend on its own port — `/api` self-documents that). One naming convention: the
   folder signals the layer, the entry file is named after its folder (`api/chat/chat.ts`), NO
   mixed `-route`/`-gate` suffixes.
5. **`@devgent/core` is bundler-agnostic.** It must not import vite/webpack/etc. Dev-server
   inspection goes through the `BundlerBridge` interface (protocol), implemented in the plugin
   packages. Group `core/src` by domain (chat/, harness/, runner/, page/, server/, editor/), not flat.
6. **Verify library APIs against real docs (online), not `.d.ts` grepping or memory.** For h3
   especially: pin **h3 2.0.1-rc.22** (2.0.0 is a broken publish). h3 v2 facts: `new H3()`;
   `app.get/post(path, handler)`; handler gets `event`; **`event.req`** is the web `Request`
   (`.json()`, `.method`, `.signal`, `.headers`) — NOT `event.request`; `event.url` is a URL;
   set status with `event.res.status = N`; return a plain object → JSON; return
   `new Response(readableStream, {headers})` for SSE (works with `text/event-stream`). Listener:
   srvx `serve({fetch: app.fetch, port})`, then `server.url` (there is no `server.port` — parse it).
7. **Terse comments.** No multi-line explanatory essays. One line where it earns its place.
8. **DRY.** Extract shared schemas/helpers (e.g. claude content blocks → `claude/blocks.ts`).
9. **Workflow.** Commit straight to `main` (no feature branches). Deliver the whole requested
   scope in one pass (don't gate phase-by-phase). Verify with typecheck (fast); for the slow
   vitest IT, verify the underlying path directly rather than blocking on cold-start.

## Problem

The current codebase hard-wires three concrete tools into one Vite plugin:

- **Harness = Claude.** `claude` is woven through ~8 files: argv builder (`claude-args.ts`),
  stream-json→AG-UI decoder (`claude-agui-stream.ts`), lock, `--resume` session tracking,
  JSONL transcript history (`history-parser.ts` + `transcript-path.ts`), and the risky-Bash
  permission gate (Claude's `--settings` PreToolUse HTTP hook → `/api/chat/permission`).
- **Test runner = Vitest.** `vitest-manager.ts`, `vitest-runner-child.ts`, `vitest-route.ts`,
  `vitest-types.ts`, the CLI `vitest` subcommand, and the widget `vitest-card.tsx`.
- **Bundler = Vite.** The whole `@devgent/vite-plugin` package _is_ a Vite `Plugin`
  (`transformIndexHtml`, `configureServer`, connect `server.middlewares`, `ViteDevServer`).

We want to swap each of these independently: add harnesses (codex, gemini-cli, opencode, pi),
test runners (jest, node:test, playwright), and bundlers (webpack, rspack, rollup, esbuild)
without touching the others.

## Goals

1. **Harness adapters** — Claude becomes one adapter among many, behind a capability-declaring
   interface that degrades gracefully when a harness lacks a feature.
2. **Test-runner adapters** — Vitest becomes one runner behind a generalized interface.
3. **Bundler-agnostic plugin** via [unplugin](https://github.com/unjs/unplugin): one core
   factory + a thin package per bundler.
4. **Drop-in extensibility** — adding an adapter is a new subfolder + one export line; third
   parties can register their own adapters at runtime against published interfaces.

## Non-goals

- Implementing all five harnesses now. We ship the abstraction + **claude** (port the
  existing implementation) + **codex** (proof of the seam). gemini-cli / opencode / pi land as
  capability-only stubs.
- Persistent test-watch / `@vitest/ui` server (already deferred in the current code).

## Key technology decisions

- **unplugin** (unjs) for the bundler seam — single `createUnplugin` factory, per-bundler entry
  packages. Standard unplugin pattern.
- **h3** (unjs) + **srvx/listhen** for the engine's HTTP surface, **not** raw `node:http` and
  **not** Nitro. h3 is the embeddable micro-framework (router + handlers + first-class SSE via
  `createEventStream`); it is web-standard (`Request`/`Response`/`ReadableStream`) so TanStack's
  `toServerSentEventsStream()` web stream returns directly from a handler — deletes the current
  hand-rolled `Readable.fromWeb`/`pipeline` SSE glue. Nitro is the deploy-time macro-framework
  (file routing, server bundling, deploy presets) — dead weight for a dev-only embedded sidecar.
  h3→Nitro stays an open upgrade path if devgent core ever becomes a standalone daemon.
- **Standalone engine server** (option A): `@devgent/core` boots its own h3 server in dev; each
  bundler entry only injects HTML + boots it. Writes the server _once_ for all bundlers. Cost:
  cross-origin → set the existing `pw-api-base` meta to the core port + CORS (the chat stream
  already sends `access-control-allow-origin: *`). Vite may optionally proxy `/api` same-origin
  later as an optimization, but is not required.

## Architecture — three orthogonal seams

### Package layout (~12 packages)

```
@devgent/protocol      types only: HarnessAdapter, TestRunnerManager, BundlerBridge, TestEvent, chat/ui/page
@devgent/core          h3 + srvx engine — /api routes, lock, session, uiBus, registry wiring
@devgent/harness       claude, codex (+ gemini-cli/opencode/pi stubs) via subpaths
@devgent/runner        vitest, jest, node-test, playwright via subpaths
@devgent/plugin-core   unplugin factory; boots @devgent/core + injects the widget HTML tags
@devgent/plugin-vite   thin entry: export default unplugin.vite     (file: vite.ts)
@devgent/plugin-webpack export default unplugin.webpack
@devgent/plugin-rspack  export default unplugin.rspack
@devgent/plugin-rollup  export default unplugin.rollup
@devgent/plugin-esbuild export default unplugin.esbuild
@devgent/cli           generic `devgent tools test|page|server|open|ui`
@devgent/widget        generic test-card over TestEvent
```

**Conventions**

- **No `index.ts` barrels** anywhere. Each file is named after its contents; package `exports`
  subpaths point at named files.
- Adapter **interfaces/types live in `@devgent/protocol`** (zero-runtime, already a universal
  dep). Adapters depend only on `@devgent/protocol` for their contract — never on the engine.
- `@devgent/core` = the engine (framework-free h3 app). `@devgent/plugin-core` = the unplugin
  glue that boots the engine and injects HTML. Distinct responsibilities, distinct packages.

### Seam 1 — Harness adapters (capability-based)

```ts
// @devgent/protocol/harness-types
type HarnessCapabilities = {
  resume: boolean // can --resume a prior session
  permissionGate: 'hook' | 'none' // can call back mid-turn for tool approval
  transcriptHistory: boolean // can hydrate prior turns from disk
  systemPrompt: 'file' | 'flag' | 'none'
}

type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string // provided by core iff permissionGate === 'hook'
}

type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; kill(): void}

// Each harness member is its OWN named interface with its OWN generic define* factory — never a
// bare function/object literal. The adapter composes them.
type HarnessArgsBuilder = (turn: HarnessTurn) => string[]
type HarnessDecoder = (
  lines: AsyncIterable<string>,
  opts: {onSessionId(id: string): void},
) => AsyncGenerator<StreamChunk>
type HarnessHistory = {transcriptPath(cwd: string, sessionId: string): string; parse(raw: string): UIMessage[]}
// + defineHarnessArgs / defineHarnessDecoder / defineHarnessHistory (all generic <T extends …>)

type HarnessAdapter = {
  id: string // 'claude' | 'codex' | …
  binName: string // default binary on PATH
  capabilities: HarnessCapabilities
  buildArgs: HarnessArgsBuilder
  decode: HarnessDecoder
  history?: HarnessHistory // present iff capabilities.transcriptHistory
}
```

`@devgent/core`'s chat route becomes harness-agnostic: it takes a resolved `HarnessAdapter` + a
spawn seam, and **feature-detects by capability**:

| Capability absent          | Core behavior (graceful degradation)                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `permissionGate: 'none'`   | No `/permission` route wired; risky-Bash relies on the harness's own sandbox/approval. No mid-turn approval card. |
| `transcriptHistory: false` | No `/history` route; widget hydrates from the live thread only.                                                   |
| `resume: false`            | Each turn starts fresh; session store still tracks the latest id for display.                                     |
| `systemPrompt: 'none'`     | System prompt prepended to the first turn's prompt instead of via flag/file.                                      |

**File mapping (current → harness package):**

- `claude-args.ts` → `harness/src/claude/args.ts` (`buildArgs`)
- `claude-agui-stream.ts` → `harness/src/claude/decode.ts` (`decode`)
- `transcript-path.ts` + `history-parser.ts` → `harness/src/claude/history.ts`
- `chat-system-prompt.ts` → `harness/src/claude/system-prompt.ts`
- `claude-lock.ts` → stays in `@devgent/core` (already harness-agnostic; rename `claude.lock` → `agent.lock`)

claude capabilities: `{resume:true, permissionGate:'hook', transcriptHistory:true, systemPrompt:'file'}`.
codex capabilities (proof): research `codex exec` JSON event output + sandbox model; likely
`{resume:?, permissionGate:'none', transcriptHistory:?, systemPrompt:'flag'}` — confirmed during impl.

Registry (`harness/src/registry.ts`): `registerHarness`, `getHarness(id)`, `listHarnesses`.
External adapters call `registerHarness` at runtime; they need only `@devgent/protocol`.

### Authoring adapters — `define*` typed factories

Every seam ships a typed factory helper from `@devgent/protocol` so adapters self-define with
full inference, autocomplete, and capability validation — the `defineConfig`/unplugin idiom.
A `define*` helper is a typed function (not a bare identity): it locks the type, applies
defaults, and dev-asserts capability/method consistency at definition time.

The helpers are **generic** so they preserve each adapter's exact literal type (no widening):

```ts
// @devgent/protocol/harness-types
export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  // dev-time invariant: declared capabilities must match provided methods
  if (adapter.capabilities.transcriptHistory && !(adapter.transcriptPath && adapter.parseHistory))
    throw new Error(`harness "${adapter.id}": transcriptHistory requires transcriptPath + parseHistory`)
  return adapter
}

// @devgent/protocol/runner-types
export function defineRunner<T extends TestRunnerAdapter>(adapter: T): T {
  /* + invariants */ return adapter
}

// @devgent/protocol/config
export function defineConfig<T extends DevgentConfig>(config: T): T {
  return config
}
```

Each adapter is written as `export const claude = defineHarness({ … })`, `export const vitest =
defineRunner({ … })`. The bundler seam uses unplugin's own `createUnplugin` factory as its
`define*` equivalent. Rule: **no adapter is defined as a bare object literal** — always through
its `define*` helper, so the contract is enforced and inferred, not hand-typed.

### Typing discipline (hard rule)

**No type casting anywhere — `as` (except `as const`) and angle-bracket casts are banned.**
Reach correctness through **generics, type guards, discriminated unions, and `satisfies`** —
never assertions. Concretely:

- Parsing untrusted input (JSON lines, child messages, request bodies) goes through **type-guard
  functions** (`isRecord`, `isTestEvent`, `isChatRequest`) that narrow, not `JSON.parse(...) as T`.
- The harness `decode` and runner child message streams use **discriminated unions** keyed on
  `type`, narrowed by `switch`/guards — the existing `as Extract<…>` filters get rewritten as guards.
- Generic seams (`defineHarness<T>`, `getHarness<…>`, the driver's message reader) carry the type
  through parameters instead of casting the result.
- Web/Node stream bridging that today casts (`Readable.fromWeb(x as …)`) is replaced by h3's
  native web-stream return path, eliminating the cast.

This applies to all ported code, not just new code: porting a file is also de-casting it.

### Seam 2 — Test-runner adapters

The current `VitestManager` interface (`list / run / status / subscribeRaw / emitSnapshot /
openUiServer / stop`) is already runner-neutral — generalize the name to **`TestRunnerManager`**
and lift `VitestEvent` → **`TestEvent`** into `@devgent/protocol` (shapes `run-start / test /
file-end / run-end / snapshot` are already runner-agnostic).

```
packages/runner/src/
  registry.ts                        registerRunner / getRunner / listRunners
  driver.ts                          shared: clean-env spawn + NDJSON-on-fd3 reader
                                     (the reusable core of today's vitest-manager.ts)
  vitest/{vitest.ts, child.ts}       child.ts = today's vitest-runner-child.ts
  jest/{jest.ts, child.ts}
  node-test/{node-test.ts, child.ts}
  playwright/{playwright.ts, child.ts}
```

- **vitest** — port existing manager + child verbatim onto the shared driver.
- **jest / node:test** — straight fits (per-file, per-test, pass/fail) onto `TestEvent`.
- **playwright** — looser fit: e2e with browser lifecycle. Adapter maps Playwright's JSON
  reporter onto `TestEvent`; `capabilities.watch = false`. Flagged as the seam-stressing case;
  validates the abstraction isn't vitest-shaped.

Each runner declares `capabilities: { watch, uiServer, filterByName, failedOnly }`. The
`@devgent/core` test route + widget card consume `TestEvent` only — runner-blind.

**Wrapper types are the contract.** The word "vitest" must not appear in any `@devgent/protocol`
type name, in `@devgent/core`'s test route, or in `@devgent/widget`. `vitest-types.ts` is renamed
`test-types.ts` and its types lose the runner prefix: `VitestEvent → TestEvent`,
`RunResult → TestRunResult`, etc. Each runner adapter owns the dirty translation from its native
output into these wrapper types and emits **only** wrapper types across the fd3/NDJSON channel:

```
runner native output        adapter (runner pkg)        wrapper types (protocol)        consumer
────────────────────        ────────────────────        ────────────────────────        ────────
vitest reporter events  ─┐
jest reporter events    ─┼─►  map → TestEvent /     ─►   TestEvent, TestRow,        ─►   widget test-card
node:test events        ─┤     TestRunResult             FileState, Summary,             + core test route
playwright JSON report  ─┘                               TestError                       (these types only)
```

This mirrors the harness side exactly: the widget speaks AG-UI `StreamChunk`, never Claude's
stream-json. Consumers depend on `@devgent/protocol` wrapper types only — zero runner imports.

### Seam 3 — Bundler via unplugin

`@devgent/plugin-core` exports a `createUnplugin((opts) => ({ name: 'devgent', vite: {...},
webpack: {...}, rspack: {...}, rollup: {...}, esbuild: {...} }))`. Per-bundler logic is reduced
to two things:

1. **Boot the engine** — on dev-server start, `@devgent/core` `.start(opts)` → `{ port, stop }`.
2. **Inject HTML** — the existing `headTags(previewId, widgetUrl)` (meta `pw-api-base` = core
   port, `pw-preview-id`, deferred widget `<script>`). The only genuinely per-bundler code:
   Vite `transformIndexHtml` vs webpack `HtmlWebpackPlugin` tap vs rspack equivalent.

Each bundler package (`@devgent/plugin-vite`, `-webpack`, `-rspack`, `-rollup`, `-esbuild`) is a
single named file re-exporting the matching unplugin entry, e.g. `vite.ts`:
`export {default} from '@devgent/plugin-core/vite'` (i.e. `unplugin.vite`). Adding a bundler =
one new 1-file package once `plugin-core` declares that hook.

### Seam 3b — Bundler bridge (`@devgent/core` stays bundler-agnostic)

Beyond boot + HTML injection, the agent can **inspect and drive the live dev server** via
`devgent tools server …` (config, resolve, module-graph, transform, urls, reload, restart).
Those operations are bundler-specific — Vite's module graph + HMR are nothing like webpack's.
So **`@devgent/core` must not import Vite**. The dev-server operations are abstracted behind a
`BundlerBridge` interface in `@devgent/protocol`; each bundler implements it in its own plugin
package and passes it to `engine.start({bridge})`:

```ts
// @devgent/protocol/bundler-types
export type BundlerBridge = {
  id: string // 'vite' | 'webpack' | …
  config(): {
    root: string
    base: string
    mode: string
    aliases: {find: string; replacement: string}[]
    plugins: string[]
  }
  resolve(spec: string, importer?: string): Promise<{id: string | null}>
  moduleGraph(file: string): {url: string; importers: string[]; importedModules: string[]}[]
  transform(url: string): Promise<{code: string | null}>
  urls(): {local: string[]; network: string[]}
  reload(file: string): Promise<void>
  restart(force?: boolean): Promise<void>
}
export function defineBundlerBridge<T extends BundlerBridge>(b: T): T {
  return b
}
```

- The Vite implementation (today's `tools-layer.ts`) lives in `@devgent/plugin-vite`
  (`@devgent/vite-plugin` until Plan 4) as `viteBridge` — **never in core**.
- Core's `api/server/server.ts` calls `bridge.*` only. The CLI surface is `devgent tools
server …` (generic), replacing the old `devgent tools vite …`.
- A bridge is optional: `engine.start()` without one simply doesn't mount `/api/server/*`
  (a build-only bundler like rollup/esbuild has no live dev server to inspect).

### `@devgent/core` internal layout (domain-grouped, mirrors the seam packages)

Core's `src/` is grouped by domain — **not flat**. **All HTTP routes live under `src/api/`**
(HARD RULE 4); each route entry file is named after its folder (no `-route`/`-gate` suffix), and
non-route domain logic lives under `src/<domain>/`. The `harness/` and `runner/` subfolders mirror
the future `@devgent/harness` / `@devgent/runner` packages so Plans 2 & 3 are near-straight moves:

```
core/src/
  engine.ts            start() + htmlTags() — composition root
  app.ts               makeApp(): h3 wiring
  config.ts
  api/                                              ← ALL HTTP routes; paths are /api/<domain>/…
    chat/    chat.ts  turn.ts  session.ts  permission.ts  messages.ts   (/api/chat*)
    page/    page.ts                                (/api/page/*  — page-bus, agnostic)
    server/  server.ts                              (/api/server/* — consumes BundlerBridge, agnostic; mounted iff a bridge is provided)
    test-runner/  test-runner.ts                    (/api/test-runner/* — consumes TestRunnerManager)
    editor/  editor.ts                              (/api/editor/open)
  chat/    ui-bus.ts  lock.ts  risk.ts  session-store.ts        (chat domain logic, no HTTP)
  harness/ registry.ts  claude/{adapter,args,decode,history,system-prompt,blocks}.ts   → @devgent/harness
  runner/  registry.ts  vitest/{adapter,manager,child}.ts                              → @devgent/runner
  page/    journal.ts                               (page domain logic)
  editor/  open.ts                                  (makeEditorOpener — agnostic)
```

## Data flow (unchanged in shape, now adapter-driven)

```
page  ──widget──>  /api/chat (h3 SSE)  ──>  core resolves HarnessAdapter
                                              ├─ buildArgs(turn) → spawn harness child
                                              ├─ decode(stdout) → AG-UI StreamChunk stream
                                              ├─ uiBus merges generative-UI CUSTOM events
                                              └─ web ReadableStream → new Response(stream) → SSE
agent ──Bash──>  devgent tools test run  ──>  /api/test-runner  ──>  core resolves TestRunnerAdapter
                                              └─ driver spawns clean child → TestEvent NDJSON
                                                 → SSE /api/test-runner/stream  → widget test-card
```

## Configuration

`DevgentConfig` generalizes the current claude/vitest fields:

```ts
interface DevgentConfig {
  enabled?: boolean
  widgetUrl?: string
  previewId?: string
  lockDir?: string
  harness?: string // adapter id, default 'claude'   (was claudePath/claudeSessionId)
  harnessBin?: string // override the binary on PATH
  sessionId?: string // resume a prior session (was claudeSessionId)
  testRunner?: string // adapter id, default 'vitest'
  systemPrompt?: string
}
```

Env fallbacks generalize `DEVGENT_CLAUDE_*` → `DEVGENT_HARNESS`, `DEVGENT_HARNESS_BIN`,
`DEVGENT_SESSION_ID`, `DEVGENT_TEST_RUNNER` (keep old names as deprecated aliases for one cycle).

## Testing strategy

- **Harness seam:** the existing `fake-claude.ts` fixture becomes a generic fake-harness; an
  IT asserts the chat stream, the approval gate (hook-capable harness), and a `permissionGate:
'none'` harness skips the gate cleanly.
- **Runner seam:** existing vitest IT fixtures stay; add a minimal jest + node:test fixture and
  assert identical `TestEvent` sequences through the shared driver. One playwright smoke fixture.
- **Plugin seam:** unplugin's test harness + the existing Playwright browser IT against the
  vite entry; a webpack entry IT proves HTML injection + engine boot on a second bundler.
- Capability matrix unit tests: each adapter's declared capabilities match its actual `buildArgs`/
  method presence (e.g. `transcriptHistory ⇒ transcriptPath && parseHistory` defined).

## Risks / open items

- **codex / gemini-cli / opencode / pi capability research** — each CLI's stream format, session
  model, and permission story must be confirmed against current docs during implementation; the
  capability table is the contract that absorbs the differences.
- **h3 v1→v2 API churn** — pin v2; confirm the exact SSE helper (`createEventStream`) and
  listener (`srvx` vs `listhen`) against installed docs before wiring.
- **Cross-origin engine** — standalone server reintroduces CORS + port wiring the same-origin
  middleware avoided; mitigated by existing `pw-api-base` meta + permissive CORS on streams.
- **Large blast radius** — nearly every `vite-plugin` file moves/renames. Done directly on main
  (no feature branch per project workflow); land in dependency order (protocol → core → harness/
  runner → plugin-core → bundler entries → cli/widget) keeping the suite green at each step.

```

```
