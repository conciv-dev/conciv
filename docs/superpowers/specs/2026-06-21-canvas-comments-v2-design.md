# Canvas + Source-Anchored Comments — Design (v2, clean rebuild)

Status: design. Worktree `worktree-canvas-comments`, reset clean to `origin/main`. Supersedes
`2026-06-20-canvas-comments-design.md` (the prior attempt's code was spike-quality and discarded;
its analysis is carried forward here). The discarded implementation is preserved in the
`slop-archive` git tag for reference, not reuse.

## Goal

A transparent, infinite Excalidraw canvas layered over the app during development. The user and the
AI collaborate on it as equals: draw, diagram, and leave **comments** that persist and that both read
later. Comments pin to a page element and **anchor to the source line that rendered it**, with a
git-like content hash that keeps the reference correct as code changes. Everything is local-first and
exposed identically to the AI (MCP), the user (UI), and the CLI.

## What changed from the prior attempt (why v2)

The prior attempt was vibe-coded and dumped every subsystem into `packages/core/src/` as a hardcoded
"built-in", bolting ad-hoc seams onto the extension contract. That inverted the architecture. The
correction, decided with the user:

1. **canvas-comments is a real extension, not a core built-in.** It is discovered and loaded like any
   other extension. It does not live in `core`.
2. **Core hosts two generic, reusable services and exposes them on `ServerApi`.** The extension wields
   them. Core contains zero canvas/comment-specific logic.
   - **`mx.sync`** — a CRDT room engine, Yjs-backed today, swappable later. Powers the canvas.
   - **`mx.db`** — a live, optimistic collection service: core supervises the `trail` binary as sole
     client, the browser gets a reactive TanStack DB collection synced through core. Powers comments.
3. **Two sync stories on purpose.** Canvas geometry needs true CRDT merge (Yjs). Comments are rows
   that need realtime + optimistic writes + FTS + instant agent replies (TrailBase + TanStack DB).
4. **One durable store: TrailBase (SQLite).** `trail` is a Rust HTTP server over a single SQLite DB
   in its `--data-dir` (`<cwd>/.mandarax/trail/`). All durable data lives there: comment rows + FTS5,
   **and** the canvas `.ybin` snapshot as a BLOB row. No second persistence mechanism (no unstorage
   fs for the canvas). Verified present: `trail v0.22.9`. The prior attempt deviated to `node:sqlite`;
   v2 uses the real binary.
5. **No vendoring, no `y-excalidraw`.** Our own ~40-line plain-TS Yjs↔Excalidraw glue against
   Excalidraw's official `onChange`/`updateScene`. (Carried over; it is the one proven finding.)
6. **Clean TDD rebuild.** Every phase a real vertical slice, real browser / real `trail` / real Yjs /
   real git, no mocks, committed clean.

## Principles (carried forward)

1. **Local-first, on the user's disk.** Durable artifacts under `<cwd>/.mandarax/`, owned by local
   processes. The browser stays instantly responsive via an optimistic local cache; durable sync is
   background. Never the cloud.
2. **AI and user reach the same capabilities — mutations symmetric, a few asymmetries by design:**
   (a) input modality (user mouse-picks; AI references by file/component), (b) viewport (zoom/pan is
   viewer-local, not shared state), (c) approval authority (only the human answers approvals).
3. **Swappable seams.** `mx.sync`'s CRDT backend, `mx.db`'s store, the `AnchorResolver`, and the
   harness are capability-typed adapters; each replaceable without touching the surfaces.
4. **Thin layer over tested code.** Tool `execute` is a dumb adapter; behavior is plain, tested code.

## Architecture

