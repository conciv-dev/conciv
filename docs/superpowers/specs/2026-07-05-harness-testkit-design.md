# Harness Testkit — non-flaky, harness-agnostic integration testing

Date: 2026-07-05
Status: Design (approved shape, pending spec review)

## Problem

Our real-claude integration tests are flaky, and the flakiness is structural, not incidental.

- **Root cause.** `packages/core/test/helpers/server.ts` consumes `/api/chat/attach` by grabbing a
  fixed **5-second snapshot** of the SSE text (`attach(..., {timeoutMs ?? 5000})`) and asserting on it.
  Real claude routinely takes longer than 5s to reach the asserted event (a tool call, an injected UI
  spec, final text), so the assertion runs against a half-finished run and fails intermittently. When
  claude happens to be fast, it passes. This is a time-boxed snapshot masquerading as an assertion.
- **No shared setup.** `hasClaude()` is copy-pasted in 3+ files; there is no shared fake/real
  parametrization, so every real-claude test re-invents the fragile bits.
- **Fake vs real is a global env read.** `packages/harness/src/claude/index.ts` picks the transport at
  import time: `const USE_SDK = !process.env.CONCIV_CLAUDE_CLI`. `CONCIV_CLAUDE_CLI` set → CLI-spawn
  path (fake tests); unset → SDK path (production + real tests). The two claude variants even carry
  **different capabilities** (`permissionGate` callback vs hook, `compaction`, `slashCommands`), so
  today's fake tests exercise a different transport *and* capability set than production real claude.
- **Not claude-specific.** We support multiple harnesses (claude, codex, and more to come). The
  testing capability must work for any harness, derived from its definition — not hand-written per
  harness.

## Goals

1. Kill the time-boxed snapshot. Tests consume the run's actual events (push): resolve the instant the
   awaited event arrives, fail fast if the run ends without it, and only trip a large hang-guard on a
   genuine stall.
2. One test body runs both **fake** (deterministic, what CI runs — no claude there) and **real**
   (local only, skipped when claude is absent). The test never encodes which; it is chosen by the
   harness object passed in.
3. Works for **any** harness, derived automatically from its `defineHarness` definition.
4. **No mocks, no stubs, no test code in production `src`.** The kit drives real seams only: the
   `spawnHarness`/harness DI point (already used by `engine.ts`) and the real HTTP/MCP endpoints. The
   fake harness is a real `HarnessAdapter` with deterministic control seams, not a mock.
5. Remove the `CONCIV_CLAUDE_CLI` / `USE_SDK` global env read in favor of an explicit harness choice.

## Non-goals

- Faking model *vision* (e.g. `claude-image.it` "sees red"). That asserts real claude vision; its
  deterministic sibling `image-result.it` (real MCP client, no LLM) already covers the wiring. It stays
  real-only.
- Exercising `decode` / real transport through the fake path. Those have dedicated tests
  (`claude-decode.test.ts`, `codex-decode.test.ts`) and the real-mode runs. The fake harness feeds
  deterministic events into everything *downstream* of the model call, which is where the flakiness is.

## Architecture

Two functions, clean separation of concerns:

```ts
// harness-level: wrap a real HarnessAdapter, adding ONLY the seams tests need
const testHarness = createTestHarness(claude)        // sync, pure

// orchestration: boot the real server around a TestHarness, own lifecycle + verbs
const testkit = createTestkit(testHarness)           // sync, holds config
const kit = await testkit.setup()                    // async — boots real server, returns live handle
// ... kit.chat(...), kit.callTool(...), kit.attach()
await kit.cleanup()
```

Fake vs real is which harness object you pass — no `mode` flag:

```ts
describe.each([claude, createTestHarness(claude)])('conciv_ui', (harness) => {
  const testkit = createTestkit(harness)
  // real element = claude; fake element = createTestHarness(claude)
})
```

`createTestkit` accepts **any** `HarnessAdapter`. `createTestHarness(real)` returns a `TestHarness`
(the real adapter + control seams). Passing the raw real adapter runs real; passing the wrapped one
runs deterministically when the test drives the seams.

### The TestHarness interface — exactly two seams

`StreamChunk` (AG-UI events) is the universal output contract for every harness. The only place an
adapter "talks to the model" is `run: (turn, ctx) => AsyncGenerator<StreamChunk>` (or the
`spawnHarness` + `decode` fallback when `run` is absent). `harnessText` already prefers `run`
(`if (harness.run) yield* harness.run(...)`), so attaching a `run` makes even spawn-only harnesses
(codex) deterministic — no per-harness wire-protocol faking.

`createTestHarness(real)` returns `{...real, run: scriptedRun, shutdown, release}` where `scriptedRun`
exposes:

1. **Injectable run** — the turn emits a scripted `StreamChunk` sequence (default: a minimal valid
   lifecycle `RUN_STARTED → text → RUN_FINISHED`), or falls through to the real transport in real mode.
2. **Turn hold/release** — the scripted run can stay open until signaled, so the kit can fire a real
   mid-turn action (call `conciv_ui` over the real MCP client → real injection into the live turn) and
   then let the turn finish.

