# Harness Testkit + non-flaky testing discipline

Date: 2026-07-05
Status: Design (approved shape, pending spec review)

This spec has two halves that ship together:

1. **`@conciv/harness-testkit`** — the foundation that makes server/harness integration tests
   deterministic and harness-agnostic.
2. **A suite-wide waiting discipline** — the primitives and rules that remove the *other* flakiness
   sources (arbitrary sleeps, hand-rolled polling, negative-assertion races) so every test — node or
   browser — has a non-flaky way to wait.

## Flakiness survey (what actually makes our tests flaky)

Measured across all 141 test files:

| Pattern | Where | Count | Fix |
| --- | --- | --- | --- |
| **Fixed snapshot window** — read the SSE for N ms, then assert on the text | `core/test/helpers/server.ts` `postChat` (5s); every core HTTP IT | ~15 ITs | `RunStream` (push consumer) |
| **Arbitrary sleep** — `waitForTimeout(ms)` / `sleep(ms)` before asserting | widget + whiteboard browser tests | **52 calls / 6 files** | `until(predicate)` condition wait |
| **Hand-rolled polling** — a local `until(cond, ms)` / `untilBuffer` deadline loop | terminal + widget tests | ~5 copies | one shared `until` with fail-fast |
| **Negative assertion after a sleep** — sleep, then assert something did *not* appear | e.g. `trigger-menu.it` (`/co` → wait 300ms → expect no listbox) | a handful | settle-signal recipe (below) |
| **Real-LLM variance / latency** — real claude slow or takes a ToolSearch detour | 5 real-claude ITs + `terminal-mode.it` | 6 tests | deterministic fake harness + `waitFor` + hang-guard |
| **Transport/capability divergence** — fake path runs a different claude transport than prod | `CONCIV_CLAUDE_CLI` / `USE_SDK` global | global | derive fake from the real definition; kill the global |

Not flaky and left alone: pure unit tests (`run-view`, `turn-hub`, `*-decode`), and `image-result.it`
(real MCP client, no LLM). `networkidle` is already absent (good).

## The one principle

**Never assert against an elapsed time window. Wait for a condition; a deadline is a hang-guard, not an
assertion window.**

Every wait resolves the instant its condition is true, **rejects fast** when a definitive terminal
signal says it can never become true (run finished, stream closed, process exited), and trips a large
`hangGuardMs` only on a genuine stall. No test asserts "after 300ms, X"; it asserts "when settled, X".

### Banned in tests (lint-enforceable)

- `page.waitForTimeout(...)`, `sleep(...)`, bare `setTimeout`-to-await as a synchronization step.
- Fixed-window stream snapshots (read-for-N-ms-then-assert).
- Hand-rolled `while (Date.now() - start < ms)` polling loops — use the shared `until`.
- `networkidle` on any page running the live widget (its SSE never idles).

## Part 1 — `@conciv/harness-testkit`

### Architecture

Two functions, clean separation:

```ts
const testHarness = createTestHarness(claude)   // sync, pure — real adapter + the two test seams
const testkit = createTestkit(testHarness)      // sync — holds config
const kit = await testkit.setup()               // async — boots the REAL server, returns live handle
// kit.chat(...) / kit.callTool(...) / kit.attach() / kit.until(...)
await kit.cleanup()
```

Fake vs real is which harness object you pass — no `mode` flag:

```ts
describe.each([claude, createTestHarness(claude)])('conciv_ui', (harness) => {
  const testkit = createTestkit(harness)         // real element = claude; fake = createTestHarness(claude)
})
```

`createTestkit` accepts **any** `HarnessAdapter`; it does not care which. CI passes only the fake
(no claude there); locally both run. The real element skips itself when `hasClaude()` is false.

### The TestHarness — exactly two seams