```
USER'S MACHINE (all local, 127.0.0.1)
┌────────────────────────────────────────────────────────────────────────────┐
│ mandarax core (Node) — the ONLY process the browser talks to                 │
│                                                                              │
│  CORE-OWNED SERVICES (generic, exposed on ServerApi, opt-in for any ext)     │
│   • mx.db   — live collection service: supervises `trail` (sole client,      │
│               SQLite in .mandarax/trail/), gated SSE fan-out + mutation routes│
│   • mx.sync — Yjs room engine: snapshot persisted as a trail BLOB row         │
│               + gated relay route (origin + host-loopback + per-session tok) │
│   • event bus (session_start / tool_execution_start) · approval policy gate  │
│                                                                              │
│  EXTENSIONS (discovered/loaded; canvas-comments is one of them)              │
│   • declares its `comments` collection on mx.db, canvas room on mx.sync      │
│   • owns: overlay Effect, pins/threads UI, AnchorResolver, doctor, tools     │
│                                                                              │
│        │ gated relay (SSE+POST)    │ gated SSE+POST      │ /api/mcp          │
│ ┌──────┴───────────────┐   ┌───────┴──────────┐   ┌──────┴───────────────┐  │
│ │ BROWSER WIDGET (Solid)│   │ TrailBase (binary)│   │ harness (Node AI)    │  │
│ │  Excalidraw React     │   │  SQLite main.db   │   │ draws via mx.sync ·  │  │
│ │   island (only React) │◄─►│  127.0.0.1 only,  │   │ comments via mx.db · │  │
│ │  Solid pins/threads,  │   │  reachable only   │   │ tools via /api/mcp   │  │
│ │  TanStack DB (solid)  │   │  by core          │   └──────────────────────┘  │
│ └───────────────────────┘   └──────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

Two sync paths, both fronted by core (the browser never talks to a backend directly):

- **`mx.sync` (Yjs)** for the live canvas (drawings, pins, cursors), over core's gated relay.
- **`mx.db` (TanStack DB ↔ core ↔ TrailBase)** for comments. Instant optimistic local reads/writes;
  realtime fan-out and durable sync through core's gated endpoints; core is the sole TrailBase client.

## Core service 1 — `mx.sync` (Yjs room engine)

Core owns the CRDT. Yjs is hidden behind the interface so the backend can change later.

```ts
// On ServerApi — core-owned, exposed to extensions
type SyncEngine = {
  room(roomId: string): SyncRoom
}
type SyncRoom = {
  doc: Y.Doc // the authoritative doc (core-side)
  observe(cb: (update: Uint8Array, origin: unknown) => void): () => void
  apply(update: Uint8Array, origin: unknown): void
  snapshot(): Uint8Array // Y.encodeStateAsUpdate, for export/debug
}

