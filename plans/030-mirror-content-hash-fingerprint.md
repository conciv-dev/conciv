# Plan 030: Terminal mirror detects last-message changes by content, not by serialized length

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/extensions/terminal/src/server/mirror.ts`
> If it changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

The terminal activity-rail mirror polls a transcript source and only pushes an update to attached viewers when its fingerprint changes. The fingerprint is `messages.length : lastMessageId : JSON.stringify(lastParts).length` — it uses the serialized **length** of the last message's parts, not their content. Any edit to the last message that keeps the same message count, same id, and same serialized-JSON length (an in-place character swap, or a tool part whose content changes size-neutrally) is treated as "no change" and never emitted, so the mirror silently goes stale. This plan replaces the length component with a content hash (or the serialized string itself), so content changes are detected regardless of length.

## Current state

- `packages/extensions/terminal/src/server/mirror.ts` — the entire file:

```ts
import type {UIMessage} from '@conciv/protocol/chat-types'

export type MirrorSource = {
  messages(): Promise<UIMessage[]>
}

export function watchMirror(
  source: MirrorSource,
  emit: (payload: {messages: UIMessage[]}) => void,
  intervalMs = 500,
): () => void {
  const state = {fingerprint: ''}
  const tick = async (): Promise<void> => {
    const messages = await source.messages().catch((): UIMessage[] => [])
    const last = messages.at(-1)
    const fingerprint = `${messages.length}:${last?.id ?? ''}:${JSON.stringify(last?.parts ?? []).length}`
    if (fingerprint === state.fingerprint) return
    state.fingerprint = fingerprint
    emit({messages})
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
```

The bug is the `.length` on line with `JSON.stringify(last?.parts ?? []).length`.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style.
- Never hand-roll a hash primitive when a stdlib one exists — use `node:crypto` (`createHash`). (This is a repo-recorded rule: no hand-rolled uuid/hash.)
- Tests: `packages/extensions/terminal/test/` — check for existing server-side tests to match.

## Commands you will need

| Purpose   | Command                                                             | Expected on success    |
| --------- | ------------------------------------------------------------------- | ---------------------- |
| Typecheck | `pnpm exec turbo run typecheck --filter=@conciv/extension-terminal` | exit 0                 |
| Test      | `pnpm exec turbo run test --filter=@conciv/extension-terminal`      | all pass               |
| Lint      | `pnpm exec turbo run lint --filter=@conciv/extension-terminal`      | exit 0                 |
| Fallow    | `pnpm exec fallow audit --changed-since main --format json`         | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/extensions/terminal/src/server/mirror.ts`
- A test in `packages/extensions/terminal/test/` (new or extended)

**Out of scope**:

- The mirror's polling interval, the `MirrorSource` contract, the WS emit path — only the fingerprint computation changes.
- Broadening the fingerprint to hash _all_ messages (the last message + count + id is a sufficient change signal for an append-mostly transcript; only the last message is edited in place). If you find mid-transcript edits are common, report — don't silently hash everything (cost per tick).

## Git workflow

- Branch: `advisor/030-mirror-content-hash-fingerprint`
- Commit style: `fix(extension-terminal): fingerprint the mirror by content hash, not serialized length`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Replace the length component with a content hash

Use `node:crypto` `createHash('sha1')` (or `sha256`) over the serialized last parts. Target:

```ts
import {createHash} from 'node:crypto'
import type {UIMessage} from '@conciv/protocol/chat-types'

function lastPartsHash(last: UIMessage | undefined): string {
  return createHash('sha1')
    .update(JSON.stringify(last?.parts ?? []))
    .digest('hex')
}
```

Then in `tick`, build the fingerprint from `messages.length`, `last?.id`, and `lastPartsHash(last)` instead of the `.length`. Everything else in `watchMirror` stays identical.

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/extension-terminal` → exit 0.

### Step 2: Add a regression test

Add a test in `packages/extensions/terminal/test/`. The key case is the one the old code missed:

- Build a `MirrorSource` stub whose `messages()` returns, on first call, a message with a last part `{type:'text', content:'aaaa'}`, and on the second call the **same length** but different content `{type:'text', content:'bbbb'}` (same count, same id). Assert `emit` is called on the **second** tick (content changed) — the old length-based fingerprint would have skipped it.
- Also assert the happy paths still work: an appended message (count changes) emits; a truly unchanged tick does **not** emit.

Because `watchMirror` uses `setInterval`, drive ticks deterministically: either call the internal `tick` by refactoring it to be testable, or use vitest fake timers to advance `intervalMs`. Prefer fake timers so the public API stays unchanged; if the source is async, `await` a microtask flush between advances. Model on any existing terminal server test.

**Verify**: `pnpm exec turbo run test --filter=@conciv/extension-terminal` → all pass, including the same-length-different-content case.

### Step 3: Lint + fallow

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/extension-terminal` → exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- New test: same-count/same-id/same-length but different-content last message → mirror emits (the regression); appended message → emits; identical tick → no emit.
- Verification: `pnpm exec turbo run test --filter=@conciv/extension-terminal` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/extension-terminal` exits 0
- [ ] `grep -n ").length" packages/extensions/terminal/src/server/mirror.ts` no longer shows the `JSON.stringify(...).length` fingerprint component
- [ ] A test asserts a same-length content change triggers an emit
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `mirror.ts` doesn't match the "Current state" excerpt (drift).
- Fake timers don't drive the async `tick` cleanly after one reasonable attempt — refactor `tick` into a returned/testable function and report the API tweak, rather than removing the test.
- You discover mid-transcript (not just last-message) edits happen — then count+id+last-hash is insufficient; report so the fingerprint scope can be reconsidered (don't silently hash the whole array every 500ms without noting the cost).

## Maintenance notes

- The mirror assumes the transcript is append-mostly with only the last message edited in place. If a future change edits earlier messages (e.g. a redaction pass), the fingerprint must widen to cover them — a reviewer should re-check this assumption when transcript mutation semantics change.
- sha1 here is a change-detector, not a security primitive — collision resistance isn't required; speed is fine. Don't over-engineer it.
- The same "fingerprint by length" anti-pattern appears in plan 024's turn signature (a deliberately-accepted heuristic there because a stale frame self-corrects on the next tick); here staleness does _not_ self-correct until the next content change, which is why this one needs the hash.
