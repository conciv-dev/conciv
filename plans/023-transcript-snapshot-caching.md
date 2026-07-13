# Plan 023: The chat SSE loop stops re-parsing the whole on-disk transcript on every tick

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/core/src/chat/attach.ts packages/core/src/chat/run.ts`
> If either changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (pairs with plan 024 on the client; independent to land)
- **Category**: perf
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

During a live agent turn, the server re-reads and fully re-parses the entire on-disk JSONL transcript from scratch on **every** SSE snapshot — roughly 20 times/second — and streams a complete transcript snapshot each time. The parse cost and the SSE payload both grow with total conversation length, so a long session degrades to O(transcript²) work over a single run. This is the single largest scaling cost in the chat path, and it forces the client to re-diff the whole thread each tick (plan 024 addresses the client half). This plan removes the redundant re-parse by caching the parsed transcript and only re-reading when the transcript file actually grows — the streaming _run_ messages (which do change per tick) stay live, but the settled transcript (which only changes at turn boundaries) is parsed once.

## Current state

- `packages/core/src/chat/attach.ts:69-91` — the snapshot builders:

```ts
export async function transcriptMessages(deps: ChatDeps, sessionId: string): Promise<ChatHistory> {
  if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
  const record = await sessionById(deps.db, sessionId)
  if (!record?.harnessSessionId) return []
  const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome))
  return jsonl ? deps.harness.history.parse(jsonl) : []
}

async function buildSnapshot(deps: ChatDeps, sessionId: string): Promise<StreamChunk> {
  const transcript = await transcriptMessages(deps, sessionId)
  const row = runMessagesFor(deps.db, sessionId)
  const run = row ? ChatHistorySchema.parse(row.messages) : []
  const settled = settledMessages(transcript, pendingUserTextOf(run))
  return aguiSnapshotFor([...settled, ...run])
}

