# State-machine rewrites — de-rotting the interactive state layer

Date: 2026-08-01. Source: cold-read rot audit (9 opus agents over 203 files + codex
gpt-5.6-sol over 15 hotspots; verdicts agree on the core set). Score: 12 rotten /
78 smelly / 113 clean. This plan rewrites the rotten interactive-state files on the
connected-external-terminal branch. The 78 smellies are a separate ranked backlog, not
this plan.

## The disease (one sentence)

Every async race got its own ad-hoc flag instead of the state getting a machine — N
mutable flags per 1 logical state, illegal combinations representable, correctness
dependent on callback ordering.

## The cure (uniform, all rewrites)

- ONE pure `transition(state, event)` function per flow, node-tested without a browser.
- Reactive holder: `createStore` + `reconcile` (per docs.solidjs.com/guides/state-management —
  the repo's Solid idiom gate, clauses answered per rewrite in the report).
- Every derived fact a memo; `createEffect` only for true side effects (announce, DOM
  outside JSX). No effect that only sets a signal. No mutable shadows for prev-values —
  Solid's `on()` provides prev natively.
- Async state from solid-query/createResource; retry/error/connected DERIVED from query
  state, never hand-counted.
- Timers/subscriptions created by the state that needs them, die with it. No always-on
  intervals. MANDATORY mechanism (user-approved install 2026-08-01): `@solid-primitives/
event-listener` (makeEventListener) and `@solid-primitives/timer` for every DOM
  listener/interval these rewrites touch — these self-register onCleanup, making the
  leak class unrepresentable. Debounce/throttle/rate-shaping use `@tanstack/solid-pacer`
  (the house pacing primitive — Pacer's AsyncRetryer is already the mandated retry
  mechanism), NOT `@solid-primitives/scheduled`: the pane-draft debouncer becomes a
  Pacer debouncer. Raw `addEventListener`/`setInterval` in rewritten files is a review
  rejection. (Repo currently has ZERO solid-primitives usage and 12 files hand-rolling
  timers/listeners — wave rewrites convert the files they touch; the rest join the
  smelly backlog.)
- Style reference: `apps/conciv/src/shell/notices.tsx` + `notice-queue.test.ts` (audited
  clean by both reviewers) — pure brain, thin wiring.
- Existing browser tests are the behavior contract and MUST pass with zero behavioral
  edits. The only permitted test changes: poll→web-first conversion (`expect.poll` is
  banned repo-wide; assert aria-live/DOM via `expect.element`; non-DOM facts sync after a
  causal DOM settle) inside the touched suites.
- Embed rebuild + headless drive + screenshots per landing; serial throttled gates; no
  --force; fallow zero INTRODUCED.

## Wave 1 — bug-carrying small files (three dispatches, serialized on the branch worktree)

### 1a. `apps/conciv/src/chat/send-guard.ts` (conciv-frontend)

Machine: `idle → conflict{attempt} → sending{attempt} → sent | failed{attempt}` with
events `send`, `rejected(error)`, `delivered`, `takeOver`, `takeOverFailed(reason)`,
`sendAnyway`, `cancel`, `detachSettled`. Kills `{attempt, rejections, epoch, retrying}`
bag and the before/after rejection-count comparison. KNOWN BUG to fix and pin with a
failing test first: delivered-but-rejected currently nulls the attempt while the conflict
dialog stays open — dialog buttons dead (audit evidence send-guard.ts:83-101). Delivery
becomes derived: attempt records its epoch; delivered = chat status reached `streaming`
during that attempt (chat-pane's `delivery.done` flag dies in wave 3 but the store field
lands now). `deps.delivered()` remains the interim input until 3a.
Contract: `terminal-conflict-dialog.browser.test.tsx`, `send-rejection.browser.test.tsx`,
`user-turn.browser.test.tsx`.

### 1b. `apps/conciv/src/chat/use-pane-draft.ts` (conciv-frontend)

Two real defects, failing tests first: (1) viewport `scroll` listener added at :95 never
removed — `onCleanup` misses it; every pane teardown leaks a listener holding the
debouncer. (2) the restore effect (:80-85) writes server text into the composer whenever
the input is unfocused, clobbering typed-but-undebounced text. Restore becomes a
single-shot transition keyed on composer-ready + session identity (no `restored.done`
latch); the listener registers via the same scoped-lifetime rule as everything else.

### 1c. `packages/ui-kit-chat/src/primitives/model-selector/model-selector.tsx` (conciv-frontend)

Real defect: `useListCollection({initialItems: props.models.slice()})` freezes the
dropdown at first-render models while `models: () => props.models` reads live — async
model lists diverge permanently (audit :102-108). Known landmine
[[ark-uselistcollection-not-reactive]]: useListCollection is NOT reactive — fix with the
established pattern (rebuild/sync collection on props.models change), failing browser
test first (models arrive after mount → dropdown shows them).

## Wave 2 — `use-connect-flow.ts` (conciv-frontend, plan already user-approved)

Union machine grown from `connect-steps.ts`: `closed | picking{held, error} |
connecting{candidate} | snippet{detail} | reload{adopted} | leaveConfirm`. Ten signals
(`requested, step, adopted, epoch, flight, undecided, connected, now, failures, held`) →
one store + one query. Announce = pure derivation of state (kills `lastSaid`); freeze/
merge/arrived = own tested primitive; reload dialing = solid-query with retry config —
`failures`/`connected`/`unreachable` derived from query state; countdown = scoped clock
created on entering `reload`, killed on exit (the always-on 1s interval at :107-110
dies). `epoch`/`flight` disappear into state identity (a result belongs to the attempt
recorded in the state that spawned it).
Contract: all `connect-*.browser.test.tsx` suites + `connect-flow` (poll conversion
included). Note: one open flake in `connect-flow` ("handing it back on the way out…",
1-in-5) — expected to die with the machine; if it survives the rewrite it gets its own
RCA, not a paper-over.

## Wave 3 — `chat-pane.tsx` decomposition (conciv-frontend)

Target: ~80-line composition. Extractions, each killing a named hack:

- 3a `use-send-pipeline.ts`: dispatch/beforeSend/guard wiring. Kills `guardHolder`
  (chat errors land in a signal the 1a guard machine consumes reactively) and
  `delivery.done` (derived in the guard store from status-during-attempt).
- 3b `use-chat-announcements.ts`: `createEffect(on(chat.status, (now, prev) => …))` —
  kills `wasWorking`/`prevStatus` shadows; announce + invalidate-on-settle only.
- 3c `use-tool-cards.tsx`: toolCtx, durations (move `startedAt` Map inside the memo
  closure — no external mutation from a memo), tools(), streamTitles, uiReply.
- 3d `use-composer-bridge.ts`: `composerApi.current` → `createSignal<ComposerStateApi |
null>`; draft-restore + attachment-drain become effects on composer-ready; focus mgmt.
- 3e `use-session-maintenance.ts`: markers/dividers, compact mutation, newSession,
  nav blocker.
- 3f view split: `<ThreadView>` + `<ComposerView>` with narrow props.
  Contract: every existing chat-pane-touching browser test unchanged.

## Wave 4 — `use-thread-auto-scroll.ts` (conciv-frontend, LAST, highest behavioral risk)

HARD constraints from memory: the engine-adapter design is load-bearing
([[pane-snapshot-pagetoken]] — never poke scrollTop from outside;
[[dom-reinsert-resets-scrolltop]] — hostObserver restore is load-bearing;
[[scroll-to-bottom-button-in-flow-jumps]] — holdPosition). Rewrite unifies at-bottom
into one derived rule (formula currently written twice), one machine for
pinned/holding/free, kills the DOM-attribute-as-storage and the 4-field `last` record.
The MutationObserver narrows its watch set. Every historical scroll bug has a pinned
test — the net is the whole point of doing this file last, with the most care.

## Deferred rotten files (separate follow-ups, not this plan)

`gate.ts`, `session.ts` (server-side god-file splits — conciv-implementer texture, no UI),
`terminal-panel-view.tsx`, `page-action-card.tsx`, `mount-impl.tsx`, `cli/page.ts`.
Rationale: no user-visible defect named by the audit; branch scope is already large.

## Definition of done, per wave

Named hacks demonstrably gone (grep proof in report), idiom-gate clauses answered,
behavior tests green unchanged, poll-free in touched suites, embed rebuilt + headless
drive screenshots, serial gates green, fallow zero INTRODUCED, orchestrator line-by-line
diff review, worktree cleaned after landing.