// The swappable persistence seam: Yjs stays unaware of where its snapshot lands.
type SnapshotStore = {
  load(room: string): Promise<Uint8Array | null>
  save(room: string, ybin: Uint8Array): Promise<void> // debounced by the engine
}
```

- One room per session, id `${previewId}:${sessionId}`. The engine persists `Y.encodeStateAsUpdate`
  (debounced) through the `SnapshotStore` seam and rehydrates on boot under a `core-rehydrate` origin
  so load never re-broadcasts.
- **`SnapshotStore` is backed by TrailBase** in core: a `canvas_snapshots(room TEXT pk, ybin BLOB,
updated_at)` table written by core (the sole `trail` client). Yjs never sees trail; the seam keeps
  the backend swappable. While `trail` is mid-restart, snapshotting pauses; the live doc + browser
  `y-indexeddb` cache cover the gap and reconcile on restart.
- Core serves the **gated relay route** from its `api/` layer (origin allowlist + host-loopback +
  per-session token). The widget connects through a core-provided relay client.
- **Three writers** (user, AI/harness, extra tab) into one doc. Feedback-loop guard uses a
  per-transaction Yjs **origin tag** (`'user' | 'ai' | 'remote' | 'core-rehydrate' | 'excalidraw'`):
  the Excalidraw→Yjs outbound writer fires only for `user`; inbound `updateScene` applies non-user
  origins with `captureUpdate: NEVER` (keeps remote/AI edits out of the local undo stack).
- The browser binds the doc to Excalidraw via **our own plain-TS glue** (no `y-excalidraw`);
  `y-indexeddb` is an offline cache only.

## Core service 2 — `mx.db` (live collection service)

Core supervises `trail` and is its sole client. The browser gets a reactive, optimistic TanStack DB
collection that syncs through core. Generic enough that any extension can declare a collection.

```ts
// On ServerApi — core-owned. Extension declares a collection by schema + migration.
type LiveDb = {
  collection<T>(
    name: string,
    opts: {
      schema: z.ZodType<T>
      migration: string // SQL run on core boot (TrailBase migrations)
      fts?: string[] // columns to index in FTS5
    },
  ): ServerCollection<T>
  // Introspection — the storage layer is SHARED and discoverable. Any extension can see which
  // collections exist, their JSON Schema, table name, and FTS columns. Matches the self-describe
  // model: collections carry their own metadata, discovered at runtime (no central catalog).
  list(): CollectionInfo[]
  get(name: string): ServerCollection<unknown> | null // reach another extension's collection
}
type CollectionInfo = {name: string; table: string; schema: object /* JSON Schema */; fts: string[]}
type ServerCollection<T> = {
  query(filter?: Partial<T> & {search?: string}): Promise<T[]>
  insert(row: T): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
}
```

**Shared + introspectable.** `mx.db` is one store shared by all extensions, not a per-extension silo.
`mx.db.list()` returns every declared collection's name, table, JSON Schema, and FTS columns;
`mx.db.get(name)` reaches another extension's collection. A built-in `mandarax_db catalog`-style tool
surfaces the same to the AI, so the agent knows what tables/schemas are queryable. Collection names
are globally unique; declaring an existing name with a matching schema is idempotent (returns the same
handle), with a mismatched schema is a clear error (no silent clobber).

**Contracts characterized before use (zero unknowns).** Before any `mx.db` wiring, three contracts are
pinned down by throwaway spikes against the real packages/binary, each committing a notes doc: (1) the
`trail` Record API + realtime SSE + auth/ACL contract; (2) the `@tanstack/db` core custom-collection
adapter (`SyncConfig` callback signature: `begin`/`write`/`commit`/`markReady`, `getKey`, schema
validation, `createCollection` return methods, transaction `mutationFn`/`isPersisted`); (3) the
`@tanstack/solid-db` `useLiveQuery` contract (the docs are inconsistent — resolve whether it returns
`{data, isLoading()}` or a call-accessor — in a real browser). No `mx.db` code is written against an
unverified signature.

- **Server half (core):** TrailBase supervisor (spawn + restart, bound `127.0.0.1`), sole client (the
  `trail` HTTP Record API), migrations on boot, a **gated SSE** route driven by TrailBase's realtime
  subscription (fan-out), and **gated mutation** routes.
- **Client half (widget):** a `@tanstack/db` collection whose **custom sync adapter** opens the core
  SSE (`sync: { sync: ({begin, write, commit, markReady}) => … }`) for live updates and whose
  `onInsert/onUpdate/onDelete` POST to core's gated mutation routes. Solid reads it via
  `@tanstack/solid-db`'s `useLiveQuery`. Optimistic writes apply instantly; rollback on failure;
  upsert-by-pk collapses the optimistic + sync echo.
- **Browser never touches `trail` directly.** All sync is browser ↔ core ↔ TrailBase.
- **Degraded mode:** `trail` down → the browser keeps reading/writing its local TanStack DB; mutations
  queue and reconcile on reconnect.

### Cold start

core spawns `trail` → waits ready → runs migrations → opens the gated SSE+mutation routes → browser
syncs. Because the canvas snapshot is also a trail BLOB, `mx.sync` rehydrates after trail is ready;
until then the room starts empty and the browser `y-indexeddb` cache seeds it. Nothing blocks the
widget mounting (services fail gracefully into local-only).

## Contract seams added to the extension system (generic, help every extension)

The merged `@mandarax/extensions` `ServerApi` is `{registerTool, systemPrompt}`. v2 grows it minimally:

```ts
type ServerApi = {
  registerTool: (tool: ToolDefinition) => void
  systemPrompt: {append: (text: string) => void}
  sync: SyncEngine // NEW (core service 1)
  db: LiveDb // NEW (core service 2)
  on: (event: 'session_start' | 'tool_execution_start', handler: () => void) => void // NEW
  approval: (tool: string, policy: 'auto' | 'ask') => void // NEW
}
type ComposerActionCtx = {
  insert: (text: string) => void
  notify: (message: string) => void
  runTool: (name: string, input: unknown) => Promise<unknown> // NEW
}
```

These are generic capabilities, not canvas/comment-specific. A future presence/cursors/collab
extension can use `mx.sync`; any extension wanting durable realtime rows can use `mx.db`.

## The commentId join — one core-side write owns both stores

A source-linked comment spans two stores (a TrailBase row + a Yjs pin). To avoid orphans/races:

- **`commentId` is a client-generated UUID accepted verbatim** by core — never a temp→real swap (a
  swap would break the Yjs pin's captured id).
- **`comment.create` and `comment.delete` are single executes that write/remove BOTH** the `mx.db` row
  and the `mx.sync` pin (core owns the authoritative Yjs doc). The browser's optimistic path uses the
  same UUID for both its TanStack DB row and its local pin.
- **The row is the source of truth for "a comment exists";** the Yjs pin is pure geometry
  (`{commentId, x, y, elementId, pinState}`) keyed by it.
- **Doctor reconciles:** pin with no row → drop pin; row with no pin → re-materialize from
  `anchor.visual` or mark `orphaned`.

## The overlay (a React island in the Solid widget)

The widget is **Solid**; Excalidraw is **React-only**. The canvas is a **React island**: one React
root hosting `<Excalidraw>` bound to the Yjs doc via our glue, mounted into the Solid widget's shadow
root, bridged to Solid via the shell store (toggle, active session, mode). The overlay is registered
as an **Effect** (`defineEffect`) — a toggleable Solid page overlay; the React island mounts inside
its `render(ctx)`. Comment **pins and threads stay Solid** (Solid `tool-ui` renderers); only the
Excalidraw surface is React.

- **Transparent, infinite canvas:** `viewBackgroundColor: transparent`, zen mode hides chrome,
  `pointer-events` flips `none`↔`auto` (idle↔active).
- **Our own zoom controls:** in / out / reset-100% / zoom-to-fit. The comment list doubles as nav.
- **AI as collaborator:** the agent gets an entry in Excalidraw's `collaborators` map (named cursor).
  AI canvas writes emit a skeleton or Mermaid, never raw elements →
  `convertToExcalidrawElements` / `parseMermaidToExcalidraw` → `updateScene({captureUpdate: NEVER})`,
  granular id-keyed ops, never a full-scene overwrite.
- **Packaging:** the React+Excalidraw island (~1MB) lazy-loads behind the composer toggle, never in
  the initial bundle. Proven findings to apply: `resolve.dedupe(['react','react-dom'])`;
  `define` `process.env.NODE_ENV='production'` + `IS_PREACT='false'`; inject
  `@excalidraw/excalidraw/index.css?inline` into the shadow root; Excalidraw 0.18.x + React 19.2 work.

## Comments

### Kinds

- **Source-linked** — pinned onto a DOM element and anchored to its source line. Shows a `file:line`
  badge.
- **Floating** — placed on empty canvas, canvas coords only, no element/source.

### Two coordinates for a source-linked pin (orthogonal, both resolved every sweep)

A pin sits on _one rendered DOM instance_, but source resolves to _one JSX location_ that may render N
instances. Both must be answered:

- **Source anchor** — `file:line:col` + normalized AST-subtree hash + ancestor-path salt + component +
  git SHA + snippet. Drives the badge, doctor, and AI `element.reference`. (One per JSX location.)
- **Instance anchor** — fiber/selector path + React key + visual rect. Drives _which rendered element_
  gets the pin. (One per DOM instance.)

Requires the react-grab adapter to expose `getElementContext()` (`columnNumber`, `fiber`, `selector`,
frame `stack`), not just `getSource()`. Without the column, a JSX node on a shared line is ambiguous.
In a repeated list, instance identity degrades to position+rect heuristics — when ambiguous, **flag
`drifted`, never silently re-pin**.

### Pin state lives with geometry (Yjs), not the row

`pinState: 'locked' | 'offset'` is geometric → lives on the **Yjs pin**. A `locked` pin derives its
screen position from the element rect; an `offset` pin floats with a faint **tether line**. Pin
appearance is a pure function of `row.status` + Yjs geometry; no second write.

### Drag rule

Dragging a source-linked pin prompts: **Disconnect** (→ floating, source dropped) · **Keep link,
accept drift** (→ source-linked at custom offset, tether drawn) · **Cancel** (snaps back). Floating
pins drag freely. AI equivalent: **`comment.move` / `pin.setState`**.

### Two drifts (independent axes)

- **Pin drift** — user dragged the pin off its element (`pinState: offset`).
- **Source drift** — code changed under the source anchor; doctor flags `status: drifted` + diff.

They can coexist; source-drift resolution **never silently re-snaps a user offset**.

### Authorship, status, threads, parts

- `author_kind: 'ai' | 'human'` always visible (AI carries its model).
- `status: open | resolved | drifted | orphaned`.
- Every comment is a thread (replies nested via `parent_id`).
- A comment/reply carries **`parts[]`** (text + tool parts, the tanstack shape) rendered by the
  existing Solid **`tool-ui`** pipeline (by `part.name`; read `part.arguments`, since `part.input` is
  often empty). AI replies can render tool cards inline; approvals render in-thread.
- **Streaming:** stream reply content over the existing **`ui-bus` SSE** (not Yjs awareness — that is
  ephemeral and wrong for durable content). Insert the row on first token with a streaming status,
  patch `parts` optimistically; `mx.db` fans out. Route a turn's UI into a thread by **tagging the
  part envelope with `commentId`** (keep one-turn-per-session + the single channel; no per-thread
  channels). Awareness carries only the ephemeral "AI is typing/drawing here" cursor.

### Comment record (TrailBase, declared via `mx.db.collection`)

```
comments
  id            TEXT pk        -- client-gen UUID = commentId; joins the Yjs pin
  preview_id    TEXT idx
  session_id    TEXT idx
  thread_id     TEXT idx
  parent_id     TEXT
  parts         JSON           -- text + tool parts → tool-ui renders
  author_kind   TEXT           -- 'human' | 'ai'  (+ author_model)
  status        TEXT idx       -- 'open' | 'resolved' | 'drifted' | 'orphaned'
  kind          TEXT           -- 'source-linked' | 'floating'
  anchor        JSON           -- OPAQUE: resolver's full anchor (source + instance + visual)
  anchor_file   TEXT idx       -- promoted → "comments on file X"
  anchor_component TEXT        -- promoted
  anchor_hash   TEXT           -- promoted (AST-subtree hash)
  last_resolved_commit TEXT    -- doctor incrementality
  last_resolved_file_hash TEXT -- doctor incrementality (uncommitted/same-second edits)
  created_at / updated_at / resolved_at / resolved_by
  + comments_fts (FTS5 over parts text)