async function snapshotKey(deps: ChatDeps, sessionId: string): Promise<string> {
  const row = runMessagesFor(deps.db, sessionId)
  const record = await sessionById(deps.db, sessionId)
  return `${row?.updatedAt ?? 0}:${record?.updatedAt ?? 0}:${record?.harnessSessionId ?? ''}`
}
```

- `packages/core/src/chat/attach.ts:140-168` — the live loop calls `buildSnapshot` whenever `snapshotKey` changes:

```ts
const key = await snapshotKey(deps, sessionId)
if (key !== seen.key) {
  yield await buildSnapshot(deps, sessionId)
  lastSnapshotAt = Date.now()
}
```

- Why the key flips every tick: `packages/core/src/chat/run.ts:152-154` writes the full run-message blob (bumping `row.updatedAt`) on every streamed chunk:

```ts
onMessagesChange: (messages) => {
  setRunMessages(deps.db, sessionId, messages)
  deps.changes.notify()
},
```

So `snapshotKey` (which includes `row.updatedAt`) changes ~20×/s, `buildSnapshot` runs each time, and `transcriptMessages` re-reads + `history.parse`s the whole JSONL each time — even though the _transcript file_ (settled history) does not change mid-turn; only the run blob does.

Key insight for the fix: **the settled transcript is immutable during a run.** The harness writes the transcript JSONL at turn boundaries, not per chunk. So the per-tick re-parse of `transcriptMessages` is pure waste; only `runMessagesFor` (the DB run blob) legitimately changes each tick.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style.
- The db driver is synchronous `node:sqlite`; `runMessagesFor(deps.db, sessionId)` is a sync call, `sessionById` is async.
- Tests: `packages/core/test/chat/*.it.test.ts` are the integration tests for this path — model new tests on them.

## Commands you will need

| Purpose   | Command                                                     | Expected on success    |
| --------- | ----------------------------------------------------------- | ---------------------- |
| Typecheck | `pnpm exec turbo run typecheck --filter=@conciv/core`       | exit 0                 |
| Test      | `pnpm exec turbo run test --filter=@conciv/core`            | all pass               |
| Lint      | `pnpm exec turbo run lint --filter=@conciv/core`            | exit 0                 |
| Fallow    | `pnpm exec fallow audit --changed-since main --format json` | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/core/src/chat/attach.ts` (add a transcript parse cache; keep the snapshot/settled-merge semantics identical)
- Tests in `packages/core/test/chat/`

**Out of scope**:

- Changing the SSE snapshot _format_ or moving to delta/patch emission — that is a larger, riskier follow-up (see Maintenance notes). This plan keeps emitting full snapshots; it only removes the redundant transcript **re-parse**. The payload-size win is deferred.
- `run.ts`'s per-chunk `setRunMessages` — plan 006 territory (PERF-06, not selected); do not change write cadence here.
- The client (`ui-kit-chat`) — that's plan 024.

## Git workflow

- Branch: `advisor/023-transcript-snapshot-caching`
- Commit style: `perf(core): cache parsed transcript so the SSE loop stops re-parsing per tick`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add an mtime/size-keyed transcript parse cache

In `attach.ts`, introduce a module-level cache keyed by transcript file path, storing the file's identity (size + mtimeMs from `statSync`) and the parsed `ChatHistory`. `transcriptMessages` re-reads and re-parses only when the file's size or mtime changed since the cached entry; otherwise it returns the cached parse.

Target shape (adjust imports — add `statSync` from `node:fs`):

```ts
const transcriptCache = new Map<string, {size: number; mtimeMs: number; parsed: ChatHistory}>()

export async function transcriptMessages(deps: ChatDeps, sessionId: string): Promise<ChatHistory> {
  if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
  const record = await sessionById(deps.db, sessionId)
  if (!record?.harnessSessionId) return []
  const path = deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome)
  const stat = statSync(path, {throwIfNoEntry: false})
  if (!stat) return []
  const cached = transcriptCache.get(path)
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.parsed
  const jsonl = readFileOrEmpty(path)
  const parsed = jsonl ? deps.harness.history.parse(jsonl) : []
  transcriptCache.set(path, {size: stat.size, mtimeMs: stat.mtimeMs, parsed})
  return parsed
}
```

Notes:

- `statSync(..., {throwIfNoEntry: false})` returns `undefined` for a missing file — replaces the implicit "empty" path without throwing.
- The cache is keyed by absolute transcript path, so distinct sessions don't collide.
- Return the cached array by reference — callers (`settledMessages`, `historyFor`) must not mutate it. Verify they don't (they `.map`/spread, which is non-mutating — confirm in `run.ts:210` `historyFor` and `settledMessages` in `session.ts`).

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/core` → exit 0.

### Step 2: Confirm snapshot content is unchanged

The cache is transparent: for the same file state it returns the same parse. `buildSnapshot` and `snapshotKey` are unchanged, so the emitted snapshots must be byte-identical to before for any given transcript+run state. The existing `packages/core/test/chat/*.it.test.ts` integration tests assert snapshot/stream behavior — they must still pass unchanged.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → all pass.

### Step 3: Add a regression test proving the transcript is parsed once per turn, not per tick

Add a test (in `packages/core/test/chat/`) that spies on `history.parse` (or counts reads of the transcript file) across a multi-chunk run and asserts `parse` is called O(1) times for a stable transcript rather than O(chunks). If the test harness (`@conciv/harness-testkit` fake harness) doesn't expose a parse spy, assert indirectly: drive N `changes.notify()` ticks over a fixed transcript file and assert the file is `readFileSync`'d at most once after the first (e.g. via a `vi.spyOn(fs, 'readFileSync')` count, scoped to the transcript path).

Model the test on an existing `packages/core/test/chat/attach*.it.test.ts` or `chat.it.test.ts`.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → new test passes; parse/read count is bounded.

### Step 4: Lint + fallow

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/core` → exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- New test in `packages/core/test/chat/` asserting the transcript is read/parsed at most once across many SSE ticks over an unchanged transcript file (the regression this plan fixes).
- The existing `*.it.test.ts` snapshot/stream tests must still pass unchanged (proves output identical).
- Verification: `pnpm exec turbo run test --filter=@conciv/core` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/core` exits 0
- [ ] `transcriptMessages` consults a size/mtime cache and only re-parses on file change (grep shows `statSync` + cache Map)
- [ ] A test asserts bounded transcript reads/parses across multiple ticks
- [ ] Existing chat integration tests pass unchanged (snapshot output identical)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `attach.ts`/`run.ts` don't match the "Current state" excerpts (drift).
- Any caller mutates the array returned by `transcriptMessages` (would corrupt the cache) — report the mutation site; do not defensively deep-copy on every call (that reintroduces the cost).
- The transcript file's mtime granularity is too coarse to detect a same-second append in tests (some filesystems have 1s mtime resolution) — if a test flakes on that, key the cache on `size` alone plus a content check, and report; do not delete the test.
- Removing the re-parse changes any snapshot's content in an existing test — that means the parse was not actually pure/deterministic; STOP and report rather than updating snapshots to match.

## Maintenance notes

- Deferred (bigger follow-up): emitting **incremental deltas** instead of full snapshots per tick would also cut the SSE payload (which still grows with thread length). The AG-UI event model and the `snapshotKey` machinery could gate a patch-based emission. That's a separate plan — it changes the wire contract and the client's reconciliation, so it needs its own design and the client (plan 024) landed first.
- A reviewer should confirm the cache can't serve a stale parse across a genuine transcript rewrite (compaction rewrites the transcript in place — verify size **or** mtime changes then; if a harness rewrites without changing size, add a cheap content hash).
- The cache is process-lifetime and unbounded in entry count (one per session transcript path). For a dev tool with a handful of sessions this is fine; if session counts ever grow large, add an LRU bound.
