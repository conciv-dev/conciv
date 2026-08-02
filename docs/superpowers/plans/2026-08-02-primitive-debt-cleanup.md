# Primitive-Debt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. One implementation agent in the worktree at a time (shared dist).

**Goal:** Delete every hand-rolled mechanism on branch `connected-external-terminal` that duplicates a shipped primitive: the toast system, the two ticking clocks, the dial-in poll ladder, the gutter splitter, and the raw drag listeners.

**Architecture:** Ark UI owns toasts and splitters. TanStack Query owns staleness. Core pushes dial-in over a new oRPC event-iterator route fired from the existing `dialLog.note` flip point, so the connect flow and presence pill consume pushed state instead of ticking clocks and backoff polling.

**Tech Stack:** @ark-ui/solid (Toast, Splitter), @tanstack/solid-query, @orpc eventIterator + `subscriptionIterator`, @solid-primitives/event-listener + timer.

## Global Constraints

- Worktree `/Users/omrikatz/Public/web/aidx/.claude-worktrees/connected-external-terminal` only; never touch `apps/site/content/docs/quick-start/ios.mdx` or `plans/ios-extension/11-native-first-integration.md`; commit with pathspec; no push.
- Zero comments, no `as`/`any`/IIFE/classes, splitProps only, oxfmt style.
- Tests: real browser, no timers in tests (`conciv/no-timers-in-tests`), no `expect.poll`, no `until()`, no predicate waits. Await product surfaces or auto-retrying web-first assertions only.
- Gates per task: `pnpm turbo run typecheck build --filter=<pkgs>...`, tests serial (`VITEST_MAX_FORKS=1 pnpm turbo run test --concurrency=1 --force --filter=<pkgs>`), `pnpm lint`, `pnpm exec fallow audit --changed-since main --format json` (nothing newly INTRODUCED; the 2 inherited turn-detach dup findings are known). New UnoCSS classes need an embed rebuild before widget ITs.
- Prek hook broken in this worktree: `pnpm format` on touched files, then `git commit --no-verify`.
- zod on every new HTTP boundary. Widget bundle externalization rules unchanged.

---

### Task 1: notices → Ark Toast (IN FLIGHT — acceptance gate only)

Already dispatched with its own brief. This task records the acceptance gate the orchestrator applies to its diff; do not re-implement.

- [ ] **Accept only if:** no context/hook/provider/notify-prop anywhere — module-level `createToaster` + exported plain `notify()` + one `<Toaster>` in the shell; `fuses` Map, `lastId`, queue helpers in `notify.ts` dead and deleted (fallow-traced); consumers (`chat-pane.tsx`, `composer/actions.tsx`, connect flow) import `notify` directly; prop chain stripped; no synthetic screenshot test file; toaster portals inside the widget shadow root; gates green.

---

### Task 2: Core pushes dial-in (`sessions.awaitDialIn`)

**Files:**
- Modify: `packages/core/src/chat/dial-log.ts` (add subscribe)
- Modify: `packages/contract/src/contract.ts` (new route under `sessions`)
- Modify: `packages/core/src/api/rpc/*` where `sessions.attachCandidates` is implemented (add handler; find with `grep -rn attachCandidates packages/core/src/api`)
- Test: `packages/core/test/chat/dial-in-push.it.test.ts`

