# Plan 003: Make session-lock acquisition atomic and enforce it in the turn route

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2446924..HEAD -- packages/core/src/store/lock.ts packages/core/src/api/chat/turn.ts packages/core/test/store/lock.test.ts`
> If any changed since this plan was written, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2446924`, 2026-06-16

## Why this matters

The per-session lock exists to guarantee **one live agent run per session** — two processes appending
to the same harness session id at once corrupt its transcript. But acquisition is non-atomic
check-then-act, and the turn route doesn't enforce the result:

1. `acquireLock` does `readLock(...)` then `writeJson(...)` as two separate steps — between them, a
   second caller can also observe "free" and both write (TOCTOU).
2. In the turn route, the only hard guard is a `readLock(...).held` check at the top that throws 409;
   the actual `acquireLock(...)` happens later in `onSpawn` **and its boolean return is ignored** — so
   two concurrent `POST /api/chat` for the same session can both pass the 409 check, both spawn
   `claude --resume <same id>`, and corrupt the transcript.

The multi-session redesign correctly made locks per-session (distinct sessions parallelize), which
_narrows_ this to same-session concurrency — but that path is now easy to hit: the out-of-band compact
request and a normal turn target the same session. Fix by making `acquireLock` atomic (exclusive file
creation) and acquiring **before** spawning, rejecting with 409 if the lock is already held.

## Current state

- `packages/core/src/store/lock.ts` — per-session lock store. Current acquire is check-then-act:

```ts
// lock.ts (lines 17-36, current)
export function readLock(stateRoot: string, sessionId: string): LockState {
  const parsed = readJson(statePaths(stateRoot).lockFor(sessionId), LockFileSchema, {})
  if (typeof parsed.pid !== 'number' || !pidAlive(parsed.pid)) return {held: false, role: null, pid: null}
  return {held: true, role: parsed.role ?? null, pid: parsed.pid}
}

// Acquire if free or stale. Returns false if a live holder already owns it.
export function acquireLock(stateRoot: string, sessionId: string, role: LockRole, pid: number): boolean {
  if (readLock(stateRoot, sessionId).held) return false // <-- TOCTOU: gap before the write
  writeJson(statePaths(stateRoot).lockFor(sessionId), {role, pid, startedTs: Date.now()})
  return true
}

export function releaseLock(stateRoot: string, sessionId: string): void {
  try {
    rmSync(statePaths(stateRoot).lockFor(sessionId))
  } catch {
    // already gone
  }
}
```

`statePaths(stateRoot).lockFor(sessionId)` returns `join(dir, \`agent.${sessionId}.lock\`)`(see`packages/core/src/state-paths.ts`). `writeJson`/`readJson`live in`packages/core/src/fs.ts`;
`writeJson`calls`writeText`which does`mkdirSync(dirname(path), {recursive:true})`then`writeFileSync(path, text)`(no exclusive flag).`pidAlive(pid)`uses`process.kill(pid, 0)`.

- `packages/core/src/api/chat/turn.ts` — the turn route. Current guard + late, unchecked acquire:

```ts
// turn.ts (lines 54-57)
const sessionId = sessionIdFromHeaders(event.req.headers)
if (!sessionId) throw new HTTPError({status: 400, message: 'no session (resolve first)'})
if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'session busy'})
```

```ts
// turn.ts (lines 86-92) — inside the harnessText({...}) options
      onSpawn: (child) => {
        acquireLock(deps.stateRoot, sessionId, 'chat', child.pid)   // <-- return ignored; runs AFTER spawn
        event.req.signal.addEventListener('abort', () => {
          abort.abort()
          child.kill()
        })
      },
```

The lock is released in a `finally` (search `releaseLock(stateRoot, sessionId)` — around line 132, in
the stream-teardown helper). Imports at top: `import {acquireLock, readLock, releaseLock} from '../../store/lock.js'`.

- `packages/core/test/store/lock.test.ts` — existing per-session lock tests; use as the pattern. It
  uses `mkdtempSync(join(tmpdir(), 'aidx-lock-'))` for isolated state roots and cleans up in
  `afterEach`. Current first test:

```ts
// lock.test.ts (existing)
describe('per-session lock', () => {
  it('locks are independent per session id', () => {
    const root = tmp()
    expect(acquireLock(root, 'sess-a', 'chat', process.pid)).toBe(true)
    expect(readLock(root, 'sess-a').held).toBe(true)
    expect(readLock(root, 'sess-b').held).toBe(false)
    ...
  })
})
```

