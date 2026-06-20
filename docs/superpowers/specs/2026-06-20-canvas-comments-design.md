# Canvas + Source-Anchored Comments — Design

Status: design, revised after a 5-angle review. Worktree `worktree-canvas-comments` (off `main`).

## Goal

A transparent, infinite Excalidraw canvas layered over the app during development. The user and the AI collaborate on it as equals: draw, diagram, and leave **comments** that persist and that both read later. Comments can be pinned to a page element and **anchored to the source line that rendered it**, with a git-like content hash that keeps the reference correct as code changes. Everything is local-first and exposed identically to the AI (MCP), the user (UI), and the CLI.

## Prerequisites (both currently unbuilt — this feature depends on them)

1. **The mandarax extension system** — `defineExtension().client().server()` + `toolDefinition().server()/.render()` + the two-sided event bus + discovery/HMR. Designed in `2026-06-20-plugin-system-design.md`, implemented on `worktree-plugin-system-design`, **not yet on main**. This feature is authored against that contract and must land after it (or alongside, sharing the branch). It is **not** re-invented here.
2. **TrailBase as an external binary** — like the harness's `claude` binary, `trail` is a user-installed binary on `PATH` that core spawns (NOT shipped via npm — see Security/Supply-chain). The comment store depends on it being present.

## Principles

1. **Local-first, on the user's disk.** Durable artifacts live under `<cwd>/.mandarax/`, owned by local processes — not the cloud. Survives close/reopen. The browser stays instantly responsive via an optimistic local cache; durable sync happens in the background.
2. **AI and user reach the same capabilities — mutations symmetric, a few asymmetries by design.** Every _mutation_ is one typed definition exposed to MCP, CLI, and UI from the same source, enforced through the same core-side `execute`. Three asymmetries are intentional: (a) input modality (user mouse-picks; AI references by file/component), (b) viewport (zoom/pan is viewer-local, not shared state), (c) approval authority (only the human answers approvals). The earlier "UI can do nothing the AI can't, and vice versa" was wrong — approval _requires_ the human to hold a power the AI lacks.
3. **Reuse the extension contract; ship canvas-comments as a first-party built-in.** It is authored with the same `defineExtension/toolDefinition` shape (dogfooding the system) but **registered at engine boot as a built-in**, not discovered from the user's `mandarax/extensions/` directory. No parallel `define*` API.
4. **Swappable seams.** The stores, the `AnchorResolver`, and the harness are capability-typed adapters; each can be replaced without touching the surfaces.
5. **Thin layer over tested code.** Tool `execute` is a dumb adapter; behavior is plain, tested code.

## Architecture

```
USER'S MACHINE (all local, 127.0.0.1)
┌──────────────────────────────────────────────────────────────────────┐
│ mandarax core (Node) — the ONLY process the browser talks to          │
│   • extension host + built-in canvas-comments tools                    │
│   • owns canvas Yjs blobs:  <cwd>/.mandarax/canvas/<preview>/<sess>.ybin│
│   • Yjs sync relay (gated: origin + host-loopback + per-session token) │
│   • sole TrailBase client (browser never talks to TrailBase directly)  │
│   • spawns + supervises: TrailBase (PATH binary) and the harness       │
│        │ gated SSE+POST            │ gated comment sync (through core)  │
│ ┌──────┴───────────────┐   ┌───────┴──────────┐   ┌──────────────────┐ │
│ │ BROWSER WIDGET (Solid)│   │ TrailBase (binary)│  │ harness (Node AI) │ │
│ │  React island:        │   │  comments.db      │  │ draws via Yjs ·   │ │
│ │   Excalidraw +         │   │  127.0.0.1 only,  │  │ comments via core │ │
│ │   y-excalidraw         │◄─►│  reachable only   │  │ · tools via       │ │
│ │  Solid: pins, threads, │   │  by core          │  │ /api/mcp          │ │
│ │   tool-ui, TanStack DB │   └──────────────────┘   └──────────────────┘ │
│ └───────────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────┘
```

Two sync paths, both fronted by core (never the browser direct to a backend):

- **Yjs** for the live canvas (drawings, pins, cursors), over core's gated relay.
- **TanStack DB (browser, optimistic local) ↔ core ↔ TrailBase** for comments. Instant local reads/writes; background durable sync through core's gated endpoint. Core is the sole TrailBase client.

### The commentId join — one core-side write owns both stores

