# Calm Chat Plane

Spec: make streaming visually calm and replace hand-rolled chat persistence/transport with @tanstack/ai's native stack. Four phases, each independently shippable.

Rev 4 — 2026-08-26. Post codex adversarial review (16 findings addressed), source verification of every "stays ours" claim against TanStack/ai@main `4e9c5d2`, and docs sweeps (reaping, approval memory, occupancy).

## Thesis

Two root problems share one fix direction. (1) The widget transcript rearranges itself while streaming: representations swapped mid-run, cards auto-open and snap shut, grouping recomputed retroactively. (2) packages/core and packages/client re-implement run records, replay, resume, interrupts, and crash recovery that @tanstack/ai now ships first-party. We adopt the library everywhere it has an API, delete our parallels, and rebuild the streaming UI on one invariant: **an activity gets one surface, born once, streaming into itself, settling in place — never replaced, never snapped shut mid-run.**

## Locked decisions

1. **Library-first:** every hand-written piece the library provides gets deleted.
2. **Transport:** chat plane speaks @tanstack/ai transports end to end — WebSocket primary, with their SSE connection adapter as fallback mirroring the embed's existing WS-to-SSE selection behavior (transport-selection e2e stays green, connection-count parity asserted). oRPC remains for all non-chat RPC.
3. **Live visibility is the feature:** auto-expanded live surfaces stay; the lifecycle gets fixed, not the openness. No auto-fold that hides completed activity: surfaces settle in place and fold only on the next prompt send or by the user.
4. **Sequence:** Phase 0 characterization harness → Phase 1 upgrade → Phase 2 native plane → Phase 3 calm surfaces (flips the harness to a blocking gate).

## Verified adoption map (source-checked, TanStack/ai@main)

| Concern                                                     | Library API                                                                                                                                                                                 | Verdict                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run records + double bookkeeping                            | `RunStore` (Drizzle-backed, ai-persistence schema)                                                                                                                                          | delete ours                                                                                                                                                  |
| Replay / hydrate / rejoin                                   | `reconstructChat` + resume cursors + `hydrate()`/`joinRun()`                                                                                                                                | delete ours                                                                                                                                                  |
| Client subscribe/retry/refresh plumbing                     | `webSocket()` / `fetchServerSentEvents` adapters                                                                                                                                            | delete ours (see refresh contract)                                                                                                                           |
| Approval persistence lifecycle                              | `InterruptStore` + atomic resume batches                                                                                                                                                    | adopt via gate adapter (workstream 2.b)                                                                                                                      |
| conciv_ui choice menu                                       | `defineInterrupt` (payloadSchema=question+options, responseSchema=pick), persisted + rehydrated                                                                                             | delete ours — verified full fit                                                                                                                              |
| Boot-time crash recovery (abandonUnfinishedRuns)            | `RunStore.listReclaimable` + `reapDetachedRuns` + `probeRunExit`                                                                                                                            | 2.a: shim over `listReclaimable` (no journal/drive seam yet); 2.c: full reap once harness runs adopt the run-driver seam (journal + claim/pipe + sandboxKey) |
| Durable delivery log (replay after process restart)         | `@tanstack/ai-durable-stream` (fenced multi-writer StreamDurability sink; needs a Durable Streams server)                                                                                   | adopt or explicitly scope guarantees to process lifetime — decided at Phase 2.c review (see risk 2)                                                          |
| 'stopping' phase                                            | `RunRecord.cancelRequested`                                                                                                                                                                 | re-derive                                                                                                                                                    |
| Raw per-turn token usage                                    | harness adapters' `TokenUsage` on RUN_FINISHED                                                                                                                                              | adopt                                                                                                                                                        |
| CLI JSONL transcript merge (anchor/boundary, msgid folding) | none — adapters treat the CLI session as opaque (`--resume` only, flatten-to-text fallback drops tool calls)                                                                                | ours forever                                                                                                                                                 |
| Context-window occupancy math                               | none — docs-swept: absent by design (adapters even collapse provider context-exceeded stop reasons into generic `stop`)                                                                     | ours                                                                                                                                                         |
| "Allow for session" approval memory                         | none shipped — docs-swept; candidate seat: `onBeforeToolCall` middleware short-circuit (its ordering vs the approval interrupt is undocumented — resolved in 2.b design from engine source) | ours, layered on their hooks                                                                                                                                 |
| Multi-writer transcript merge                               | none — MessageStore is deliberately single-writer full-overwrite                                                                                                                            | ours                                                                                                                                                         |
| Client storage adapters                                     | local/session/indexedDB persistence                                                                                                                                                         | not adopted — no-client-cache design already server-authoritative                                                                                            |
| ai-memory / ai-solid-ui                                     | semantic recall middleware / headless Solid chat components                                                                                                                                 | out of scope; ai-solid-ui noted for future ui-kit overlap review                                                                                             |

## Phase 0 — Calm characterization harness

