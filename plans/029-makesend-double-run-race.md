# Plan 029: `makeSend` never releases a run that `startRun` already owns (no duplicate harness process)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/core/src/chat/run.ts`
> If it changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

`makeSend` claims the run lock, then dispatches `startRun` **unawaited** (`void startRun(...)`), then does more async work (`await db.delete(drafts)` + `changes.notify()`) inside the same `try`. Its `catch` releases the run on any throw. But `startRun` also releases the run in its own `finally`. So if the drafts-delete (or notify) throws _after_ `startRun` has already launched, `makeSend`'s catch flips the run status to `idle` while the harness turn is still live. A subsequent `send`/`claimRun` can then succeed and spawn a **second concurrent harness process** against the same session. The window is small (the synchronous sqlite delete rarely throws), but the failure mode — two live agent processes on one session — is severe. This plan closes the window by not letting `makeSend`'s catch release a run once `startRun` has been dispatched.

## Current state

- `packages/core/src/chat/run.ts:213-233` — `makeSend`:

```ts
export function makeSend(deps: ChatDeps): (sessionId: string, text: string) => Promise<void> {
  return async (sessionId, text) => {
    if (!claimRun(deps.db, sessionId, 'chat')) throw new Error(SESSION_BUSY)
    deps.changes.notify()
    try {
      deps.onRunStart?.(sessionId)
      await ensureChatRecord(deps.db, sessionId, deps.harness.id, deps.cwd)
      const userText = await composeUserText(deps.db, sessionId, text)
      const model = (await sessionById(deps.db, sessionId))?.model ?? null
      const history = await historyFor(deps, sessionId)
      const messages = toModelMessages([...history, {role: 'user', content: userText}])
      void startRun(deps, sessionId, {messages, model, kind: 'chat'})
      await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      deps.changes.notify()
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.changes.notify()
      throw error
    }
  }
}
```

- `startRun` (`run.ts:148-174`) owns the lock lifecycle after dispatch — its `finally` calls `releaseRun(deps.db, sessionId, outcome.error)` (`:170`). So once `void startRun(...)` runs, releasing the lock is `startRun`'s job, not `makeSend`'s.

The bug: the `await db.delete(drafts)` and `changes.notify()` at `:225-226` sit _after_ the `void startRun` at `:224` but _inside_ the try whose catch releases the run.

The same pattern is safe in `makeCompactor` (`run.ts:241-260`) because there the drafts/marker work happens **before** `startRun` is called (the `startRun` is the last statement, outside the try). `makeSend` should match that shape.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style.
- `claimRun`/`releaseRun` are synchronous db operations (`@conciv/db`); the sqlite driver is synchronous.
- Tests: `packages/core/test/chat/*.it.test.ts`.

## Commands you will need

| Purpose   | Command                                                     | Expected on success    |
| --------- | ----------------------------------------------------------- | ---------------------- |
| Typecheck | `pnpm exec turbo run typecheck --filter=@conciv/core`       | exit 0                 |
| Test      | `pnpm exec turbo run test --filter=@conciv/core`            | all pass               |
| Lint      | `pnpm exec turbo run lint --filter=@conciv/core`            | exit 0                 |
| Fallow    | `pnpm exec fallow audit --changed-since main --format json` | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/core/src/chat/run.ts` (`makeSend` only)
- A test in `packages/core/test/chat/`

**Out of scope**:

- `startRun`, `makeCompactor`, `foldRunStream` — untouched.
- The drafts-clearing behavior — drafts must still be deleted on a successful send; only the _ordering relative to lock release_ changes.
- `claimRun`/`releaseRun` in `@conciv/db`.

## Git workflow

- Branch: `advisor/029-makesend-double-run-race`
- Commit style: `fix(core): don't release a run in makeSend once startRun owns it`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Reorder so the fallible work precedes dispatch, and dispatch is the last statement

Move the drafts delete (and its `changes.notify()`) to **before** `void startRun(...)`, so all the catch-guarded fallible work happens while `makeSend` still legitimately owns the lock; then dispatch `startRun` as the final statement of the try (or just after it). Once `startRun` is dispatched, the lock belongs to `startRun`'s `finally`. Target shape:

```ts
export function makeSend(deps: ChatDeps): (sessionId: string, text: string) => Promise<void> {
  return async (sessionId, text) => {
    if (!claimRun(deps.db, sessionId, 'chat')) throw new Error(SESSION_BUSY)
    deps.changes.notify()
    let launched = false
    try {
      deps.onRunStart?.(sessionId)
      await ensureChatRecord(deps.db, sessionId, deps.harness.id, deps.cwd)
      const userText = await composeUserText(deps.db, sessionId, text)
      const model = (await sessionById(deps.db, sessionId))?.model ?? null
      const history = await historyFor(deps, sessionId)
      const messages = toModelMessages([...history, {role: 'user', content: userText}])
      await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      launched = true
      void startRun(deps, sessionId, {messages, model, kind: 'chat'})
      deps.changes.notify()
    } catch (error) {
      if (!launched) {
        releaseRun(deps.db, sessionId, null)
        deps.changes.notify()
      }
      throw error
    }
  }
}
```

Two changes: (1) the drafts delete now happens **before** dispatch, so a delete failure releases the lock correctly (startRun never launched); (2) the `launched` flag guarantees that once `startRun` is dispatched, `makeSend`'s catch never releases the lock — even if `changes.notify()` after dispatch somehow threw. Prefer the `launched`-flag form (belt-and-suspenders) over merely reordering, since a future edit could re-add post-dispatch async work.

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/core` → exit 0.

### Step 2: Add a regression test

Add a test in `packages/core/test/chat/` that forces a throw on the drafts delete **after** a hypothetical dispatch and asserts the run is not released twice. Concretely, the robust assertion given the reorder: if any fallible pre-dispatch step throws, the lock is released exactly once and the session returns to idle (no leaked lock); if `startRun` is dispatched, `makeSend` does not release the lock (startRun's finally does).

The cleanest deterministic test: use the fake harness (`@conciv/harness-testkit`) and a db seam. Assert that after a successful `send`, the run lock is owned by the run (status not idle until the run finishes) and drafts are cleared. Then, in a second case, make `composeUserText`/`historyFor` or the drafts delete throw (e.g. by injecting a db that rejects the delete) and assert `releaseRun` ran exactly once and no `startRun` was dispatched (the fake harness recorded zero turns). Model on an existing `packages/core/test/chat/*.it.test.ts` that drives `makeSend`.

If a precise double-release assertion is hard to construct, at minimum add a test asserting: (a) successful send clears drafts and the run proceeds, and (b) a pre-dispatch failure leaves the session idle (lock released) — these lock in the reorder.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → all pass, including the new test.

### Step 3: Lint + fallow

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/core` → exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- New test in `packages/core/test/chat/`: successful send clears drafts and holds the lock via the run; a pre-dispatch failure releases the lock once and dispatches no run.
- Existing chat integration tests must still pass (send behavior otherwise unchanged).
- Verification: `pnpm exec turbo run test --filter=@conciv/core` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/core` exits 0
- [ ] In `makeSend`, the drafts delete happens before `startRun` dispatch, and the catch does not release the lock once dispatched (a `launched` guard or equivalent)
- [ ] A test asserts a pre-dispatch failure releases the lock exactly once and dispatches no run
- [ ] Existing chat integration tests pass unchanged
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `makeSend` doesn't match the "Current state" excerpt (drift).
- Reordering the drafts delete before dispatch changes observable behavior in an existing test (e.g. a test asserts drafts are deleted _after_ the run starts) — report; the reorder must not regress draft semantics.
- You cannot construct a deterministic failure-injection test after a reasonable attempt — land Step 1 with the two weaker assertions (success clears drafts; pre-dispatch failure leaves idle) and report that the exact double-release case is covered by reasoning, not a test.

## Maintenance notes

- The invariant: **once `startRun` is dispatched, only `startRun`'s `finally` releases the run lock.** Any future code added to `makeSend` after the dispatch must not be inside a catch that releases the lock. The `launched` guard enforces this; keep it.
- `makeCompactor` already follows the safe shape (fallible work before `startRun`, dispatch last) — it's the reference.
- A reviewer should check that no new `await` was introduced between `void startRun(...)` and the end of the try that could throw and hit the (now guarded) catch.