A source-linked comment spans two stores (a TrailBase row + a Yjs pin). To avoid orphans/races:

- **`commentId` is a client-generated UUID accepted verbatim** by core — never a temp→real swap (a swap would break the Yjs pin's captured id).
- **`comment.create` and `comment.delete` are single core-side executes that write/remove BOTH** the TrailBase row and the Yjs pin (core owns the authoritative Yjs doc, so it writes the pin directly). The browser's optimistic path uses the same UUID for both its TanStack DB row and its local pin.
- **The TrailBase row is the source of truth for "a comment exists";** the Yjs pin is pure geometry (`{commentId, x, y, elementId, pinState}`) keyed by it.
- **Doctor reconciles**: pin with no row → drop pin; row with no pin → re-materialize from `anchor.visual` coords or mark `orphaned`. `orphaned` covers both source loss and pin↔row loss.

## Stores

### Canvas — Yjs (CRDT, no single authority)

- One `Y.Doc` per session, room `${previewId}:${sessionId}`. Core persists `Y.encodeStateAsUpdate` to `<cwd>/.mandarax/canvas/<previewId>/<sessionId>.ybin` and rehydrates on boot. Yjs is multi-master CRDT — core's `.ybin` is the **durable snapshot**, not "the authority" (no arbitration needed).
- Browser binds the doc to Excalidraw via **`y-excalidraw`** (vendored/forked) inside a React island (see below); `y-indexeddb` is an offline cache only.
- **Three writers** (user, AI/harness, extra tab) into one doc. The feedback-loop guard uses a **per-transaction Yjs origin tag** (`'user' | 'ai' | 'remote' | 'core-rehydrate'`): the Excalidraw→Yjs outbound writer fires only for `origin === 'user'`; inbound `updateScene` applies all non-user origins with `captureUpdate: NEVER` (keeps remote/AI edits out of the local undo stack). Rehydrate uses its own origin so boot-load never re-broadcasts.
- **`canvas.export`** capability dumps a room to `.excalidraw`/SVG/PNG so canvas data is portable, not just an opaque `.ybin` (honors the "get data out" goal).

### Comments — TanStack DB (browser) ↔ core ↔ TrailBase

- **TrailBase** (external `trail` binary, spawned + supervised by core, bound `127.0.0.1`, reachable only by core) owns `<cwd>/.mandarax/comments.db` (plain SQLite — inspectable, FTS5).
- **Browser** holds a TanStack DB collection persisted to **IndexedDB** (browser-sandboxed; _not_ under `.mandarax/`): optimistic mutations + live queries → instant interaction with no node round-trip. Writes dedupe by `commentId` (upsert-by-pk) so optimistic + sync-echo collapse (the comment-side analog of the canvas origin guard).
- **Sync** runs in the background through **core's gated endpoint**, and **core** is the sole TrailBase client. (Whether via the `trailBaseCollection` adapter pointed at a core proxy, or a core-backed collection, is an implementation choice; the security boundary — browser never talks to TrailBase directly — is not.)
- Comments are **append-mostly**, so no CRDT merge is needed here; conflicts (rare same-row edits) are last-write-wins.
- **Degraded mode**: if TrailBase is down/not-yet-spawned, the browser still reads/writes its local TanStack DB; mutations queue and reconcile on reconnect.

### Cold start

core spawns TrailBase → waits ready → runs migrations → opens the gated comment endpoint → browser syncs. Canvas `.ybin` loads independently. Nothing blocks the widget mounting (extensions/stores fail gracefully into local-only).

## Scoping

`previewId` (env, from config, default `local`) + `sessionId` (active session). Canvas = per-session doc (switching session swaps it). Comments carry `preview_id` + `session_id`; default view = current session, a **"Show all"** toggle drops the session filter. A cross-session comment offers **"switch to session X"**: jump-to performs `session.switch` (load that doc) _then_ pans — off-session comments render read-only in the list until switched. **Doctor + anchoring are session-agnostic** (source is shared across sessions).

## The overlay (a React island in the Solid widget)

The widget is **Solid**; Excalidraw and `y-excalidraw` are **React-only**. So the canvas is a **React island**: react + react-dom added as widget deps, one React root hosting `<Excalidraw>` bound to the Yjs doc, bridged to Solid via the shell store (toggle, active session, mode). Comment **pins and threads stay Solid** (they reuse the Solid `tool-ui` renderers); only the Excalidraw surface is React. The two layers share coordinates through the pin store. All of it (React + Excalidraw, ~1MB+) is lazy-loaded behind the composer toggle — never in the initial bundle.

- **Transparent, infinite canvas**: `viewBackgroundColor: transparent`, zen mode hides Excalidraw chrome, `pointer-events` flips `none`↔`auto` (idle↔active).
- **Our own zoom controls** (chrome hidden): in / out / reset-100% / zoom-to-fit. The comment list doubles as navigation (jump-to pan/zoom; off-session → switch first).
- **AI as collaborator**: the agent gets an entry in Excalidraw's `collaborators` map (named cursor). AI canvas writes: emit a skeleton (or Mermaid), never raw elements → `convertToExcalidrawElements` / `parseMermaidToExcalidraw` → `updateScene({ captureUpdate: NEVER })`, granular id-keyed ops, never a full-scene overwrite. Sanitize/repair/few-shot discipline is **ported** from the local-model spike (it lives on another worktree, not reused in place); the lazy-load precedent is `react-grab/adapter.ts`'s `await import()`.

## Comments

### Kinds

- **Source-linked** — pinned onto a DOM element and anchored to its source line. Shows the `file:line` badge.
- **Floating** — placed on empty canvas, canvas coords only, no element/source.

### Two coordinates for a source-linked pin (orthogonal, both resolved every sweep)

A pin sits on _one rendered DOM instance_, but source resolves to _one JSX location_ that may render N instances. These are different questions and both must be answered:

- **Source anchor** — `file:line:col` + normalized AST-subtree hash + component + git SHA + snippet. Drives the badge, doctor, and AI `element.reference`. (One per JSX location.)
- **Instance anchor** — fiber/selector path + any available React key + visual rect. Drives _which rendered element_ gets the pin. (One per DOM instance.)

This requires switching the react-grab adapter from `getSource()` (which returns only `{componentName, filePath, lineNumber}` — no column) to **`getElementContext()`**, which react-grab already exposes with `columnNumber`, `fiber`, `selector`, and a frame `stack`. Without the column, a JSX node on a shared line (`<Row><Icon/><Label/></Row>`, ternaries, inline `.map`) is ambiguous. Within a repeated list, instance identity degrades to position+rect heuristics — when ambiguous, **flag `drifted`, never silently re-pin**.

### Pin state lives with geometry (Yjs), not the row

`pinState: 'locked' | 'offset'` is a geometric fact → it lives on the **Yjs pin**, not the TrailBase row. A `locked` pin's screen position derives from the element rect; an `offset` pin floats with a faint **tether line** to its element. The pin's _appearance_ is a pure function of `row.status` (open/resolved/drifted/orphaned) + Yjs geometry — the renderer reads both; no second write.

### Drag rule

Dragging a source-linked pin prompts: **Disconnect** (→ floating, source anchor dropped) · **Keep link, accept drift** (→ source-linked at custom offset, tether drawn) · **Cancel** (snaps back). Floating pins drag freely. An AI equivalent exists: **`comment.move` / `pin.setState`** capabilities (so the AI can "move this pin back onto the button" — closing a parity gap).

### Two drifts (independent axes)

- **Pin drift** — user dragged the pin off its element (user-chosen; `pinState: offset`).
- **Source drift** — code changed under the source anchor; doctor flags `status: drifted` + diff.
  They can coexist (`offset` + `drifted`): keep the user's offset, show the diff, re-target the tether to the re-anchored element (or drop to floating-with-note if orphaned). **Source-drift resolution never silently re-snaps a user offset.**

### Authorship, status, threads, parts

- `author_kind: 'ai' | 'human'` always visible (avatar/color/icon; AI carries its model).
- `status: open | resolved | drifted | orphaned`.
- Every comment is a thread (replies, nested via `parent_id`).
- A comment/reply carries **`parts[]`** (text + tool parts — the AG-UI/tanstack shape) rendered by the existing Solid **`tool-ui`** pipeline (by `part.name`; note `part.input` is often empty → read `part.arguments`). So an **AI reply can render tool cards inline** (diff, Q&A, "apply this?"), and **approvals render in-thread** (see Approval).
- **Streaming**: drop Yjs awareness for reply _content_ (ephemeral, wrong store, evaporates on abort). Stream over the existing **`ui-bus` SSE channel**; insert the row on first token with a streaming status and patch `parts` as optimistic updates; sync fans out. Awareness is used only for the ephemeral "AI is drawing/typing here" cursor, never for durable content. Route a turn's UI into a thread by **tagging the part envelope with `commentId`** (keep one-turn-per-session + the existing single channel; do not invent per-thread channels — that would collide with the turn lock).

### Comment record (TrailBase)

```
comments
  id            TEXT pk        -- client-gen UUID = commentId; joins the Yjs pin
  preview_id    TEXT idx       -- env/project
  session_id    TEXT idx       -- owning session (default view filter)
  thread_id     TEXT idx       -- grouping; parent_id for nested replies
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
  last_resolved_file_hash TEXT -- doctor incrementality (catches uncommitted/same-second edits)
  created_at / updated_at / resolved_at / resolved_by
  + comments_fts (FTS5 over parts text)
```

Pin geometry (`x, y, elementId, pinState`) lives in the Yjs pin, not here.

## Source anchoring

### Layered authority

Resolve source drift in order, never silently wrong: **AST content-hash (primary) → git line-tracking (commit-granularity fallback) → DOM/visual (placement + last resort)**. Instance placement is resolved _in parallel_, not as a fallback.

### Capture (core-side; it has fs + git + a parser)

From `getElementContext()` (`file:line:col`, fiber, selector): the **source anchor** (parse the JSX node at `file:line:col` via oxc/babel → normalized AST-subtree hash + ancestor-path salt so identical leaves in different parents differ + component + git SHA + snippet) and the **instance anchor** (fiber/selector path + React key + visual rect).

### Resolve (on load / doctor)

1. Re-hash at stored `file:line:col` against the **working tree** (not `git show SHA:file`). **Match → fresh.**
2. Mismatch → search the file for the hash. **Exactly one** match → re-anchor (`moved`). **>1** match → tie-break by nearest line + instance-anchor agreement; still ambiguous → **`drifted`/`ambiguous`, surface candidates, do not auto-pick.**
3. Working-tree miss + the file is committed-clean → git maps the old commit's line into the tree (commit-granularity only; **no-ops for uncommitted edits — which is why the content-hash is the real workhorse for the dev loop**).
4. All fail → DOM/visual fallback for placement; flag `drifted` (with diff) or `orphaned`.

Instance placement runs every sweep regardless of source result (it answers "which of N").

### The `AnchorResolver` seam (swappable)

```ts
type AnchorResolver = {
  capture(target: PickedTarget): Promise<Anchor>
  resolve(anchor: Anchor): Promise<{
    status: 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
    anchor?: Anchor // updated when moved
    dom?: {selector: string; rect: Rect; instanceKey?: string} // placement
    candidates?: Anchor[] // when ambiguous
    diff?: {before: string; after: string} // when drifted
  }>
  reanchor(anchor: Anchor, target: PickedTarget): Promise<Anchor> // backs comment.reanchor
}
```

The default impl is React/TSX-specific (oxc/babel + git); the seam keeps other languages a swap away. The store promotes only `anchor_file/component/hash`; the rest stays opaque, so swapping the resolver changes only the blob + promoted columns. **Pin drift is UI-composed state, out of the resolver's scope** (the resolver owns source drift + placement only).

## Doctor

`mandarax doctor` (a `packages/cli` command) + an auto-run on a server **`session_start`** event (the extension bus already has this).

- Sweeps comments; per comment runs `resolver.resolve()`. Status mapping: `fresh`→no-op · `moved`→re-anchor, keep `open` · `drifted`/`ambiguous`→flag + diff/candidates · `orphaned`→mark. **Skips `kind: 'floating'`** (sourceless ≠ orphaned).
- **Incremental & content-addressed**: re-resolve when `current_commit != last_resolved_commit` **OR** `current_file_hash != last_resolved_file_hash`; mtime is only a fast pre-filter. This catches uncommitted and same-second saves that a commit/mtime key would miss.
- Also reconciles the commentId join (orphan pins/rows, above). Idempotent; manual + CI invocable. Prints `N fresh · M re-anchored · K drifted (review) · J orphaned`.

## Capabilities (authored against the real extension contract)

Built-in, authored with `defineExtension({id, tools}).client(mx=>…).server(mx=>…)` and `toolDefinition({name, description, inputSchema, outputSchema}).server(execute)` + `mx.registerToolRenderer(name, Card)`. Registered at engine boot as a first-party built-in (not user-discovered).

```ts
const commentCreate = toolDefinition({
  name: 'comment.create',
  description: 'Pin a comment on an element or canvas point, anchored to source.',
  inputSchema: z.object({parts: PartsSchema, anchor: AnchorInput, pin: PinSchema.optional()}),
  outputSchema: CommentSchema,
})

export default defineExtension({id: 'canvas-comments', tools: {commentCreate, commentDelete /*…*/}})
  .server((mx) => {
    mx.tools.commentCreate.server((input) => ctx.comments.create(input)) // writes row + Yjs pin
    mx.tools.commentDelete.server((input) => ctx.comments.delete(input.id)) // removes row + pin
    mx.on('session_start', () => ctx.doctor.run()) // doctor on boot
  })
  .client((mx) => {
    mx.registerToolRenderer('comment.create', CommentCard)
    mx.registerComposerAction({
      id: 'comment',
      label: 'Comment',
      icon: MessageSquare,
      onClick: (c) => c.runTool('comment.create' /* from react-grab pick */),
    })
  })
```

### Approval — enforced in the shared core execute, NOT a per-surface hook

Every invocation path — AI via `/api/mcp`, the user's UI via `ctx.runTool(...)`, and the CLI — funnels through the **same core-side `execute`**. Approval is enforced there (generalizing `permission.ts`, today Bash-only, into a tool-agnostic gate keyed by a per-tool approval policy). So a destructive call from the UI or CLI is gated identically to the AI's — closing the bypass where a `pi.on('tool_call')`-style hook would gate only the AI. The decision UI is the in-thread hybrid approval (native `part.approval` + out-of-band decision) for AI-origin calls, and a confirm dialog for user-origin calls. Policy: additive/reversible → `auto`; destructive or source-reading → `ask`. Since the contract's tool shape carries no `approval` field, the policy is declared as tool metadata and read by the gate (a small extension to the tool definition / a core policy map — flagged as a real change).

### Capability set

```
canvas.read · canvas.draw · canvas.connect · canvas.diagram(mermaid) · canvas.export
            · canvas.update · canvas.delete[ask] · canvas.clear[ask]
comment.create · comment.list(session|all) · comment.read · comment.reply
            · comment.resolve[ask] · comment.delete[ask] · comment.reanchor · comment.move/pin.setState
element.pick (user mouse, react-grab) · element.reference (AI by file/component, project-root-confined)
anchor.resolve · doctor.run · session.switch
```

Asymmetries by design: input modality (pick vs reference), viewport (viewer-local, no capability), approval authority (human-only).

## Security (new — the review found this was missing and unsafe)

mandarax's own `cors.ts` already proves loopback-binding is necessary-but-not-sufficient (a webpage you visit can `fetch` localhost; DNS-rebinding resolves a malicious domain to 127.0.0.1). The defense is Origin allowlist + **Host-header loopback check** (unforgeable by page JS) + **per-session token**. This feature must inherit it, on every new surface:

- **TrailBase is never exposed to the browser.** It binds `127.0.0.1` and is reachable **only by core**. All comment sync goes browser ↔ **core** (gated by `cors.ts`) ↔ TrailBase. "Anon Record API to the browser" is struck as unsafe.
- **The Yjs relay** binds `127.0.0.1`, validates the WS handshake Origin against the allowlist, checks Host = loopback, and requires the per-session token (in the WS URL / first frame). Room ids are not the only access control.
- **The `AnchorResolver` + `element.reference`** confine every `file` to the project root (resolve + assert, reject `../` / `file://` / symlink escape — reuse the `symbolicate.ts` fix), and apply a **secret denylist** (`.env`, `*.pem`, `id_rsa`, key files) so anchors/snippets can't capture or egress secrets into comment bodies (which flow to the model). Snippet capture is a redaction point. `element.reference` (AI-supplied path) is gated to in-project paths.
- This mirrors the `page-bus-security-gaps` memory (CORS no-auth, symbolicate path-traversal, secret egress) — those exact classes are re-introduced by this feature and must be closed, not repeated.

## AI consumption of comments (the "read for later" core loop)

This is the point of the feature, so the mechanism is explicit:

- **Pull**: `comment.list(session|all, {file?, status?})` is an MCP tool the agent calls on demand.
- **Push**: on a turn that touches a file, core auto-injects the **open + drifted comments anchored to that file** into context (via the extension's `.server` `systemPrompt.append` / a `context` event). Ask the AI to work on `Foo.tsx` and it already sees your pinned notes there — keyed to place + source, surviving across sessions.
- The AI can `comment.reply`, `comment.resolve[ask]`, or act on a comment whose `parts` carry a tool it invokes. Comments are durable, place-anchored agent memory.
- A `drifted` comment is surfaced to the AI for re-anchoring help (next: AI-assisted semantic re-anchor).

## AI legibility & discovery (so the AI knows exactly how to use it)

- Each `toolDefinition` carries `promptSnippet` + `promptGuidelines` (the contract supports both) → self-documents into the system prompt on registration (Pi parity). No hand-maintained docs.
- The tools/renderers/capabilities appear in the plugin system's **generated catalog** (`mandarax_ui catalog`, computed live from registries) — discoverable, never stored/stale.
- A **skill** `canvas-comments` + worked examples (pin a comment, generate a diagram from Mermaid, re-anchor a drifted comment) so the AI copies patterns reliably.

## Testing strategy (house rules: real browser, native assertions, no jsdom, no mocks)

- **ITs (Playwright `newPage()`, real core + real TrailBase + real Yjs):** pin a comment on an element → reload → it re-anchors `fresh`; edit the source → doctor flags `drifted` with diff; drag a pin → disconnect / accept-drift / cancel; AI `comment.create` → renders in the thread via tool-ui; a UI-origin `comment.delete` is blocked until the approval confirm; cross-session "show all" → "switch to session" → pin pans into view.
- **Anchor tests (real oxc/babel + a real git temp repo):** move a JSX node → `moved`/re-anchor; duplicated JSX → `ambiguous` (never silent); uncommitted edit → content-hash relocates where git can't; `.env` path → denylist rejects.
- **Bridge test:** Excalidraw React island mounts inside the Solid widget shadow root and pins overlay at correct coords; assert via roles/visibility, reaching the shadow root through `getByRole().getRootNode()`.

## Error handling & resilience

- The React island and each pin/thread render inside an **error boundary** — one bad element never crashes the widget (matches the extension system's isolation).
- TrailBase crash → core's supervisor restarts it; the browser stays in **degraded local-only mode** (TanStack DB + y-indexeddb) and reconciles on return.
- A resolver failure on one comment flags it `drifted`/`orphaned`; it never throws the whole doctor sweep.
- Yjs relay disconnect → keep editing locally, resync on reconnect.

## Versioning & migration

- The opaque `anchor` blob carries a `version`; a resolver declares which versions it reads and migrates older ones. Promoted columns (`anchor_file/component/hash`) are derived and rebuildable by doctor.
- TrailBase schema migrations run on core boot (the cold-start step). `parts` follows the AG-UI/tanstack part version.

## Accessibility & interaction

- Pins/threads are keyboard-navigable (focus ring, Enter opens, Esc closes), ARIA roles on thread/comment, author + status announced. Zoom controls are labelled buttons.
- Pin/tether motion animates on state transitions only and respects reduced-motion (house rule: no perpetual idle animation).

## Notifications (toasts)

- **`solid-sonner`** toasts, mounted in the widget shadow root (EnvironmentProvider for shadow-DOM, per house rule). Fired on: AI left/replied to a comment, doctor found drift (`"3 comments drifted — review"`), TrailBase reconnected, sync failure. Clicking a toast jumps to the comment (pan/zoom, switching session if needed). Respect reduced-motion; toasts animate on entry/exit only.

## Resolve workflow (greyed as completed)

- `comment.resolve[ask]` sets `status: resolved`, `resolved_at`, `resolved_by` (with author kind — **AI or Human**, shown on the resolved card). The pin + thread render **greyed/dimmed as completed** (desaturated pin, collapsed thread). Resolved comments stay queryable; a **"show resolved"** filter reveals them. `comment.reopen` reverses it (and is undoable). Resolve is `ask`, so an AI-initiated resolve prompts the human first.

## Undo / redo — everything, one stack

Every mutation already funnels through the single core-side `execute` (the same chokepoint as approval). That chokepoint records a `{label, inverse}` entry on a **per-session history stack**, so _all_ mutations are reversible through one path:

- **`history.undo` / `history.redo` are capabilities** (AI and user both — `⌘Z` / `⇧⌘Z` drive them in the UI).
- **Inverses**: create↔delete, move↔move-back, resolve↔reopen, disconnect↔reconnect, re-anchor↔restore-anchor, draw↔erase (scene delta).
- **One stack across both stores**: Excalidraw's internal undo is disabled in favor of the unified stack; scene element mutations are captured as before/after deltas, Yjs pins via `Y.UndoManager` scoped to the user origin, comment ops via their recorded inverse. A single `⌘Z` reverses the last action regardless of which store it touched.
- A new mutation invalidates the redo branch (standard). Stack is bounded (see Limits). AI-origin and user-origin actions share the stack, so "undo what the AI just did" is one keystroke.

## Limits (sane defaults — guardrails with clear errors, not product caps)

- Comment text: **16 KB** per text part · thread: **500 replies** · comments per session: soft **2,000** (keeps FTS fast).
- Canvas: **5,000 elements** per scene · Mermaid `maxEdges` 500 (Excalidraw default) · embedded image/file blobs **5 MB** each.
- Anchor snippet captured: **2 KB** · undo history: **200 entries** per session.
  These are tunable; each enforces with a clear error, never silent truncation.

## Empty state (onboarding sketch that self-deletes)

- When a session's canvas is empty, render a **nicely hand-drawn Excalidraw sketch** — a little arrow + handwritten _"Draw here, or ⌘-click an element to pin a comment →"_ pointing at the composer's comment button.
- It is **ephemeral, view-mode, non-persisted** (a client-side overlay, _not_ in the Yjs doc — so it never persists, syncs, or counts against limits).
- On the **first real interaction** (draw, pin, or an AI write) it's removed and never returns for that session.

## Observability

- Doctor runs (counts: fresh/re-anchored/drifted/orphaned), sync failures, TrailBase supervisor restarts, resolver errors, and relay disconnects log through the existing **`harness-logger`** (`packages/core/src/runtime/harness-logger.ts`). Structured, dev-visible, no telemetry egress.

## Packages / file layout

- `protocol` — `Anchor` / `AnchorResolver` contracts, capability IO schemas (Zod). (The `defineExtension`/`toolDefinition` factories come from the extension system, not here.)
- `core` — built-in canvas-comments extension registration; the shared tool `execute` + generalized approval gate; canvas Yjs store + `.ybin` persistence + gated relay; TrailBase supervisor + sole client + migrations; doctor; the default `AnchorResolver` (fs + git + oxc/babel, project-root-confined).
- `widget` — the React island (Excalidraw + y-excalidraw, bridged to Solid), Solid pins/threads (tool-ui parts, in-thread approvals), the TanStack DB comment collection (synced through core), zoom controls, "show all" + jump-to. Redirects the existing `react-grab` `comment()` sink (today dead code — net-new wiring) into a persisted, pinned comment.
- `cli` — thin citty commands over the same core `execute` (flat-input tools, or JSON arg passing for nested inputs).

## New dependencies (all require approval before install — per house rule)

`@excalidraw/excalidraw`, `yjs` (+ `Y.UndoManager`), `y-excalidraw` (vendored/forked — no npm releases/tests), `y-indexeddb`, `react` + `react-dom` (for the island), `@tanstack/db` (the comment collection — _not_ currently present; only `@tanstack/ai` is), `solid-sonner` (toasts), an oxc/babel parser, a git interface (CLI or `simple-git`). **TrailBase** is an external `trail` binary the user installs on `PATH` (NOT an npm dep) — mirroring how core spawns the external `claude` harness, which keeps it compatible with the pnpm supply-chain hardening (that hardening governs npm scripts/resolution, not a fetched binary; a postinstall-download npm package would have to be `allowBuilds`-listed, re-opening a worm vector — avoided by the PATH-binary model).

## Risks / notes

- Two unbuilt substrates underpin this (the extension system + TrailBase) — sequence accordingly; this is not a wiring job on existing infra.
- `y-excalidraw` is unreleased — vendor/fork as a reference impl.
- The React-island bridge (Excalidraw React ↔ Solid widget) is real integration work, not a drop-in.
- The default `AnchorResolver` is React/TSX-specific; other frameworks are a swap away but unimplemented.
- Repeated/list-rendered elements degrade instance identity to heuristics — flagged as `drifted` rather than mis-pinned; acceptable, documented.

```

```