A real-browser suite encoding the calm contract, landed as a characterization harness with explicit expected-failure markers (each annotated with the mechanism A/B/C it documents), so CI stays green while the failures are executable and quoted. Phase 3 deletes the markers and the suite becomes the blocking gate.

Invariants, asserted at scripted-run hold points (harness-testkit gates: pre-stream `holdTools`, mid-stream, post-`release` settle):

- **Surface immortality:** stamped on surface roots only (cards, trace groups, rows) — not every node — with a declared allow-list of legitimate removals (narration label exits via Presence, virtualization eviction below the viewport, error replacement). No surface root that appeared during the run is removed before run end.
- **Stillness above the live region:** anchor-rect sampling with scroll normalized first (pin scroll position via the fixture, or subtract scrollTop), virtualization disabled or thread below `virtualizeThreshold`, 1px tolerance.
- **Single narration:** exactly one glyph while running (existing coverage folds in).
- Chromium bonus: `layout-shift` entries filtered to sources above the live region, read at settled checkpoints (Firefox lacks the API; rects are the portable gate).

Scenario matrix: multi-tool run, tool→text→tool interleave, approval pause/resume, error mid-run, cancel, reload mid-run, trace toggled by user mid-run, reduced motion, long thread at the virtualization boundary.

**Exit:** harness landed, CI green, every expected-failure annotated to mechanism A/B/C, failures quoted in the PR.

## Phase 1 — Family upgrade 0.43.1 → 0.48.0

Lockstep set: `ai 0.48.0`, `ai-client 0.26.0`, `ai-solid 0.18.3`, `ai-code-mode 0.4.3`, isolates `0.1.51`/`0.3.1`, `ai-mcp 0.3.4`, harnesses `claude-code 0.4.4` / `codex 0.4.4` / `opencode 0.3.4` / `acp 0.3.4`, `ai-sandbox 0.5.0`. Upstream fixed the exact-pin poison (exact pins → caret ranges); catalog comment rewritten.

Known breaks:

- Spec-only wire chunks; TanStack extras under `metadata.tanstack`. Read sites: `core/src/chat/run.ts:245,251-252`, `core/src/chat/tool-names.ts:48,52`, test helpers, `ui-kit-chat/src/store/story-connection.ts:93-119`. Rule: run log stores chunks as received; consumers bypassing ai-client call `restoreInboundChunk` at read time, never mutating storage.
- `getSkillBindings` → `getSnippetBindings` (`core/src/chat/code-mode.ts:318`) — silent if missed; guarded by a bindings-reachable test.
- Client `id` option removed (unused by us); persistence requires threadId at compile time (we already pass sessionId).

Free wins in range: background-tab stream stall fix, tool-args corruption fix on interleaved text, native-tool name-hijack fix.

**Exit:** full gates + assert exactly ONE @tanstack/ai instance in the lockfile + all package manifests/peer ranges audited + embed mount-externals test + publint/attw on published artifacts + Phase 0 harness expected-failures unchanged.

## Phase 2 — Native chat plane (lane A)

Three stacked, individually gated workstreams.

### 2.a Stores + migration

Drizzle-backed `RunStore`/`MessageStore`/`InterruptStore` on the ai-persistence schema, adopted under the EXISTING transport. One recoverable migration imports every current row — transcripts, attachments, synthetic code-mode parts, anchor ids, pending approvals, lifecycle state. Gate: an upgrade test opens a pre-migration DB fixture and proves the full conversation hydrates via `reconstructChat`. Boot cleanup rebuilt as a shim over `listReclaimable` (expiry-only — no journal to probe yet) with a crash-fixture test; the full `reapDetachedRuns` adoption (probe + drive + reclaim) lands with 2.c's run-driver seam. Two reaping-doc rules adopted immediately: the delivery log is never terminalized on disconnect (only a driver/reaper closes it), and a run record is never pruned before it is both terminal AND reclaimed.

### 2.b Gate-to-interrupt adapter

Our approvals block a middleware promise inside the harness sandbox; a persisted interrupt does not resume it by itself. Explicit adapter design: ask creation writes the interrupt; resolution flows through the resume batch AND settles the in-memory waiter; transaction boundary, restart behavior (pending interrupt + dead process → recovered as parked, re-askable), duplicate-decision handling, middleware ordering all specified and tested. "Allow for session" memory stays as our layer keyed off resolved interrupts (candidate seat: `onBeforeToolCall`; its ordering vs the approval interrupt resolved from engine source during this design). conciv_ui choices reimplemented as a `defineInterrupt` and the bespoke channel deleted.

### 2.c Transport swap

