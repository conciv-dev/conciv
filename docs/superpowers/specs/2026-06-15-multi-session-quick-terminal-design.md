# Multi-session quick terminal — design

Date: 2026-06-15
Status: approved (brainstorm), pending implementation plan

## Problem

The quick terminal (`packages/widget/src/quick-terminal.tsx`) presents each pane as "its
own independent agent session." The backend does not support that. Core keeps exactly one
session per preview:

- `SessionState` is a single mutable `{sessionId}` holder per `registerChatRoutes`
  (`packages/core/src/api/chat/chat.ts:28`).
- A single global lock (`<stateRoot>/.aidx/agent.lock`) serializes all agent runs
  (`packages/core/src/store/lock.ts`).
- The persisted map is `previewId → sessionId`
  (`packages/core/src/store/session-store.ts`).
- The widget client never sends a per-pane identity; `useChat` POSTs `{messages}` only.

Resulting bugs when more than one pane exists:

1. A "new" pane hydrates from the single global session → shows another pane's transcript.
2. Only one pane can run a turn at a time; a second pane's send returns `409 agent busy`.
3. All panes resume and append to one harness session id → shared transcript, racing writes.
4. `onSessionId` clobbers the global state; whichever pane ran last wins on reopen.

Root cause: the session model is single-session-per-preview; the quick-terminal UI assumes
multi-session. There is no session-id dimension in the backend.

## Decisions

Settled during brainstorming:

- **Concurrency:** true parallel runs. Each session has its own lock and its own harness
  process; panes stream simultaneously.
- **Persistence:** restore all panes and their histories across reload and dev-server
  restart.
- **Identity approach:** client-minted session id (approach A). The client owns session
  lifecycle; the harness's own id is a server-internal resume token mapped under our id.
- **Session vs surface:** a _session_ is the durable conversation; a _surface_ (pane, PiP,
  modal) holds a _reference_ to a session id. Sessions are not tied to panes.
- **Transport:** the session id travels in an HTTP header, `aidx-session-id`. Absent →
  the default session.

## Model

### Two concepts

- **Session** — durable conversation, identified by a client-minted `sessionId`
  (`crypto.randomUUID`). The harness's own id (claude `session_id`, codex `thread_id`) is a
  resume token stored _under_ our session id; the client never sees it.
- **Surface** — pane / PiP / modal. Holds a reference to a `sessionId`. Disposable;
  sessions outlive surfaces. A surface may switch which session it shows.

### Wire contract — header based

- Constant `AIDX_SESSION_HEADER = 'aidx-session-id'`. The client sends it on every chat
  request: `POST /api/chat`, `GET /api/chat/session`, `GET /api/chat/history`,
  `POST /api/chat/permission-decision`, `POST /api/chat/ui`.
- Server helper resolves `sessionId = header || DEFAULT_SESSION_ID` (a fixed constant id).
- `ChatRequestSchema.sessionId` (body field) is removed; identity lives only in the header.

Consequences of the default fallback:

- The modal panel and `probeChatAvailable` send no header → the default session.
- Quick-terminal panes each mint and send their own id → independent of the modal and of
  each other.
- The modal chat and quick-terminal sessions therefore diverge into separate conversations
  (today they collide on one global session). This is intended.

### Server state

```ts
type SessionState = {harnessSessionId: string} // resume token, '' until first turn
const sessions = new Map<string, SessionState>() // keyed by OUR sessionId
```

Replaces the single `SessionState` in `chat.ts`. Routes look up `sessions.get(sessionId)`,
creating an empty entry on first reference (lazily seeded from the persisted map). The
**default** session seeds its `harnessSessionId` from `initialSessionId` (the agent
`iterate` handoff) when present.

### Persistence — split by ownership

The server owns resume tokens; the client owns UI layout. Two stores:

**Server** — `chat-sessions.json` shape changes from `previewId → sessionId` (flat string) to
`previewId → { ourSessionId: harnessToken }`:

```json
{
  "<previewId>": {
    "uuid-a": "claude-sess-1",
    "uuid-b": "claude-sess-2",
    "default": "claude-sess-0"
  }
}
```

- Keyed by _our_ client-minted session id; the value is the harness resume token, `''` until
  the session's first turn mints one.
- Store API: `readSessions(stateRoot, previewId): Record<string, string>`,
  `writeSession(stateRoot, previewId, sessionId, harnessToken)` upserts one entry,
  `removeSession(stateRoot, previewId, sessionId)` drops one.
- Migration: v0, no users — reshape outright, no back-compat read of the old flat shape. Old
  files read as empty and get rewritten.

