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

### Task 2: `sessions.changes` push route + Online/Last-seen presence model

No new server state. The change emitter already exists (`makeChanges` in `packages/core/src/chat/attach.ts`, with `nextChange`/`ChangeWaiter` already written and tested) and dial-in already reaches it: MCP request → sessions fan-out → terminal observer presence transition → `observer-wiring.ts:49` `notifyChange()` → `bumpExternal()`. This task only (a) exposes that emitter on the wire and (b) reshapes the candidate row from a connect/disconnect flag to presence.

**Files:**
- Modify: `packages/contract/src/contract.ts` (route `sessions.changes`)
- Modify: `packages/contract/src/rows.ts` (`LiveSessionSchema`: replace `ready: z.boolean()` with `online: z.boolean()` and `lastSeenAt: z.number().nullable()`)
- Modify: `packages/core/src/chat/dial-log.ts` (presence read surface)
- Modify: `packages/core/src/chat/adopt.ts:132` (row assembly)
- Modify: `packages/core/src/api/rpc/*` sessions handler (add `changes` handler; find with `grep -rn attachCandidates packages/core/src/api`)
- Modify: every `ready` consumer (`grep -rn '\.ready' apps/conciv/src packages/core/src packages/contract/src`) — v0, no shims
- Test: `packages/core/test/chat/changes-push.it.test.ts`

**Interfaces:**
- Produces: contract route `sessions.changes: oc.output(eventIterator(z.object({rev: z.number()})))`. Handler: loop `nextChange(changes, signal)`, but yield ONLY when `changes.externalRev()` advanced past the last yielded rev — the shared emitter also fires on every chat-stream snapshot change (`notify()` during token streaming), and those must never ring this bell. No other filtering, no per-session state. Abort via signal. Test case (c): drive a chat-stream-only change (plain `notify()` path), then an external change; assert exactly one event arrives and its rev reflects only the external bump.
- Produces: `DialLog` reshaped: `note(id)` unchanged; `seen(id)` renamed `online(id)` (same recent-window math); new `lastSeenAt(id): number | null`. TTL no longer DELETES entries (last-seen must survive going offline) — the LRU cap (512) remains the only eviction. Known accepted edge: in-memory, so a core restart forgets last-seen until next contact.
- Produces: `LiveSession.online` (recent contact) + `LiveSession.lastSeenAt` (last contact, null = never dialed this core run). The "started before install — one reload" note keys off `lastSeenAt === null`, not a decaying flag — a wired-but-idle session shows "last seen 5m ago", never the reload note.

- [ ] **Step 1: Failing test.** `changes-push.it.test.ts` via `bootCoreApp`: open `sessions.changes` with an AbortController, `for await` the first event after driving one real change (the same MCP-request path existing observer tests use); assert `rev` increased. Second case: two rapid changes coalesce (microtask batching) — drive both, await one event, assert no second event arrives before the next cause (synchronous assert on collected array after a third cause's event lands — no timers).
- [ ] **Step 2: Run, verify it fails.**
- [ ] **Step 3: Implement** route + dial-log reshape + row reshape + consumer sweep.
- [ ] **Step 4: Gates** for `@conciv/core @conciv/contract` + full `conciv` app typecheck (consumer sweep).
- [ ] **Step 5: Commit** `feat(core): sessions.changes push over the existing change emitter; rows carry online/lastSeenAt`.

---

### Task 3: connect flow rides the push — poll ladder and clock die

**Files:**
- Modify: `apps/conciv/src/composer/connect/use-connect-flow.ts`
- Modify: `apps/conciv/src/composer/connect/connect-steps.ts` (delete `dialInPollMs`, `GIVE_UP_AFTER_FAILURES` if now dead)
- Modify: `apps/conciv/src/composer/connect/connect-copy.ts` (delete `isStale` if now dead)
- Modify: `apps/conciv/src/composer/connect/connect-machine.ts` ONLY if the `dialledIn` event needs no shape change (it should not — the machine already accepts `{type: 'dialledIn'}`)
- Test: whatever browser test currently covers the connect dialog staleness/dial-in (grep `stale\|dialledIn` under `apps/conciv/test`); update in place.

**Interfaces:**
- Consumes: `deps.rpc.sessions.changes(undefined, {signal})` and `LiveSession.online`/`lastSeenAt` from Task 2.

- [ ] **Step 1: Delete the clock.** Remove `now`/`setNow`/`createTimer`/`TICK_MS`. Stale badge becomes `stale: () => candidates.isStale`; set the query's `staleTime` to the single badge window (move `STALE_AFTER_MS = 15_000` out of connect-copy into this file as the `staleTime` value). Delete `FRESH_MS`. `checkedAt` stays `candidates.dataUpdatedAt` (RelativeTime consumes it).
- [ ] **Step 2: Push-driven refetch.** Delete `pollMs()`/`persistence()`/`dialInPollMs`/`GIVE_UP_AFTER_FAILURES`/`terminalDialledIn`. While the dialog is open, hold ONE `sessions.changes` subscription (AbortController tied to `open()` — a small effect or the machine's plan, matching the existing effect-planner idiom); each event → `queryClient.invalidateQueries({queryKey: attachCandidates.key()})`. The query keeps a slow safety-net `refetchInterval: open() ? POLL_MS : false` ONLY for sessions that cannot announce themselves (no hooks installed yet — their processes appear without any server-side event); bump `POLL_MS` to 15_000 since push now carries the fast path. Dial-in state: `dialledIn` fires when the adopted row (`adoptedOf(state).harnessSessionId`) shows `online: true` in fresh data — same `createEffect` shape as today's `terminalDialledIn`, but reading `online`. `contactLost` = subscription dropped while in reload (iterator ended/errored, not user-aborted); `unreachable` = `candidates.isError`. On subscription drop, do NOT hand-roll reconnect: surface `contactLost` and re-open only on explicit user retry or dialog re-open. If that shape fights the machine, STOP and report — pacer AsyncRetryer is the only sanctioned retry primitive if one is truly needed.
- [ ] **Step 3: Online/Last-seen presentation.** `connect-copy.ts` `activityOf`/`metaLine`: replace the working/idle + reload-note logic — `online: true` → "online" (plus working/shell detail), else "last seen" + `RelativeTime` of `lastSeenAt` (or "started" + `startedAt` when `lastSeenAt` is null, keeping the one-time-setup note only for null). Candidate-row renders it with the existing `RelativeTime`. Reload card copy: waiting = "Waiting for this session to come online…", flipped = existing DIALLED_IN line.
- [ ] **Step 4: Update the browser test** to drive dial-in through the real surface (the fake harness dials via the same MCP path as Task 2's test), assert the reload card flips via `expect.element` and a row shows "last seen" after the online window passes is NOT tested (would need clock control — skip; the pure `metaLine` mapping is covered by the machine-free copy function's usage in the browser test's visible text). No timers.
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