```

Pin geometry (`x, y, elementId, pinState`) lives in the Yjs pin, not here.

## Source anchoring

### Layered authority

Resolve source drift in order, never silently wrong: **AST content-hash (primary) → git line-tracking
(commit-granularity fallback) → DOM/visual (placement + last resort)**. Instance placement resolves
_in parallel_, not as a fallback.

### Capture (core-side; it has fs + git + a parser)

From `getElementContext()`: the **source anchor** (parse the JSX node at `file:line:col` via
oxc/babel → normalized AST-subtree hash + ancestor-path salt so identical leaves under different
parents differ + component + git SHA + snippet) and the **instance anchor** (fiber/selector +
React key + rect).

### Resolve (on load / doctor)

1. Re-hash at stored `file:line:col` against the **working tree**. Match → `fresh`.
2. Mismatch → search the file for the hash. Exactly one match → `moved` (re-anchor). >1 → tie-break by
   nearest line + instance agreement; still ambiguous → `drifted`/`ambiguous`, surface candidates,
   never auto-pick.
3. Working-tree miss + file committed-clean → git maps the old commit's line into the tree
   (commit-granularity only; no-ops for uncommitted edits — the content-hash is the dev-loop
   workhorse).
4. All fail → DOM/visual fallback for placement; flag `drifted` (with diff) or `orphaned`.

### The `AnchorResolver` seam (swappable, extension-owned)

```ts
type AnchorResolver = {
  capture(target: PickedTarget): Promise<Anchor>
  resolve(anchor: Anchor): Promise<{
    status: 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
    anchor?: Anchor
    dom?: {selector: string; rect: Rect; instanceKey?: string}
    candidates?: Anchor[]
    diff?: {before: string; after: string}
  }>
  reanchor(anchor: Anchor, target: PickedTarget): Promise<Anchor>
}
```

Default impl is React/TSX-specific (oxc/babel + git, project-root-confined, secret denylist). The
store promotes only `anchor_file/component/hash`; the rest is opaque, so swapping the resolver changes
only the blob + promoted columns. Pin drift is UI-composed state, out of the resolver's scope.

## Doctor

`mandarax doctor` (a `packages/cli` command) + an auto-run on `mx.on('session_start', …)`.

- Sweeps comments; per comment runs `resolver.resolve()`. `fresh`→no-op · `moved`→re-anchor, keep
  `open` · `drifted`/`ambiguous`→flag + diff/candidates · `orphaned`→mark. **Skips `floating`**.
- **Incremental & content-addressed:** re-resolve when `current_commit != last_resolved_commit` OR
  `current_file_hash != last_resolved_file_hash`; mtime is a fast pre-filter.
- Reconciles the commentId join. Idempotent; manual + CI invocable. Prints
  `N fresh · M re-anchored · K drifted (review) · J orphaned`.

## Capabilities (the extension's tools)

Authored with the real contract: `defineExtension({id, tools}).client(mx=>…).server(mx=>…)` and
`defineTool({name, description, parameters, execute, renderCall?, renderResult?, promptSnippet?,
promptGuidelines?})`.

```ts
const commentCreate = defineTool({
  name: 'comment.create',
  description: 'Pin a comment on an element or canvas point, anchored to source.',
  parameters: z.object({parts: PartsSchema, anchor: AnchorInput, pin: PinSchema.optional()}),
  execute: (input) => comments.create(input), // writes row (mx.db) + Yjs pin (mx.sync)
})

