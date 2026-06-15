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
- **Session vs surface:** a *session* is the durable conversation; a *surface* (pane, PiP,
  modal) holds a *reference* to a session id. Sessions are not tied to panes.
- **Transport:** the session id travels in an HTTP header, `aidx-session-id`. Absent →
  the default session.

## Model

### Two concepts

- **Session** — durable conversation, identified by a client-minted `sessionId`
  (`crypto.randomUUID`). The harness's own id (claude `session_id`, codex `thread_id`) is a
  resume token stored *under* our session id; the client never sees it.
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
type SessionState = { harnessSessionId: string }   // resume token, '' until first turn
const sessions = new Map<string, SessionState>()    // keyed by OUR sessionId
```

Replaces the single `SessionState` in `chat.ts`. Routes look up `sessions.get(sessionId)`,
creating an empty entry on first reference. The `order: 0` session seeds its
`harnessSessionId` from `initialSessionId` (the agent `iterate` handoff) or the persisted
registry.

### Persistence

`chat-sessions.json` shape changes from `previewId → sessionId` to:

```json
{
  "<previewId>": {
    "sessions": [
      { "sessionId": "uuid-a", "harnessSessionId": "claude-sess-1", "order": 0 },
      { "sessionId": "uuid-b", "harnessSessionId": "claude-sess-2", "order": 1 }
    ]
  }
}
```

- `order` drives left-to-right pane recreation on reopen and the persisted-focus index
  (`aidx-qt-focused`).
- `harnessSessionId` is `''` until a session's first turn mints one; empty-token sessions
  are still persisted so the pane count restores, and hydrate to the greeting.
- Store API: `writeSession(stateRoot, previewId, sessionId, harnessSessionId)` updates one
  entry; a new `removeSession(stateRoot, previewId, sessionId)` drops one on `closePane`.
- Migration: v0, no users — reshape the format outright, no back-compat read of the old
  flat shape. Old files read as empty and get rewritten.

## Server routes

`registerChatRoutes` (`chat.ts`) replaces the single `state` with the
`Map<sessionId, SessionState>` plus a helper that lazily creates an entry and seeds
`order: 0` from `initialSessionId` / the registry. All three route groups receive the map.

- `GET /api/chat/session` — reads `sessionId` from the header. Returns
  `{sessionId, source, cwd, lock}` where `sessionId` echoes *our* id (never the harness
  token, which stays server-internal). `source`: `'agent'` if the order-0 session adopted
  `initialSessionId`, `'chat'` if it has a minted token, else `'new'`. The client decides
  whether to hydrate from `source !== 'new'`. `lock` is the per-session lock. With no
  header, returns the default session's state (probe-safe).
- `GET /api/chat/panes` (new) — returns the persisted registry so the client restores all
  panes on reopen.
- `GET /api/chat/history` — header based (no `?sessionId=` query); resolves the harness
  token from the header session id server-side and reads that transcript.
- `POST /api/chat` — the core change:
  - Reads `sessionId` from the header.
  - `resumeSessionId = harness.capabilities.resume ? (sessions.get(sessionId)?.harnessSessionId || null) : null`.
  - Lock check is per session: 409 only if *that* session is busy.
  - `onSessionId` writes `sessions.get(sessionId)` and
    `writeSession(..., sessionId, harnessToken)`.
  - `onSpawn` acquires the per-session lock.

## Concurrency & lock

- `lock.ts` functions (`readLock` / `acquireLock` / `releaseLock` / path) gain a `sessionId`
  param → `<stateRoot>/.aidx/agent.<sessionId>.lock`. Independent sessions run in parallel.
- The `iterate` / `chat` role invariant ("two writers, one transcript") now holds per
  session, because an `iterate` run and a chat turn targeting the same harness session
  resolve to the same `sessionId` lock.
- The standalone `iterate` CLI path also acquires this lock; it must compute the matching
  `sessionId` so a handoff shares pane-0's lock. In scope for this work.

## Harness contract (unchanged — the simplicity goal)

The entire feature lives in core + widget. The harness contract is untouched:

- `resumeSessionId: null` → start a new session; the CLI mints its own id.
- `resumeSessionId: <token>` → resume (`--resume <id>`, `exec resume <id>`, etc.).
- `onSessionId(id)` → report the minted/active id.

A new harness implements nothing new. If it declares `capabilities.resume` and decodes
`onSessionId` (all current adapters do), multi-session works for free. `resume: false`
harnesses (gemini-cli, pi, opencode) still get parallel independent runs; they simply never
carry context turn-to-turn, a pre-existing CLI limitation guarded by `turn.ts` checking
`capabilities.resume`.

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
- On reopen, the client reads `GET /api/chat/panes` and recreates one pane per persisted
  session in `order`, each hydrating from its own transcript.
- `closePane` calls `removeSession` and stops the session's stream if running.

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

- Core unit tests: keyed `sessions` map, per-session lock isolation, registry
  read/write/remove, default-header fallback, order-0 seeding from `initialSessionId`.
- Widget integration test (real browser, `newPage()`): open quick terminal → split into two
  panes → each sends a message → both stream in parallel with no 409 → each shows its own
  distinct history → reload restores both panes with the correct transcripts.

## Out of scope

- Surfaces switching which session they reference at runtime (the model allows it; no UI for
  it yet).
- Back-compat migration of old `chat-sessions.json` (v0, no users).
- Any change to the streaming protocol or harness adapters beyond threading `sessionId` into
  the `iterate` lock.
