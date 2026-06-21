# Whiteboard — Canvas + Source-Anchored Comments Extension (Design v2)

Status: design. Worktree `worktree-canvas-comments`. **The platform this builds on is already shipped**
(PR #12: `mx.db`, `mx.sync`, the grown extension contract). This document is the **extension** — it
consumes that platform and owns everything canvas/comment-specific. It supersedes the combined
`2026-06-21-canvas-comments-v2-design.md` (which mixed platform + feature before the platform existed);
the solid ideas there are carried forward here, reframed as an extension.

## Goal

A transparent, infinite Excalidraw canvas layered over the app during development. **The user and the
AI are equal participants**: both draw, diagram, leave comments, resolve them, undo/redo — through the
same surfaces. Comments pin to a page element and **anchor to the source line that rendered it**, with
a git-like content hash that keeps the reference correct as code changes. Everything is local-first and
exposed identically to the AI (MCP tools), the user (UI), and the CLI.

## Scope — everything is v1 (nothing deferred)

In: infinite Excalidraw/Yjs canvas (draw/pan/zoom, transparent overlay, persist + multi-tab sync);
**AI as a co-equal editor** (draws, comments, with a live presence cursor on the canvas); source-linked
**and** floating comments (threads, parts/tool-ui, status); **source anchoring** (AST-hash + git
line-tracking + DOM fallback, `AnchorResolver` seam); **doctor** (drift sweep + `session_start`
auto-run + `mandarax doctor` CLI); **undo/redo** (one cross-store stack); approval gate; security
hardening; limits; empty state; notifications; a11y.

This is the full feature. Later work is only new _capabilities_ (more canvas verbs, other frameworks'
resolvers), not deferrals of the above.

## Framing — this is an extension on the shipped platform

Everything below is built **inside one first-party extension** using only the public extension API.
The platform (already merged) provides, on the single composable `mx` object:

- **`mx.db`** (`ServerApi.db` / `ClientApi.db`) — live collections: core supervises `trail` (SQLite,
  sole client) + gated reverse-proxy; the browser gets a reactive, optimistic TanStack DB collection.
  Server `collection(name, {schema, columns, fts})` → `ServerCollection` (query/insert/update/delete +
  `cid` join); `list()`/`get()` introspection. Client `collection(name, {parse, serialize})` → native
  `@tanstack/trailbase-db-collection` over the proxy; `useLiveQuery` to read.
- **`mx.sync`** (`ServerApi.sync` / `ClientApi.sync`) — a Yjs room engine over the official
  `y-websocket` provider ↔ native h3/crossws WebSocket; snapshots persist as a trail BLOB. Server
  `room(id)` → `{doc, observe, apply, snapshot}`; client `room(id)` → a `WebsocketProvider`-backed
  `{doc, connected, disconnect}` with a `y-indexeddb` cache.
- **`mx.on(event, handler)`** — `session_start` / `tool_execution_start` lifecycle.
- **`mx.approval(tool, 'auto' | 'ask')`** — per-tool gate enforced in the shared `POST /api/tools/run`
  chokepoint (and the MCP path); `ask` → 403 needs-approval.
- **`mx.registerTool(defineTool(...))`** + `mx.systemPrompt.append` — agent tools (MCP) that
  self-document into the system prompt.
- **`ClientApi.ui`** (setWidget/Header/Footer/Status/EmptyState/Theme), **`registerComposerAction`**,
  and **`ComposerActionCtx.runTool(name, input)`** — the composer→tool path.
- Effects (`defineEffect`) — toggleable Solid page overlays.

The extension declares its `comments` collection on `mx.db`, its canvas room on `mx.sync`, its tools via
`mx.registerTool`, gates destructive ones via `mx.approval`, runs the doctor on `mx.on('session_start')`,
and renders the overlay as an Effect + the pins/threads via `mx.ui`. Core gains **zero**
canvas/comment-specific logic.

## Packaging & discovery — first-party, default-on

The extension is its own monorepo package, **`packages/whiteboard`**, exporting a single
`MandaraxExtension` (`defineExtension({id:'whiteboard', tools}).server(...).client(...)`). It ships
**enabled by default** for every mandarax user — it is the product's flagship surface, not a sample.

The loader learns one new concept: **first-party (built-in) extensions applied alongside discovered
project ones**, on both halves, using only the public API:

- **Server:** `bootServices` / `loadServerContributions` prepend the built-in list to the discovered
  files: `collectServerContributions([...firstParty, ...discovered], services)`. `firstParty` is a
  small explicit array importing `@mandarax/whiteboard`.
- **Client:** `mount.tsx` applies the built-in extensions' `clientFn(clientApi)` (and
  `collectClientContributions`) directly, in addition to the discovered virtual-module ones.