**Interfaces:**
- Produces: `DialLog` gains `onDial(listener: (harnessSessionId: string) => void): () => void`; `note(id)` fires listeners exactly once per id (repeat notes for an already-seen id do not re-fire).
- Produces: contract route `sessions.awaitDialIn: oc.input(z.object({harnessSessionId: HarnessSessionId})).output(eventIterator(z.object({ready: z.literal(true)})))`. Semantics: if `dialLog.seen(id)` already true, emit `{ready: true}` immediately and end; otherwise emit on the first `onDial` for that id, then end. Client cancels via signal; handler must unsubscribe on abort (use the existing `subscriptionIterator` helper pattern from the terminal extension's `observe` route).

- [ ] **Step 1: Failing test.** In `dial-in-push.it.test.ts` boot the core app via `bootCoreApp` (existing helper). Two cases: (a) subscribe to `awaitDialIn` for an unseen id, then trigger the same code path `onHarnessDial` uses (drive it through the public surface that calls `dialLog.note` — an MCP request with the session header, as existing core tests do; grep `onHarnessDial` usage in tests); the subscription's first (awaited, not polled) event is `{ready: true}` and the iterator completes. (b) subscribe for an id already noted; event arrives immediately. Await the iterator directly (`for await` first value) — no wait helpers.
- [ ] **Step 2: Run, verify it fails** (route missing).
- [ ] **Step 3: Implement** `onDial` in dial-log (listener array, fanOut-style error isolation like `packages/core/src/app.ts:232`, unsubscribe function), contract route, handler.
- [ ] **Step 4: Tests green.** Also `pnpm turbo run typecheck --filter=@conciv/core --filter=@conciv/contract`.
- [ ] **Step 5: Commit** `feat(core): push harness dial-in over sessions.awaitDialIn` (pathspec: the four files).

---

### Task 3: connect flow rides the push — poll ladder and clock die

**Files:**
- Modify: `apps/conciv/src/composer/connect/use-connect-flow.ts`
- Modify: `apps/conciv/src/composer/connect/connect-steps.ts` (delete `dialInPollMs`, `GIVE_UP_AFTER_FAILURES` if now dead)
- Modify: `apps/conciv/src/composer/connect/connect-copy.ts` (delete `isStale` if now dead)
- Modify: `apps/conciv/src/composer/connect/connect-machine.ts` ONLY if the `dialledIn` event needs no shape change (it should not — the machine already accepts `{type: 'dialledIn'}`)
- Test: whatever browser test currently covers the connect dialog staleness/dial-in (grep `stale\|dialledIn` under `apps/conciv/test`); update in place.

**Interfaces:**
- Consumes: `deps.rpc.sessions.awaitDialIn({harnessSessionId}, {signal})` from Task 2.

- [ ] **Step 1: Delete the clock.** Remove `now`/`setNow`/`createTimer`/`TICK_MS`. Stale badge becomes `stale: () => candidates.isStale`; set the query's `staleTime` to the single badge window (move `STALE_AFTER_MS = 15_000` out of connect-copy into this file as the `staleTime` value). Delete `FRESH_MS`. `checkedAt` stays `candidates.dataUpdatedAt` (RelativeTime consumes it).
- [ ] **Step 2: Replace dial-in polling.** Delete `pollMs()`/`persistence()`/`terminalDialledIn` and the `dialInPollMs` backoff. Query keeps a single steady `refetchInterval: open() ? POLL_MS : false` for list freshness only (listing running processes has no push source — this poll is the honest interface and stays), plain default retry. Dial-in: when the machine enters the reload step (`adoptedOf(state)` non-null), open `awaitDialIn` for `adopted.harnessSessionId` with an AbortController tied to leaving the step (effect or plan-driven — follow the machine's existing effect-planner idiom: prefer emitting an `openDialWatch`/`closeDialWatch` entry from `connectPlanFor` and executing it in `runPlan`, matching how `adopt`/`follow` effects run). First event → `apply({type: 'dialledIn'})`. `contactLost`/`unreachable` derive from the subscription erroring/retrying: on iterator error while still in reload, re-open after `dialInPollMs`-free fixed delay is NOT allowed — instead surface `contactLost` state and re-open on the query's next successful refetch or an explicit user retry. If that error-path shape fights the machine, STOP and report; do not invent a retry loop (pacer AsyncRetryer is the only sanctioned retry primitive if one is truly needed).
- [ ] **Step 3: Update the browser test** to drive dial-in through the real surface (the fake harness dials in via the same path as Task 2's test), assert the reload card flips to "Connected" via `expect.element`. No timers.
- [ ] **Step 4: Gates green** for `conciv` app filter + embed if classes changed.
- [ ] **Step 5: Commit** `refactor(conciv): connect flow rides pushed dial-in, deletes clock and poll ladder`.

---

### Task 4: presence pill clock dies

**Files:**
- Modify: `packages/extensions/terminal/src/client/presence-pill.tsx`
- Read first: the `PresencePillView` component in the same file/dir — find every use of the `now` prop.

**Interfaces:**
- Consumes: `RelativeTime` from `@conciv/ui-kit-system` (already used by connect-dialog).

- [ ] **Step 1:** Replace the `now` signal + `makeTimer` tick: wherever the view formats "last seen at X" from `snapshot.lastEvidenceWallAt`, render `<RelativeTime value={...}>`. If `now` feeds a *staleness boolean* (pill tone flip), check what `observeTerminal` pushes — the observer already emits `state: 'stale'` presence transitions server-side; prefer the pushed state. If the view genuinely needs a live-ticking derived value the push cannot express, STOP and report (that would justify `createDateNow` + the `@solid-primitives/date` install, which needs user sign-off — do not install it yourself).
- [ ] **Step 2:** Existing terminal client tests green; update assertions from tick-dependent to pushed-state-dependent if any.
- [ ] **Step 3: Commit** `refactor(extension-terminal): presence pill renders pushed state, drops the tick clock`.

---

### Task 5: quick.tsx gutter → Ark Splitter; draggable-position listeners

**Files:**
- Modify: `apps/conciv/src/routes/quick.tsx` (delete `onGutterDown`, `resetPaneFlex`; render Ark Splitter)
- Modify: `apps/conciv/src/lib/draggable-position.ts` (raw listeners → `makeEventListener`, `snapTimer` → `makeTimer`)
- Read first: Ark Splitter source in node_modules (`@ark-ui/solid` splitter: `Splitter.Root/Panel/ResizeTrigger`, `size`/`onSizeChange`, min/max panel sizes) and how ui-kit-system wraps other Ark components — wrap Splitter thin in ui-kit-system if any second consumer is plausible, otherwise use it directly.

- [ ] **Step 1:** Replace the two-pane flex + gutter with `Splitter.Root` (two panels, `minSize` equivalent to the current 180px floor — Ark sizes are proportional; convert or use the px units if the installed version supports them; read the source, don't guess). Keyboard resize comes free — keep the existing visual gutter styling via the ResizeTrigger class.
- [ ] **Step 2:** The split/reset behavior (`resetPaneFlex` on layout change) maps to controlled `size` state reset — wire through the same code path that today calls `resetPaneFlex`.
- [ ] **Step 3:** draggable-position.ts: every `window.addEventListener` pair inside the drag lifecycle becomes `makeEventListener` under the component's owner (this file is called from components; if any call site runs outside an owner, use `createRoot` per the established handler-panel pattern). `snapTimer = setTimeout` → `makeTimer`.
- [ ] **Step 4:** Browser test: existing quick-terminal test (grep `quick` under `apps/conciv/test`) still green; add a resize interaction assert only if one existed before (no new DOM-measurement tests — layout proof is screenshots).
- [ ] **Step 5: Gates + embed rebuild** (new Ark component classes) **+ commit** `refactor(conciv): quick terminal panes ride Ark Splitter; draggable position uses solid-primitives`.

---

### Task 6: recorder retry/poll family → GitHub issue (no code)

- [ ] **Step 1:** Open one issue titled "recorder client: hand-rolled retry/poll where primitives exist" listing: `flusher.ts:88` hand backoff (→ pacer AsyncRetryer), `boot.ts` `wait()` reconnect loop (→ AsyncRetryer), `player.ts` `LIVE_POLL_MS` tick + `panel-view.tsx` 1s `refetchInterval` (→ ride the existing recorder control stream), `visibility-pauser.ts` timer (triage). Label it debt; reference this plan. `gh issue create` from the worktree.

---

## Execution order & serialization

Task 1 (in flight) → Task 2 (conciv-implementer, core) → Task 3 (conciv-frontend; depends on 2) → Task 4 (conciv-frontend; independent of 2/3 but serialized) → Task 5 (conciv-frontend) → Task 6 (orchestrator, `gh` only). One agent at a time. Orchestrator reviews every diff line-by-line against this plan's acceptance criteria before the next dispatch, and reruns gates personally.