export default defineExtension({id: 'canvas-comments', tools: [commentCreate /* … */]})
  .server((mx) => {
    const comments = mx.db.collection('comments', {schema: CommentSchema, migration, fts: ['parts']})
    const canvas = mx.sync.room(roomId)
    mx.approval('comment.delete', 'ask')
    mx.approval('canvas.clear', 'ask')
    mx.on('session_start', () => doctor.run())
  })
  .client((mx) => {
    mx.ui.setEmptyState(/* self-deleting onboarding sketch */)
    mx.registerComposerAction({
      id: 'comment',
      label: 'Comment',
      icon: MessageSquare,
      onClick: (c) => c.runTool('comment.create' /* from react-grab pick */),
    })
  })
```

### Capability set

```
canvas.read · canvas.draw · canvas.connect · canvas.diagram(mermaid) · canvas.export
            · canvas.update · canvas.delete[ask] · canvas.clear[ask]
comment.create · comment.list(session|all) · comment.read · comment.reply
            · comment.resolve[ask] · comment.delete[ask] · comment.reanchor · comment.move/pin.setState
element.pick (user mouse, react-grab) · element.reference (AI by file/component, project-root-confined)
anchor.resolve · doctor.run · session.switch · history.undo · history.redo
```

Asymmetries by design: input modality (pick vs reference), viewport (viewer-local, no capability),
approval authority (human-only).

### Approval — enforced in the shared core execute, NOT a per-surface hook

Every path (AI `/api/mcp`, user UI `runTool`, CLI) funnels through the **same core-side `execute`**.
Approval is enforced there, generalizing `permission.ts` (today Bash-only) into a tool-agnostic gate
keyed by the per-tool policy declared via `mx.approval(tool, policy)`. A destructive UI/CLI call is
gated identically to the AI's. Decision UI: the in-thread hybrid approval (native `part.approval` +
out-of-band decision) for AI-origin calls; a confirm dialog for user-origin calls. Policy: additive/
reversible → `auto`; destructive or source-reading → `ask`.

## Undo / redo — everything, one stack

The single core-side `execute` records a `{label, inverse}` entry on a per-session history stack.

- **`history.undo` / `history.redo` are capabilities** (AI and user; `⌘Z` / `⇧⌘Z` in the UI).
- **Inverses:** create↔delete, move↔move-back, resolve↔reopen, disconnect↔reconnect,
  re-anchor↔restore, draw↔erase (scene delta).
- **One stack across both stores:** Excalidraw's internal undo disabled; scene mutations captured as
  before/after deltas; Yjs pins via `Y.UndoManager` scoped to the user origin; comment ops via their
  recorded inverse. A single `⌘Z` reverses the last action regardless of store. New mutation
  invalidates the redo branch. Bounded (see Limits). AI- and user-origin share the stack.

## Security

Inherit mandarax's `cors.ts` defense on every new surface: Origin allowlist + **Host-header loopback
check** (unforgeable by page JS) + **per-session token** (DNS-rebinding defense).

- **TrailBase is never exposed to the browser.** Binds `127.0.0.1`, reachable only by core. All sync
  is browser ↔ core ↔ TrailBase.
- **The `mx.sync` relay** binds loopback, validates the WS handshake Origin, checks Host = loopback,
  requires the per-session token. Room ids are not access control.
- **The `AnchorResolver` + `element.reference`** confine every `file` to the project root (resolve +
  assert, reject `../` / `file://` / symlink escape — reuse the `symbolicate.ts` fix), and apply a
  **secret denylist** (`.env`, `*.pem`, `id_rsa`, key files) at the snippet-capture redaction point,
  so anchors/snippets cannot egress secrets into comment bodies (which flow to the model).
