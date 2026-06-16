# Session Selector — Design Spec (v3)

Date: 2026-06-16
Status: Draft — rebased onto the multi-session foundation after discovering the 2026-06-15 plan;
incorporates the 5-angle frontend review (state / a11y / animation / architecture / API+security).

## 0. Relationship to the multi-session foundation (READ FIRST)

This feature **builds on** `docs/superpowers/specs/2026-06-15-multi-session-quick-terminal-design.md`
and its 16-task plan (`docs/superpowers/plans/2026-06-15-multi-session-quick-terminal.md`), which is
**approved but not yet implemented**. That foundation must land first (or as the lower tasks of a merged
plan). It already provides everything v1/v2 of this spec tried to re-derive — more cleanly:

- **Client-minted session id** (`crypto.randomUUID`) sent in the `aidx-session-id` header. The client
  always knows its own id → **no `AIDX_SESSION_EVENT`, no stream-capture, no adoption feedback-loop**
  (v2 §3 is deleted). The harness token is a server-internal resume token mapped under our id.
- **Per-session lock** `agent.<sessionId>.lock` → true concurrency (the locked decision) for free.
- **`Map<sessionId, SessionState>`** + header-scoped routes → usage/state are per-session, not global.
- **Session vs surface** model: a surface (pane/PiP/modal) holds a *reference* to a session and **may
  switch which session it shows** — the foundation explicitly defers the *UI* for that to us.
- **`Popover`** (`@floating-ui/dom`) + **`SessionInfoCard`** + **`nameFromTranscript`** (Claude `summary`
  records) + name→short-id→`New session` label resolver.
- **`localStorage` pane layout** (`aidx-qt-panes`) restored on reopen.

What THIS spec adds on top: **(1)** session **enumeration** (`HarnessHistory.list`), **(2)** the
**switch UI** (the combobox selector), **(3)** **rename** + a title store. Plus review-driven hardening:
`sessionId` validation, the exhaustive state matrix, a11y, and the `bar`-variant layout fit.

**Two carry-over fixes the foundation plan must also make** (the review caught them; they are not
selector-specific): under true parallel turns the **`uiBus` is a single global channel** (foundation
Task 6 keeps `uiBus.inject`/`run` global) → concurrent turns clobber `state.channel` and generative-UI
injects cross-deliver. The channel must be **turn-scoped**, with the cross-process `POST /api/chat/ui`
routed by `sessionId`. And usage persistence must key on the turn's own session id. These belong in the
foundation work but are prerequisites for this feature's correctness, so they are tracked here too (§4.6).

## 1. Goal

A header control, modeled on the existing model selector (Ark Combobox), that lists every Claude
session in the current CWD and lets the user **switch**, **start new**, and **rename**. Claude-only
(transcript-backed); hidden when the active harness cannot enumerate sessions. Each surface/pane points
at its own session independently, and — per the locked decision below — sessions on *different* ids can
run **concurrently** (per-session locking).

Non-goals (YAGNI): deleting sessions, cross-CWD listing, codex/non-transcript enumeration, multi-select,
drag-reorder, server push of list changes (poll/invalidate). "Open session in a terminal" is a natural
future hook now that adapters expose `launch({cwd, sessionId})` — explicitly out of scope here.

## 2. Decisions (locked)

- **Builds on the multi-session foundation** (§0) — client-minted id header, per-session lock, session map.
- **Scope:** list ALL Claude sessions in the CWD (incl. terminal-CLI and agent-iterate runs), with an
  **origin marker** distinguishing aidx-started sessions from externally-started ones (§4.4, §5.2a).