`StreamChunk` (AG-UI events) is the universal output contract for every harness, and the only place an
adapter talks to the model is `run: (turn, ctx) => AsyncGenerator<StreamChunk>` (or `spawnHarness` +
`decode` when `run` is absent). `harnessText` already prefers `run`, so attaching a `run` makes even
spawn-only harnesses (codex) deterministic — no per-harness wire-protocol faking.

`createTestHarness(real)` returns `{...real, run: scriptedRun, shutdown, release}` exposing exactly:

1. **Injectable run** — the turn emits a scripted `StreamChunk` sequence (default: `RUN_STARTED → text
   → RUN_FINISHED`), or falls through to the real transport in real mode.
2. **Turn hold/release** — the scripted run stays open until signaled, so the kit can fire a real
   mid-turn action (call `conciv_ui` over the real MCP client → real injection into the live turn) and
   then release. This is what makes the injection test deterministic without faking the injection.

Anything past these two seams is a smell requiring justification. `decode`, `capabilities`, `history`,
`tty`, MCP, server, uiBus, hub, attach stay real. **Both seams live in the `createTestHarness` output,
never in `packages/*/src`.**

### Kill the global env read

`makeApp` resolves the harness from the global registry and the claude adapter reads
`USE_SDK = !process.env.CONCIV_CLAUDE_CLI` at import. One production change (a legitimate DI seam, not
test code): `MakeAppOpts`/`StartOpts` gain optional `harness?: HarnessAdapter`, defaulting to
`requireHarness(cfg.harness)`. `engine.ts` passes the resolved adapter; the testkit passes its
TestHarness. `USE_SDK` and `CONCIV_CLAUDE_CLI` leave the codebase. Net production improvement.

## Part 2 — the waiting primitives (used by every layer)

### `RunStream` — event streams (StreamChunk)

Over any `AsyncIterable<StreamChunk>` — the raw harness generator (Layer A) or the parsed
`/api/chat/attach` SSE (Layer B):

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

`waitFor` resolves on first match, **rejects fast** on `RUN_FINISHED`/stream-close without a match,
hang-guard (~90s) only for true stalls.

### `until` — any condition (browser DOM, terminal buffer, CRDT convergence)

The shared replacement for every `waitForTimeout`/`sleep` and every hand-rolled deadline loop:

```ts
until(predicate: () => boolean | Promise<boolean>, opts?: {
  hangGuardMs?: number          // guard only, default ~10s (browser) / ~5s (node)
  settleFor?: number            // predicate must hold continuously for this long (debounce/quiescence)
  failWhen?: () => boolean      // definitive "can never become true" → reject fast
}): Promise<void>
```

- Terminal buffer: `until(() => buffer().includes('TICK-3'))` replaces `untilBuffer`.
- pty roundtrip: `until(() => chunks.join('').includes('tty-roundtrip-42'))` replaces the local `until`.
- CRDT convergence: `until(() => elementCount() === 3, {settleFor: 200})` replaces `waitForTimeout(1500)`
  — wait for the state to reach and hold the converged value, not a fixed guess.

Driven by microtask polling with a guard (not wall-clock sleeps); `settleFor` expresses quiescence
explicitly instead of a magic sleep.

### Negative assertions (the honest hard case)

"Assert X did NOT appear" cannot be push-waited — there is no positive event for absence. `sleep(300)`
then assert-absent is inherently racy. The recipe, in order of preference:

1. **Wait for a co-occurring positive signal, then assert absence.** e.g. after typing `/co`, wait for
   the input's own settled state (a debounce-complete signal the component already exposes via a
   `data-state`/role), then assert no listbox. Deterministic.
2. **Drive to a known terminal state.** Trigger the action that would have opened the menu and let it
   fully resolve, then assert the menu is absent.
3. If neither exists, that is a **missing observability point**, addressed in the component's own
   contract (a real state a user/AT can observe) — not by a sleep, and not by a test-only hook.

This is the one pattern the primitives do not magically fix; the spec calls it out so tests handle it
deliberately rather than sleeping.

## Package layout

