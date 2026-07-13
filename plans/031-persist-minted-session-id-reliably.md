# Plan 031: The minted harness session id is persisted reliably, not fire-and-forget with a swallowed error

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/core/src/chat/run.ts`
> If it changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

When a harness turn mints its session id, the fold loop persists it with `void recordMintedToken(...).catch(() => {})` — not awaited, error discarded, and re-fired on every chunk that carries a session-id event. `recordMintedToken` writes `harnessSessionId`, which is the **only** key used later to resume the session (`resumableToken`) and to wrap/adopt it. If that write loses a race with run teardown or errors, the session becomes permanently un-resumable and un-wrappable with **no signal to anyone**. This plan awaits the write, logs on failure (instead of swallowing), and writes it once on first observation rather than redundantly per chunk.

## Current state

- `packages/core/src/chat/run.ts:131-146` — `foldRunStream`, where the session id is tapped and persisted:

```ts
async function foldRunStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  processor: StreamProcessor,
  stream: AsyncIterable<StreamChunk>,
  outcome: RunOutcome,
): Promise<void> {
  for await (const chunk of stream) {
    processor.processChunk(chunk)
    tapSessionId(chunk, (id) => void recordMintedToken(deps.db, sessionId, id).catch(() => {}))
    if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls' && chunk.usage) {
      outcome.usage = usageSnapshotFor(deps, req.model ?? deps.harness.defaultModel ?? null, chunk.usage)
    }
  }
}
```

- `recordMintedToken` (`run.ts:34-35`) — a single db `update` (synchronous sqlite driver under the hood, returns a promise):

```ts
export const recordMintedToken = (db: ConcivDb, id: string, token: string): Promise<unknown> =>
  db.update(sessions).set({harnessSessionId: token, updatedAt: Date.now()}).where(eq(sessions.id, id))
```

- `tapSessionId` (`run.ts:191-197`) invokes the callback for each `*.session-id` custom chunk — the harness may emit it more than once, so the current code writes redundantly.
- Consumers of `harnessSessionId`: `resumeTokenFor` (`run.ts:19-20`), `resumableToken` (`run.ts:22-32`), and session wrapping (`session.ts`). A missing write here breaks all of them.
- There is an existing error-logging helper: `logError` (imported in `app.ts` from `./lib/debug.js`) and `harnessDebug` (imported in `run.ts` from `../lib/debug.js`). Use the repo's logging path, not `console`.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style.
- The db driver is synchronous, so awaiting `recordMintedToken` inside the fold does not meaningfully block streaming — it resolves effectively immediately.
- Don't swallow errors on a critical path; log them via the existing `logError`/debug helper (`packages/core/src/lib/debug.ts`).
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

- `packages/core/src/chat/run.ts` (`foldRunStream`, and a small guard to write once)
- A test in `packages/core/test/chat/`

**Out of scope**:

- `tapSessionId` (the chunk-matching helper) — leave it; the dedup happens at the call site.
- `recordMintedToken`'s signature/body — it's fine; only how it's called changes.
- The usage-snapshot logic in the same loop.
- Retrying the write (a failed sqlite write on a synchronous driver is exceptional; log it — don't build a retry loop).

## Git workflow

- Branch: `advisor/031-persist-minted-session-id-reliably`
- Commit style: `fix(core): await and log the minted-session-id write; persist once`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Await the write, log failures, and write once

In `foldRunStream`, track whether the token was already recorded this run, and `await` the write with an error log. `tapSessionId` takes a sync callback, so collect the id and await outside the tap (or make the tap callback async-aware by capturing the id and awaiting after). Target shape:

```ts
async function foldRunStream(deps, sessionId, req, processor, stream, outcome): Promise<void> {
  let recorded = false
  for await (const chunk of stream) {
    processor.processChunk(chunk)
    let mintedId: string | null = null
    tapSessionId(chunk, (id) => {
      mintedId = id
    })
    if (mintedId && !recorded) {
      recorded = true
      await recordMintedToken(deps.db, sessionId, mintedId).catch((error) => {
        logError(`[core] failed to persist minted session id for ${sessionId}: ${String(error)}`)
      })
    }
    if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls' && chunk.usage) {
      outcome.usage = usageSnapshotFor(deps, req.model ?? deps.harness.defaultModel ?? null, chunk.usage)
    }
  }
}
```

Notes:

- `recorded` makes it write once per run (the first session-id chunk), removing the per-chunk redundancy.
- The `await` ensures the write completes (or logs) before the loop continues; on the synchronous sqlite driver this is effectively instant and cannot lose a race with teardown.
- Import `logError` from `../lib/debug.js` if not already imported in `run.ts` (it imports `harnessDebug` from there — check and add `logError` to that import).
- If a harness legitimately re-mints a _different_ session id mid-run (unusual), the `recorded` guard would skip the second. Confirm the harness mints once per run; if re-minting with a changed id is real, key the guard on the id value instead of a boolean (write when `mintedId !== lastRecordedId`). Default to the boolean unless you find evidence of re-minting.

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/core` → exit 0.

### Step 2: Add a test

Add a test in `packages/core/test/chat/` that drives a run whose stream emits a `*.session-id` custom chunk and asserts `harnessSessionId` is persisted (readable via `resumeTokenFor`/`sessionById`) after the run. Add a second case: two session-id chunks with the same id result in a single write (spy on `db.update` or `recordMintedToken`, or assert idempotent final state). Model on an existing `packages/core/test/chat/*.it.test.ts` that uses the fake harness — configure the fake to emit a session-id chunk.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → all pass, including the persistence assertion.

### Step 3: Lint + fallow

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/core` → exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- New test: a session-id chunk causes `harnessSessionId` to be persisted (resumable afterward); duplicate session-id chunks write once.
- Existing chat integration tests (which exercise resume) must still pass.
- Verification: `pnpm exec turbo run test --filter=@conciv/core` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/core` exits 0
- [ ] `grep -n "recordMintedToken" packages/core/src/chat/run.ts` shows the write is awaited with an error log, not `.catch(() => {})`
- [ ] The write happens at most once per run (a `recorded` guard)
- [ ] A test asserts the minted session id is persisted and duplicate chunks don't double-write
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `foldRunStream`/`recordMintedToken` don't match the "Current state" excerpts (drift).
- Awaiting the write inside the fold measurably stalls streaming in an existing test (it shouldn't on the sync sqlite driver) — report; if the driver is unexpectedly async/slow, fire-and-forget-but-logged (`.catch(logError)`) is an acceptable fallback that still fixes the swallow.
- You find the harness re-mints different session ids within one run — report; switch the guard from boolean to last-id comparison and note it.

## Maintenance notes

- `harnessSessionId` is the resume/wrap key — treat its persistence as load-bearing. Any future refactor of the fold loop must keep this write awaited-and-logged, not fire-and-forget.
- A reviewer should confirm the write still happens for the _first_ session-id chunk (some harnesses emit it early, some late) and that the `recorded` guard doesn't skip the only chunk.
- Related: `run.ts` has other `.catch(() => {})` swallows on genuinely best-effort paths (`recordRunEnd`, `onRunEnd`) — those are lower-stakes (they don't gate resume) and are intentionally left; only the resume-critical minted-id write is fixed here.