- Closes the `page-bus-security-gaps` classes (CORS no-auth, symbolicate path-traversal, secret
  egress) rather than re-introducing them.

## AI consumption of comments (the core loop)

- **Pull:** `comment.list(session|all, {file?, status?})` is an MCP tool the agent calls on demand.
- **Push:** on a turn that touches a file, core auto-injects the **open + drifted comments anchored to
  that file** into context (extension `.server` `systemPrompt.append` / a context event). Ask the AI
  to work on `Foo.tsx` and it already sees the pinned notes there, surviving across sessions.
- The AI can `comment.reply`, `comment.resolve[ask]`, or act on a comment whose `parts` carry a tool.
  Comments are durable, place-anchored agent memory.

## AI legibility & discovery

- Each `defineTool` carries `promptSnippet` + `promptGuidelines` → self-documents into the system
  prompt on registration. No hand-maintained docs.
- Tools/renderers/effects appear in the extension system's generated catalog (computed live).
- A **`canvas-comments` skill** + worked examples (pin a comment, Mermaid diagram, re-anchor a drifted
  comment).

## Testing strategy (house rules: real browser, native assertions, no jsdom, no mocks)

- **ITs (Playwright `newPage()`, real core + real `trail` + real Yjs):** pin a comment → reload →
  re-anchors `fresh`; edit source → doctor flags `drifted` with diff; drag a pin → disconnect /
  accept-drift / cancel; AI `comment.create` → renders in the thread via tool-ui; UI-origin
  `comment.delete` blocked until confirm; cross-session "show all" → "switch to session" → pan.
