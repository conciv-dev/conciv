# devgent adapter architecture — design

**Date:** 2026-06-13
**Status:** approved (design); implementation plan to follow

## Problem

The current codebase hard-wires three concrete tools into one Vite plugin:

- **Harness = Claude.** `claude` is woven through ~8 files: argv builder (`claude-args.ts`),
  stream-json→AG-UI decoder (`claude-agui-stream.ts`), lock, `--resume` session tracking,
  JSONL transcript history (`history-parser.ts` + `transcript-path.ts`), and the risky-Bash
  permission gate (Claude's `--settings` PreToolUse HTTP hook → `/__pw/chat/permission`).
- **Test runner = Vitest.** `vitest-manager.ts`, `vitest-runner-child.ts`, `vitest-route.ts`,
  `vitest-types.ts`, the CLI `vitest` subcommand, and the widget `vitest-card.tsx`.
- **Bundler = Vite.** The whole `@devgent/vite-plugin` package *is* a Vite `Plugin`
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
  bundler entry only injects HTML + boots it. Writes the server *once* for all bundlers. Cost:
  cross-origin → set the existing `pw-api-base` meta to the core port + CORS (the chat stream
  already sends `access-control-allow-origin: *`). Vite may optionally proxy `/__pw` same-origin
  later as an optimization, but is not required.

## Architecture — three orthogonal seams

### Package layout (~12 packages)

```
@devgent/protocol      types only: HarnessAdapter, TestRunnerManager, TestEvent, chat/ui/page
@devgent/core          h3 + srvx engine — /__pw routes, lock, session, uiBus, registry wiring
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
  resume: boolean                    // can --resume a prior session
  permissionGate: 'hook' | 'none'    // can call back mid-turn for tool approval
  transcriptHistory: boolean         // can hydrate prior turns from disk
  systemPrompt: 'file' | 'flag' | 'none'
}

type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string             // provided by core iff permissionGate === 'hook'
}

type HarnessChild = { pid: number; stdout: Readable; stderr: Readable; kill(): void }

type HarnessAdapter = {
  id: string                         // 'claude' | 'codex' | …
  binName: string                    // default binary on PATH
  capabilities: HarnessCapabilities
  buildArgs(turn: HarnessTurn): string[]
  decode(lines: AsyncIterable<string>, opts: {onSessionId(id: string): void}): AsyncGenerator<StreamChunk>
  transcriptPath?(cwd: string, sessionId: string): string   // present iff transcriptHistory
  parseHistory?(raw: string): UIMessage[]                    // present iff transcriptHistory
}
```

`@devgent/core`'s chat route becomes harness-agnostic: it takes a resolved `HarnessAdapter` + a
spawn seam, and **feature-detects by capability**:

| Capability absent | Core behavior (graceful degradation) |
|---|---|
| `permissionGate: 'none'` | No `/permission` route wired; risky-Bash relies on the harness's own sandbox/approval. No mid-turn approval card. |
| `transcriptHistory: false` | No `/history` route; widget hydrates from the live thread only. |
| `resume: false` | Each turn starts fresh; session store still tracks the latest id for display. |
| `systemPrompt: 'none'` | System prompt prepended to the first turn's prompt instead of via flag/file. |

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

## Data flow (unchanged in shape, now adapter-driven)

```
page  ──widget──>  /__pw/chat (h3 SSE)  ──>  core resolves HarnessAdapter
                                              ├─ buildArgs(turn) → spawn harness child
                                              ├─ decode(stdout) → AG-UI StreamChunk stream
                                              ├─ uiBus merges generative-UI CUSTOM events
                                              └─ createEventStream → web ReadableStream → SSE
agent ──Bash──>  devgent tools test run  ──>  /__pw/test  ──>  core resolves TestRunnerAdapter
                                              └─ driver spawns clean child → TestEvent NDJSON
                                                 → SSE /__pw/test/stream  → widget test-card
```

## Configuration

`DevgentConfig` generalizes the current claude/vitest fields:

```ts
interface DevgentConfig {
  enabled?: boolean
  widgetUrl?: string
  previewId?: string
  lockDir?: string
  harness?: string        // adapter id, default 'claude'   (was claudePath/claudeSessionId)
  harnessBin?: string     // override the binary on PATH
  sessionId?: string      // resume a prior session (was claudeSessionId)
  testRunner?: string     // adapter id, default 'vitest'
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