- **Harnesses:** Claude-only via a general `HarnessHistory.list`; selector hides when absent (codex).
- **Surfaces:** modal header + every quick-terminal pane + PiP; each surface re-references independently
  (the foundation's surface/session model already supports this).
- **Actions:** list + switch + "+ New session" + rename.
- **Concurrency:** **per-session locks** — provided by the foundation. Two surfaces on different sessions
  run in parallel; two turns on the *same* session serialize.
- **Identity:** new sessions = client-minted uuid (foundation); **discovered sessions = referenced by their
  harness token** (§3). Both are opaque, charset-validated strings in one id namespace.
- **Bug scope:** `sessionId` validation, usage-keying, compact-`sessionId`, and uiBus turn-scoping fixes
  land **with this work** (some belong to the foundation — §4.6).
- **Rename UX:** **current session only, from an always-visible control in the popover header** (rows stay
  clean Ark Combobox options — valid semantics, fully keyboard/SR accessible). Title keyed by harness token.
- **List fetch:** one shared widget-level cache, invalidated on rename / debounced turn-end / pane add.

## 2b. Canonical id model (resolves the namespace split — REVIEW-CRITICAL)

Two id forms exist: our **client-minted uuid** (new sessions) and the **harness token** (transcript
filename; the only id a discovered/external session has). The 5-angle review found that keying write-state
by uuid and read-state by token with no join breaks `running`, generative-UI inject, and `origin`. One rule
makes them cohere:

- **The "header session id" is canonical for all live state** — what the client sends in `aidx-session-id`
  (a uuid for new, the harness token for discovered). **Lock, uiBus channel, and usage are ALL keyed by it**
  and never re-keyed to the harness token mid-turn (the A18 correction: do NOT move the usage key to the
  token).
- **The list keys rows by the harness token.** `GET /sessions` **joins** through the foundation's
  `previewId → {headerId: harnessToken}` map: for a row with token `T`, find any `headerId` mapping to `T`
  and test `running`/`usage` against **both** `T` and that `headerId`.
- **Generative-UI inject** (`aidx ui`, cross-process): the agent is spawned with its header id in the env
  (`AIDX_SESSION_ID`); the CLI echoes it as the `aidx-session-id` header on `POST /api/chat/ui`; the uiBus
  channel registers under that same header id. The agent env carries no session id today — this is new
  spawn-path wiring the plan must add, or inject cannot route under concurrency.
- **`origin` = true birth-provenance.** A new session's entry is `uuid → token` (key ≠ value); an adopted
  external's entry is `token → token` (key == value). So `origin='aidx'` iff the token appears as a value
  under a key **≠ itself**:
  `aidxTokens = new Set(Object.entries(map).filter(([k,v]) => k !== v).map(([,v]) => v))`. Exactly "started
  by aidx"; never poisons on resume.

## 3. Integration: referencing discovered sessions

The foundation hides harness tokens behind client-minted ids. But the CWD session **list** is built from
transcript files, which are named by **harness** id — and includes sessions our client never minted
(terminal-CLI, `iterate`). So the selector is the one place harness ids are first-class (the foundation's
`SessionInfoCard` already displays them). Reconciliation:

- **A surface references a discovered session by its harness token directly.** When the user switches a
  surface to a listed session `T`, the surface sets its `sessionId` (the `aidx-session-id` header) to `T`.
- **Server seeds an unmapped, transcript-backed id as its own resume token.** Extend the foundation's
  `sessionFor(id)`: if `readSessions(previewId)[id]` is empty AND a transcript exists at
  `transcriptPath(cwd, id)`, seed `harnessSessionId = id`. So referencing `T` resumes `T` and
  `GET /history` (header = `T`) loads its transcript immediately — no new endpoint, no new our-id.
- **New sessions keep uuid minting** (foundation). After a new session's first turn mints a harness token,
  it appears in the list under that token; the uuid-keyed surface and the token-keyed list row denote the
  same conversation. To avoid a duplicate row, the list **unions/dedupes** the surface's resolved harness
  token (reported via the foundation's `onSessionLabel`) — a new session shows as one row once its token
  is known, and as the surface's own "New session" label before that.
- **No `AIDX_SESSION_EVENT`, no adoption loop, no turn-scoped client state** — the client already owns its
  id. (v2 §3 deleted.) Switching is a plain re-reference: set the header id, clear thread, hydrate history.

## 3a. Carry-over backend fixes (prerequisites — see §4.6)

The foundation introduces true concurrency; three things it leaves global must become turn/session-scoped
for correctness, independent of the selector UI: **uiBus channel** (turn-scoped + session-keyed inject),
**usage persistence** (key on the turn's own id), and **compact `sessionId`** plumbing. Detailed in §4.6.

## 4. Backend

### 4.1 Harness contract (`packages/protocol/src/harness-types.ts`)

Add to `HarnessHistory` (gated by `transcriptHistory`, so codex is type-excluded — verified via the
adapter union at `harness-types.ts:100-108`):

```ts
export type HarnessSessionMeta = { id: string; derivedTitle: string; updatedAt: number; messageCount: number }
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
  list(cwd: string): HarnessSessionMeta[] | Promise<HarnessSessionMeta[]>   // NEW (async-capable)
}
```

Extend `capability-matrix.test.ts` to assert `typeof adapter.history?.list === 'function'` for
transcript-capable adapters.

### 4.2 Claude impl (`packages/harness/src/claude/history.ts`) — perf-correct

Reading + fully parsing up to 50 multi-MB transcripts on every popover open / invalidate would stall the
event loop. Bound the cost:

1. `readdir` the encoded project dir; on **any** error (ENOENT, EACCES, …) return `[]` (never throw).
2. `await Promise.all(stat)` all `*.jsonl` (cheap) → sort `mtime` desc → **slice 50** → only then read.
3. `derivedTitle`: read just the **first user line** (stream / first ~16 KB), don't parse the whole file
   for a title. Trim, collapse whitespace, slice ~80 chars. Empty → `''`.
4. `messageCount`: needs a full parse; do it async with a small concurrency cap over the 50. Accept the
   cost but see 4.6 (no full-list invalidate on every turn-end).
5. Sidecar index is a deferred optimization — not built now.

### 4.3 Title store (`packages/core/src/store/session-titles-store.ts`)

`sessionId → title` map in `<stateRoot>/.aidx/session-titles.json`. Because titles are NOT gated by the
agent lock and multiple surfaces can rename, the read-modify-write race in the existing store pattern is
real here:

- **Atomic writes**: write to `*.tmp` + `rename` (atomic on same fs), or serialize writes through an
  in-process promise-chain mutex (one dev server owns the file → in-memory queue suffices, avoids the RMW
  race entirely). Use the mutex.
- `readTitle(stateRoot, id)`, `writeTitle(stateRoot, id, title)` (empty → delete entry).
- Malformed file reads as `{}`.

### 4.4 Routes (`packages/core/src/api/chat/session.ts`)

```
GET  /api/chat/sessions
POST /api/chat/sessions/title   { sessionId, title }   // POST, not PATCH (see below)
```

- **`POST`, not `PATCH`**: CORS (`cors.ts:6`) allows only `GET/POST/OPTIONS`; every mutating route is
  POST. A `PATCH` preflight would fail. Stay consistent.
- `GET /sessions`: if `!harness.capabilities.transcriptHistory || !harness.history` → `{sessions: []}`.
  Else `await harness.history.list(cwd)`, merge `readTitle` over `derivedTitle` → final `title`. Build the
  join from the foundation map `m = readSessions(stateRoot, previewId)` (`headerId → token`) once:
  - `headerIdsByToken`: invert `m` (token → the headerIds that resume it).
  - `usage`: for row token `T`, `readUsage(T) ?? readUsage(headerIdsByToken[T])` (live uuid-session usage is
    stored under the uuid headerId — §2b).
  - `running`: `readLocks(stateRoot)` keys are headerIds; `running = locks.has(T) || headerIdsByToken[T]?.some(h => locks.has(h))`.
  - `origin`: per §2b, `'aidx'` iff `T` appears in `m` under a key ≠ `T`
    (`Object.entries(m).some(([k,v]) => v === T && k !== T)`), else `'external'`.
  **Drop a server `current` flag** — it derived from the now-cold-start-only `state.sessionId` and would
  be misleading across panes; each selector marks its own `activeId()`.
  ```ts
  ChatSessionMeta = { id, title, updatedAt, messageCount, running, origin: 'aidx' | 'external', usage: UsageSnapshot | null }
  ChatSessions    = { sessions: ChatSessionMeta[] }
  ```
- `POST /sessions/title`: schema `{ sessionId: SessionId, title: z.string() }`, where the handler
  `.transform`s title — strip control chars `/[\u0000-\u001F\u007F-\u009F]/`, collapse whitespace, cap
  120. `writeTitle`; return `{ok:true, title}`.
- **Switch hydration reuses the foundation's header-based `GET /api/chat/history`** (the foundation moved
  it off the `?sessionId=` query onto the header). The selector sets the surface's header id, then hydrates.
- `sessionId` here (title key, list id) is the **harness token**.

### 4.5 `sessionId` validation (security — path traversal)

`sessionId` is interpolated raw into `transcriptPath`'s `join` (`history.ts:17`). Under the foundation it
arrives in the `aidx-session-id` header (client-minted uuid OR, for discovered sessions, a harness token),
and is a persisted map key. Lock it down:

- A shared `SessionId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)` schema (uuids and claude tokens pass).
- Validate the header value in the foundation's `sessionIdFromHeaders` helper and in the title POST body;
  reject → 400. The foundation already dropped `ChatRequestSchema.sessionId`, closing the body vector; the
  header is the new vector.
- Defense-in-depth: in `transcriptPath` consumers assert `resolve(path).startsWith(resolve(projectDir)+sep)`.

### 4.6 Carry-over concurrency fixes (foundation prerequisites)

The foundation enables parallel turns; these globals must become turn/session-scoped or the selector (and
the foundation) misbehave. Ideally folded into the foundation's Task 6; tracked here as blockers.

- **uiBus turn-scoped + keyed by header id** (`ui-bus.ts`): `run(headerId, events)` owns a local channel
  registered in `Map<headerId, Channel>`; two parallel turns no longer clobber. `inject(headerId, spec)` /
  `injectUsage(headerId, usage)` route by key; `inject` returns false when no live channel. The channel is
  keyed by the **header id** (§2b), the same id the agent echoes — NOT the harness token.
- **Agent must learn its header id (NEW spawn-path wiring)**: the spawned agent process has no session id
  in its env today, so `POST /api/chat/ui` arrives header-less and can't route. Inject the turn's header id
  into the child env as `AIDX_SESSION_ID` (this makes `spawnHarness`/child env per-turn, not per-engine — a
  real signature change to budget), and have the `aidx ui` CLI (`cli-http.ts`) set the `aidx-session-id`
  header from `process.env.AIDX_SESSION_ID`.
- **Usage keyed on the turn's HEADER id** (A18 correction): write `RUN_FINISHED` usage against the stable
  header id the turn was invoked with — do NOT re-key to the harness token in `onSessionId`. This keeps
  lock + uiBus + usage on one key; the list joins to it (§4.4).
- **Compact carries the header**: `compact()` (`chat-panel.tsx`) builds its own POST; it must include
  `api.sessionHeaders()` or it compacts the default session instead of the surface's.
- **Foundation Task 6 must NOT regress** the existing usage-write, `onUsage`/`injectUsage`, and
  `intent`/`turnKind`/compact-fallback logic in `turn.ts` (the 2026-06-15 plan's shown rewrite drops them).
  These carry-over fixes patch that logic — it must still exist.

### 4.7 New session

The foundation replaced the global `POST /session/new` reset with client-minted ids + per-session
`DELETE /session`. "+ New" = the surface mints a fresh uuid (modal clears to its default), `addDivider('new')`,
clears the thread; the next turn (header = new uuid) spawns fresh. No global reset.

### 4.8 List cache invalidation

Invalidate the shared list on: rename (optimistic + settle), a **debounced** turn-end (not per message),
pane add/close. The rendered list **unions the surface's resolved harness token** (from `onSessionLabel`)
so a just-born session appears before its file flushes / before a refetch lands.

### 4.9 Backward compatibility

Older core without `/sessions` → 404 → selector hidden. Distinguish **404 (unsupported → hide)** from
**5xx/timeout (error → Retry, keep trigger visible)** — not a bare `!res.ok`.

## 5. Frontend

### 5.1 Session identity (already owned by the surface, via the foundation)

The foundation makes the surface own its `sessionId` and pass it into `ChatPanel` (`PanelContext.sessionId`),
which sets the `aidx-session-id` header on every request/SSE. The selector reuses that — **switching is just
re-pointing the surface's `sessionId`**:

- The owner (`ModalLayout` / each qt pane) holds the surface's `sessionId` signal (the foundation already
  adds this for per-pane sessions). The `SessionSelector` calls `onSwitch(id)` → owner sets the signal.
- `ChatPanel` reacts to a `sessionId` change: `chat.stop()` (abort any in-flight SSE) → `clearMessages` →
  header-based `api.history()` → `setMessages` → set usage. A change equal to the loaded id is a no-op.
  Because the client owns the id (no stream-born id to adopt), there is **no feedback loop** — a `sessionId`
  change always means "the user re-pointed this surface," which is exactly a switch.
- The lazy first-activation `hydrate()` and a user switch must not double-`setMessages`: the switch path
  subsumes the initial hydrate (guard precedence; covered by a test).
- New session ("+ New"): owner mints a fresh uuid → `sessionId` change to an id with no transcript →
  `api.history()` returns `[]` → greeting + `addDivider('new')`.

### 5.2 `SessionSelector` component (`packages/widget/src/session-selector.tsx`)

Ark `Combobox`, two trigger **variants**:

- `variant: 'pill'` — modal header. Bordered pill like the model selector, but `min-width:0; flex:1 1 auto`
  with ellipsis on the title so it flexes in the tight header (the fixed "aidx"/spark brand stays; the
  *selector* is the flexible element, not the brand).
- `variant: 'bar'` — quick-terminal pane bar. **Borderless**, inherits the bar's 12px mono, uses the
  existing pane dot as the affordance + a tiny caret, no separate glyph/border. Below a pane-width
  breakpoint (container query / ResizeObserver on `.pw-qt-pane`) the `ContextTracker` collapses to
  ring-only (drop the % label) so the title gets room; the close X keeps `margin-left:auto`.

Popover content:
- **Header row** (always visible, in Tab order, outside the listbox): search `Input`, a
  **"Rename current session"** button (the locked rename UX — acts on `activeId`; disabled when the id is
  a not-yet-born fresh session), and a **"+ New session"** button. Each a real `<button>` with a unique,
  context-bearing `aria-label` (see §6). The Retry button (error state) and empty-state lines also live
  here, not as fake options.
- **List** = clean Ark `Combobox.Item`s grouped by recency (`Today`/`Yesterday`/`Earlier` via
  `Combobox.ItemGroupLabel`, like the model selector groups). Row: title (1 line, ellipsis, full text in
  `title` + `aria-label`), meta line ("Edited 2 hours ago · 14 messages" as an `aria-label`; the visible
  "·"/glyphs are `aria-hidden`), check indicator on the active row, a **`running` indicator** (small pulse
  dot) for sessions live in another pane, and an **origin marker** (§5.2a).
- **Origin marker (`origin: 'aidx' | 'external'`)** — distinguishes sessions aidx started from ones started
  in the terminal/externally. Show a subtle aidx glyph (the ✦ spark, `aria-hidden`) on `'aidx'` rows and
  nothing on `'external'` rows; the difference is also carried in each row's `aria-label`
  ("… · started in aidx" / "… · started externally") so it isn't color/glyph-only. Optionally group or sort
  aidx-first within a recency bucket is **out of scope** — recency order stays; the marker is the only cue.
  The `SessionInfoCard` (popover detail) also states the origin in words.
- **Rename** = inline edit in the header (not in a row): the "Rename current session" button swaps the
  header into a labeled `<input>` (`aria-label="Rename session"`), autofocus, Enter commits / Esc cancels —
  with `stopPropagation` on Enter/Esc so they don't bubble to the Combobox or the modal Esc/Tab trap.
  Commit dedupes Enter+blur (commit-once flag). Optimistic update with a pending-overlay that survives an
  interleaving list refetch; rollback + keep typed value on failure. Focus returns to the rename button.

Props:
```ts
{
  variant: 'pill' | 'bar'
  activeId: () => string | null
  busy: () => boolean        // THIS pane is mid-turn
  lockedElsewhere: (id: string) => boolean   // session running in another pane
  onSwitch: (id: string) => void
  onNew: () => void
  announce: (msg: string, assertive?: boolean) => void   // owner-provided live-region writer (§6)
}
```

### 5.3 Shared session-list store (`packages/widget/src/session-store-client.ts`)

Module-level reactive store, one fetch shared by all selectors:
- `sessions()`, `status(): 'idle'|'loading'|'ready'|'error'`, `error()`.
- `load(apiBase)` — fetch `/sessions`; dedupe in-flight; **404 → status `'ready'`, `sessions=[]`**
  (selectors hide); **5xx/timeout → `'error'`** (Retry, trigger stays).
- `invalidate()` — refetch; called on `AIDX_SESSION_EVENT` and debounced turn-end (4.6).
- `applyTitle(id, title)` — optimistic patch that wins over a fetched value until the POST settles.
- Recency buckets + relative times are **derived/recomputed reactively**, not snapshotted at popover open,
  so an open popover re-buckets when `updatedAt` changes.

### 5.4 ChatPanel switching state

- `switching` signal. On a real switch: `chat.stop()` (abort any in-flight SSE) → enter switching →
  `clearMessages` → `history(id)` → `setMessages` → set usage from cached meta → set `loadedSessionId` →
  exit. Switch to already-loaded id is a no-op.
- The log shows a `pw-chat-switching` overlay with `role="status"` `aria-label="Loading session…"`; the
  composer is disabled, but focus is moved to a safe in-dialog target (the overlay `tabindex=-1`, or the
  trigger) so it isn't orphaned to `document.body`.
- Switch is blocked while THIS pane is `busy()` (defense-in-depth; primary gate is per-session lock + the
  cross-pane `lockedElsewhere` row state).

### 5.5 Exhaustive state matrix

**Loading**
- *Initial list*: skeleton rows (`pw-session-skel`); popover content `aria-busy`, `role="status"`
  "Loading sessions…". No skeleton flash when the store is already `ready`.
- *Switching thread*: overlay + disabled composer (5.4); announce start (polite) and completion.
- *Rename in-flight*: header input `aria-busy`; optimistic title already shown.
- *New session*: instant (local clear + divider); real id arrives via the stream — no spinner.

**Empty**
- *Harness unsupported / 404*: `sessions=[]` → selector renders nothing.
- *Only the current session*: trigger still shows (rename + "+ New" reachable); list shows
  `pw-session-empty` `role="status"` "No other sessions yet".
- *Search yields nothing*: `role="status"` "No sessions match"; header (rename/new) stays.

**Error**
- *List fetch (5xx/timeout)*: `pw-session-error` row + Retry (calls `load`); trigger keeps last title or
  "New session".
- *Switch history fetch fails*: keep the CURRENT thread (don't clear), revert `activeId`/`loadedSessionId`,
  inline `pw-chat-error` "Couldn't load that session" + Retry, announce **assertively**.
- *Rename POST fails*: roll back optimistic title, keep the input open with an error hint + typed value.
- *New-session turn fails*: existing `chat.error()` + Retry covers it; divider stays.
- *Send 409 'session busy' (this session running elsewhere)*: distinct inline state "Busy in another pane",
  NOT a raw `chat.error()`; offer Retry once free. Rows for live-elsewhere sessions show the `running` dot
  and disable *switch-then-send* expectations (switching to read is allowed).
- *Session vanished on disk between list and switch*: `history(id)` `[]` → treat as empty valid session
  (greeting) and `invalidate()`. Note: `GET /history` also returns `[]` when unsupported — acknowledged
  ambiguity; benign since the selector is hidden when unsupported.
- *Active session deleted by an external run while idle*: next turn's resume target is gone → harness
  spawns fresh, fires `AIDX_SESSION_EVENT` with the new id; drop the stale row on next invalidate; announce.

**Disabled**
- Trigger uses `aria-disabled` + stays focusable (do NOT set the `disabled` attribute — the modal focus
  trap filters `[disabled]` out, `widget-shell.tsx:188`, which would hide the "why" from keyboard/SR).
  Block activation in the handler. Reason via an Ark Tooltip / `aria-describedby`, not bare `title`.
- "Rename current session" disabled when `activeId` is a not-yet-born fresh session.
- "+ New session" disabled while `busy()`; double-click guarded to a no-op when already `null` + empty.
- Active row is non-selectable for *switch* (check shown); rows live elsewhere are switch-to-browse only.

**Animations** (see §7)

### 5.6 Placement & wiring

- **Modal** (`widget-shell.tsx` `ModalLayout`): the foundation already gives the modal a session label +
  info popover in `pw-chat-head`. This feature **replaces that static label with `<SessionSelector
  variant="pill">`** as the flexible header element (brand stays fixed). The selector subsumes the
  foundation's `SessionInfoCard` (its details become a row/expander in the popover). Owner holds the
  surface `sessionId` (foundation), provides `onSwitch`/`onNew`/`announce`.
- **Quick-terminal** (`quick-terminal.tsx`): the foundation already replaced `session-{pane.id}` with the
  per-pane label + popover; this feature **swaps that for `<SessionSelector variant="bar">`** per pane.
  Wire the pane's working signal into `busy` (the foundation leaves `onWorkingChange` a no-op there).
- **PiP**: relocates the existing DOM — selector comes along for free.

## 6. Accessibility (review-resolved)

- **No nested interactive controls inside `role="option"`**: rename + "+ New" + Retry live in the popover
  **header**, always rendered and in Tab order (resolves the hover-only-pencil blocker).
- **Per-instance accessible names**: each selector's trigger names its surface/session
  (`aria-label={"Session: " + title}` or `"Select session — pane N"`); rename names the target. Pass a
  unique `ids` prefix into each `Combobox.Root` and assert no collision in the IT (multiple instances
  under one shadow root must not share `aria-controls`/`activedescendant`).
- **Live region ownership**: add ONE shell-level polite + assertive live region **outside any pane**
  (never inside an `inert`/closed qt sheet). The owner passes `announce()` to the selector. Switch start =
  polite, switch error = assertive. ChatPanel keeps its own region for panel-originated status.
- **Focus**: define every close path — switch → composer; "+ New" → composer; Esc/cancel → trigger; rename
  commit/cancel → rename button. Verify the Ark popover (`strategy:'fixed'`) portals **inside** `panelEl`
  (so the modal focus trap includes search/rows/rename input and Tab can't escape the dialog); if Ark
  portals to `document.body`, pass a container into the shadow-root subtree. IT: Tab through
  trigger→search→rename→rows and assert focus never leaves the dialog.
- **Rename input** `stopPropagation` on Enter/Esc (so they don't trip the Combobox select / modal
  Esc-close / Tab-trap). Announce rename outcome ("Renamed to X" / "Rename failed, reverted").
- **Switching overlay** `role="status"`; don't disable the composer out from under focus.
- **Meta line** carries an absolute-time `aria-label`; glyphs/"·" `aria-hidden`.
- Disabled cue is not color-only (pair grey with the tooltip + a glyph; keep disabled text ≥ contrast).
- Touch targets ≥ 44px for trigger, rows, header buttons, caret.

## 7. Animation (review-resolved)

- **Popover motion parity**: the model selector currently **hard-cuts** (`.pw-model-content` has no
  transition; `[hidden]` removes it instantly). Decision: **add a shared `[data-state=open/closed]`
  entrance (opacity + 4px translateY, ~120ms `var(--pw-ease)`) to BOTH** via a common `pw-combo-content`
  class, so the two composer-area popovers stay consistent. This requires relaxing the `[hidden]`-removes
  rule so the closing frame can play (gate unmount on Ark's `data-state`), called out as real wiring.
- **Switch crossfade**: suppress `pw-chat-msg-in` on hydrated rows (add `pw-chat-hydrating` on the log →
  `.pw-chat-msg{animation:none}` for that paint) so a restored 20-message thread doesn't re-animate every
  row under the fade. Only the container crossfades: ~120ms out / overlay / ~120ms in.
- **Skeleton**: a NEW `pw-session-skel` gradient sweep (1.2s linear) — the existing `pw-chat-shimmer` is a
  text-clip effect and is not reusable as a block skeleton.
- **Tokens**: use `var(--pw-ease)` and the established 120/160ms cadence; row hover matches the model
  selector (instant / no bespoke 80ms).
- **Reduced motion**: the `@media (prefers-reduced-motion: reduce)` block enumerates classes explicitly —
  add each new one by name (`pw-session-skel`, `pw-combo-content`/popover, `pw-chat-switching`, rename
  swap). Spinners follow the existing **substitute-a-gentle-pulse** convention (`pw-compact-pulse`), not a
  bare `animation:none`.
- **Layout**: `bar` variant (5.2) is the load-bearing fix — a 28px bordered pill does not fit the ~110–130px
  pane bar; the borderless dot+title+caret variant + tracker-collapse does.

## 8. Persistence

- Custom titles → `.aidx/session-titles.json` (atomic, 4.3).
- Modal active session restores via the `previewId` map (cold-start hint only).
- Quick-terminal pane active sessions are ephemeral (matches today's fresh-per-pane); qt focus-index
  persistence unchanged.

## 9. Testing (no jsdom; real browser via Playwright; `newPage()` not `newContext()`)

- **Harness unit**: `claudeHistory.list(cwd)` vs a fixture project dir — ids/titles/counts, mtime-desc,
  50-cap (only top-50 read), missing dir → `[]`, EACCES → `[]`, unparseable file skipped, first-line title.
- **Lock unit** (foundation): per-session acquire/release; same-id chat vs iterate exclude; different ids
  concurrent; dead-pid sweep. Add a `readLocks` enumerator test here.
- **Core route**: `GET /sessions` merges title + usage + `running` + `origin` (a token in the session-store
  map → `'aidx'`, one only on disk → `'external'`); `[]` when unsupported; `sessionFor`
  seeds an unmapped transcript-backed id; `POST /sessions/title` validation (control-char strip, 120 cap,
  bad `sessionId` → 400, malformed store survives); header `sessionId` charset rejection.
- **Carry-over (§4.6) unit**: usage keyed on the turn's id under two interleaved turns (no cross-write);
  compact carries the header; two concurrent uiBus `run()`s don't cross-deliver; `inject(sessionId)` routes
  correctly; 404 when no live channel.
- **Widget IT** (Playwright, `newPage()`): modal — list/switch(hydrate)/+New(reset)/rename(persist across
  reload); a qt pane switch doesn't affect a sibling; two panes on different sessions both stream;
  send-while-session-busy-elsewhere shows the distinct state; list-error Retry; empty state; Tab focus
  never escapes the dialog; reduced-motion.

## 10. Files touched

**Provided by the foundation (this feature consumes, does not re-create):** `store/lock.ts` (per-session
keys), `api/chat/{chat,session,turn}.ts` (header-scoped session map), `store/session-store.ts` (reshape),
`api/chat/session-id.ts`, `chat-api.ts` (header transport), `popover.tsx`, `session-info.tsx`,
`claude/history.ts` (`nameFromTranscript`), `quick-terminal.tsx` + `widget-shell.tsx` (per-pane id + label).

**This feature:**
- Protocol: `harness-types.ts` (`HarnessSessionMeta`, `list`), `chat-types.ts` (`ChatSessionMeta`,
  `ChatSessions`, `SessionId`, title body schema).
- Harness: `claude/history.ts` (`list` + tests).
- Core: `store/session-titles-store.ts` (NEW, atomic), `store/lock.ts` (`readLocks` enumerator for the
  `running` flag), `api/chat/session.ts` (`GET /sessions`, `POST /sessions/title`, `sessionFor` seeds an
  unmapped transcript-backed id, charset validation in `sessionIdFromHeaders`).
- Widget: `session-selector.tsx` (NEW), `session-store-client.ts` (NEW shared cache),
  `widget-shell.tsx` + `quick-terminal.tsx` (swap the foundation label for the selector; shell live region;
  `busy` wiring), `chat-panel.tsx` (switch → stop/clear/hydrate; subsume initial hydrate),
  `chat-api.ts` (`sessions()`, `renameSession()`), widget CSS (`pw-session-*`, `pw-combo-content`).

**Carry-over fixes (§4.6) ideally land in the foundation:** `runtime/ui-bus.ts` (turn-scoped + session
registry), `api/chat/ui` inject (route by `sessionId`), `turn.ts`/`compact()` (header + usage id).

## 11. Open risks / deferred

- **Sequencing**: the foundation (2026-06-15) must land first, or be merged into one plan with this as the
  upper tasks. This spec is incoherent without it.
- **Foundation carry-over fixes (§4.6)** are correctness blockers under true concurrency; whoever lands the
  foundation should include them. The cross-process `aidx ui` inject needs the agent to send its
  `sessionId` — verify the CLI has it (it runs inside the harness process, which knows it).
- **Discovered-session identity**: referencing by harness token (§3) breaks the foundation's "client never
  sees harness tokens" abstraction — intentional, since the selector surfaces them. Validate the seed rule
  (`sessionFor` adopting an unmapped transcript id) doesn't let a bogus header id resume an arbitrary file
  (charset + project-dir containment, §4.5).
- **50-file parse** bounded (stat→sort→read top 50, first-line title) but still a cost on huge dirs; sidecar
  index deferred.
- **`encodeProjectDir` collisions** (`/a/b` vs `/a-b`) inherited from Claude's scheme — left for parity.
- **Open-in-terminal** via the new adapter `launch({cwd, sessionId})` is a natural follow-up — out of scope.