A user can still ship their own extensions in `mandarax/extensions/`; canvas-comments simply always
loads first. (Disabling/config is a later concern; default-on is the v1 behavior.)

## Architecture

```
EXTENSION  @mandarax/whiteboard  (uses only the public mx API)
┌───────────────────────────────────────────────────────────────────────────┐
│ .server(mx)                                  .client(mx)                     │
│  • mx.db.collection('comments', …)            • overlay Effect: React island │
│  • mx.sync.room(`${previewId}:${sessionId}`)    hosting <Excalidraw> bound to│
│  • mx.registerTool(comment.* / canvas.* / …)    the Yjs doc (our glue)       │
│  • mx.approval('comment.delete','ask') …      • Solid pins/threads/zoom over  │
│  • mx.on('session_start', doctor.run)           the canvas (tool-ui render)   │
│  • AnchorResolver (oxc + git, core-side)      • mx.registerComposerAction →   │
│  • doctor sweep + cross-store undo stack        runTool('comment.create')     │
└───────────────────────────────────────────────────────────────────────────┘
        │ writes via mx.db / mx.sync (server)        │ reads via ClientApi.db / .sync
        ▼                                             ▼
   PLATFORM (shipped): trail (SQLite) · Yjs room engine · gated proxy + WS relay · approval gate
        ▲
        │ /api/mcp (tools)
   harness (AI): draws + comments via the SAME tools → same Yjs doc + comments collection
```

Two sync stories, both fronted by core (browser never talks to a backend directly): **Yjs (`mx.sync`)**
for the live shared canvas (drawings, pins, **cursors**); **TanStack DB (`mx.db`)** for durable comment
rows.

## The canvas — a React island in the Solid widget

The widget is **Solid**; Excalidraw is **React-only**. The canvas is a **React island**: one React root
hosting `<Excalidraw>`, mounted into the Solid widget's shadow root, registered as an Effect
(`defineEffect`) — the React island mounts inside its `render(ctx)`. Comment **pins and threads stay
Solid** (`tool-ui` renderers); only the Excalidraw surface is React.

- **Transparent, infinite:** `viewBackgroundColor: 'transparent'`, zen mode hides chrome,
  `pointer-events` flips `none ↔ auto` (idle ↔ active) so the app underneath stays usable.
- **Own zoom controls** (in / out / reset-100% / zoom-to-fit); the comment list doubles as nav.
- **Packaging:** the React + Excalidraw island (~1 MB) **lazy-loads** behind the composer toggle, never
  in the initial bundle. Proven findings to apply: `resolve.dedupe(['react','react-dom'])`; `define`
  `process.env.NODE_ENV='production'` + `IS_PREACT='false'`; inject
  `@excalidraw/excalidraw/index.css?inline` into the shadow root. Excalidraw 0.18.x + React 19.2 work.
- **Error boundary:** the React island renders inside an error boundary; one bad element never crashes
  the widget.

### Yjs ↔ Excalidraw binding — our own glue (no `y-excalidraw`)

There is no official binding and the community `y-excalidraw@2.0.12` is ~18 months stale against a
fast-moving Excalidraw — so we own ~40 lines of plain-TS glue against Excalidraw's official
`onChange` / `updateScene`:

- A `Y.Map` (or `Y.Array`) of elements keyed by Excalidraw element `id`. Outbound: Excalidraw
  `onChange` diffs the scene and writes only changed/added/removed elements into the Yjs map.
  Inbound: a Yjs observer maps remote ops to `updateScene`.
- **Feedback-loop guard via Yjs origin tags** (`'user' | 'ai' | 'remote' | 'core-rehydrate'`): the
  Excalidraw→Yjs outbound writer fires only for `user`-origin local edits; inbound `updateScene`
  applies non-user origins with `captureUpdate: NEVER` (keeps remote/AI edits out of the local undo
  stack — see Undo).