- **Anchor tests (real oxc/babel + real git temp repo):** move a JSX node → `moved`; duplicated JSX →
  `ambiguous` (never silent); uncommitted edit → content-hash relocates where git can't; `.env` path
  → denylist rejects.
- **Bridge test:** Excalidraw React island mounts inside the Solid shadow root and pins overlay at
  correct coords; assert via roles/visibility, reach the shadow root via `getByRole().getRootNode()`.
- **`mx.db` test:** optimistic insert renders before the round-trip; agent insert via core propagates
  live to a second browser; kill `trail` → degraded local-only → reconcile on restart.
- Parallel browser tests need a unique `browser.api.port`.

## Error handling & resilience

- The React island and each pin/thread render inside an **error boundary**; one bad element never
  crashes the widget.
- `trail` crash → supervisor restarts it; the browser stays in degraded local-only mode and reconciles
  on return.
- A resolver failure on one comment flags it `drifted`/`orphaned`; never throws the whole sweep.
- `mx.sync` relay disconnect → keep editing locally, resync on reconnect.

## Versioning & migration

- The opaque `anchor` blob carries a `version`; a resolver declares which versions it reads and
  migrates older ones. Promoted columns are derived, rebuildable by doctor.
- TrailBase schema migrations run on core boot. `parts` follows the tanstack part version.

## Accessibility & interaction