**Client** — pane layout lives in `localStorage` (consistent with `aidx-qt-height`,
`aidx-qt-focused`, `aidx-fab-position`). Key `aidx-qt-panes` holds the ordered list of pane
session ids:

```json
["uuid-a", "uuid-b"]
```

On reopen the quick terminal recreates one pane per id in order; an empty/absent list seeds
a single fresh pane. The server is never told about panes or order — it only ever sees a
session id in a request header.

## Server routes

`registerChatRoutes` (`chat.ts`) replaces the single `state` with a
`Map<sessionId, SessionState>` plus a `sessionFor(sessionId)` helper that lazily creates an
entry, seeding it from the persisted map and — for the default session id only — from
`initialSessionId` when present. All three route groups receive the map + helper.

- `GET /api/chat/session` — reads `sessionId` from the header (or default). Returns
  `{sessionId, harnessId, name, source, cwd, lock}`. `sessionId` echoes _our_ id (the identity
  the client sends back in the header). `harnessId` is the harness resume token, display-only
  (powers the short id and the copyable id in the popover; `null` before the first turn) — the
  client never sends it back as identity. `name` is the harness session name or `null`.
  `source`: `'agent'` if the default session adopted `initialSessionId`, `'chat'` if it has a
  minted token, else `'new'`. The client decides whether to hydrate from `source !== 'new'`.
  `lock` is the per-session lock. With no header, returns the default session's state
  (probe-safe).
- `GET /api/chat/history` — header based (no `?sessionId=` query); resolves the harness
  token from the header session id server-side and reads that transcript.
- `POST /api/chat` — the core change:
  - Reads `sessionId` from the header.
  - `resumeSessionId = harness.capabilities.resume ? (sessionFor(sessionId).harnessSessionId || null) : null`.
  - Lock check is per session: 409 only if _that_ session is busy.
  - `onSessionId` writes `sessionFor(sessionId).harnessSessionId` and
    `writeSession(..., sessionId, harnessToken)`.
  - `onSpawn` acquires the per-session lock.

No `/panes` endpoint — pane layout is client-side `localStorage` (see Persistence). The
client restores panes from its own list and hydrates each via the header.

## Concurrency & lock

- `lock.ts` functions (`readLock` / `acquireLock` / `releaseLock` / path) gain a `sessionId`
  param → `<stateRoot>/.aidx/agent.<sessionId>.lock`. Independent sessions run in parallel.
- The `iterate` / `chat` role invariant ("two writers, one transcript") now holds per
  session, because an `iterate` run and a chat turn targeting the same harness session
  resolve to the same `sessionId` lock.
- There is no standalone `iterate` CLI today; the only `iterate`-role lock holder is the
  busy-state simulation in `chat.it.test.ts`. That test acquires the lock for the default
  session id so the 409 assertion still targets the right lock. The `LockRole` enum is
  unchanged.

## Harness contract

Multi-session itself adds nothing to the harness contract:

- `resumeSessionId: null` → start a new session; the CLI mints its own id.
- `resumeSessionId: <token>` → resume (`--resume <id>`, `exec resume <id>`, etc.).
- `onSessionId(id)` → report the minted/active id.

A new harness implements nothing new for multi-session. If it declares `capabilities.resume`
and decodes `onSessionId` (all current adapters do), it works for free. `resume: false`
harnesses (gemini-cli, pi, opencode) still get parallel independent runs; they simply never
carry context turn-to-turn, a pre-existing CLI limitation guarded by `turn.ts` checking
`capabilities.resume`.

### Optional session name

To surface a human-readable session name (below), `HarnessHistory` gains one **optional**
method:

```ts
nameFromTranscript?(raw: string): string | null
```

- Claude implements it by reading the transcript's `summary` record (claude auto-generates a
  short title per session); the current parser ignores those records, so this is additive.
- Harnesses that omit it return no name and the UI falls back to a short id. No other harness
  is required to implement it.

## Session label (UX)

Both surfaces show a per-session label. Resolution order:

1. harness session name (`nameFromTranscript`), if any;
2. else a short id — the first 8 chars of the harness token (`a1b2c3d4`);
3. else, before the first turn mints a token, the placeholder `New session`.

The label is a button that opens the session-info popover (below) with the full details.

- **Quick-terminal pane bar** — replaces the current hardcoded `session-{pane.id}` (a local
  counter, not the real session — a bug) with the label, truncated with ellipsis. Clicking
  it opens the popover anchored to the label.
- **Modal header** — the shell header renders the same label as a subtitle beside the `aidx`
  brand, same truncation, same popover on click.