`@conciv/harness-testkit` (node-level, no browser deps), mirroring `extension-testkit`'s
one-file-per-concern layout. Public surface: `createTestHarness`, `createTestkit`, `until`, and their
types. Everything else internal.

```
packages/harness-testkit/src/
  create-test-harness.ts   createTestHarness(real) → TestHarness (the two seams)
  create-testkit.ts        createTestkit(harness) → {setup} ; setup() → live kit handle
  scripted-run.ts          the injectable + hold/release run seam
  run-stream.ts            makeRunStream(source): waitFor / waitForUiSpec / waitForText / done
  run-events.ts            RunEvents typed queries
  until.ts                 until(predicate, opts) — the generic condition wait
  call-tool.ts             MCP tool call via real @tanstack/ai-mcp client
  has-claude.ts            hasClaude() — single source (delete the 3 copies)
```

`extension-testkit` (browser layer) depends on `@conciv/harness-testkit` for `createTestHarness` /
`createTestkit` (harness selection + boot) and re-exports `until` for in-page condition waits, so
browser tests replace their sleeps with the same primitive.

## Migration (every layer, so nothing stays flaky)

- **Layer B — core HTTP ITs** (`chat.it`, `claude-mcp.it`, `claude-image.it`, `sessions.it`,
  `turn-detach.it`, `turn-end.it`, `turn-error-flood.it`, `extension-server-surfaces.it`): drop
  `startTestServer` + 5s `postChat`; use `createTestkit(harness).setup()` + `RunStream`. `claude-mcp.it`
  → mode-blind body via the hold/release seam. `claude-image.it` stays real-only (vision); its CI
  sibling is `image-result.it`.
- **Layer A — harness ITs** (`claude-sdk.it`, `text-adapter.it`): `makeRunStream(...)` over the raw
  generator; delete the local `hasClaude()`.
- **Terminal extension** (`pty-sessions.it`, `mirror.it`, `routes.it`): replace the local `until` with
  the shared `until`; buffer waits via `until`.
- **Layer C — browser** (`terminal-mode.it`, `trigger-menu.it`, `widget.it`, `reload-continuity.it`,
  `effect-highlight.it`, whiteboard `canvas-*`, `thread-*`, `inbox*`, `pin-pan`): replace all 52
  `waitForTimeout`/`sleep` calls with `until(predicate, {settleFor?})`; negative assertions use the
  settle-signal recipe; `terminal-mode.it` gains a deterministic fake variant on the shared TestHarness.

Acceptance: after migration, `grep -rE "waitForTimeout|\bsleep\(|Date\.now\(\).*<.*ms"` over `**/test`
returns zero, and the fixed-window snapshot in `server.ts` is gone. A lint rule guards it going forward.

## Testing the testkit

- Unit-test `scripted-run` (emission, hold/release), `run-stream` (resolve-on-match,
  reject-on-terminal-without-match, hang-guard), `until` (resolve, `settleFor`, `failWhen` fast-reject),
  `run-events` queries — deterministic, no claude.
- The fake path of every migrated test is the integration coverage for `createTestkit` /
  `createTestHarness`.

## Open questions / risks

- **Mid-turn injection ordering** — verified feasible: `turn.ts` does `merged = uiBus.run(...)` then
  `hub.start(...)`, so an injection during a live turn reaches every `attach` subscriber; the
  hold/release seam gates the tool call before `RUN_FINISHED`.
- **`makeApp` harness DI** — additive, defaulted, and removes the `USE_SDK` global. Only production
  touch; justified.
- **Negative assertions** — not solved by a primitive; handled per-case via the settle-signal recipe.
- **Real-mode residual variance** — real claude can't be isolated (OAuth in the config dir, no API
  key); `waitFor` + hang-guard absorb latency; real mode is local-only and never gates CI.
- **`settleFor` values** — quiescence windows are still numbers; they are guards on *stability*, not
  assertion windows, and should be as small as reliably holds. Document chosen values inline.