Anything beyond these two seams is a smell and must be justified. `decode`, `capabilities`, `history`,
`tty`, MCP, server, uiBus, hub, attach stay real and untouched. Both seams live in the
`createTestHarness` output, never in `packages/*/src`.

### The event consumer — push, not snapshot

`kit.attach()` (and the raw-generator path for harness-layer tests) returns a `RunStream` over an
`AsyncIterable<StreamChunk>`:

```ts
type RunStream = {
  waitFor(match: (e: StreamChunk) => boolean, opts?: {hangGuardMs?: number}): Promise<StreamChunk>
  waitForUiSpec(question?: string): Promise<UiSpec>
  waitForText(substr: string): Promise<void>
  done(opts?: {hangGuardMs?: number}): Promise<RunEvents>   // drain to RUN_FINISHED
}
type RunEvents = {
  all: StreamChunk[]
  text(): string; uiSpecs(): UiSpec[]; toolCalls(): {name: string; args: string}[]
  usage(): UsageSnapshot[]; errors(): string[]; runs(): number
}
```

`waitFor` resolves on the first matching event; **rejects fast** if `RUN_FINISHED`/stream-close arrives
without a match (a deterministic failure, not a hang); `hangGuardMs` (default ~90s) trips only on a
genuine stall. Same primitive over Layer-A raw generators and Layer-B SSE — no time-boxed window
anywhere.

### Killing the global env read

`makeApp` currently resolves the harness from the global registry
(`requireHarness(cfg.harness) = getHarness(id) ?? getHarness('claude')`), and the claude adapter picks
its transport from `USE_SDK = !process.env.CONCIV_CLAUDE_CLI` at import. This is the only production
change required, and it is a legitimate DI seam (not test code):

- `MakeAppOpts` (and `StartOpts`) gain an optional `harness?: HarnessAdapter`, defaulting to
  `requireHarness(cfg.harness)`. `engine.ts` passes the resolved adapter; the testkit passes its
  `TestHarness`.
- The `USE_SDK` import-time global goes away; the SDK-vs-spawn choice becomes which adapter is
  constructed/passed. `CONCIV_CLAUDE_CLI` is removed from the test path entirely.

## Package layout

New node-level package `@conciv/harness-testkit` (no browser/Playwright deps), mirroring
`extension-testkit`'s one-file-per-concern structure. Public surface: `createTestHarness`,
`createTestkit` (+ their types). Everything else is internal.

```
packages/harness-testkit/src/
  create-test-harness.ts   createTestHarness(real) → TestHarness (adds the two seams)
  create-testkit.ts        createTestkit(harness) → {setup} ; setup() → live kit handle
  run-stream.ts            makeRunStream(source): waitFor / waitForUiSpec / waitForText / done
  run-events.ts            RunEvents typed queries
  call-tool.ts             MCP tool call via real @tanstack/ai-mcp client (shared shape w/ extension-testkit)
  scripted-run.ts          the injectable + hold/release run seam implementation
```

`extension-testkit` (browser layer) depends on `@conciv/harness-testkit` for boot + harness selection
so browser tests (e.g. `terminal-mode.it`) get the same fake/real capability instead of duplicating it.

## Migration (all test layers)

- **Layer B — core HTTP ITs** (`chat.it`, `claude-mcp.it`, `claude-image.it`, `sessions.it`,
  `turn-detach.it`, `turn-end.it`, `extension-server-surfaces.it`): replace `startTestServer` +
  `postChat` 5s snapshot with `createTestkit(harness).setup()` + `RunStream`. `claude-mcp.it` becomes a
  mode-blind body using the hold/release seam for the injection. `claude-image.it` stays real-only
  (vision); `image-result.it` is its CI sibling.
- **Layer A — harness ITs** (`claude-sdk.it`, `text-adapter.it`): consume via `makeRunStream(...)` over
  the raw generator; drop the duplicated local `hasClaude()`.
- **Layer C — browser** (`terminal-mode.it`, `reload-continuity.it`, widget/extensions): `extension-testkit`
  gains harness selection from the foundation; `terminal-mode.it` gets a deterministic fake variant on
  top of the same TestHarness.

## Testing the testkit

- Unit-test `scripted-run` (script emission, hold/release), `run-stream` (resolve-on-match,
  reject-on-run-end-without-match, hang-guard), `run-events` queries — all deterministic, no claude.
- The fake path of every migrated test is itself the integration coverage for `createTestkit` +
  `createTestHarness`.

## Open questions / risks

- **Mid-turn injection ordering.** The fake `scriptedRun` must keep the turn's uiBus channel live while
  the kit calls `conciv_ui`. Verified feasible: `turn.ts` does `merged = uiBus.run(sessionId, stream)`
  then `hub.start(...)`, so an injection during a live turn reaches every `attach` subscriber. The
  hold/release seam gates the run so the tool call lands before `RUN_FINISHED`.
- **`makeApp` harness DI.** Small, additive, defaulted — but touches production. Justified: it also
  removes the `USE_SDK` global, a net production improvement.
- **Real-mode residual variance.** Real claude can't be isolated here (OAuth lives in the config dir;
  no API key), so real-mode runs still inherit global hooks/CLAUDE.md and can be slow. `waitFor` +
  hang-guard absorb latency; real mode is local-only and never gates CI.
```