- Pins/threads keyboard-navigable (focus ring, Enter opens, Esc closes), ARIA roles, author + status
  announced. Zoom controls are labelled buttons.
- Pin/tether motion animates on state transitions only and respects reduced-motion.

## Notifications

- **`solid-sonner`** toasts mounted in the widget shadow root (EnvironmentProvider). Fired on: AI
  left/replied, doctor found drift, `trail` reconnected, sync failure. Click jumps to the comment
  (pan/zoom, switching session if needed). Animate on entry/exit only.

## Limits (guardrails with clear errors, never silent truncation)

- Comment text **16 KB**/text part · thread **500 replies** · comments/session soft **2,000**.
- Canvas **5,000 elements**/scene · Mermaid `maxEdges` 500 · image/file blob **5 MB** each.
- Anchor snippet **2 KB** · undo history **200 entries**/session.

## Empty state

When a session's canvas is empty, render a hand-drawn Excalidraw sketch ("Draw here, or ⌘-click an
element to pin a comment →"). It is **ephemeral, view-mode, non-persisted** (a client overlay, not in
the Yjs doc). On the first real interaction it is removed and never returns for that session.

## Observability

Doctor runs, sync failures, supervisor restarts, resolver errors, relay disconnects log through the
existing **`harness-logger`**. Structured, dev-visible, no telemetry egress.

## Package / file layout

- **`packages/extensions`** — grow the contract: `ServerApi.sync/db/on/approval`,
  `ComposerActionCtx.runTool`; collect handlers in `collectServerContributions`.
- **`packages/core`** — the two generic services (`db/` TrailBase supervisor + sole client + gated
  SSE/mutation routes, the single SQLite store; `sync/` Yjs room engine + gated relay route, its
  `SnapshotStore` seam backed by a trail BLOB table); the event
  bus; the shared `execute` chokepoint + generalized approval gate + undo stack. **Zero
  canvas/comment-specific logic.**
- **`mandarax/extensions/canvas-comments/`** (the extension, discovered/loaded) — `.server`: tools,
  the `comments` collection declaration, the canvas room, the `AnchorResolver`, doctor, push/pull
  context. `.client`: the overlay Effect (React island), Solid pins/threads/zoom, the TanStack DB
  collection wiring, the composer action, renderers. (Final dir path follows the extension system's
  discovery convention; first-party extensions may live under a repo `extensions/` workspace.)
- **`packages/cli`** — `mandarax doctor` over the core sweep.

## New dependencies (require approval before install — per house rule)

Widget: `@excalidraw/excalidraw`, `yjs` (+ `Y.UndoManager`), `y-indexeddb`, `@tanstack/db`,
`@tanstack/solid-db`, `solid-sonner`. Core: an oxc/babel parser + a git interface (shell `git` vs
`simple-git` — decide at the anchoring phase); a TrailBase client (shell `fetch` to the trail HTTP API
vs the `trailbase` client SDK — decide at the `mx.db` phase). `react` + `react-dom` already present.
**No `y-excalidraw`** (dropped — own glue). **No vendoring.** **`trail`** is an external PATH binary
the user installs (not npm), mirroring the `claude` harness binary — verified present (`v0.22.9`).

## Open decisions deferred into the plan

- oxc vs babel parser; shell `git` vs `simple-git` (anchoring phase).
- `trail` HTTP via `fetch` vs the `trailbase` client SDK (`mx.db` phase).
- Whether the canvas-comments extension ships from a repo `extensions/` workspace or another
  discovery path (depends on how the extension loader resolves first-party extensions).
- Exact `mx.db` custom-adapter shape against the real `trail` realtime API (validate in a thin spike
  inside its phase, then delete the spike).

## Risks / notes

- Two new core services underpin this (`mx.sync`, `mx.db`) plus contract growth — sequence so the
  services land and are independently tested before the extension consumes them.
- The React-island bridge (Excalidraw React ↔ Solid widget) is real integration work; the one proven
  finding (own glue + dedupe + define + shadow CSS) de-risks it.
- The default `AnchorResolver` is React/TSX-specific; other frameworks are a swap away but
  unimplemented.
- Repeated/list-rendered elements degrade instance identity to heuristics — flagged `drifted` rather
  than mis-pinned; acceptable, documented.