- Conventions: functions not classes; single-line comments; zod for on-disk shapes (already in
  `lock.ts`); Node built-ins imported from `node:fs` etc.

## Commands you will need

| Purpose        | Command                                                 | Expected on success |
| -------------- | ------------------------------------------------------- | ------------------- |
| Typecheck core | `pnpm turbo run typecheck --filter=@opendui/aidx-core`  | exit 0              |
| Core tests     | `pnpm turbo run test --filter=@opendui/aidx-core`       | all pass            |
| Lock test only | `pnpm --filter @opendui/aidx-core exec vitest run lock` | lock tests pass     |
| Lint core      | `pnpm --filter @opendui/aidx-core lint`                 | exit 0              |

## Scope

**In scope**:

- `packages/core/src/store/lock.ts`
- `packages/core/src/api/chat/turn.ts`
- `packages/core/test/store/lock.test.ts`

**Out of scope** (do NOT touch):

- The lock-file shape/schema, `releaseLock`, `readLocks`, and `pidAlive` — keep them; only `acquireLock`
  changes internally (its signature stays identical).
- The session store, resume-token plumbing (`recordMintedToken`/`resumeTokenFor`), and `uiBus` — unrelated.
- Do NOT change the per-session lock model into a global lock — distinct sessions MUST still run in
  parallel.

## Git workflow