Their WS connection adapter primary, their SSE adapter fallback, selection mirroring the embed's existing probe logic; oRPC `chat.subscribe` retires. `refresh()` keeps its coordinator contract (awaited forced rehydrate driving captures/pane state) reimplemented over `hydrate()`. Run-lifecycle consumers inventoried (mascot, status chip, occupancy, shutdown drain, stop serialization); each moves to `onRunIdChange`/run records or keeps the CUSTOM channel with a named consumer — deletion only with parity tests. Delivery log: adopt `ai-durable-stream` if we accept running its server locally, else document process-lifetime guarantees explicitly and keep replay-after-restart out of scope — decision recorded at 2.c review.

**Stays ours (source-verified):** CLI JSONL transcript anchor/boundary merge + msgid folding (their adapters never read the native transcript — opaque `--resume` only), context-window occupancy math, "Allow for session" memory, multi-writer merge. Client storage adapters deliberately skipped.

New process-restart tests: browser reload + core restart mid-run; pending approval recovered after restart; late-join after restart. Existing same-process ITs (snapshot-resubscribe, approval-replay, late-join narration) must pass unmodified — weakening any of them is a stop-the-line signal.

Code-mode attribution (corrected after source read at main, `tool-calls.ts:873` + `processor.ts:2105`): the engine stamps `toolCallId` into every tool-emitted custom event's value, the client surfaces it via `onCustomEvent` context, and because it lives in the CUSTOM chunk's `value` it survives wire normalization, run-log persistence, and replay — no positional bracketing needed. Residual caveat: resume-alignment may skip (not mis-attribute) custom events on takeover mismatch; the exec card must tolerate a gap, covered by a test. The docs' CodeExecutionPanel shape (one panel per toolCallId, append-only event timeline, per-call `isRunning`) matches Phase 3's surface design.

**Exit per workstream:** full gates + the workstream's named tests + oRPC surface diff showing only chat.subscribe removed (2.c) + embed transport-selection e2e green with connection-count parity (2.c).

## Phase 3 — Calm surfaces

**Surface identity:** the kit invariant is one surface per surface id: a standalone tool call's surface id is its `toolCallId`; a grouped surface (SessionCard spanning N page calls) is identified by its group key, which becomes sticky for the run — minted at first member, never recomputed until settle. Open-state store keys by surface id.

- **Mechanism A — card remount** (`tool-call-card.tsx:113-124`): placement decided at birth, never revisited; live body renders in the final position from TOOL_CALL_START.
- **Mechanism B — wrong streaming bit** (`thread.tsx:275`): replaced by the part's own state machine (`awaiting-input → input-streaming → input-complete → result`) per surface. "Live" = my surface unfinished, not "nothing rendered after me".
- **Mechanism C — retroactive regrouping** (`page-session.ts:141`): grouping sticky during the run; any reclassification happens once at settle.
- **Settle & fold:** at its own completion a surface settles in place — glyph/tint change, label morph (`MorphLabel`: Ark Presence, width+fade, tabular-nums). It stays open and inspectable. Fold happens on the NEXT prompt send or by the user — never on a timer, never at run end. User toggle owns state permanently.
- **Enforcement:** the Phase 0 harness (markers removed) is the authoritative gate; the `conciv/calm-streaming` lint rule is supplementary API hygiene only. `createAutoCollapse` deleted; unused styled `Reasoning` export deleted (fallow-verified) or consciously kept — decided at review.

**Exit:** Phase 0 suite green as a blocking gate across the full scenario matrix in Chromium; existing browser suites unchanged; the "Fill in the form" video scenario re-recorded, reviewed by Omri in Firefox.

## Risks

- **2.b is the hardest piece** — approval semantics were hard-won (#589); the adapter design gets its own review before implementation.
- **Delivery-log durability:** without ai-durable-stream, replay-after-core-restart still depends on rebuild-from-stores (reconstructChat), not log replay; pending-run recovery then flows through reap, not resume. Stated, tested, and either accepted or closed by adopting the durable stream.
- **WS on embed:** fallback + pooling + origin/auth acceptance criteria in 2.c; a second socket must not regress hosts that block WS (existing e2e is the contract).
- **Migration:** v0 lets us break APIs, not user data on our own machines — the migration imports, never drops; fixture DBs from current snapshots gate it.

## Open questions

- Adopt ai-durable-stream now (runs an external Durable Streams server next to core) or defer and accept process-lifetime delivery logs? Recommendation: defer; reconstructChat covers restart hydration, revisit when multi-process lands.
- ai-solid-ui overlap with ui-kit-chat: ignore for now, or schedule a comparison review after Phase 3? Recommendation: after Phase 3.
- Phase 2 workstream ordering is 2.a → 2.b → 2.c; 2.b and 2.c could swap if the gate adapter stalls.

## Evidence base

Four reference-UI studies (assistant-ui, ai-elements, opencode, pi); tanstack-ai 0.48 identity + persistence research (d.ts citations); conciv arsenal inventory (file:line); fit/gap map; calm-testing techniques survey; codex adversarial review (16 findings, all addressed); source verification of every stays-ours claim against TanStack/ai@main `4e9c5d2`; docs sweeps: sandbox reaping, approval memory, context occupancy.
