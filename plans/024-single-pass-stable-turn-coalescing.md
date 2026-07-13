# Plan 024: Turn coalescing is single-pass and returns referentially-stable turns, so streaming only re-renders the tail

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/ui-kit-chat/src/store/grouping.ts packages/ui-kit-chat/src/store/chat-context.tsx packages/ui-kit-chat/src/primitives/thread/thread.tsx`
> If any changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (complements plan 023 on the server; independent to land)
- **Category**: perf
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

Every streamed chunk currently recomputes and re-reconciles the whole chat thread, not just the growing tail. `coalesceTurns` rebuilds all turns with `reduce` + array-spread (O(n²) in message count) and allocates brand-new `Turn` objects on every call. It re-runs on every SSE snapshot because `useThread` memoizes on `chat.messages()`, which changes each tick. Because every `Turn` is a fresh reference, the `<Index each={turns()}>` in `thread.tsx` updates every row's signal each tick, re-running `pairResults`, `groupSegments`, and each message's markdown re-parse for the entire visible transcript — even for turns that settled long ago. Long threads get quadratically slower to stream and can jank the widget. This plan makes `coalesceTurns`/`groupSegments` single-pass and returns **referentially stable** turn objects for unchanged turns, so `<Index>` only updates the tail that actually changed.

## Current state

- `packages/ui-kit-chat/src/store/grouping.ts:5-13` — `coalesceTurns` (O(n²), fresh refs each call):

```ts
export function coalesceTurns(messages: ReadonlyArray<UIMessage>): Turn[] {
  return messages.reduce<Turn[]>((turns, message, index) => {
    const last = turns.at(-1)
    if (message.role === 'assistant' && last?.role === 'assistant') {
      return [...turns.slice(0, -1), {...last, parts: [...last.parts, ...message.parts], end: index}]
    }
    return [...turns, {key: message.id, role: message.role, parts: [...message.parts], start: index, end: index}]
  }, [])
}
```

- `grouping.ts:21-29` — `groupSegments`, same O(n²) slice-spread reduce pattern.
- `packages/ui-kit-chat/src/store/chat-context.tsx:67` — `useThread` memoizes on `chat.messages()`:

```ts
const turns = createMemo(() => coalesceTurns(chat.messages()))
```

- `packages/ui-kit-chat/src/primitives/thread/thread.tsx:67-90` — `Messages` renders `<Index each={turns()}>`; each row builds `createMemo(() => pairResults(turn().parts))`. `Index` keys by position and updates a row's `turn()` signal whenever the value at that position is a **new reference**. Since `coalesceTurns` returns all-new refs each tick, every row updates every tick.

`Turn` shape (`grouping.ts:3`): `{key: string; role; parts: MessagePart[]; start: number; end: number}`.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style.
- Solid: never destructure props (invokes getters); use `splitProps`. Do not write signals in render bodies. `<Index>` keys by position (values may change), `<For>` keys by reference — this code intentionally uses `<Index>`; keep it.
- Memoization uses `createMemo`. Tests: `ui-kit-chat` has unit tests under `packages/ui-kit-chat/test/` (real-browser or node per its vitest config — check `packages/ui-kit-chat/vitest.config.ts`; if Solid, it must pin `environment: 'node'`).

## Commands you will need

| Purpose   | Command                                                      | Expected on success    |
| --------- | ------------------------------------------------------------ | ---------------------- |
| Typecheck | `pnpm exec turbo run typecheck --filter=@conciv/ui-kit-chat` | exit 0                 |
| Test      | `pnpm exec turbo run test --filter=@conciv/ui-kit-chat`      | all pass               |
| Lint      | `pnpm exec turbo run lint --filter=@conciv/ui-kit-chat`      | exit 0                 |
| Fallow    | `pnpm exec fallow audit --changed-since main --format json`  | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/ui-kit-chat/src/store/grouping.ts` (`coalesceTurns`, `groupSegments` — make single-pass + stable)
- A unit test in `packages/ui-kit-chat/test/` (create or extend a grouping test)

**Out of scope**:

- `thread.tsx` rendering — it should not need changes once `coalesceTurns` returns stable refs; do NOT restructure the `<Index>`/`pairResults` there unless a test proves it necessary (if so, STOP and report — that's a bigger change).
- `pairResults` (`grouping.ts:33-44`) — already single-pass with Maps/Sets; leave it.
- Markdown rendering / `solid-streamdown` — the re-lex cost is PERF-05, a separate finding not in this plan.
- List virtualization — deferred (see Maintenance notes).

## Git workflow

- Branch: `advisor/024-single-pass-stable-turn-coalescing`
- Commit style: `perf(ui-kit-chat): single-pass, referentially-stable turn coalescing`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make `coalesceTurns` single-pass

Rewrite `coalesceTurns` to build the array with a single forward pass, mutating a local accumulator (push, and merge into the last turn in place) rather than slice-spreading. This alone removes the O(n²) allocation. Keep the exact same output shape and merge rule (consecutive assistant messages coalesce; everything else starts a new turn; `key` = first message id; `start`/`end` = index range).

```ts
export function coalesceTurns(messages: ReadonlyArray<UIMessage>): Turn[] {
  const turns: Turn[] = []
  messages.forEach((message, index) => {
    const last = turns.at(-1)
    if (message.role === 'assistant' && last?.role === 'assistant') {
      last.parts = [...last.parts, ...message.parts]
      last.end = index
      return
    }
    turns.push({key: message.id, role: message.role, parts: [...message.parts], start: index, end: index})
  })
  return turns
}
```

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/ui-kit-chat` → exit 0. Existing grouping tests still pass (output shape unchanged).

### Step 2: Return referentially-stable turns for unchanged turns

The above is still all-new refs each call. Add a memoization layer keyed by turn identity + content so a turn whose id and parts haven't changed returns the **same object reference** as the previous call. The cheapest robust key: `key` + `parts.length` + the last part's serialized length (a settled turn's part count and final part are stable; a streaming turn's last part grows, so it correctly gets a new ref).

Implement as a stateful factory the memo can hold across recomputations. Since `coalesceTurns` is a pure function called inside a `createMemo`, add a companion `makeTurnCoalescer()` that closes over a cache and is instantiated once per `useThread` consumer. Then change `chat-context.tsx:67` to use it:

```ts
export function makeTurnCoalescer(): (messages: ReadonlyArray<UIMessage>) => Turn[] {
  const cache = new Map<string, Turn>()
  return (messages) => {
    const raw = coalesceTurns(messages)
    const next = new Map<string, Turn>()
    const result = raw.map((turn) => {
      const sig = turnSignature(turn)
      const prev = cache.get(turn.key)
      const stable = prev && turnSignature(prev) === sig ? prev : turn
      next.set(turn.key, stable)
      return stable
    })
    cache.clear()
    next.forEach((turn, key) => cache.set(key, turn))
    return result
  }
}

function turnSignature(turn: Turn): string {
  const last = turn.parts.at(-1)
  return `${turn.parts.length}:${last ? JSON.stringify(last).length : 0}:${turn.end}`
}
```

Then in `chat-context.tsx`, construct the coalescer once and use it in the memo:

```ts
const coalesce = makeTurnCoalescer()
const turns = createMemo(() => coalesce(chat.messages()))
```

Notes:

- Stable-ref turns mean `<Index>` leaves settled rows untouched; only the streaming (tail) turn's ref changes, so only its row re-runs `pairResults`/markdown.
- `turnSignature` mirrors the coarse fingerprint used elsewhere in the codebase (e.g. the terminal mirror). It is a heuristic: identical length + count + end index is treated as unchanged. That is safe here because a genuine content change during streaming always grows the last part's serialized length or the part count. (If you want exactness, hash the last part instead of taking its length — but plan 030 covers the length-vs-hash tradeoff for a different call site; length is acceptable here since a stale row would at worst miss one intermediate frame, self-correcting on the next tick.)

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/ui-kit-chat` → exit 0.

### Step 3: Test referential stability

Add a unit test in `packages/ui-kit-chat/test/` (e.g. `grouping.test.ts`). Cases:

- **Correctness (unchanged behavior)**: `coalesceTurns` merges consecutive assistant messages, keeps user/system boundaries, and produces the same turns as before for a fixed input (assert the shape).
- **Stability**: build a coalescer, call it on messages `[u, a1]`, then again on `[u, a1, a2-growing]` (append parts to the last assistant turn), and assert the **user turn object is the same reference** across calls while the assistant turn is a new reference. Then call again with an identical array and assert **all** turns are the same references (no change → no new refs).

Model the test file on any existing `packages/ui-kit-chat/test/*.test.ts`. Ensure the vitest config pins `environment: 'node'` if this is a Solid package (it is) — a pure-function test needs no DOM.

**Verify**: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` → all pass, including stability assertions.

### Step 4: Optionally make `groupSegments` single-pass

`groupSegments` (`grouping.ts:21-29`) has the same slice-spread O(n²) shape. Convert it to a single forward pass (push segments, extend the last chain in place) with identical output. This is per-turn (called inside each row's render), so it compounds with the tail-only win. Keep output identical; add a small test asserting the segment output matches for a mixed parts array.

**Verify**: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` → all pass.

### Step 5: Lint + fallow + downstream typecheck

Because `chat-context.tsx`'s public `useThread` signature is unchanged, `apps/conciv` should be unaffected. Confirm:

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/ui-kit-chat` → exit 0
- `pnpm exec turbo run typecheck --filter=conciv` → exit 0 (consumer still typechecks)
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- File: `packages/ui-kit-chat/test/grouping.test.ts` (new or extended).
- Cases: coalescing correctness (unchanged output), referential stability of settled turns across streaming appends, no-op call returns identical refs, `groupSegments` output parity.
- Verification: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/ui-kit-chat` exits 0
- [ ] `grep -n "slice(0, -1)" packages/ui-kit-chat/src/store/grouping.ts` returns nothing (no slice-spread reduce left)
- [ ] A test asserts settled turns keep the same object reference across a streaming append
- [ ] `pnpm exec turbo run typecheck --filter=conciv` exits 0 (consumer unaffected)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `grouping.ts`/`chat-context.tsx`/`thread.tsx` don't match the "Current state" excerpts (drift).
- After Step 2, an existing `ui-kit-chat` test that asserts render behavior fails in a way that implies `<Index>` needs a keyed `<For>` instead — that's a rendering-model change beyond this plan's scope; report it.
- The coalescer cache causes a settled turn to _not_ update when it genuinely should (e.g. a tool-result folds into an earlier turn late) — if a test catches a missed update, the signature is too coarse; switch the last-part `.length` to a hash and report. Do not widen the signature to always-changing (that defeats the plan).

## Maintenance notes

- Deferred: **virtualization** of the message list. `Messages` renders every turn; for very long threads a windowed list (e.g. `@tanstack/solid-virtual`) would cap DOM nodes. Larger change, separate plan.
- Deferred: **markdown re-lex** per chunk (`solid-streamdown` re-heals/re-lexes the full message on each chunk — PERF-05). This plan reduces _how many_ turns re-render; it does not make the streaming turn's own markdown incremental. That's a separate plan in `solid-streamdown`.
- A reviewer should confirm the streaming (last) turn still updates every tick (users must see live text) — the stability optimization must apply only to settled turns, never suppress the active one.
- If `Turn` gains fields, update `turnSignature` so a change in the new field invalidates the cached reference.
