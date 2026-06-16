# Plan 002: Compact must not claim "Context compacted" when the turn failed

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2446924..HEAD -- packages/widget/src/chat-panel.tsx packages/widget/test/widget.it.test.ts`
> If either file changed since this plan was written, compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2446924`, 2026-06-16

## Why this matters

The composer's "Compress" action runs a compaction turn **out of band** (a raw `fetch`, not through
the typed transport that checks `res.ok`). It optimistically inserts a boundary divider that reads
"Compacting…" while in flight and flips to "Context compacted" when the fetch settles. But the code
never checks the HTTP status: if the server returns `409 session busy` (another turn is already
running in this session) or any error, the fetch still "succeeds" from the client's view, the divider
flips to **"Context compacted"**, and the user is told the context shrank when nothing happened. After
the multi-session redesign, same-session concurrency (e.g. clicking Compress while a turn streams) is
exactly the path that returns 409, so this misreport is reachable in normal use.

The fix: on any non-2xx response or network error, remove the optimistic divider and announce the
failure, so the divider only ever flips to "Context compacted" on a real success.

## Current state

- `packages/widget/src/chat-panel.tsx` — the chat panel. Relevant pieces:

The dividers signal + `addDivider` (returns the new divider's id):

```tsx
// chat-panel.tsx (around lines 522-526)
  const [dividers, setDividers] = createSignal<{id: number; afterCount: number; kind: 'new' | 'compact'}[]>([])
  const addDivider = (kind: 'new' | 'compact'): number => {
    const id = dividerSeq.n++          // (exact increment expression may differ; it returns a unique id)
    setDividers((prev) => [...prev, {id, afterCount: chat.messages().length, kind}])
    return id
  }
```

The `compact()` function — note it captures the divider id via `setPendingCompactId(addDivider('compact'))`,
never checks `res.ok`, and the `catch` only catches network/abort (an HTTP 409 is NOT thrown by `fetch`):

```tsx
// chat-panel.tsx (lines 550-574)
  const [pendingCompactId, setPendingCompactId] = createSignal<number | null>(null)
  const compacting = () => pendingCompactId() !== null
  const compact = async () => {
    if (chat.isLoading() || compacting()) return
    setPendingCompactId(addDivider('compact'))
    try {
      const res = await fetch(client.chatStreamUrl(), {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...client.chatHeaders()},
        body: JSON.stringify({
          messages: [{role: 'user', content: '/compact'}],
          forwardedProps: {...requestMeta(), intent: 'compact'},
        }),
      })
      await res.body?.pipeTo(new WritableStream())
      // Server persisted post-compaction usage on RUN_FINISHED → reflect the smaller context.
      const session = await client.session()
      if (session.usage) setUsage(session.usage)
    } catch {
      // network/abort — the divider stays; the tracker refreshes on the next real turn
    } finally {
      setPendingCompactId(null)
    }
  }
```

The divider's label is driven purely by `pending` (cleared in `finally`), which is why a failed turn
silently flips to "Context compacted":

```tsx
// chat-panel.tsx (lines 257-259)
function Divider(props: {kind: 'new' | 'compact'; pending?: boolean}): JSX.Element {
  ...
  const label = () => (props.kind === 'new' ? 'New session' : props.pending ? 'Compacting…' : 'Context compacted')
```

There is already a polite screen-reader live region driven by `setLiveMsg(...)` (search `setLiveMsg`
in the file — it's used for "aidx is thinking…" / "aidx replied."). Reuse it to announce failure.

- Repo conventions: functions, not classes (see the user's global rule and every file here);
  single-line comments only; Solid signals via `createSignal`; the widget's only network layer is
  `packages/widget/src/transport.ts`, whose `apiError(path, status)` factory is the canonical "non-2xx"
  error — `import {apiError} from './transport.js'` if you choose to throw it (optional; see Step 2).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build widget bundle (tests load the built bundle) | `pnpm turbo run build --filter=@aidx/widget` | exit 0 |
| Widget tests (real browser) | `pnpm --filter @aidx/widget exec vitest run` | all pass |
| Single test by name | `pnpm --filter @aidx/widget exec vitest run -t "Compress"` | matching tests pass |
| Typecheck | `pnpm turbo run typecheck --filter=@aidx/widget` | exit 0 |
| Lint | `pnpm --filter @aidx/widget lint` | exit 0 |

IMPORTANT: the widget integration tests run a real browser against the **prebuilt** bundle
(`packages/widget/dist/aidx-widget.global.js`). You MUST rebuild the bundle (first command) after every
source edit or the tests run stale code. Do not introduce `jsdom`/`happy-dom`; UI is tested in a real
browser via Playwright only.

## Scope

**In scope** (the only files you should modify):
- `packages/widget/src/chat-panel.tsx`
- `packages/widget/test/widget.it.test.ts`

**Out of scope** (do NOT touch):
- `packages/widget/src/transport.ts` — already checks `res.ok` for typed routes; compaction is an SSE
  stream so it can't use `transport.route()` (which parses JSON). Do not try to route compaction
  through it.
- The server (`packages/core/**`) — the 409 behavior is correct; this plan only fixes the client's
  handling of it.
- The divider's "Compacting…"/"Context compacted" wording and the spinner — keep them; this plan only
  ensures the divider is *removed* on failure.

## Git workflow

- Branch: `advisor/002-compact-failure-state`
- Commit style: conventional commits (e.g. `fix(widget): drop the compact divider when the turn fails`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `removeDivider` helper

Next to `addDivider` in `chat-panel.tsx`, add:

```tsx
  const removeDivider = (id: number) => setDividers((prev) => prev.filter((d) => d.id !== id))
```

**Verify**: `pnpm turbo run typecheck --filter=@aidx/widget` → exit 0.

### Step 2: Fail the compact cleanly on non-OK / error

Rewrite `compact()` so it (a) captures the divider id in a local, (b) treats a non-2xx response as a
failure, and (c) removes the divider + announces on ANY failure. Target shape:

```tsx
  const compact = async () => {
    if (chat.isLoading() || compacting()) return
    const id = addDivider('compact')
    setPendingCompactId(id)
    try {
      const res = await fetch(client.chatStreamUrl(), {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...client.chatHeaders()},
        body: JSON.stringify({
          messages: [{role: 'user', content: '/compact'}],
          forwardedProps: {...requestMeta(), intent: 'compact'},
        }),
      })
      if (!res.ok) throw apiError('/api/chat', res.status) // 409 session busy, etc.
      await res.body?.pipeTo(new WritableStream())
      const session = await client.session()
      if (session.usage) setUsage(session.usage)
    } catch {
      // Any failure (HTTP non-2xx, network, abort): drop the optimistic boundary and tell the user,
      // so the divider never flips to the false "Context compacted".
      removeDivider(id)
      setLiveMsg('Compaction failed — the session may be busy. Try again in a moment.')
    } finally {
      setPendingCompactId(null)
    }
  }
```

Add the import at the top of the file if you used `apiError`:
`import {apiError} from './transport.js'` (match the file's existing import style/ordering). If you
prefer not to import it, replace the throw with `throw new Error(\`compact ${res.status}\`)` — the
`catch` doesn't inspect the error.

**Verify**: `pnpm turbo run typecheck --filter=@aidx/widget` → exit 0, and `pnpm --filter @aidx/widget lint` → exit 0.

### Step 3: Rebuild the bundle

**Verify**: `pnpm turbo run build --filter=@aidx/widget` → exit 0.

### Step 4: Add a regression test (409 → no false "Context compacted")

In `packages/widget/test/widget.it.test.ts` there is an existing test titled
`Compress: marks a boundary and sends a compaction turn ...`. Use it as the structural pattern (how it
opens the FAB, sends a first message, locates the divider). The test server in that file routes
`POST /api/chat` and branches on `intent === 'compact'` (search `writeCompactStream` / `readChatIntent`).

Add a sibling test that makes the compaction request return **409** and asserts the divider does NOT
end up reading "Context compacted":

- Make the compact branch respond `409` instead of streaming. The simplest approach: add a per-test
  flag the server reads (e.g. a module-level `let compactStatus = 200`) and, in the compact branch,
  `if (compactStatus !== 200) { res.writeHead(compactStatus); res.end('{}'); return }`. Set it to `409`
  at the start of the new test and reset to `200` in a `finally`/`afterEach`. Follow the file's
  existing server-state pattern (it already mutates `chatState.script`).
- Steps in the test: open chat, send one normal message, click "Compress the conversation", then assert:
  - a divider reading "Compacting" appears (optimistic), then
  - after the request settles, there is **no** `.pw-chat-divider` containing "Context compacted"
    (`expect(await page.locator('.pw-chat-divider', {hasText: 'Context compacted'}).count()).toBe(0)`),
  - and the prior assistant reply is still present (scrollback intact).

Use `browser.newPage()` (NOT `newContext()`), matching every other test in this file.

**Verify**: `pnpm --filter @aidx/widget exec vitest run -t "Compress"` → all Compress tests pass,
including the new 409 one. Then `pnpm --filter @aidx/widget exec vitest run` → full widget suite passes.

## Test plan

- New test in `packages/widget/test/widget.it.test.ts`: "Compress on a busy session (409) removes the
  boundary instead of claiming success" — happy path is the existing Compress test; this covers the
  regression (409 → no "Context compacted" divider; scrollback preserved).
- Pattern to follow: the existing `Compress: marks a boundary ...` test in the same file.
- Verification: `pnpm --filter @aidx/widget exec vitest run` → all pass (existing count + 1 new).

## Done criteria

ALL must hold:

- [ ] `grep -n "if (!res.ok)" packages/widget/src/chat-panel.tsx` returns the new guard inside `compact()`
- [ ] `removeDivider` exists and is called in `compact()`'s `catch`
- [ ] `pnpm turbo run typecheck --filter=@aidx/widget` exits 0
- [ ] `pnpm turbo run build --filter=@aidx/widget` exits 0
- [ ] `pnpm --filter @aidx/widget exec vitest run` exits 0; the new 409 test exists and passes
- [ ] `pnpm --filter @aidx/widget lint` exits 0
- [ ] Only the two in-scope files are modified (`git status --porcelain`)
- [ ] `plans/README.md` row for 002 updated

## STOP conditions

Stop and report (do not improvise) if:

- `compact()` or `addDivider` in `chat-panel.tsx` no longer matches the "Current state" excerpts.
- The widget test file no longer has a Compress test or a compaction branch in its mock server (the
  test harness was restructured) — report what it looks like now instead of forcing the pattern.
- The full widget suite has a pre-existing failure unrelated to your change after a rebuild — report it;
  do not "fix" unrelated tests.

## Maintenance notes

- If compaction is ever moved to go through the typed transport (e.g. a streaming variant of
  `transport.route`), the explicit `res.ok` check here can be dropped in favor of the transport's
  `apiError` rejection — but keep the `removeDivider`-on-failure behavior.
- Reviewer: confirm the divider is removed (not merely re-labeled) on failure, and that `setLiveMsg`
  is the existing polite live region (no new alert UI was added).
- Deferred: surfacing a richer error (retry button) is out of scope; a live-region announcement is
  enough for this fix.
