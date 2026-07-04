# Widget Reload Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page reload (including vite full-reloads caused by AI edits) is invisible: the running AI turn keeps streaming, the chat rebuilds mid-word, and every piece of ephemeral UI state — composer draft, cursor position, focus, staged grabs, open panel, scroll — comes back exactly as it was.

**Architecture:** Server-side, turns detach from the HTTP request: `POST /api/chat` starts the turn and returns immediately; chunks flow into a per-session `TurnHub` replay buffer; a new `GET /api/chat/attach` SSE endpoint emits an atomic snapshot (settled history + in-flight user message) followed by a replay of the active run and a live tail. Client-side, the widget switches `useChat` to subscription mode (`live: true` + a `SubscribeConnectionAdapter` with an internal reconnect loop) — a capability TanStack AI already ships for exactly this. Ephemeral UI state is continuously mirrored into per-tab `sessionStorage` and restored on mount.

**Tech Stack:** H3 routes in `@conciv/core`, `@tanstack/ai` StreamChunks + `@tanstack/ai-client` SubscribeConnectionAdapter, `@tanstack/ai-solid` useChat, Solid signals, Playwright ITs against the real widget bundle, fake-claude child-process fixture for core ITs.

## Global Constraints

- Functions only — never classes; never IIFEs.
- ZERO narration comments in product code. No `else` (early return / ternary / map). No non-null assertion `x!`. No abbreviated identifiers. No barrel files.
- No new npm dependencies (all packages used below are already in the workspace). Adding an existing workspace package to another package's `package.json` is allowed.
- No jsdom, no stubs/mocks: core ITs spawn the real `fake-claude.ts` child through `startTestServer`; widget ITs run the real built bundle in real Chromium via Playwright.
- Test assertions: `getByRole`/`getByText`/`toBeVisible`; never class selectors, `data-testid`, or `getComputedStyle`.
- Vitest configs that touch Solid must pin `environment: 'node'` (existing configs already do — don't regress).
- Tight test timeouts: SSE waits ~1s, turn waits ~5s. Never stack ceilings.
- Build/typecheck via `pnpm turbo build --filter=...` / `pnpm turbo typecheck --filter=...` from repo root, never manual dist rebuilds. Widget ITs run against a freshly built core when core sources changed.
- Commit per task with pathspec: `git commit -m "..." -- <paths>` (parallel sessions may stage other files). Repo git identity must be `omridevk` noreply (already configured — verify with `git config user.email` once before the first commit).
- v0: break wire/API freely, update every call site — no compatibility shims.

## Locked Design Decisions

1. **Turn lifetime** — `POST /api/chat` no longer returns SSE and no longer aborts on request abort (`turn.ts:87-88` today kills the harness child when the page reloads — this is the bug). It acquires the lock, starts the turn through `TurnHub`, and returns `{ok: true}` JSON. `RUN_FINISHED` usage persistence and lock release stay inside the existing `withLockRelease` wrapper, which now runs detached.
2. **TurnHub** (`packages/core/src/runtime/turn-hub.ts`) — one per app. Holds, per session: the active run's chunk buffer, the in-flight user message (from the POST body), a generating flag, and live subscriber channels (same channel pattern as `ui-bus.ts`). Buffer + user message + generating flag reset when the run's stream ends (transcript is then authoritative).
3. **Attach = snapshot + replay + live** — `GET /api/chat/attach` (session id via the existing `conciv-session-id` header) opens an SSE stream that synchronously (single Node tick — race-free) emits: one `CUSTOM` chunk `conciv-snapshot` `{generating, messages}`, then the buffered chunks of the active run, then live chunks until the client disconnects. The connection stays open across runs. `messages` = transcript history with the in-flight turn's trailing entries truncated, plus the hub's stored user message when generating. Truncation matches on the last user text message equalling the pending user text (transcript ids are synthetic `h1…`, so id-matching is impossible; text-match self-heals after the run settles).
4. **Client adapter** — `attachConnection(client)` in the widget returns a `SubscribeConnectionAdapter`: `send` POSTs the ChatRequest JSON; `subscribe` loops `fetch(attachUrl)` + hand-rolled SSE parse with 500ms retry, honoring the abort signal. `useChat({live})` drives subscribe/unsubscribe per pane activity. Snapshot chunks arrive through `onCustomEvent` and call `setMessages`.
5. **Stop semantics** — local `chat.stop()` no longer kills the server turn. `Composer.Cancel` gains an `onCancel` handler hook; the widget's handler calls both `chat.stop()` and `POST /api/chat/stop` (new `stop` route on `SessionClient`).
6. **Compact** — POST returns immediately now; the compact flow waits for `chat.sessionGenerating()` to drop back to false (run events arrive via the subscription), then refetches session usage.
7. **UI snapshot** — per-tab `sessionStorage`. Shell level: open layer (`modal`/`quick`/null) + mounted pane ids. Pane level (keyed by session id): draft text, selectionStart/selectionEnd, focused flag, staged grab texts, dividers, genUi specs, thread scrollTop. Written debounced on change + flushed on `pagehide`; restored on mount. `conciv-active-session` stays in localStorage (existing behavior).
8. **`/api/chat/history` stays** untouched for external consumers; the widget stops calling it on mount (the snapshot replaces it).

## File Structure

- Create: `packages/core/src/runtime/turn-hub.ts` — detached turn state + replay buffer + subscriber fan-out
- Create: `packages/core/src/api/chat/settled-history.ts` — truncate in-flight turn out of parsed transcript
- Create: `packages/core/src/api/chat/attach.ts` — `GET /api/chat/attach` SSE route
- Modify: `packages/core/src/api/chat/turn.ts` — detach POST, wire hub
- Modify: `packages/core/src/api/chat/chat.ts` — construct hub, pass to routes
- Modify: `packages/protocol/src/ui-types.ts` — `CONCIV_SNAPSHOT_EVENT`, `SnapshotSchema`, `aguiSnapshotFor`
- Modify: `packages/api-client/src/api-client.ts` — `attachUrl`, `stop` route
- Create: `packages/widget/src/client/attach-connection.ts` — SubscribeConnectionAdapter + SSE parser
- Create: `packages/widget/src/lib/ui-snapshot.ts` — sessionStorage read/write for shell + pane snapshots
- Modify: `packages/widget/src/chat/chat-panel.tsx` — subscription mode, snapshot handling, compact/cancel rework, pane state persistence
- Modify: `packages/widget/src/shell/widget-shell.tsx` — layer + pane list persistence
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx` + `composer.tsx` — `onCancel` hook
- Tests: `packages/core/test/runtime/turn-hub.test.ts`, `packages/core/test/api/chat/settled-history.test.ts`, `packages/core/test/api/chat/turn-detach.it.test.ts`, `packages/widget/test/attach-connection.it.test.ts`, `packages/widget/test/reload-continuity.it.test.ts`
- Modify tests: `packages/core/test/api/chat/chat.it.test.ts`, `packages/core/test/helpers/server.ts`, `packages/core/test/fixtures/fake-claude.ts` (new `CONCIV_FAKE_RELEASE_FILE` slow mode)

---

## Phase A — Core: detached turns

### Task 1: TurnHub

**Files:**

- Create: `packages/core/src/runtime/turn-hub.ts`
- Test: `packages/core/test/runtime/turn-hub.test.ts`

**Interfaces:**

- Consumes: `StreamChunk`, `EventType` from `@tanstack/ai`; `ChatMessage` from `@conciv/protocol/chat-types`.
- Produces (later tasks rely on exactly these):
  - `makeTurnHub(): TurnHub`
  - `TurnHub.start(sessionId: string, userMessage: ChatMessage | null, stream: AsyncIterable<StreamChunk>): Promise<void>` — pumps to completion, resolves when the stream ends.
  - `TurnHub.generating(sessionId: string): boolean`
  - `TurnHub.pendingUserMessage(sessionId: string): ChatMessage | null`
  - `TurnHub.attach(sessionId: string, signal: AbortSignal): {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>}` — `replay` is a synchronous copy of the buffer taken at call time; `live` yields subsequent chunks until the signal aborts. Attach must register the subscriber and copy the buffer in the same synchronous step.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeTurnHub} from '../../src/runtime/turn-hub.js'

const started: StreamChunk = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished: StreamChunk = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk
const text = (delta: string): StreamChunk =>
  ({type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta}) as StreamChunk
const userMessage = {id: 'u1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}

function makeGate(): {stream: AsyncIterable<StreamChunk>; push: (c: StreamChunk) => void; end: () => void} {
  const queue: StreamChunk[] = []
  const waiters: (() => void)[] = []
  const state = {done: false}
  const wake = () => waiters.splice(0).forEach((w) => w())
  return {
    push: (c) => {
      queue.push(c)
      wake()
    },
    end: () => {
      state.done = true
      wake()
    },
    stream: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const next = queue.shift()
          if (next) {
            yield next
            continue
          }
          if (state.done) return
          await new Promise<void>((resolve) => waiters.push(resolve))
        }
      },
    },
  }
}

describe('turn hub', () => {
  it('buffers the active run and replays it to a late subscriber', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    gate.push(text('hel'))
    await new Promise((r) => setTimeout(r, 10))
    expect(hub.generating('s1')).toBe(true)
    expect(hub.pendingUserMessage('s1')).toEqual(userMessage)
    const controller = new AbortController()
    const {replay, live} = hub.attach('s1', controller.signal)
    expect(replay.map((c) => c.type)).toEqual([EventType.RUN_STARTED, EventType.TEXT_MESSAGE_CONTENT])
    const collected: StreamChunk[] = []
    const drain = (async () => {
      for await (const chunk of live) collected.push(chunk)
    })()
    gate.push(text('lo'))
    gate.push(finished)
    gate.end()
    await pump
    await new Promise((r) => setTimeout(r, 10))
    expect(collected.map((c) => c.type)).toEqual([EventType.TEXT_MESSAGE_CONTENT, EventType.RUN_FINISHED])
    expect(hub.generating('s1')).toBe(false)
    expect(hub.pendingUserMessage('s1')).toBe(null)
    const after = hub.attach('s1', controller.signal)
    expect(after.replay).toEqual([])
    controller.abort()
    await drain
  })

  it('stops yielding to an aborted subscriber but keeps the run going', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    const controller = new AbortController()
    const {live} = hub.attach('s1', controller.signal)
    const collected: StreamChunk[] = []
    const drain = (async () => {
      for await (const chunk of live) collected.push(chunk)
    })()
    controller.abort()
    await drain
    gate.push(text('after-abort'))
    gate.push(finished)
    gate.end()
    await pump
    expect(collected.map((c) => c.type)).not.toContain(EventType.RUN_FINISHED)
    expect(hub.generating('s1')).toBe(false)
  })

  it('fans out live chunks to two subscribers', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    await new Promise((r) => setTimeout(r, 10))
    const a = new AbortController()
    const b = new AbortController()
    const subA = hub.attach('s1', a.signal)
    const subB = hub.attach('s1', b.signal)
    const gotA: StreamChunk[] = []
    const gotB: StreamChunk[] = []
    const drainA = (async () => {
      for await (const c of subA.live) gotA.push(c)
    })()
    const drainB = (async () => {
      for await (const c of subB.live) gotB.push(c)
    })()
    gate.push(finished)
    gate.end()
    await pump
    await new Promise((r) => setTimeout(r, 10))
    a.abort()
    b.abort()
    await Promise.all([drainA, drainB])
    expect(gotA.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
    expect(gotB.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/runtime/turn-hub.test.ts` (cwd `packages/core`)
Expected: FAIL — `makeTurnHub` not found.

- [ ] **Step 3: Implement**

```ts
import type {StreamChunk} from '@tanstack/ai'
import type {ChatMessage} from '@conciv/protocol/chat-types'

type Subscriber = {
  push: (chunk: StreamChunk) => void
  close: () => void
  iterate: () => AsyncGenerator<StreamChunk>
}

function makeSubscriber(): Subscriber {
  const items: StreamChunk[] = []
  const waiters: ((result: IteratorResult<StreamChunk>) => void)[] = []
  const state = {closed: false}

  function push(chunk: StreamChunk): void {
    const waiter = waiters.shift()
    if (waiter) {
      waiter({value: chunk, done: false})
      return
    }
    items.push(chunk)
  }

  function close(): void {
    state.closed = true
    const waiter = waiters.shift()
    if (waiter) waiter({value: undefined, done: true})
  }

  async function* iterate(): AsyncGenerator<StreamChunk> {
    while (true) {
      const buffered = items.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (state.closed) return
      const next = await new Promise<IteratorResult<StreamChunk>>((resolve) => waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }

  return {push, close, iterate}
}

type SessionRun = {
  buffer: StreamChunk[]
  userMessage: ChatMessage | null
  generating: boolean
  subscribers: Set<Subscriber>
}

export type TurnHub = {
  start: (sessionId: string, userMessage: ChatMessage | null, stream: AsyncIterable<StreamChunk>) => Promise<void>
  generating: (sessionId: string) => boolean
  pendingUserMessage: (sessionId: string) => ChatMessage | null
  attach: (sessionId: string, signal: AbortSignal) => {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>}
}

export function makeTurnHub(): TurnHub {
  const sessions = new Map<string, SessionRun>()

  function sessionFor(sessionId: string): SessionRun {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const created: SessionRun = {buffer: [], userMessage: null, generating: false, subscribers: new Set()}
    sessions.set(sessionId, created)
    return created
  }

  async function start(
    sessionId: string,
    userMessage: ChatMessage | null,
    stream: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    const session = sessionFor(sessionId)
    session.buffer = []
    session.userMessage = userMessage
    session.generating = true
    try {
      for await (const chunk of stream) {
        session.buffer.push(chunk)
        for (const subscriber of session.subscribers) subscriber.push(chunk)
      }
    } finally {
      session.buffer = []
      session.userMessage = null
      session.generating = false
    }
  }

  function attach(sessionId: string, signal: AbortSignal): {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>} {
    const session = sessionFor(sessionId)
    const subscriber = makeSubscriber()
    session.subscribers.add(subscriber)
    const detach = () => {
      session.subscribers.delete(subscriber)
      subscriber.close()
    }
    signal.addEventListener('abort', detach, {once: true})
    if (signal.aborted) detach()
    return {replay: [...session.buffer], live: subscriber.iterate()}
  }

  return {
    start,
    attach,
    generating: (sessionId) => sessions.get(sessionId)?.generating ?? false,
    pendingUserMessage: (sessionId) => sessions.get(sessionId)?.userMessage ?? null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/runtime/turn-hub.test.ts` (cwd `packages/core`)
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runtime/turn-hub.ts packages/core/test/runtime/turn-hub.test.ts
git commit -m "feat(core): TurnHub replay buffer for detached chat turns" -- packages/core/src/runtime/turn-hub.ts packages/core/test/runtime/turn-hub.test.ts
```

### Task 2: settled-history truncation

**Files:**

- Create: `packages/core/src/api/chat/settled-history.ts`
- Test: `packages/core/test/api/chat/settled-history.test.ts`

**Interfaces:**

- Produces: `settledMessages(messages: ChatHistory, pendingUserText: string | null): ChatHistory` — when `pendingUserText` is null returns messages unchanged; otherwise finds the LAST user message whose concatenated text parts equal `pendingUserText` and returns everything before it; if no match (transcript hasn't recorded the in-flight turn yet) returns messages unchanged.
- Also produces: `userText(message: {role: string; parts: ReadonlyArray<{type: string}>}): string` — concatenated `content` of `type === 'text'` parts, empty string for non-user roles.

**Note for implementer:** message part shape comes from `packages/harness/src/claude/history.ts` `parse` output — text parts are `{type: 'text', content: string}` (same as `ChatMessagePartSchema` in `packages/protocol/src/chat-types.ts`; confirm by reading both files before writing the test, and if the field is named differently — e.g. `text` — mirror the real name in both test and implementation).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect} from 'vitest'
import {settledMessages} from '../../../src/api/chat/settled-history.js'

const user = (id: string, text: string) => ({
  id,
  role: 'user' as const,
  parts: [{type: 'text' as const, content: text}],
})
const assistant = (id: string, text: string) => ({
  id,
  role: 'assistant' as const,
  parts: [{type: 'text' as const, content: text}],
})

describe('settledMessages', () => {
  it('returns everything when no turn is pending', () => {
    const messages = [user('h1', 'hi'), assistant('h2', 'hello')]
    expect(settledMessages(messages, null)).toEqual(messages)
  })

  it('drops the in-flight turn from the last matching user message onward', () => {
    const messages = [user('h1', 'hi'), assistant('h2', 'hello'), user('h3', 'do it'), assistant('h4', 'partial…')]
    expect(settledMessages(messages, 'do it')).toEqual([user('h1', 'hi'), assistant('h2', 'hello')])
  })

  it('keeps everything when the transcript has not recorded the pending message yet', () => {
    const messages = [user('h1', 'hi'), assistant('h2', 'hello')]
    expect(settledMessages(messages, 'do it')).toEqual(messages)
  })

  it('cuts at the LAST occurrence for repeated identical prompts', () => {
    const messages = [user('h1', 'go'), assistant('h2', 'done'), user('h3', 'go'), assistant('h4', 'part')]
    expect(settledMessages(messages, 'go')).toEqual([user('h1', 'go'), assistant('h2', 'done')])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/api/chat/settled-history.test.ts` (cwd `packages/core`)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type {ChatHistory} from '@conciv/protocol/chat-types'

type Part = {type: string; content?: unknown}
type HistoryMessage = {role: string; parts: ReadonlyArray<Part>}

export function userText(message: HistoryMessage): string {
  if (message.role !== 'user') return ''
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('')
}

export function settledMessages(messages: ChatHistory, pendingUserText: string | null): ChatHistory {
  if (pendingUserText === null) return messages
  const index = messages.findLastIndex((message) => userText(message as HistoryMessage) === pendingUserText)
  if (index === -1) return messages
  return messages.slice(0, index)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/api/chat/settled-history.test.ts` (cwd `packages/core`)
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/chat/settled-history.ts packages/core/test/api/chat/settled-history.test.ts
git commit -m "feat(core): settled-history truncation for attach snapshots" -- packages/core/src/api/chat/settled-history.ts packages/core/test/api/chat/settled-history.test.ts
```

### Task 3: snapshot protocol types

**Files:**

- Modify: `packages/protocol/src/ui-types.ts`
- Test: extend `packages/protocol/test/ui-types.test.ts` if it exists, otherwise create it (check `packages/protocol/test/` first and follow its conventions).

**Interfaces:**

- Produces:
  - `CONCIV_SNAPSHOT_EVENT = 'conciv-snapshot'`
  - `SnapshotSchema = z.object({generating: z.boolean(), messages: ChatHistorySchema})`, `type Snapshot`
  - `aguiSnapshotFor(snapshot: Snapshot): StreamChunk` — CUSTOM chunk shaped exactly like the existing `aguiCustomFor` (read it first and mirror its `{type: EventType.CUSTOM, name, value}` construction).

- [ ] **Step 1: Read `packages/protocol/src/ui-types.ts`** — locate `aguiCustomFor`, `CONCIV_UI_EVENT`, and the import of `ChatHistorySchema` availability (it lives in `chat-types.ts`; import from there — protocol has no barrels, use the exact module path used elsewhere in the repo).

- [ ] **Step 2: Write failing test** (in the protocol package's existing test style):

```ts
import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {CONCIV_SNAPSHOT_EVENT, SnapshotSchema, aguiSnapshotFor} from '../src/ui-types.js'

describe('snapshot event', () => {
  it('wraps a snapshot in an AG-UI CUSTOM chunk', () => {
    const snapshot = SnapshotSchema.parse({generating: true, messages: [{id: 'u1', role: 'user', parts: []}]})
    const chunk = aguiSnapshotFor(snapshot)
    expect(chunk.type).toBe(EventType.CUSTOM)
    expect(chunk).toMatchObject({name: CONCIV_SNAPSHOT_EVENT, value: snapshot})
  })
})
```

- [ ] **Step 3: Run to verify it fails, implement, run to verify it passes**

Implementation (append to `ui-types.ts`, mirroring `aguiCustomFor`'s exact chunk shape):

```ts
export const CONCIV_SNAPSHOT_EVENT = 'conciv-snapshot'

export const SnapshotSchema = z.object({generating: z.boolean(), messages: ChatHistorySchema})
export type Snapshot = z.infer<typeof SnapshotSchema>

export function aguiSnapshotFor(snapshot: Snapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: CONCIV_SNAPSHOT_EVENT, value: snapshot} as StreamChunk
}
```

(If `aguiCustomFor` builds its chunk without a cast, copy that construction instead of `as StreamChunk`.)

Run: `pnpm vitest run` (cwd `packages/protocol`) — PASS. Then `pnpm turbo typecheck --filter=@conciv/protocol` — PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/ui-types.ts packages/protocol/test
git commit -m "feat(protocol): conciv-snapshot AG-UI event" -- packages/protocol/src/ui-types.ts packages/protocol/test
```

### Task 4: detach POST /api/chat + attach route

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts` (POST rework)
- Create: `packages/core/src/api/chat/attach.ts`
- Modify: `packages/core/src/api/chat/chat.ts` (make hub, pass to both)
- Modify: `packages/core/test/fixtures/fake-claude.ts` (gated slow mode)
- Modify: `packages/core/test/helpers/server.ts` (postChat = POST + attach-collect; new `attach` helper)
- Test: `packages/core/test/api/chat/turn-detach.it.test.ts`; update `packages/core/test/api/chat/chat.it.test.ts`

**Interfaces:**

- Consumes: `makeTurnHub`, `settledMessages`, `userText`, `aguiSnapshotFor`, `SnapshotSchema`.
- Produces:
  - `POST /api/chat` → `{ok: true}` JSON (still 409 on busy lock, 400 with no session).
  - `GET /api/chat/attach` (header `conciv-session-id`) → SSE; first data event is the snapshot CUSTOM chunk; then replay; then live until disconnect.
  - `registerTurnRoutes(app, deps)` gains `hub: TurnHub` in `TurnDeps`; `registerAttachRoute(app, deps)` exported from `attach.ts` with deps `{cwd, harness, store, hub}`.
  - Helper contract for later tasks/tests: `server.attach(sessionId, {until, timeoutMs})` resolves with concatenated SSE text once a data line contains `until`.

- [ ] **Step 1: Add gated slow mode to fake-claude.** In `packages/core/test/fixtures/fake-claude.ts`, add a branch before the HANG branch (match the file's existing `if/else if` chain style):

```ts
} else if (process.env.CONCIV_FAKE_RELEASE_FILE) {
  const releaseFile = process.env.CONCIV_FAKE_RELEASE_FILE
  const head = [
    {type: 'system', subtype: 'init', session_id: 'sess-fake', model: 'claude-test'},
    {type: 'stream_event', event: {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}},
    {type: 'stream_event', event: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'first-half '}}},
  ]
  for (const line of head) process.stdout.write(JSON.stringify(line) + '\n')
  const waitForRelease = () => {
    if (existsSync(releaseFile)) {
      const tail = [
        {type: 'stream_event', event: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'second-half'}}},
        {type: 'stream_event', event: {type: 'content_block_stop', index: 0}},
        {type: 'assistant', message: {model: 'claude-test', content: [{type: 'text', text: 'first-half second-half'}]}},
        {type: 'result', session_id: 'sess-fake', num_turns: 1, total_cost_usd: 0.001},
      ]
      for (const line of tail) process.stdout.write(JSON.stringify(line) + '\n')
      process.exit(0)
    }
    setTimeout(waitForRelease, 20)
  }
  waitForRelease()
}
```

Add `existsSync` to the existing `node:fs` import. Verify the emitted line shapes against the PARTIAL branch (they must decode through the same `decode.ts` path — copy field-for-field from the PARTIAL branch, only splitting the delta in two).

- [ ] **Step 2: Extend the test server helper.** In `packages/core/test/helpers/server.ts`:

```ts
const attach = async (sessionId: string, opts: {until: string; timeoutMs?: number}): Promise<string> => {
  const controller = new AbortController()
  const response = await fetch(`${base}/api/chat/attach`, {
    headers: {'conciv-session-id': sessionId},
    signal: controller.signal,
  })
  const reader = response.body?.getReader()
  if (!reader) throw new Error('attach returned no body')
  const decoder = new TextDecoder()
  const deadline = Date.now() + (opts.timeoutMs ?? 5000)
  let text = ''
  while (Date.now() < deadline) {
    const {value, done} = await reader.read()
    if (done) break
    text += decoder.decode(value, {stream: true})
    if (text.includes(opts.until)) break
  }
  controller.abort()
  return text
}
```

Rework `postChat` so existing turn tests keep meaning "run a full turn and give me the stream text":

```ts
const postChat = async (message: unknown, sessionId?: string): Promise<string> => {
  const id = sessionId ?? (await resolve())
  const attached = attach(id, {until: 'RUN_FINISHED'})
  const response = await post('/api/chat', {messages: [message]}, id)
  if (!response.ok) return response.text()
  return attached
}
```

Add `attach` to the `TestServer` type and return object. NOTE the ordering: attach opens BEFORE the POST so fast fake turns can't finish before the subscriber exists.

- [ ] **Step 3: Write the failing detach IT** — `packages/core/test/api/chat/turn-detach.it.test.ts`:

```ts
import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {startTestServer, type SpawnHarness, type TestServer} from '../../helpers/server.js'
import {useFakeHarness} from '../../helpers/harness-mode.js'

const fakeIt = it.runIf(useFakeHarness)
const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))
const dirs: string[] = []

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-detach-it-'))
  dirs.push(dir)
  return dir
}

function slowSpawn(releaseFile: string): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {...process.env, CONCIV_FAKE_RELEASE_FILE: releaseFile},
    })
    const {stdin, stdout, stderr} = child
    if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
    return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
  }
}

const turn = (text: string) => ({id: 'u-live', role: 'user', parts: [{type: 'text', content: text}]})

describe('detached turns (IT)', () => {
  const state = {server: undefined as TestServer | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  fakeIt('POST /api/chat returns ok JSON before the turn finishes', async () => {
    const releaseFile = join(tmp(), 'release')
    const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
    state.server = server
    const id = await server.resolve()
    const response = await server.post('/api/chat', {messages: [turn('hi')]}, id)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ok: true})
    writeFileSync(releaseFile, '')
    const body = await server.attach(id, {until: 'RUN_FINISHED'})
    expect(body).toContain('RUN_FINISHED')
  })

  fakeIt('a mid-run attach replays from RUN_STARTED and continues live', async () => {
    const releaseFile = join(tmp(), 'release')
    const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
    state.server = server
    const id = await server.resolve()
    await server.post('/api/chat', {messages: [turn('hi')]}, id)
    const early = await server.attach(id, {until: 'first-half', timeoutMs: 3000})
    expect(early).toContain('RUN_STARTED')
    expect(early).toContain('conciv-snapshot')
    expect(early).toContain('"generating":true')
    writeFileSync(releaseFile, '')
    const late = await server.attach(id, {until: 'RUN_FINISHED'})
    expect(late).toContain('RUN_STARTED')
    expect(late).toContain('first-half')
    expect(late).toContain('second-half')
    expect(late).toContain('RUN_FINISHED')
  })

  fakeIt('the turn completes with zero subscribers and persists usage', async () => {
    const server = await startTestServer({
      spawnHarness: (args, cwd) => {
        const child = spawn(process.execPath, [fakeClaude, ...args], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        })
        const {stdin, stdout, stderr} = child
        if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
        return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
      },
    })
    state.server = server
    const id = await server.resolve()
    await server.post('/api/chat', {messages: [turn('hi')]}, id)
    const deadline = Date.now() + 5000
    let usage: unknown = null
    while (Date.now() < deadline && !usage) {
      const session = (await (await server.getSession(id)).json()) as {usage: unknown}
      usage = session.usage
      if (!usage) await new Promise((r) => setTimeout(r, 50))
    }
    expect(usage).toBeTruthy()
  })

  fakeIt('attach on an idle session emits a snapshot with generating:false', async () => {
    const server = await startTestServer({spawnHarness: slowSpawn(join(tmp(), 'never'))})
    state.server = server
    const id = await server.resolve()
    const body = await server.attach(id, {until: 'conciv-snapshot', timeoutMs: 2000})
    expect(body).toContain('"generating":false')
  })
})
```

- [ ] **Step 4: Run to verify failure** — `pnpm vitest run test/api/chat/turn-detach.it.test.ts` (cwd `packages/core`): FAIL (404 on attach, SSE body on POST).

- [ ] **Step 5: Implement.**

`packages/core/src/api/chat/turn.ts` — change only the POST body construction tail; keep everything through `const messages = toChatMessages(chatReq)` intact, then:

```ts
const stream = chat({
  adapter,
  messages,
  systemPrompts: sysText ? [sysText] : [],
  abortController: abort,
  debug: harnessDebug,
})

uiBus.setModel(sessionId, chatReq.model ?? chatReq.forwardedProps?.model ?? chatReq.data?.model ?? null)
const merged = uiBus.run(sessionId, stream)
const lastUserMessage = chatReq.messages.findLast((message) => message.role === 'user') ?? null
void deps.hub
  .start(sessionId, lastUserMessage, withLockRelease(merged, deps.store, deps.stateRoot, sessionId))
  .catch(() => {})
return {ok: true}
```

Delete these two lines (the fix itself):

```ts
const abort = new AbortController()
event.req.signal.addEventListener('abort', () => abort.abort())
```

→ keep `const abort = new AbortController()` (the `chat()` call and stop flow still use it) but remove the `event.req.signal` listener. Remove the now-unused `toServerSentEventsStream` / `sseHeaders` imports if nothing else in the file uses them. Add `hub: TurnHub` to `TurnDeps`.

`packages/core/src/api/chat/attach.ts`:

```ts
import type {H3} from 'h3'
import {HTTPError} from 'h3'
import {toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import type {SessionStore} from '../../store/session-store.js'
import type {TurnHub} from '../../runtime/turn-hub.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'
import {sseHeaders} from '../sse.js'
import {settledMessages, userText} from './settled-history.js'

export type AttachDeps = {
  cwd: string
  harness: HarnessAdapter
  store: SessionStore
  hub: TurnHub
}

async function transcriptMessages(deps: AttachDeps, sessionId: string): Promise<unknown[]> {
  if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
  const record = await deps.store.get(sessionId)
  if (!record?.harnessSessionId) return []
  const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId))
  return jsonl ? deps.harness.history.parse(jsonl) : []
}

export function registerAttachRoute(app: H3, deps: AttachDeps): void {
  app.get('/api/chat/attach', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session'})
    const history = await transcriptMessages(deps, sessionId)
    const abort = new AbortController()
    event.req.signal.addEventListener('abort', () => abort.abort())
    const pending = deps.hub.pendingUserMessage(sessionId)
    const generating = deps.hub.generating(sessionId)
    const {replay, live} = deps.hub.attach(sessionId, abort.signal)
    const settled = settledMessages(history, pending ? userText(pending) : null)
    const messages = pending ? [...settled, pending] : settled
    async function* chunks(): AsyncGenerator<StreamChunk> {
      yield aguiSnapshotFor({generating, messages})
      yield* replay
      yield* live
    }
    return new Response(toServerSentEventsStream(chunks(), abort), {status: 200, headers: sseHeaders(event)})
  })
}
```

Typing note: `history.parse` returns the harness's UIMessage array and `SnapshotSchema.messages` is `ChatHistorySchema` (a loose `z.custom<UIMessage>` array) — thread the types through without `as any`; if `transcriptMessages` needs a return type, use `ChatHistory` from `@conciv/protocol/chat-types` and type `settledMessages` accordingly (Task 2 already uses `ChatHistory`). `pending` is a `ChatMessage` (wire shape `{id, role, parts}`) which satisfies the loose `ChatHistory` element check.

`packages/core/src/api/chat/chat.ts` — inside `registerChatRoutes`:

```ts
import {makeTurnHub} from '../../runtime/turn-hub.js'
import {registerAttachRoute} from './attach.js'
```

```ts
const hub = makeTurnHub()
```

pass `hub` into `registerTurnRoutes(app, {...deps, hub})` and add:

```ts
registerAttachRoute(app, {cwd: opts.cwd, harness: opts.harness, store, hub})
```

- [ ] **Step 6: Update `chat.it.test.ts`.** The helper rework (Step 2) keeps most tests passing unchanged. Hand-fix the ones that read the POST body directly:
  - `passes --model <selected>…` test: it POSTs raw and `.text()`s — the body is now `{"ok":true}`; replace the `.text()` drain with a wait: after POST, `await server.attach(id, {until: 'RUN_FINISHED'})` (resolve `id` first and pass it to both).
  - `routes POST /api/chat/ui to the live turn` test: `server.postChat(turn('hi'), a)` returns quickly now; the hang fake means no RUN_FINISHED — call `server.post('/api/chat', {messages: [turn('hi')]}, a)` instead of `postChat` and drop the `.catch(() => '')` / final `await turnPromise` in favor of `await server.post('/api/chat/stop', {}, a)` then polling `readLock` until released (deadline 5s).
  - `refuses with 409` and `rejects with no resolved session (400)` are unchanged.
  - Any other test that greps the postChat return for `RUN_STARTED` keeps working through the reworked helper.

- [ ] **Step 7: Run the full core chat suite**

Run: `pnpm vitest run test/api/chat test/runtime` (cwd `packages/core`)
Expected: PASS. Then `pnpm turbo typecheck --filter=@conciv/core` — PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/api/chat packages/core/src/runtime/turn-hub.ts packages/core/test
git commit -m "feat(core): detach chat turns from the request; add GET /api/chat/attach snapshot+replay SSE" -- packages/core/src/api/chat packages/core/test packages/core/src/runtime
```

### Task 5: api-client attach + stop routes

**Files:**

- Modify: `packages/api-client/src/api-client.ts`
- Test: follow `packages/api-client/test/` conventions if present; otherwise this is covered by widget ITs (check the directory first).

**Interfaces:**

- Produces on `SessionClient`: `attachUrl: () => string` (`t.url('/api/chat/attach')`) and `stop: t.route({method: 'POST', path: '/api/chat/stop', response: OkSchema})`.

- [ ] **Step 1: Add both members** next to `chatStreamUrl` in `defineClient` (exact pattern of the existing `remove` route for `stop`).
- [ ] **Step 2:** `pnpm turbo typecheck --filter=@conciv/api-client` — PASS. Run its test suite if one exists.
- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/api-client.ts
git commit -m "feat(api-client): attachUrl + stop route" -- packages/api-client/src/api-client.ts
```

---

## Phase B — Widget: live subscription

### Task 6: attach connection adapter

**Files:**

- Create: `packages/widget/src/client/attach-connection.ts`
- Test: `packages/widget/test/attach-connection.it.test.ts` (node vitest, real `node:http` server — same runner that hosts the Playwright ITs; this one needs no browser)

**Interfaces:**

- Consumes: `SessionClient` (`chatStreamUrl`, `attachUrl`, `chatHeaders`), `StreamChunk` from `@tanstack/ai`, `SubscribeConnectionAdapter` + `RunAgentInputContext` types from `@tanstack/ai-client`.
- Produces: `attachConnection(client: SessionClient, opts?: {retryDelayMs?: number}): SubscribeConnectionAdapter & {bump: () => void}` — `bump()` force-reconnects the current subscribe fetch (session switch within a pane).
- Wire contract for `send`: body must satisfy `ChatRequestSchema` — `{messages, forwardedProps}` where `forwardedProps` is the merge of the adapter-level request meta and per-send `data`.

- [ ] **Step 1: Write the failing IT**

```ts
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineClient} from '@conciv/api-client'
import {attachConnection} from '../src/client/attach-connection.js'

const chunkLines = (chunks: StreamChunk[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
const started = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk

describe('attachConnection', () => {
  const state = {server: undefined as Server | undefined, base: '', posts: [] as unknown[], attachCount: 0}

  beforeAll(async () => {
    state.server = createServer((req, res) => {
      if (req.url === '/api/chat' && req.method === 'POST') {
        let body = ''
        req.on('data', (part) => (body += String(part)))
        req.on('end', () => {
          state.posts.push(JSON.parse(body))
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ok: true}))
        })
        return
      }
      if (req.url === '/api/chat/attach') {
        state.attachCount += 1
        res.setHeader('content-type', 'text/event-stream')
        res.write(chunkLines([started, finished]))
        res.end()
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve) => state.server?.listen(0, '127.0.0.1', resolve))
    const address = state.server?.address() as AddressInfo
    state.base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => state.server?.close(resolve))
  })

  it('send POSTs a ChatRequest body and resolves on ok', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client)
    await adapter.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hi'}]}], {model: 'haiku'})
    expect(state.posts.at(-1)).toMatchObject({messages: [{id: 'u1'}], forwardedProps: {model: 'haiku'}})
  })

  it('subscribe parses SSE chunks and reconnects after the stream ends', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client, {retryDelayMs: 20})
    const controller = new AbortController()
    const seen: StreamChunk[] = []
    const drain = (async () => {
      for await (const chunk of adapter.subscribe(controller.signal)) {
        seen.push(chunk)
        if (seen.length >= 4) controller.abort()
      }
    })().catch(() => {})
    const deadline = Date.now() + 3000
    while (seen.length < 4 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
    controller.abort()
    await drain
    expect(seen.length).toBeGreaterThanOrEqual(4)
    expect(state.attachCount).toBeGreaterThanOrEqual(2)
    expect(seen[0]?.type).toBe(EventType.RUN_STARTED)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/attach-connection.it.test.ts` (cwd `packages/widget`). If widget's vitest config only picks up Playwright globs, extend the config include to `test/**/*.it.test.ts` (it already matches — verify) and confirm this file runs without a browser.

- [ ] **Step 3: Implement**

```ts
import type {StreamChunk} from '@tanstack/ai'
import type {RunAgentInputContext, SubscribeConnectionAdapter, UIMessage} from '@tanstack/ai-client'
import type {ModelMessage} from '@tanstack/ai/client'
import {apiError, type SessionClient} from '@conciv/api-client'

const DEFAULT_RETRY_MS = 500

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

async function* parseSseChunks(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  try {
    while (!signal?.aborted) {
      const {value, done} = await reader.read()
      if (done) return
      buffered += decoder.decode(value, {stream: true})
      const events = buffered.split('\n\n')
      buffered = events.pop() ?? ''
      for (const event of events) {
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) yield JSON.parse(data) as StreamChunk
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function attachConnection(
  client: SessionClient,
  opts: {retryDelayMs?: number} = {},
): SubscribeConnectionAdapter & {bump: () => void} {
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_MS
  const current = {controller: null as AbortController | null}

  async function send(
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, unknown>,
    signal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): Promise<void> {
    const response = await fetch(client.chatStreamUrl(), {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {'content-type': 'application/json', ...client.chatHeaders()},
      body: JSON.stringify({messages, forwardedProps: {...runContext?.forwardedProps, ...data}}),
    })
    if (!response.ok) throw apiError('/api/chat', response.status)
  }

  async function* subscribe(signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    while (!signal?.aborted) {
      const controller = new AbortController()
      current.controller = controller
      const onOuterAbort = () => controller.abort()
      signal?.addEventListener('abort', onOuterAbort, {once: true})
      try {
        const response = await fetch(client.attachUrl(), {
          credentials: 'include',
          signal: controller.signal,
          headers: client.chatHeaders(),
        })
        if (response.ok && response.body) yield* parseSseChunks(response.body, controller.signal)
      } catch {
      } finally {
        signal?.removeEventListener('abort', onOuterAbort)
        current.controller = null
      }
      if (signal?.aborted) return
      await delay(retryDelayMs, signal)
    }
  }

  return {send, subscribe, bump: () => current.controller?.abort()}
}
```

Typecheck note: match `SubscribeConnectionAdapter.send`'s exact parameter types from `connection-adapters.d.ts` (shown above in its docstring); if the `data` param is typed `Record<string, any>` upstream, mirror it — do not introduce `any` yourself elsewhere.

- [ ] **Step 4: Run to verify pass**, then `pnpm turbo typecheck --filter=@conciv/widget`.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/client/attach-connection.ts packages/widget/test/attach-connection.it.test.ts
git commit -m "feat(widget): subscribe/send connection adapter over /api/chat/attach" -- packages/widget/src/client/attach-connection.ts packages/widget/test/attach-connection.it.test.ts
```

### Task 7: Composer onCancel hook

**Files:**

- Modify: `packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx` (add `onCancel?: () => void` to the handlers type)
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer.tsx` — `Cancel`:

```ts
function Cancel(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const cancel = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())
  return (
    <Show when={composer.canCancel()}>
      <button type="button" aria-label="Stop" onClick={cancel} {...props} />
    </Show>
  )
}
```

Also route the Escape path in `Input`'s `onKeyDown` through the same resolution (it calls `composer.cancel()` today — extract `const cancelViaHandlers = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())` using `useComposerHandlers()` in `Input` and call it there).

- [ ] **Step 1:** Read `composer-handlers.tsx`, add the optional member, update both call sites.
- [ ] **Step 2:** If ui-kit-chat has composer unit/storybook tests exercising Cancel, run them: `pnpm vitest run` (cwd `packages/ui-kit-chat`). Expected: PASS (additive change).
- [ ] **Step 3:** `pnpm turbo typecheck --filter=@conciv/ui-kit-chat` — PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit-chat/src/primitives/composer
git commit -m "feat(ui-kit-chat): composer onCancel handler hook" -- packages/ui-kit-chat/src/primitives/composer
```

### Task 8: chat-panel subscription rework

**Files:**

- Modify: `packages/widget/src/chat/chat-panel.tsx`
- Test: `packages/widget/test/reload-continuity.it.test.ts` (new, Playwright against scripted server — model it on `widget.it.test.ts` / `it-fixture.js`)

**Interfaces:**

- Consumes: `attachConnection` (Task 6), `CONCIV_SNAPSHOT_EVENT` + `SnapshotSchema` (Task 3), `client.stop` (Task 5), composer `onCancel` (Task 7).
- Produces: ChatPanel that (a) subscribes while `props.active`, (b) applies snapshots via `setMessages`, (c) sends through the adapter, (d) cancels via server stop, (e) compacts by awaiting `sessionGenerating` falling.

- [ ] **Step 1: Write the failing reload IT.** Scripted server (same shape as `widget.it.test.ts`'s helper server) implementing:
  - `POST /api/chat/session/resolve` → fixed id `conciv_reload`
  - `GET /api/chat/session` → minimal ChatSession JSON with `lock: {held: false, role: null}`
  - `GET /api/chat/sessions` → `{sessions: []}`
  - `GET /api/chat/models`, `/api/chat/commands`, `/api/chat/tools` → empty shapes (copy from existing IT server)
  - `POST /api/chat` → `{ok: true}` and flips server-side state `running = true`, remembering the user text
  - `GET /api/chat/attach` → SSE: snapshot custom chunk `{generating: running, messages: running ? [userMessage] : settled}`, then if running: `RUN_STARTED`, one `TEXT_MESSAGE_START` + `TEXT_MESSAGE_CONTENT('streamed-before-reload ')`, then KEEPS THE SOCKET OPEN, and 800ms after the FIRST attach emits `TEXT_MESSAGE_CONTENT('streamed-after-reload')`, `TEXT_MESSAGE_END`, `RUN_FINISHED` to whichever attach connections are then open, flipping `running = false` and recording the full text into `settled`.

  Test body:

```ts
it('a page reload mid-stream loses nothing', async () => {
  const page = await browser.newPage()
  await page.goto(pageUrl)
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await page.getByRole('textbox').fill('run something')
  await page.keyboard.press('Enter')
  await expect(page.getByText('streamed-before-reload')).toBeVisible()
  await page.reload({waitUntil: 'domcontentloaded'})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect(page.getByText('run something')).toBeVisible()
  await expect(page.getByText('streamed-before-reload')).toBeVisible()
  await expect(page.getByText(/streamed-after-reload/)).toBeVisible()
  await page.close()
})
```

(Panel auto-open restore lands in Task 10 — until then the test reopens via the FAB button. `waitUntil: 'domcontentloaded'`, never `networkidle` — SSE keeps the network busy.)

- [ ] **Step 2: Run to verify failure** — `pnpm turbo build --filter=@conciv/widget` then `pnpm vitest run test/reload-continuity.it.test.ts` (cwd `packages/widget`): reload wipes the messages.

- [ ] **Step 3: Implement in `chat-panel.tsx`.**

Replace the `useChat` construction (`chat-panel.tsx:176-186`):

```ts
const connection = attachConnection(client)
const chatRef = {current: null as ReturnType<typeof useChat> | null}
const onSnapshot = (data: unknown) => {
  const parsed = SnapshotSchema.safeParse(data)
  if (!parsed.success) return
  chatRef.current?.setMessages(parsed.data.messages as never)
}
const chat = useChat({
  ...createChatClientOptions({connection}),
  get live() {
    return props.active !== false
  },
  onCustomEvent: (eventType, data, context) => {
    if (eventType === CONCIV_SNAPSHOT_EVENT) return onSnapshot(data)
    onConcivUi(eventType, data, context)
  },
  onChunk,
})
chatRef.current = chat
```

Check `use-chat.js:77-87` during implementation: `options.live` is read inside a `createEffect`, so a getter is reactive — verify by toggling pane activity in the IT (`onSubscriptionChange` is omitted from UseChatOptions; assert behavior via network: inactive pane closes its attach request). If the getter turns out non-reactive, fall back to `createEffect(() => …)` in chat-panel calling nothing — STOP and re-check the lib source rather than hacking (NO HACKS rule).

`requestMeta` forwarding: `sendMessage(content)` no longer passes a per-request body through the connection options. Route it per send instead: change `onSend`'s `chat.sendMessage(text)` to `chat.sendMessage(text, requestMeta())` if `UseChatReturn.sendMessage` accepts a body param (check `types.d.ts`; the underlying `ChatClient.sendMessage(content, body)` does — if the solid wrapper hides it, keep meta on the adapter instead: give `attachConnection` an `opts.requestMeta: () => Record<string, unknown>` merged inside `send`, and pass `() => requestMeta()` at construction). Model selection must keep riding `forwardedProps` (assert via existing model-selector IT).

Delete `loadSession` and the `createEffect` at `chat-panel.tsx:298-307` that drives it; the snapshot replaces history loading. Keep `props.onActiveSession` + focus + session-label behavior:

```ts
createEffect(() => {
  const id = client.sessionId()
  if (!props.active || !id) return
  props.onActiveSession?.(id)
  focusInput()
  void client.session().then((session) => {
    props.onSessionLabel?.(session.name)
    setUsage((prev) => session.usage ?? prev)
  })
})
```

`startNewSession` keeps its shape but must reconnect the stream: after `client.setSessionId(sessionId)`, call `connection.bump()`.

Cancel: wrap the panel content's `ComposerHandlersProvider` value (find where `onSend` is provided further down the file) adding:

```ts
  onCancel: () => {
    chat.stop()
    void client.stop().catch(() => {})
  },
```

Compact (`chat-panel.tsx:352-376`) — replace the fetch-and-drain with:

```ts
const waitForIdle = () =>
  new Promise<void>((resolve) => {
    createEffect(() => {
      if (!chat.sessionGenerating() && !chat.isLoading()) resolve()
    })
  })
const compact = async () => {
  if (chat.isLoading() || compacting()) return
  const id = addDivider('compact')
  setPendingCompactId(id)
  try {
    const response = await fetch(client.chatStreamUrl(), {
      method: 'POST',
      credentials: 'include',
      headers: {'content-type': 'application/json', ...client.chatHeaders()},
      body: JSON.stringify({
        messages: [{role: 'user', content: '/compact'}],
        forwardedProps: {...requestMeta(), intent: 'compact'},
      }),
    })
    if (!response.ok) throw apiError('/api/chat', response.status)
    await new Promise((r) => setTimeout(r, 100))
    await waitForIdle()
    const session = await client.session()
    if (session.usage) setUsage(session.usage)
  } catch {
    removeDivider(id)
    setLiveMsg('Compaction failed — the session may be busy. Try again in a moment.')
  } finally {
    setPendingCompactId(null)
  }
}
```

`waitForIdle` runs inside the component's reactive owner (compact is a handler; wrap the `createEffect` in `runWithOwner(getOwner(), …)` captured at render — capture `const owner = getOwner()` top-level in the component, `runWithOwner(owner, () => createEffect(…))` in the promise).

Also update `switchError` retry button (`chat-panel.tsx:466`): `onClick={() => connection.bump()}`.

- [ ] **Step 4: Run the new IT + full widget suite**

Run: `pnpm turbo build --filter=@conciv/widget && pnpm vitest run` (cwd `packages/widget`)
Expected: reload-continuity PASSES; existing ITs (widget.it, trigger-menu, react-verbs, effect-highlight) PASS — several stub servers in those tests answer `/api/chat` with SSE; update their handlers to the new contract (`{ok:true}` + `/api/chat/attach` SSE). Grep `test/` for `'/api/chat'` handlers and convert each the same way as the reload server.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/chat/chat-panel.tsx packages/widget/test
git commit -m "feat(widget): live subscription chat — snapshot restore, detached send, server-side cancel" -- packages/widget/src/chat/chat-panel.tsx packages/widget/test
```

---

## Phase C — Ephemeral UI snapshot

### Task 9: ui-snapshot storage lib

**Files:**

- Create: `packages/widget/src/lib/ui-snapshot.ts`
- Test: covered through the Playwright ITs in Tasks 10–11 (pure storage glue; behavior asserted end-to-end per repo convention)

**Interfaces (produces — later tasks use these exact names):**

```ts
export type PaneSnapshot = {
  draft: string
  selectionStart: number
  selectionEnd: number
  focused: boolean
  grabTexts: string[]
  dividers: {id: number; afterCount: number; kind: 'new' | 'compact'}[]
  scrollTop: number | null
}
export type ShellSnapshot = {layer: 'modal' | 'quick' | null; paneIds: string[]}
export function readPaneSnapshot(sessionId: string): PaneSnapshot | null
export function writePaneSnapshot(sessionId: string, snapshot: PaneSnapshot): void
export function clearPaneSnapshot(sessionId: string): void
export function readShellSnapshot(): ShellSnapshot | null
export function writeShellSnapshot(snapshot: ShellSnapshot): void
```

- [ ] **Step 1: Implement** — `sessionStorage` keys `conciv-pane:<sessionId>` and `conciv-shell`; JSON round-trip wrapped in try/catch returning null on parse failure; guard field types with the same manual-narrowing style as `parseWidgetSettings` (`packages/widget/src/client/widget-settings.ts`). All access behind `typeof sessionStorage === 'undefined'` guards is unnecessary (widget is browser-only) — plain access, try/catch for quota/security errors like `persisted-signal.ts` does (read that file and mirror its error handling exactly).
- [ ] **Step 2:** `pnpm turbo typecheck --filter=@conciv/widget` — PASS.
- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/lib/ui-snapshot.ts
git commit -m "feat(widget): sessionStorage pane/shell snapshot store" -- packages/widget/src/lib/ui-snapshot.ts
```

### Task 10: shell restore — open layer + panes

**Files:**

- Modify: `packages/widget/src/shell/widget-shell.tsx`
- Test: extend `packages/widget/test/reload-continuity.it.test.ts`

**Interfaces:**

- Consumes: `readShellSnapshot`/`writeShellSnapshot` (Task 9).
- Produces: after reload, the panel is open iff it was open, with the same mounted panes and active pane.

- [ ] **Step 1: Extend the IT (failing)**

```ts
it('the panel reopens itself after reload with the same active session', async () => {
  const page = await browser.newPage()
  await page.goto(pageUrl)
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  await page.reload({waitUntil: 'domcontentloaded'})
  await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
})
```

Remove the interim `Open conciv chat` re-click from Task 8's reload test once this passes (the panel now restores itself).

- [ ] **Step 2: Implement.** In `Shell` (`widget-shell.tsx:156`):

```ts
const restoredShell = readShellSnapshot()
const [layer, setLayer] = createSignal<'modal' | 'quick' | null>(restoredShell?.layer ?? null)
```

In `ModalLayout` (`widget-shell.tsx:298-341`): persist pane ids and restore them —

```ts
createEffect(() =>
  writeShellSnapshot({
    layer: props.open() ? 'modal' : currentLayerFromShell(),
    paneIds: panes().map((pane) => pane.id),
  }),
)
```

Simplest correct wiring: `Shell` owns the shell snapshot. Pass `onPanesChange: (ids: string[]) => void` from Shell into ModalLayout, and write the snapshot in one Shell-level effect combining `layer()` + latest pane ids signal. Restore in ModalLayout replaces the current tail (`widget-shell.tsx:339-341`):

```ts
const restoredPanes = readShellSnapshot()?.paneIds ?? []
for (const id of restoredPanes.filter(isSessionId)) mountPane(id)
const restored = readStorage('conciv-active-session', parseActiveId, undefined)
if (restored) activate(restored)
if (!restored) void activateNew()
```

(`isSessionId` from `@conciv/protocol/chat-types`; `parseActiveId` already validates the active id.) Quick-terminal layer restore: `layer() === 'quick'` initial value is enough — QuickTerminalLayout already renders from `open()`.

- [ ] **Step 3: Run** — `pnpm turbo build --filter=@conciv/widget && pnpm vitest run test/reload-continuity.it.test.ts` (cwd `packages/widget`): PASS. Run the full widget suite for regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/shell/widget-shell.tsx packages/widget/test/reload-continuity.it.test.ts
git commit -m "feat(widget): restore open layer and mounted panes across reload" -- packages/widget/src/shell/widget-shell.tsx packages/widget/test/reload-continuity.it.test.ts
```

### Task 11: pane restore — draft, cursor, focus, grabs, dividers, scroll

**Files:**

- Modify: `packages/widget/src/chat/chat-panel.tsx`
- Test: extend `packages/widget/test/reload-continuity.it.test.ts`

**Interfaces:**

- Consumes: `readPaneSnapshot`/`writePaneSnapshot`/`clearPaneSnapshot` (Task 9); `inputEl` textarea ref, `grabs`/`setGrabs`, `dividers`/`setDividers`, the thread viewport element.

- [ ] **Step 1: Extend the IT (failing)**

```ts
it('draft text, cursor position, and focus survive reload invisibly', async () => {
  const page = await browser.newPage()
  await page.goto(pageUrl)
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  const input = page.getByRole('textbox')
  await input.fill('fix the header layout')
  await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(7, 7))
  await page.reload({waitUntil: 'domcontentloaded'})
  const restored = page.getByRole('textbox')
  await expect(restored).toHaveValue('fix the header layout')
  await expect(restored).toBeFocused()
  const selection = await restored.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])
  expect(selection).toEqual([7, 7])
})
```

- [ ] **Step 2: Implement in chat-panel.** Inside the component, after `inputEl` exists (chat-panel owns the ref):

```ts
const paneSessionId = () => client.sessionId() ?? ''
const snapshotPane = (): PaneSnapshot => ({
  draft: chat.view.draft,
  selectionStart: inputEl?.selectionStart ?? chat.view.draft.length,
  selectionEnd: inputEl?.selectionEnd ?? chat.view.draft.length,
  focused: inputEl
    ? inputEl.getRootNode() instanceof ShadowRoot
      ? (inputEl.getRootNode() as ShadowRoot).activeElement === inputEl
      : document.activeElement === inputEl
    : false,
  grabTexts: grabs().map((grab) => grab.text),
  dividers: dividers(),
  scrollTop: viewportEl?.scrollTop ?? null,
})
```

Wait — `chat.view` lives inside `ChatProvider`, below this component's top level (chat-panel renders `ChatProvider` around its tree; check where `view` is instantiated: `ChatProvider` from ui-kit-chat creates it in `chat-context.tsx:26`). Draft access therefore goes through the same `DraftBridge` pattern already present (`chat-panel.tsx:119-123`): extend the bridge to expose the full composer surface —

```ts
function ComposerStateBridge(props: {
  onReady: (api: {append: (text: string) => void; text: () => string; setText: (value: string) => void}) => void
}): JSX.Element {
  const composer = useComposer()
  props.onReady({
    append: (text) => composer.setText(composer.text() ? `${composer.text()}\n${text}` : text),
    text: composer.text,
    setText: composer.setText,
  })
  return <></>
}
```

Replace `DraftBridge` usage with `ComposerStateBridge`; keep the `appendDraft` behavior via the new `append`. Store the api in `const composerApi = {current: null as null | {append…}}`.

Restore on mount (once, after the bridge fires — do it inside `onReady`):

```ts
const restorePane = (api: {setText: (value: string) => void}) => {
  const snapshot = readPaneSnapshot(paneSessionId())
  if (!snapshot) return
  api.setText(snapshot.draft)
  setGrabs(snapshot.grabTexts.map((text) => ({text}) as Grab))
  setDividers(snapshot.dividers)
  dividerSeq.n = Math.max(0, ...snapshot.dividers.map((divider) => divider.id))
  requestAnimationFrame(() => {
    if (snapshot.scrollTop !== null && viewportEl) viewportEl.scrollTop = snapshot.scrollTop
    if (!inputEl) return
    inputEl.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd)
    if (snapshot.focused) inputEl.focus()
  })
}
```

`Grab` shape: read `packages/grab/src` for the `Grab` type before writing this — if it carries more than `text` (element refs, rects), persist only the JSON-safe fields the staged-chip rendering needs (`grab-reference.tsx` renders `g.text`) and construct the restored value through whatever narrow factory exists; if none exists, persist `{text}` and widen the staged-grab rendering to accept it. Do NOT persist live DOM references.

Continuous writes — one debounced writer + flush:

```ts
const writeSnapshot = () => writePaneSnapshot(paneSessionId(), snapshotPane())
const debouncedWrite = createDebouncer(writeSnapshot, {wait: 150})
createEffect(() => {
  grabs()
  dividers()
  debouncedWrite.maybeExecute()
})
const onPageHide = () => writeSnapshot()
window.addEventListener('pagehide', onPageHide)
onCleanup(() => window.removeEventListener('pagehide', onPageHide))
```

Draft/cursor changes don't tick a signal visible here — attach DOM listeners to `inputEl` once the ref lands (`input`, `select`, `keyup`, `click`, `focus`, `blur` → `debouncedWrite.maybeExecute()`). `viewportEl`: capture a ref where chat-panel renders the `Thread` — read the Thread primitive (`packages/ui-kit-chat/src/primitives/thread/thread.tsx`) to find the scrollable viewport element and how to ref it (`Thread.Viewport` likely accepts `ref`); wire `let viewportEl: HTMLElement | undefined` plus a `scroll` listener → debounced write.

Clear the snapshot on send (`onSend`, after `sendMessage`): `clearPaneSnapshot(paneSessionId())` then `writeSnapshot()` — draft is empty now and must not resurrect.

- [ ] **Step 3: Run** — build widget, run reload-continuity IT + full widget suite: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/chat/chat-panel.tsx packages/widget/test/reload-continuity.it.test.ts
git commit -m "feat(widget): restore draft, cursor, focus, grabs, dividers, scroll across reload" -- packages/widget/src/chat/chat-panel.tsx packages/widget/test/reload-continuity.it.test.ts
```

---

## Phase D — End-to-end verification

### Task 12: real-core end-to-end + manual verify

**Files:**

- Test: `packages/core/test/api/chat/turn-detach.it.test.ts` (extend with a reconnect-consumer case)
- No product code expected; fixes discovered here get their own micro-commits.

- [ ] **Step 1: Add the reconnect-consumer IT to core** (simulates exactly what the widget does across a reload — attach, drop, re-attach, assert full transcript):

```ts
fakeIt('a dropped and re-opened attach sees the complete turn (reload simulation)', async () => {
  const releaseFile = join(tmp(), 'release')
  const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
  state.server = server
  const id = await server.resolve()
  await server.post('/api/chat', {messages: [turn('rebuild the page')]}, id)
  const before = await server.attach(id, {until: 'first-half', timeoutMs: 3000})
  expect(before).toContain('"generating":true')
  expect(before).toContain('rebuild the page')
  writeFileSync(releaseFile, '')
  const after = await server.attach(id, {until: 'RUN_FINISHED'})
  expect(after).toContain('first-half')
  expect(after).toContain('second-half')
})
```

Run: `pnpm vitest run test/api/chat/turn-detach.it.test.ts` (cwd `packages/core`) — PASS.

- [ ] **Step 2: Full-repo gate**

```bash
pnpm turbo build typecheck --filter=@conciv/protocol --filter=@conciv/api-client --filter=@conciv/core --filter=@conciv/ui-kit-chat --filter=@conciv/widget
pnpm turbo test --filter=@conciv/core --filter=@conciv/widget --filter=@conciv/ui-kit-chat --filter=@conciv/protocol --filter=@conciv/api-client
```

Expected: all green.

- [ ] **Step 3: Manual verify in the example app** (owning-package tests stay authoritative; this is the /verify pass, not a test):
  1. `pnpm dev` (example app + core server).
  2. Open the widget, ask the agent to edit a source file of the example app so vite hard-reloads the page mid-turn.
  3. Observe: page reloads, panel reopens itself, the user message and partial assistant text are present, streaming continues to completion. Type a draft + place the cursor mid-word before triggering another reload: draft, cursor, and focus come back.
  4. Confirm the harness child was never killed (core server logs show no SIGTERM on the claude child during reload).

- [ ] **Step 4: Commit any residual fixes with pathspec, then hand off** per superpowers:finishing-a-development-branch (branch: create `widget-reload-continuity` off `main` before Task 1 if not already on a feature branch).

## Self-Review Notes

- Spec coverage: (1) detached turns → Tasks 1, 4; (2) attach/resume stream → Tasks 4, 6, 8; (3) snapshot consistency (history vs replay) → Tasks 2, 3, 4; (4) full UI state incl. cursor → Tasks 9–11. Compact + cancel semantics forced by the wire change → Tasks 7, 8. End-to-end reload invisibility → Tasks 8, 10, 11, 12.
- Known deliberate gaps (documented, not silent): PiP window state is out of scope; genUi specs injected while NO run is active are still lost on reload (during-run specs survive via replay); multi-tab same-session works (hub fans out) but each tab keeps its own UI snapshot — by design via sessionStorage.
- Type-consistency check: `TurnHub.attach` returns `{replay, live}` — used with that exact shape in `attach.ts` (Task 4) and tested in Task 1. `settledMessages(messages, pendingUserText)` — string-or-null second arg in both Task 2 and Task 4. `attachConnection(...).bump()` — produced Task 6, consumed Task 8. `PaneSnapshot`/`ShellSnapshot` field names identical across Tasks 9–11.