Plumbing: the label is owned by `ChatPanel` (which holds the session id + api), since the
chrome that displays it (pane bar in quick-terminal, header in the shell) lives outside
`ChatPanel`. `ChatPanel` gains an `onSessionLabel?(label: {name: string | null; id: string | null})`
callback, mirroring the existing `onWorkingChange`. It reports on hydrate and again when a
turn finishes (the name may first appear or change after the first turn). The shell and
quick-terminal render the resolved label from the callback.

`GET /api/chat/session` includes the name: `ChatSessionSchema` gains `name: string | null`,
computed server-side via `harness.history?.nameFromTranscript?.(transcript)` when a
transcript exists, else `null`.

### Popover component

A reusable Solid popover primitive at `packages/widget/src/popover.tsx`, built on
`@floating-ui/dom` (promoted from a transitive dep to a direct `@opendui/aidx-widget` dependency; the
framework-agnostic `dom` package is the correct choice for Solid — the React wrapper already
in the tree is not usable here).

- Positions with `computePosition` + `offset` / `flip` / `shift` middleware; `autoUpdate`
  repositions on scroll, resize, and content change; both torn down in `onCleanup`.
- API roughly `<Popover anchor={el} open={open()} setOpen={...} placement="bottom-start">…</Popover>`.
  Closes on outside-click and `Escape`. Rendered into the widget's shadow-root container so
  styles stay scoped (consistent with the rest of the widget).
- General-purpose: the session-info popover is its first consumer; later UI can reuse it.

### Session-info popover (content)

Opened by clicking the session label on either surface. Anchored to the label. Contents:

- **Full name** — the harness session name, or `New session`; wraps if long.
- **Copyable full id** — the full harness session token with a copy-to-clipboard button
  (empty/omitted before the first turn mints one).
- **Source** — `new` / `chat` / `agent`.

No rename in this iteration (deferred — would need an editable field and a persist path).

## Client

- `ChatPanel` gains a `sessionId?` prop. `createChatApi({apiBase, sessionId})` sets the
  `aidx-session-id` header on every fetch and on the `fetchServerSentEvents` connection
  (via its options thunk: `() => ({headers: {'aidx-session-id': sessionId}, credentials: 'include'})`).
  No prop → no header → default session.
- Quick-terminal `addPane()` mints the session id (`crypto.randomUUID`) and passes it via
  `panel.create` ctx; the modal passes none.
- `ChatPanel.hydrate` no longer passes a session id to `api.history()` (the header carries
  it) and gates on `source !== 'new'` instead of a truthy harness token.
  `ChatHistorySchema`'s `sessionId` query param is dropped; `ChatSessionSchema.sessionId`
  keeps its shape but now means our id.
- On reopen, the quick terminal reads the `aidx-qt-panes` `localStorage` list and recreates
  one pane per session id in order, each hydrating from its own transcript via the header. An
  empty/absent list seeds one fresh pane.
- `addPane` mints a session id and appends it to the list; `closePane` removes it from the
  list and stops the session's stream if running.

## Edge cases

- Fresh pane, no first turn → empty harness token → `source: 'new'`, greeting, no resume.
- Transcript recorded but `.jsonl` gone on restore → hydrate falls through to the greeting
  (existing catch in `ChatPanel.hydrate`).
- Default session (no header) → modal + probe; diverges from quick-terminal sessions, as
  intended.
- Closing the last pane closes the sheet (existing behavior); the session entry is removed.

## Testing

Per project conventions: no jsdom; widget integration tests run in a real browser via
Playwright using `browser.newPage()`.

- Core unit tests: keyed `sessions` map, per-session lock isolation, session-store
  read/write/remove, default-header fallback, default-session seeding from `initialSessionId`,
  `nameFromTranscript` parsing claude `summary` records, label fallback to short id.
- Widget integration test (real browser, `newPage()`): open quick terminal → split into two
  panes → each sends a message → both stream in parallel with no 409 → each shows its own
  distinct history → each pane bar shows its own label → click a label opens the session-info
  popover with the right id/source and copy works → reload restores both panes with the
  correct transcripts and labels.

## Out of scope

- Surfaces switching which session they reference at runtime (the model allows it; no UI for
  it yet).
- Back-compat migration of old `chat-sessions.json` (v0, no users).
- Any change to the streaming protocol or harness adapters beyond the optional
  `nameFromTranscript`.
- Renaming a session from the popover (deferred).

## Dependencies

- `@floating-ui/dom` promoted to a direct `@opendui/aidx-widget` dependency (already present
  transitively; no new download).