- Branch: `advisor/003-atomic-session-lock`
- Commit style: conventional commits (e.g. `fix(core): make session-lock acquisition atomic`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `acquireLock` atomic via exclusive create

Rewrite `acquireLock` in `lock.ts` to create the lock file with the exclusive flag (`wx`), so the
create itself is the mutual-exclusion primitive (no read-then-write gap). On `EEXIST`, reclaim only if
the existing holder's pid is dead (crash recovery); otherwise return `false`. Target shape:

```ts
import {rmSync, readdirSync, writeFileSync} from 'node:fs'
import {mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
// ... existing imports

// Acquire atomically: O_EXCL create is the mutex. If the file already exists, reclaim it only when
// the recorded pid is dead (crash recovery); a live holder means we lost the race → false.
export function acquireLock(stateRoot: string, sessionId: string, role: LockRole, pid: number): boolean {
  const path = statePaths(stateRoot).lockFor(sessionId)
  const body = JSON.stringify({role, pid, startedTs: Date.now()})
  mkdirSync(dirname(path), {recursive: true})
  try {
    writeFileSync(path, body, {flag: 'wx'}) // wx = create + fail if exists (atomic)
    return true
  } catch {
    // Exists. Reclaim iff the current holder is stale (dead pid); else we lost the race.
    if (readLock(stateRoot, sessionId).held) return false
    try {
      writeFileSync(path, body) // overwrite the stale lock
      return true
    } catch {
      return false
    }
  }
}
```

Note: there is still a tiny reclaim window for _stale_ locks (two callers both seeing a dead pid), but
that only happens after a crash and both would write the same "free→held" transition; the live-holder
path — the one that matters — is now race-free via `wx`. Do not over-engineer this further.

**Verify**: `pnpm turbo run typecheck --filter=@opendui/aidx-core` → exit 0.

### Step 2: Acquire before spawning in the turn route

In `turn.ts`, replace the read-only 409 check with an atomic acquire up front, and remove the
now-redundant `acquireLock` call from `onSpawn` (keep the abort/kill wiring).

Replace:

```ts
if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'session busy'})
```

with:

```ts
// Atomic acquire IS the guard — closes the check-then-act race two same-session turns could hit.
// Recorded pid is the dev-server's (alive for the run); released in the stream teardown's finally.
if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
  throw new HTTPError({status: 409, message: 'session busy'})
}
```

Then in the `onSpawn` callback, delete the `acquireLock(...)` line (the lock is already held); keep the
abort listener:

```ts
      onSpawn: (child) => {
        event.req.signal.addEventListener('abort', () => {
          abort.abort()
          child.kill()
        })
      },
```

IMPORTANT — release on the early-return/throw paths: the lock is now acquired _before_ the rest of the
handler runs. Confirm the lock is released if the handler throws after acquiring (e.g. body validation
fails) — `releaseLock` currently runs in the stream-teardown `finally`, which only covers the streaming
path. If acquisition happens and then a later `await readValidatedBody(...)` throws, the lock would
leak. Wrap the post-acquire body so any throw before the stream starts releases the lock: acquire, then
`try { ...build adapter + start stream... } catch (e) { releaseLock(deps.stateRoot, sessionId); throw e }`.
Read the handler body and place the release so EVERY path after a successful acquire releases on
failure. If the structure makes this awkward, that is a STOP condition — report the handler shape.

**Verify**: `pnpm turbo run typecheck --filter=@opendui/aidx-core` → exit 0; `pnpm --filter @opendui/aidx-core lint` → exit 0.

### Step 3: Add lock tests for double-acquire and stale reclaim

In `packages/core/test/store/lock.test.ts`, add (inside the existing `describe('per-session lock', ...)`):

```ts
it('a second acquire on a held session fails (atomic, no double-acquire)', () => {
  const root = tmp()
  expect(acquireLock(root, 's', 'chat', process.pid)).toBe(true)
  // process.pid is alive → the lock is genuinely held → second acquire must fail.
  expect(acquireLock(root, 's', 'iterate', process.pid)).toBe(false)
  releaseLock(root, 's')
  expect(acquireLock(root, 's', 'chat', process.pid)).toBe(true)
})

it('reclaims a stale lock whose holder pid is dead', () => {
  const root = tmp()
  const deadPid = 2 ** 31 - 1 // a pid that is virtually certain to be dead
  // Seed a stale lock by acquiring with a dead pid (readLock treats it as free).
  expect(acquireLock(root, 's', 'chat', deadPid)).toBe(true)
  expect(readLock(root, 's').held).toBe(false) // dead pid ⇒ reads as free/stale
  // A live caller can reclaim it.
  expect(acquireLock(root, 's', 'chat', process.pid)).toBe(true)
  expect(readLock(root, 's').held).toBe(true)
})
```

(If a chosen `deadPid` happens to be alive in the executor's environment, pick another clearly-dead pid
and note it — `process.kill(pid, 0)` throwing means dead.)

**Verify**: `pnpm --filter @opendui/aidx-core exec vitest run lock` → all lock tests pass (existing + 2 new).

### Step 4: Full core verification

**Verify**: `pnpm turbo run test --filter=@opendui/aidx-core` → all pass.

## Test plan

- New tests in `packages/core/test/store/lock.test.ts`: double-acquire-fails (the core invariant the
  atomic change protects) and stale-reclaim (crash recovery still works).
- Pattern: the existing `per-session lock` describe block in the same file.
- Note: a true parallel-process race test is inherently flaky and is intentionally **not** added; the
  `wx` flag closes the race by construction. Say so in the commit message.
- Verification: `pnpm turbo run test --filter=@opendui/aidx-core` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n "flag: 'wx'" packages/core/src/store/lock.ts` returns the exclusive-create write
- [ ] `turn.ts` acquires the lock at the top (the `if (!acquireLock(... process.pid ...))` throw) and no
      longer calls `acquireLock` inside `onSpawn` (`grep -n "acquireLock" packages/core/src/api/chat/turn.ts` shows exactly one call)
- [ ] The lock is released on post-acquire failure paths (Step 2), not just the streaming `finally`
- [ ] `pnpm turbo run typecheck --filter=@opendui/aidx-core` exits 0
- [ ] `pnpm turbo run test --filter=@opendui/aidx-core` exits 0; the 2 new lock tests pass
- [ ] `pnpm --filter @opendui/aidx-core lint` exits 0
- [ ] Only the three in-scope files are modified
- [ ] `plans/README.md` row for 003 updated

## STOP conditions

Stop and report (do not improvise) if:

- `lock.ts` `acquireLock` or `turn.ts`'s guard/`onSpawn` no longer match the "Current state" excerpts.
- You cannot place `releaseLock` to cover all post-acquire failure paths without restructuring the
  handler significantly (report the handler shape and proposed placement instead).
- Any existing core test fails after the change for a reason you can't tie to the lock (report it).

## Maintenance notes

- The lock now records the **dev-server** pid (acquired before the child spawns), not the child's. This
  is correct for crash recovery (server dies → pid dead → lock reads free). If a future change needs the
  child pid recorded, update it in `onSpawn` _after_ a successful up-front acquire — do not reintroduce a
  second `acquireLock`.
- Reviewer: scrutinize that every early-return/throw after the acquire releases the lock (leak risk),
  and that distinct sessions still run in parallel (per-session file paths unchanged).
- Follow-up deferred: a cross-process integration test (two real `POST /api/chat` in flight) — valuable
  but heavier; out of scope here.