- `y-indexeddb` is an offline cache only; the durable snapshot is the trail BLOB (platform).

### AI + user are equal on the canvas

The AI is a first-class collaborator, symmetric with the user except for three by-design asymmetries:
(a) input modality (user mouse-picks; AI references by file/component), (b) viewport (zoom/pan is
viewer-local, never shared state), (c) approval authority (only the human answers approvals).

- **AI presence cursor:** the agent gets an entry in Excalidraw's `collaborators` map (named cursor +
  selection), driven over **Yjs awareness** (ephemeral, not durable). "AI is drawing/typing here" is
  awareness; durable content is never awareness.
- **AI draws** by emitting an element **skeleton** or **Mermaid**, never raw elements:
  `convertToExcalidrawElements` / `parseMermaidToExcalidraw` → granular id-keyed ops applied to the
  shared Yjs doc with `ai` origin (`captureUpdate: NEVER`), never a full-scene overwrite. The
  conversion runs where Excalidraw's helpers are available (browser island for Mermaid which needs the
  DOM; `convertToExcalidrawElements` is pure and can run wherever the tool executes — exact split
  resolved in the plan).
- **AI comments** via the same `comment.*` tools the user's composer calls.

## Comments

### Kinds

- **Source-linked** — pinned on a DOM element and anchored to its source line; shows a `file:line` badge.
- **Floating** — placed on empty canvas (canvas coords only, no element/source).

### Record (TrailBase, declared via `mx.db.collection('comments', …)`)

```
comments
  cid           TEXT UNIQUE   -- client-gen UUID = the getKey; joins the Yjs pin
  preview_id    TEXT idx
  session_id    TEXT idx
  thread_id     TEXT idx
  parent_id     TEXT          -- replies nest via parent_id (every comment is a thread)
  parts         JSON          -- text + tool parts (tanstack shape) → tool-ui renders
  author_kind   TEXT          -- 'human' | 'ai'   (+ author_model)
  status        TEXT idx      -- 'open' | 'resolved' | 'drifted' | 'orphaned'
  kind          TEXT          -- 'source-linked' | 'floating'
  anchor        JSON          -- OPAQUE: resolver's full anchor (source + instance + visual)
  anchor_file   TEXT idx      -- promoted → "comments on file X"
  anchor_component TEXT        -- promoted
  anchor_hash   TEXT          -- promoted (AST-subtree hash)
  last_resolved_commit TEXT    -- doctor incrementality
  last_resolved_file_hash TEXT -- doctor incrementality (uncommitted edits)
  created_at / updated_at / resolved_at / resolved_by
  + comments_fts (FTS5 over parts text)
```

`columns` passed to `mx.db.collection` declares everything except the platform-owned `id`/`cid`. Pin
geometry (`x, y, elementId, pinState`) lives in the **Yjs pin**, not here.

### The commentId join — one write owns both stores

A source-linked comment spans two stores (a comments row + a Yjs pin). To avoid orphans/races:

- **`cid` is a client-generated UUID accepted verbatim** — never a temp→real swap (a swap would break
  the Yjs pin's captured id). It is the `getKey` for both the TanStack DB row and the Yjs pin.
- **`comment.create` / `comment.delete` are single executes that write/remove BOTH** the `mx.db` row
  and the `mx.sync` pin (core owns the authoritative Yjs doc; the browser's optimistic path uses the
  same UUID for both).
- **The row is the source of truth that "a comment exists";** the pin is pure geometry
  (`{cid, x, y, elementId, pinState}`).
- **Doctor reconciles:** pin with no row → drop pin; row with no pin → re-materialize from the anchor's
  visual rect or mark `orphaned`.

### Pin state, drag, drifts

- `pinState: 'locked' | 'offset'` is geometric → lives on the **Yjs pin**. `locked` derives screen
  position from the element rect; `offset` floats with a faint **tether line**. Pin appearance is a pure
  function of `row.status` + Yjs geometry — no second write.
- **Drag a source-linked pin** → prompt: **Disconnect** (→ floating, source dropped) · **Keep link,
  accept drift** (→ source-linked at custom offset, tether drawn) · **Cancel** (snaps back). Floating
  pins drag freely. AI equivalent: `comment.move` / `pin.setState`.
- **Two independent drifts:** _pin drift_ (user dragged the pin off its element → `pinState: offset`)
  and _source drift_ (code changed under the anchor → doctor flags `status: drifted` + diff). They can
  coexist; source-drift resolution **never silently re-snaps a user offset**.

### Threads, parts, streaming

- Every comment is a thread (replies via `parent_id`). A comment/reply carries **`parts[]`** (text +
  tool parts, tanstack shape) rendered by the existing Solid **`tool-ui`** pipeline (by `part.name`;
  read `part.arguments` since `part.input` is often empty). AI replies render tool cards inline;
  approvals render in-thread (native `part.approval` + out-of-band decision).
- **Streaming AI replies** flow over the existing **`ui-bus` SSE** (not Yjs awareness — that is
  ephemeral and wrong for durable content). Insert the row on first token (streaming status), patch
  `parts` optimistically; `mx.db` fans out. Route a turn's UI into a thread by tagging the part envelope
  with `cid` (one channel, one-turn-per-session preserved).

## Source anchoring

### Two coordinates for a source-linked pin (orthogonal, both resolved every sweep)

A pin sits on _one rendered DOM instance_, but source resolves to _one JSX location_ that may render N
instances. Both are answered:

- **Source anchor** — `file:line:col` + normalized AST-subtree hash + ancestor-path salt + component +
  git SHA + snippet. Drives the badge, doctor, and AI `element.reference`. (One per JSX location.)
- **Instance anchor** — fiber/selector path + React key + visual rect. Drives _which rendered element_
  gets the pin. (One per DOM instance.)

Requires the react-grab adapter to expose `getElementContext()` (`columnNumber`, `fiber`, `selector`,
frame `stack`), not just `getSource()`. Without the column, a JSX node on a shared line is ambiguous; in
a repeated list, instance identity degrades to position+rect heuristics — when ambiguous, **flag
`drifted`, never silently re-pin**.

### Capture (core-side — it has fs + git + a parser)

From `getElementContext()`: parse the JSX node at `file:line:col` via **oxc** (already a repo dep:
`oxc-parser`) → normalized AST-subtree hash + ancestor-path salt (so identical leaves under different
parents differ) + component + git SHA + snippet (the source anchor); fiber/selector + React key + rect
(the instance anchor).

### Resolve (on load / doctor) — layered authority, never silently wrong

\*\*AST content-hash (primary) → git line-tracking (commit-granularity fallback) → DOM/visual (placement

- last resort).\** Instance placement resolves *in parallel\*, not as a fallback.

1. Re-hash at stored `file:line:col` against the **working tree**. Match → `fresh`.
2. Mismatch → search the file for the hash. Exactly one → `moved` (re-anchor). >1 → tie-break by nearest
   line + instance agreement; still ambiguous → `drifted`/`ambiguous`, surface candidates, never
   auto-pick.
3. Working-tree miss + file committed-clean → git maps the old commit's line into the tree
   (commit-granularity; no-ops for uncommitted edits — the content-hash is the dev-loop workhorse).
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

Default impl is React/TSX-specific (oxc + git, **project-root-confined**, secret denylist). The store
promotes only `anchor_file/component/hash`; the rest is opaque, so swapping the resolver changes only
the blob + promoted columns. Pin drift is UI-composed state, out of the resolver's scope. Git access:
shell `git` (no new dep) unless the plan finds it insufficient.

## Doctor

`mandarax doctor` (a `packages/cli` command) + an auto-run on `mx.on('session_start', …)`.

- Sweeps comments; per comment runs `resolver.resolve()`. `fresh`→no-op · `moved`→re-anchor, keep
  `open` · `drifted`/`ambiguous`→flag + diff/candidates · `orphaned`→mark. **Skips `floating`.**
- **Incremental & content-addressed:** re-resolve when `current_commit != last_resolved_commit` OR
  `current_file_hash != last_resolved_file_hash`; mtime is a fast pre-filter.
- Reconciles the commentId join (pin↔row). Idempotent; manual + CI invocable. Prints
  `N fresh · M re-anchored · K drifted (review) · J orphaned`.

## Undo / redo — everything, one stack

The single core-side `execute` (the `/api/tools/run` + MCP chokepoint) records a `{label, inverse}`
entry on a per-session history stack. `history.undo` / `history.redo` are **capabilities** (AI and user;
`⌘Z` / `⇧⌘Z` in the UI).

- **Inverses:** create↔delete, move↔move-back, resolve↔reopen, disconnect↔reconnect,
  re-anchor↔restore, draw↔erase (scene delta).
- **One stack across both stores:** Excalidraw's internal undo disabled; scene mutations captured as
  before/after deltas; Yjs pins via `Y.UndoManager` scoped to the user origin; comment ops via their
  recorded inverse. A single `⌘Z` reverses the last action regardless of store; a new mutation
  invalidates the redo branch. Bounded (see Limits). AI- and user-origin share the stack.

## Capabilities (the extension's tools)

`defineExtension({id, tools}).client(mx=>…).server(mx=>…)`, each `defineTool({name, description,
parameters, execute, renderCall?, renderResult?, promptSnippet?, promptGuidelines?})`. Approval enforced
in the shared chokepoint via `mx.approval`.

```
canvas.read · canvas.draw · canvas.connect · canvas.diagram(mermaid) · canvas.export
            · canvas.update · canvas.delete[ask] · canvas.clear[ask]
comment.create · comment.list(session|all) · comment.read · comment.reply
            · comment.resolve[ask] · comment.delete[ask] · comment.reanchor · comment.move / pin.setState
element.pick (user mouse, react-grab) · element.reference (AI by file/component, project-root-confined)
anchor.resolve · doctor.run · session.switch · history.undo · history.redo
```

Approval policy: additive/reversible → `auto`; destructive or source-reading → `ask`. The composer
"Comment" action calls `runTool('comment.create')` from a react-grab pick; the AI calls the same tools
over `/api/mcp`.

## AI consumption of comments (the core loop)

- **Pull:** `comment.list(session|all, {file?, status?})` — an MCP tool the agent calls on demand.
- **Push:** on a turn that touches a file, the extension's `.server` auto-injects the **open + drifted
  comments anchored to that file** into context (via `systemPrompt.append` / a context event). Ask the
  AI to work on `Foo.tsx` and it already sees the pinned notes there, surviving across sessions.
- The AI can `comment.reply`, `comment.resolve[ask]`, or act on a comment whose `parts` carry a tool.
  Comments are durable, place-anchored agent memory.

## Security (reuses the platform's gate; closes the known gap classes)

The platform already gates every core surface (Origin allowlist + Host-loopback + per-session token;
trail bound `127.0.0.1`, reachable only by core). The extension adds:

- **`AnchorResolver` + `element.reference` confine every `file` to the project root** (resolve + assert;
  reject `../` / `file://` / symlink escape — reuse the `symbolicate.ts` fix) and apply a **secret
  denylist** (`.env`, `*.pem`, `id_rsa`, key files) at the snippet-capture redaction point, so
  anchors/snippets cannot egress secrets into comment bodies (which flow to the model).
- Closes the `page-bus-security-gaps` classes (CORS no-auth, path-traversal, secret egress).
- **Cross-origin note:** the platform's `cors.ts` method allowlist currently omits `PATCH`/`DELETE`
  (fine for the probe's insert-only path). Comment edit/resolve/delete from a cross-origin dev page
  needs those methods added to the allowlist — folded into the plan.

## Dependencies (require approval before install — house rule)

- **New (widget/extension):** `@excalidraw/excalidraw` (0.18.x), `solid-sonner` (toasts).
- **Already present:** `yjs` (+ `Y.UndoManager`), `y-indexeddb`, `@tanstack/db`, `@tanstack/solid-db`,
  `@tanstack/trailbase-db-collection`, `trailbase`, `react` + `react-dom`, `oxc-parser`.
- **No `y-excalidraw`** (own glue). **No vendoring.** `trail` is the external PATH binary (platform).

## Testing strategy (house rules: real browser, native assertions, no jsdom, no mocks)

- **Bridge IT (Playwright `newPage()`):** the Excalidraw React island mounts inside the Solid shadow
  root and pins overlay at correct coords; assert via roles/visibility, reach the shadow root via
  `getByRole().getRootNode()`.
- **Canvas sync IT:** draw in one page → a second page on the same room converges; reload rehydrates
  from the trail snapshot; an **AI/server-side `canvas.draw`** appears live in the browser canvas.
- **Comment ITs:** pin a comment → reload → re-anchors `fresh`; AI `comment.create` renders in the
  thread via tool-ui; UI-origin `comment.delete` blocked until confirm; cross-session "show all" →
  "switch to session" → pan.
- **Anchor tests (real oxc + real git temp repo):** move a JSX node → `moved`; duplicated JSX →
  `ambiguous` (never silent); uncommitted edit → content-hash relocates where git can't; `.env` path →
  denylist rejects.
- **Doctor IT:** edit source → sweep flags `drifted` with diff; reconciles a pin with no row.
- **Undo IT:** create → ⌘Z removes (row + pin); AI draw → ⌘Z erases the scene delta.
- Parallel browser tests need a unique `browser.api.port`.

## Error handling, limits, empty state, a11y, notifications, observability

- **Resilience:** React island + each pin/thread in an error boundary; `trail` crash → platform
  supervisor self-heals (degraded local-only meanwhile, reconcile on return); resolver failure on one
  comment flags it `drifted`/`orphaned`, never throws the sweep; relay disconnect → keep editing
  locally, resync on reconnect.
- **Limits (clear errors, never silent truncation):** comment text 16 KB/part · thread 500 replies ·
  comments/session soft 2,000 · canvas 5,000 elements/scene · Mermaid `maxEdges` 500 · blob 5 MB ·
  anchor snippet 2 KB · undo history 200 entries/session.
- **Empty state:** when a session's canvas is empty, render a hand-drawn Excalidraw sketch ("Draw here,
  or ⌘-click an element to pin a comment →") — ephemeral, view-mode, non-persisted; removed on first
  real interaction, never returns for that session.
- **A11y:** pins/threads keyboard-navigable (focus ring, Enter opens, Esc closes), ARIA roles, author +
  status announced; zoom controls labelled. Pin/tether motion animates on state transitions only,
  respects reduced-motion.
- **Notifications:** `solid-sonner` toasts in the shadow root (EnvironmentProvider). Fired on: AI
  left/replied, doctor found drift, sync reconnected, sync failure. Click jumps to the comment (pan/zoom,
  switching session if needed). Animate on entry/exit only.
- **Observability:** doctor runs, sync failures, resolver errors, relay disconnects log through the
  existing `harness-logger`. No telemetry egress.

## AI legibility & discovery

- Each `defineTool` carries `promptSnippet` + `promptGuidelines` → self-documents into the system prompt
  on registration. Tools/renderers/effects appear in the extension system's generated catalog.
- A **`whiteboard` skill** + worked examples (pin a comment, Mermaid diagram, re-anchor a drifted
  comment).

## Platform additions required — Phase 0 (close before any feature phase)

The shipped platform was validated only by a synthetic probe. An audit of every requirement above
against the real platform surfaces (`ServerApi`/`ClientApi`/`ComposerActionCtx`, `SyncRoom`/`ClientRoom`,
`ServerCollection`/`ClientDb`, the `/api/tools/run` chokepoint, `EffectCtx`, `cors.ts`,
`page-introspect-types`) found seven concrete gaps. Each is a small, public-API-level addition; the plan
opens with a Phase 0 that lands and tests them before the canvas/comments phases consume them.

1. **Tool execute gets session/preview context.** Today `ExtensionServerTool.execute = (input) => …`
   sees only `input`; the run route knows `sessionId` but doesn't pass it. Add an execute context
   `{sessionId, previewId}` (the room id is `${previewId}:${sessionId}`) threaded from the run route +
   MCP path. Without it `canvas.draw`/`comment.create` can't address the right room.
2. **`runTool` on the general client surface.** Today it lives only on `ComposerActionCtx`. Add it to
   `ClientApi` (and/or `EffectCtx`) so pins/threads can invoke `comment.resolve/reply/delete/move`
   through the gated execute (the optimistic collection write bypasses approval + undo + dual-write).
3. **Awareness on `mx.sync`.** `SyncRoom` and `ClientRoom` expose only `doc`. Surface the `Awareness`
   (the `WebsocketProvider.awareness` client-side; an awareness handle server-side) so AI + user
   presence cursors work. Cursors are awareness, not durable doc state.
4. **Session/preview identity on `ClientApi`.** It is `{ui, registerComposerAction, db, sync}` today;
   add `previewId` + `sessionId` (and a change signal) so the client opens the right canvas room and
   scopes comment queries to the session.
5. **Approval decision/resume flow.** `mx.approval` only makes `/api/tools/run` return 403
   `needsApproval` — the confirm-then-run loop (UI confirm for user-origin, in-thread `part.approval`
   for AI-origin) does not exist. Build the decision + resume path on the chokepoint.
6. **Undo/history hook at the execute chokepoint.** Nothing records `{label, inverse}` today. Add a
   per-session history recorded by the single execute, plus `history.undo`/`history.redo` capabilities,
   so the cross-store undo stack the design relies on exists.
7. **CORS `PATCH` in the method allowlist.** `cors.ts` allows `GET,POST,DELETE,OPTIONS` — `PATCH` is
   missing, so a cross-origin `comment.update`/resolve via the trailbase adapter fails preflight. Add
   `PATCH`.

**Anchoring fidelity (accepted limitation, not a blocker).** `LocateResult` exposes
`source:{file,line,column}` (so the _source anchor_ is fully capturable) but no stable selector / React
key / fiber path, so the _instance anchor_ (which of N repeated elements) degrades to rect/position
heuristics — the design already says: flag `drifted` when ambiguous, never silently re-pin. Optionally
extend the react-grab adapter to expose `getElementContext()` (column + fiber + selector + frame stack)
in a later slice for exact instance identity.

## Resolved unknowns

- **Streaming AI replies into a thread.** MCP tools are one-shot (call → result), so the AI does not
  stream token-by-token into a comment. v1: the AI calls `comment.reply` **once with the full `parts`**;
  the row inserts and `mx.db` fans it out to the thread. (A true streaming channel is a later nicety, not
  required for the feature.)
- **AI canvas-draw conversion location.** `convertToExcalidrawElements` is pure and runs wherever the
  tool executes (server-side write into the Yjs doc). `parseMermaidToExcalidraw` needs the DOM, so
  Mermaid conversion runs in the browser island: the `canvas.diagram` tool stores the Mermaid source +
  an `ai` marker in the doc; the island converts on receipt. Element-skeleton draws (`canvas.draw`) go
  fully server-side.
- **Dynamic per-turn context push.** `systemPrompt.append` is static. v1 uses the **pull** path
  (`comment.list({file, status})` is an MCP tool the agent calls); the auto-inject-on-file-touch push is
  deferred to a later slice (it needs a per-turn context hook the platform doesn't have, and pull is
  sufficient for the loop).
- **tool-ui renderer reuse.** The first-party extension depends on `@mandarax/widget` and reuses its
  Solid `tool-ui` render-by-`part.name` pipeline for comment `parts`; no new platform surface.
- **`session.switch`.** v1 scopes to the active session's room; cross-session "show all → switch" reuses
  the widget's existing session selector (the extension reads `ClientApi.sessionId` from #4 and asks the
  shell to switch). No new platform primitive beyond #4.

## Open decisions for the plan

- Exact `packages/whiteboard` layout + the precise loader hook for built-in first-party extensions
  (server prepend in `bootServices`/`loadServerContributions` + client apply in `mount.tsx`).
- Shell `git` vs `simple-git` for line-tracking (start with shell `git`).
- The React-island bundling spike (dedupe / define / shadow-CSS inject) is validated first inside the
  bridge phase, then the rest builds on it.

## Risks / notes

- The React-island bridge (Excalidraw React ↔ Solid widget) is the highest-risk integration; the v2
  spike's proven finding (own glue + dedupe + define + shadow CSS) de-risks it, but it is validated
  first in its own phase before the rest builds on it.
- The default `AnchorResolver` is React/TSX-specific; other frameworks are a swap away, unimplemented.
- Repeated/list-rendered elements degrade instance identity to heuristics — flagged `drifted` rather
  than mis-pinned; acceptable, documented.
- The platform is so far validated only by a synthetic probe; **the canvas + comments bridge phase is
  the first real consumer** and may surface platform gaps (e.g. the CORS method allowlist above) — fix
  them in-phase while the platform code is fresh.

```

```
