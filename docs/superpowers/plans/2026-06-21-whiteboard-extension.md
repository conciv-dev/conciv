# Whiteboard Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement task-by-task, TDD, checkpoint between phases. Work **inline** (no dispatched subagents — house rule for this project). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship `@mandarax/whiteboard` — a default-on first-party extension giving the user and the AI an equal, transparent, infinite Excalidraw canvas over the dev app, with source-anchored comments, a drift doctor, and one cross-store undo stack — built entirely on the shipped `mx` platform API.

**Architecture:** One monorepo package exporting a single `MandaraxExtension`. The data layer is **TanStack DB** (`mx.db`) for every durable/queryable thing (comment rows, parts, status, anchors). The **only** live CRDT surface is **Yjs** (`mx.sync`) for the canvas: drawing elements, pin geometry, ephemeral presence (awareness), and a `pending` queue the AI writes draws into. React appears in exactly **one file** — `island.tsx`, a dumb `<Excalidraw>` shim exposing an imperative handle; every line of feature logic lives outside React in plain TS + Solid.

**Tech Stack:** Solid (widget), React 19 + `@excalidraw/excalidraw` 0.18.x (island only, **light DOM**), Yjs + `y-websocket` + `y-indexeddb` (`mx.sync`), `@tanstack/db` + `@tanstack/solid-db` + `@tanstack/trailbase-db-collection` over `trail` (`mx.db`), `oxc-parser` + shell `git` (anchoring), `solid-sonner` (toasts), zod, h3.

## Grounding notes (read before starting)

- `docs/superpowers/notes/platform-phase0-gaps.md`, `excalidraw-react-island.md`, `trailbase-api.md`, `tanstack-db-contract.md`.
- `docs/superpowers/specs/2026-06-21-canvas-comments-extension-v2-design.md` — the feature spec.
- Memory: [[excalidraw-needs-light-dom]], [[use-library-native-ui]], [[playwright-effects-shadow-role]], plus the project memories ([[canvas-comments-infra-progress]], [[no-tool-registry-self-describe]], [[tool-ui-tanstack-convention]], [[no-stubs-or-mocks]], [[test-assertions-native]], [[work-inline-not-subagents]]).

## Global Constraints (every task)

- **Code style (hard):** functions not classes (lone exception: `island.tsx`'s React error boundary); NO IIFE; ZERO narration comments; no `any`; **no casts EXCEPT a localized assertion at a third-party branded-type boundary** (e.g. `as SocketId` — the repo does this; avoid where clean); no `else`; prefer generics; functional (map/reduce).
- **Deps:** present & approved: `yjs`, `y-indexeddb`, `y-websocket`, `@tanstack/*`, `trailbase`, `oxc-parser`, `zod`, `solid-js`, `react`, `react-dom`, `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`. **Remaining INSTALL GATE — STOP and ask:** `solid-sonner` (before Task 7.3). No `y-excalidraw`. No vendoring third-party source. Never patch deps or deviate approach without asking.
- **Testing:** real `trail` (`bootStack`) + real Chromium (`chromium.launch()` → `browser.newPage()`, NEVER `newContext()`); no mocks/jsdom/stubs. Native assertions (`getByRole`/`getByText`/`toBeVisible`/ARIA); reach the widget shadow root via `getByRole().getRootNode()`; **`getByRole` does NOT pierce the effects shadow root — use css/text/`[aria-label]` locators there** ([[playwright-effects-shadow-role]]). Run widget/whiteboard ITs with `SKIP_STORYBOOK_TESTS=1`. Parallel ITs: fresh `getPort()` per suite for trail AND page-server ports; the full whiteboard suite occasionally times out one heavy browser IT under parallel load (rerun passes) — watch it.
- **Build/typecheck:** via turborepo from the repo root (`pnpm turbo run build|typecheck --filter …`). Widget ITs load the built widget dist (which bundles whiteboard) — **rebuild whiteboard + widget before a widget IT after editing whiteboard src**.
- **Commits:** TDD per step (failing test → run → impl → pass → commit). `oxfmt` reformats on first commit of a file — when the pre-hook reformats, `git add -A` and re-run the SAME commit. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Workflow:** run every command from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/canvas-comments`; never `cd` to the main repo.

---

## STATUS — Phases 0, 1, 2 are DONE, committed, verified

Phase 0 (platform: CORS PATCH, awareness on `mx.sync`, `{sessionId,previewId}` execute-ctx, `runTool`/identity on `ClientApi`+`EffectCtx`, per-session history, widget-direct approval resume, package scaffold + loader hook, Gap-8 column, IT harness), Phase 1 (Excalidraw React island), and Phase 2 (canvas) all shipped. The extension loads built-in, the canvas toggles via the page driver, user + AI both draw, draws converge across tabs and survive reload, presence cursors show, destructive verbs gated. Verified live in `apps/examples/tanstack-start`.

**Phase 2 shipped:** room identity + Yjs keys (`room.ts`, incl. `PENDING_KEY`) · own Yjs↔scene glue (`glue.ts`) · live multi-tab sync + reload (`canvas-sync.ts`, wired in `canvas-effect.ts`) · **Excalidraw's native zoom controls** (no custom UI) · server canvas tools (`tools/canvas.ts`: read/draw/diagram/connect/update/delete/clear/export; delete+clear `ask`) · AI draw via the browser island (`ai-draws.ts`) · presence over awareness (`presence.ts`) · mermaid.

### Lessons learned in Phase 2 that CHANGE how you build the rest — carry forward

1. **Excalidraw MUST mount in light DOM, never a shadow root** ([[excalidraw-needs-light-dom]]). It hit-tests pointer gestures via `event.target`/`document.elementFromPoint`/`document.activeElement`, none of which pierce shadow DOM (excalidraw#7322/#8596; the `composedPath` fix is unmerged; the elementFromPoint/activeElement shim does NOT help — `event.target` retargeting is unshimmable). `canvas-effect.ts` mounts the island in a `document.body` light-DOM container (`position:fixed; inset:0; z-index:2147482000`, just below the effects host `2147483000`) and injects Excalidraw CSS into `document.head`. The node Solid renders into the effects shadow is now just a `[data-whiteboard-marker]`.
2. **Pins/threads (Phase 3) must layer OVER the light-DOM canvas.** Rendering them in the effects shadow root (z `2147483000`) puts them above the canvas (`2147482000`) — good — but verify pin click-targets and that the pins layer is `pointer-events:none` except on pins so it doesn't steal events from the canvas. This is exactly the cross-DOM-tree interaction that bit us; test it.
3. **Use the library's native UI, never reinvent it** ([[use-library-native-ui]]). We deleted a custom Solid zoom-controls set because Excalidraw ships zoom controls (visible even in zenMode). For Phase 7 a11y, do NOT reintroduce custom zoom controls.
4. **AI draw conversion happens in the BROWSER ISLAND, not the server.** `@excalidraw/excalidraw` cannot be imported in node (its prod build imports `roughjs/bin/rough` with no extension → native-node ESM fails — in the real dev engine too). So server `canvas.draw`/`canvas.diagram` are pure Yjs writes into a `pending` `Y.Map` (`{kind:'skeletons',elements}` or `{kind:'mermaid',source}`); `bindAiDraws` (browser) observes pending and converts via `convertToExcalidrawElements` / `parseMermaidToExcalidraw`. Apply the same rule to any future tool that would need Excalidraw at runtime. Tradeoff: AI draws materialize only when a tab is connected (pending persists in the snapshot until one is).
5. **Solid components compiled by esbuild (the whiteboard test-fixture bundler) CANNOT use Solid JSX.** `index.ts` and `canvas-effect.ts` stay JSX-free `.ts` and lazy-`import()` any Solid/React piece. For Phase 3 `pins.tsx`/`thread.tsx` (Solid JSX): EITHER test them through the **full widget** (`packages/widget/test`, vite+solid build — Solid JSX compiles there) OR write them JSX-free like `zoom-controls` was. Do not try to esbuild-bundle Solid JSX in a whiteboard fixture.
6. **Excalidraw `excalidrawAPI` fires BEFORE `initialData` settles** ([[excalidraw-initialdata-clobbers-seed]]). A scene seeded the instant the API arrives (the reopen seed) renders then gets reset to `initialData` one frame later — looked like "drawings vanish on reopen". `island.tsx` buffers scene writes in `pending` and flushes after one `requestAnimationFrame` (gated by `ready`). NOT viewport/scroll — scene went 1→0 across frames with dims/scroll fine; don't reach for scrollToContent. Repro: `packages/widget/test/canvas-persist.it.test.ts`.
7. **IT homes:** whiteboard-local ITs (glue/sync/tools/presence/mermaid) live in `packages/whiteboard/test` using `helpers/{bootStack,page,run-tool}` — `page.ts` `bundleFixture` is esbuild (react alias + `IS_PREACT` define + `css?inline`→'' stub), `servePage(html, syncHooks)` mounts the relay, fixtures build their own `y-websocket` `WebsocketProvider` client and send a real `MANDARAX_SESSION_HEADER`. Full-widget end-to-end ITs (the effect toggled in the real widget) live in `packages/widget/test/canvas-effect.it.test.ts` via `serveWidgetAsset`. `y-websocket` is a whiteboard devDep for this; `wsBase('')` now resolves to same-origin.

### Current file layout (Phases 0–2)

```
packages/whiteboard/src/
  index.ts            -- defineExtension; serverFn registers canvas tools over mx.sync + approvals
  room.ts             -- roomId, ELEMENTS_KEY / PINS_KEY / PENDING_KEY, PinGeometry, ORIGIN re-export
  canvas/
    island.tsx        -- the ONLY React file: <Excalidraw> shim -> IslandHandle (createElement, no JSX)
    island-types.ts   -- IslandHandle / IslandOpts
    glue.ts           -- Yjs<->scene diff/apply (no Excalidraw VALUE import; local CAPTURE_NEVER)
    canvas-sync.ts    -- bindCanvasSync: seed + glue over a room doc
    ai-draws.ts       -- bindAiDraws: browser converts pending skeletons/mermaid -> elements
    presence.ts       -- bindPresence: awareness <-> Excalidraw collaborators
    canvas-effect.ts  -- JSX-free effect: light-DOM island mount + CSS->head + sync/ai/presence wiring
  tools/canvas.ts     -- canvas.read/draw/diagram/connect/update/delete/clear/export (pure Yjs writes)
  test/ helpers/{boot-stack,page,run-tool}.ts + *.it.test.ts + fixtures/*
```

Phase 3+ adds: `schema.ts`, `tools/{comment,element,anchor,doctor-tool,history-tool}.ts`, `pins/{pins,thread,drag-prompt}`, `anchor/{resolver,oxc-capture,git-track,confine}.ts`, `doctor/sweep.ts`, `undo/inverses.ts`, `skills/whiteboard/SKILL.md`.

### The extension API model (follow exactly)

`defineExtension({id, tools?, effects?}).server(fn).client(fn)`. Tools that need NO services go in `meta.tools` (dual-consumed: wire/MCP execute + client render-by-`part.name`). Tools that need `mx.sync`/`mx.db` are created in `serverFn` closing over `mx.sync`/`mx.db` and registered via `mx.registerTool` (this is how `tools/canvas.ts` reaches the sync engine). `serverFn`: `mx.db.collection`, `mx.sync.room`, `mx.on`, `mx.approval`, `mx.systemPrompt.append`, `mx.registerTool`. `clientFn`: client `mx.db.collection`, `mx.registerComposerAction`, `mx.ui.*`, `mx.runTool`/`mx.previewId`/`mx.sessionId`. Effects (`meta.effects`) are client-only; `render(ctx: EffectCtx)`. Server tools get `(input, ctx: {sessionId, previewId})` → `roomId(previewId, sessionId)`.

---

## Phase 3 — Comments: collection, dual-write join, pins, threads, composer

> **Build notes from Phase 2:** the canvas lives in **light DOM**; pins/threads must layer over it (see lesson 2). `canvas-effect.ts` is JSX-free — mount Solid pin/thread layers via lazy `import()` + `render()`, and prefer testing Solid-JSX components through the full widget (lesson 5). The `comments` `mx.db` infra (TanStack DB over trail, `cidKeyedApi` shim) is already in place ([[canvas-comments-infra-progress]]).

### Task 3.1: Comment schema + columns + parse/serialize (`schema.ts`)

**Files:** Create `packages/whiteboard/src/schema.ts`; Test `packages/whiteboard/test/schema.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  export type Comment = {
    cid: string
    preview_id: string
    session_id: string
    thread_id: string
    parent_id: string | null
    parts: unknown[]
    author_kind: 'human' | 'ai'
    author_model: string | null
    status: 'open' | 'resolved' | 'drifted' | 'orphaned'
    kind: 'source-linked' | 'floating'
    anchor: unknown | null
    anchor_file: string | null
    anchor_component: string | null
    anchor_hash: string | null
    last_resolved_commit: string | null
    last_resolved_file_hash: string | null
    created_at: Date
    updated_at: Date
    resolved_at: Date | null
    resolved_by: string | null
  }
  export const CommentSchema: z.ZodType<Comment>
  export const COMMENT_COLUMNS: string // the SQL column defs (everything except platform id/cid)
  export const commentParse: Conversions<RecordShape, Comment> // ts->Date, json string->parts/anchor
  export const commentSerialize: Conversions<Comment, RecordShape> // inverse
  export const LIMITS = {partBytes: 16_384, threadReplies: 500, sessionComments: 2_000, snippetBytes: 2_048} as const
  ```
- Consumes: TrailBase scalar shape (notes/trailbase-api.md: UUID PK + `cid TEXT UNIQUE`; FTS over `parts` text); `Conversions` from `@tanstack/trailbase-db-collection` (notes/tanstack-db-contract.md). `parts`/`anchor` stored as JSON strings; `*_at` as unix ints ↔ `Date`.

- [ ] Steps: failing test (`commentSerialize(commentParse(record))` round-trips; `parts` JSON survives; a 17 KB part rejects via the limit guard) → FAIL → implement (zod + Conversions, functional) → PASS → Commit `feat(whiteboard): comment schema, columns, parse/serialize`.

---

### Task 3.2: Declare the `comments` collection on both halves

**Files:** Modify `src/index.ts` (server `.server`: `mx.db.collection('comments', {schema, columns, fts:['parts']})`; client `.client`: `mx.db.collection('comments', {schema, parse, serialize})`); Test `packages/whiteboard/test/comments-collection.it.test.ts`.

**Interfaces:**

- Produces: a server `ServerCollection<Comment>` (agent writes + `query`) and a client TanStack DB `Collection<Comment>` (optimistic + realtime). The client collection is created in `clientFn` and stored in a module accessor so pins/threads read it via `useLiveQuery`.
- Consumes: `mx.db` (`LiveDb` server / `ClientDb` client), the `cidKeyedApi` shim (already in `createClientDb`).

- [ ] **Step 1: Failing IT** — booted real stack: `mx.db.list()` includes `comments`; a server `insert` then a `browser.newPage` `useLiveQuery` over `comments` renders the row. Realtime: a second server insert appears live.
- [ ] **Step 2: FAIL. Step 3: Implement** the declarations. **Step 4: PASS.** Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- comments-collection`
- [ ] **Step 5: Commit** `feat(whiteboard): declare comments collection on mx.db`

---

### Task 3.3: `comment.create` / `comment.delete` — single execute, dual-writes row + Yjs pin

**Files:** Create `packages/whiteboard/src/tools/comment.ts`; Modify `src/index.ts` (register + `mx.approval('comment.delete','ask')`); Test `packages/whiteboard/test/comment-dualwrite.it.test.ts`.

**Interfaces:**

- Produces:
  - `comment.create({cid, kind, parts, anchor?, x, y, elementId?, author_kind, author_model?})` — ONE execute that (1) `mx.db.comments.insert(row)` with the client `cid` verbatim and (2) **only after the insert resolves**, writes the Yjs pin `pins.set(cid, {cid, x, y, elementId, pinState:'locked'})` into the room doc (DB rolls back an optimistic row on persist failure but the Yjs pin has no rollback → write the pin second to avoid orphans). `cid` is the `getKey` for both — never swapped ([[trailbase-adapter-cid-shim]]).
  - `comment.delete({cid})` `[ask]` — removes BOTH the row and the pin.
- Consumes: `ctx` → `roomId` → server `mx.sync.room`; `mx.db` server collection; returns `{__history:{label, inverse}}` (Phase 6 — for now record `create↔delete`).

- [ ] **Step 1: Failing IT** — `comment.create` with a fresh `cid` → the row is queryable AND the Yjs pin exists in the room (a `browser.newPage` shows the pin geometry); `comment.delete` removes both; `comment.delete` without approval → 403.
- [ ] **Step 2: FAIL. Step 3: Implement** (both writes in one execute, pin after insert resolves). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): comment.create/delete dual-write row + Yjs pin by cid`

---

### Task 3.4: Solid pins + tether (`pins.tsx`)

**Files:** Create `packages/whiteboard/src/pins/pins.tsx`; Modify `canvas-effect.ts` (mount a pins layer over the light-DOM canvas); Test in `packages/widget/test` (full widget — Solid JSX) per lesson 5.

**Interfaces:**

- Produces a Solid component reading the Yjs `pins` map + the `comments` collection (`useLiveQuery`) to render a pin per `cid`. Appearance is a pure function of `row.status` + Yjs geometry (no second write). `pinState:'locked'` derives screen pos from the element rect; `'offset'` floats with a faint tether line. Pins are keyboard-navigable (focus ring, Enter opens thread, Esc closes), ARIA `button` with author+status label. **The pins layer container is `pointer-events:none` except on the pins themselves** so it never steals events from the canvas beneath (lesson 2).
- Consumes: the room `pins` `Y.Map` (observe → Solid signal), `comments` live query, `ctx.page.elementAt`/rect for `locked` placement. Mounted from `canvas-effect.ts` via lazy `import()` + Solid `render()` into a container layered above the canvas (effects shadow z `2147483000` > canvas `2147482000`, or a light-DOM layer at a higher z — verify pointer coordination).

- [ ] **Step 1: Failing IT** — after `comment.create`, a pin renders at the geometry; `getByRole('button', {name:/comment/i})` reachable; status `resolved` changes its appearance (assert via aria/text, not class); a draw on the canvas still works with the pins layer present (pointer-events pass-through).
- [ ] **Step 2: FAIL. Step 3: Implement** (Solid `<For>` over pins; tether for offset; motion on state transitions only, reduced-motion respected). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): Solid pins and tether rendering`

---

### Task 3.5: Threads + parts via tool-ui (`thread.tsx`); `comment.list/read/reply/resolve`

**Files:** Create `packages/whiteboard/src/pins/thread.tsx`; Modify `tools/comment.ts`; Test in `packages/widget/test` (Solid JSX).

**Interfaces:**

- Produces:
  - `thread.tsx` — a Solid panel: replies via `parent_id`; each comment/reply renders `parts[]` through `@mandarax/tool-ui`'s `ToolCallCard` (`props.tools?.().find(matches part.name)` → `renderCall`/`renderResult`; read `part.arguments` since `part.input` is often empty — [[tanstack-part-input-empty]], [[tool-ui-tanstack-convention]]). Pass the whiteboard tool definitions as the `tools` accessor. Reply box → `mx.runTool('comment.reply', …)`; resolve button → `mx.runTool('comment.resolve', …)` (`ask`, drives the widget-direct approval flow).
  - tools: `comment.list({scope:'session'|'all', file?, status?})`, `comment.read({cid})`, `comment.reply({cid, parts})`, `comment.resolve({cid})` `[ask]`, with `promptSnippet`/`promptGuidelines`.
- Consumes: `@mandarax/tool-ui` `ToolCallCard` (`packages/tool-ui/src/index.tsx`), `mx.runTool`, the `comments` live query.

- [ ] **Step 1: Failing IT** — `comment.create` then `comment.reply` (AI author) → the reply renders in the thread; a reply carrying a tool part renders the tool card (assert by the card's visible title/role). `comment.list({scope:'session'})` returns the session's comments.
- [ ] **Step 2: FAIL. Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): comment threads with tool-ui parts, list/read/reply/resolve`

---

### Task 3.6: Composer "Comment" action + `element.pick` / `element.reference` + `session.switch`

**Files:** Create `packages/whiteboard/src/tools/element.ts`; Modify `src/index.ts` (`mx.registerComposerAction`); Test `packages/whiteboard/test/comment-pick.it.test.ts` (full widget for the pick).

**Interfaces:**

- Produces:
  - A composer action "Comment" (`registerComposerAction`) that runs the react-grab pick (`getReactGrabAdapter().comment(onGrab)` — exposes `LocateResult.source = file:line:col`; column is threaded via the Gap-8 build-injected attr), captures the source anchor (Phase 4 `capture`), and calls `ctx.runTool('comment.create', {cid: crypto.randomUUID(), kind:'source-linked', …, anchor})`. Where column is genuinely absent, degrade to rect/position and flag `drifted` (never silent).
  - `element.pick` (client) and `element.reference({file, component})` (AI, server, **project-root-confined** — Phase 4) so the AI can target by source without a mouse.
  - `session.switch({sessionId})` — a real `defineTool` that activates the session (reads/writes the active-session signal) and re-scopes the canvas room + comment query.
- Consumes: `react-grab` adapter (`packages/widget/src/react-grab/adapter.ts`), the AnchorResolver (Phase 4), `ctx.runTool`, `mx.sessionId`.

- [ ] **Step 1: Failing IT** — trigger the Comment action, pick an element, submit text → a source-linked comment row + pin with an `anchor_file` badge (assert the pin + `file:line` badge by text).
- [ ] **Step 2: FAIL. Step 3: Implement** (depends on Phase 4 `capture`; the plan orders anchoring next, so do Phase 4 first or accept `capture` returning `{source}` only and enrich in Phase 4). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): Comment composer action + element.pick/reference + session.switch`

---

### Task 3.7: Pin drag → drift prompt; `comment.move` / `pin.setState`

**Files:** Create `packages/whiteboard/src/pins/drag-prompt.tsx`; Modify `pins.tsx`, `tools/comment.ts`; Test in `packages/widget/test`.

**Interfaces:**

- Produces: dragging a source-linked pin opens a prompt — **Disconnect** (→ `kind:'floating'`, source dropped) · **Keep link, accept drift** (→ source-linked at custom offset, `pinState:'offset'`, tether) · **Cancel** (snap back). Floating pins drag freely. Tools `comment.move({cid, x, y})` and `pin.setState({cid, pinState})` are the AI equivalents. Pin drift (`pinState:'offset'`) and source drift (`status:'drifted'`) are independent and coexist; resolving source drift never re-snaps a user offset.
- Consumes: the Yjs `pins` map (geometry writes), `mx.runTool`.

- [ ] Steps: failing IT (drag a locked pin → prompt with three options by role/text; "Keep link" sets `pinState:'offset'` + draws a tether) → FAIL → implement → PASS → Commit `feat(whiteboard): pin drag drift prompt + comment.move/pin.setState`.

**Phase 3 exit gate:** user pins a source-linked comment from a pick; AI creates/reads/replies/resolves via the same tools; threads render parts via tool-ui; delete/resolve gated; pin drag handles drift; the row↔pin join is consistent (doctor reconciles edge cases in Phase 5); drawing still works with the pins layer present.

---

## Phase 4 — Source anchoring (oxc + git, project-root-confined)

> Ordering: Task 3.6 calls the resolver's `capture()`. Land `confine.ts` + `oxc-capture.ts` + `resolver.capture` (4.1–4.3) before wiring 3.6's enrichment, or accept 3.6 shipping with `capture` returning `{source}` only. The `AnchorResolver` seam is extension-owned, React/TSX-specific by default.

### Task 4.1: Project-root confinement + secret denylist (`confine.ts`)

**Files:** Create `packages/whiteboard/src/anchor/confine.ts`; Test `packages/whiteboard/test/confine.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  export function confineToRoot(root: string, file: string): string // throws on escape
  export function isSecretPath(file: string): boolean // .env, *.pem, id_rsa, *.key, etc.
  export function redactSnippet(text: string): string // strips obvious secrets from a snippet
  export const SNIPPET_LIMIT = 2_048
  ```

  `confineToRoot` MUST `await fs.realpath(root)` and `await fs.realpath(file)` (NOT `path.resolve`) before the prefix assert — `resolve()` does not dereference symlinks, so a symlink escapes on read. `packages/core/src/page/symbolicate.ts` uses `resolve()` and is **vulnerable** — harden it the same way as part of this task ([[page-bus-security-gaps]]). `isSecretPath` → no snippet captured (anchor still records file:line). `redactSnippet` detects high-entropy tokens + known prefixes (`sk_`/`pk_`/`ghp_`/`AKIA`), JWT shape, `Bearer …` (secrets in non-denylisted source files otherwise egress to the LLM). Residual inline-secret risk documented-accepted for a localhost dev tool.

- [ ] **Step 1: Failing test** (real temp dir, real symlink) — `confineToRoot(root, '../etc/passwd')` throws; `confineToRoot(root, 'src/A.tsx')` returns the absolute realpath; a symlink `<root>/escape.tsx -> /etc/passwd` throws (realpath check); a `file://` path throws; `isSecretPath('.env'|'id_rsa'|'k.pem'|'a.key')` → true; `redactSnippet` strips `AWS_SECRET=…` AND an inline `sk_live_…`/JWT; a 3 KB snippet truncates to `SNIPPET_LIMIT`.
- [ ] Step 2: FAIL. Step 3: implement (functional, no regex backtracking). Step 4: PASS. Step 5: Commit `feat(whiteboard): project-root confinement + secret denylist`.

---

### Task 4.2: oxc capture — AST-subtree hash + ancestor salt + snippet (`oxc-capture.ts`)

**Files:** Create `packages/whiteboard/src/anchor/oxc-capture.ts`; Test `packages/whiteboard/test/oxc-capture.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  export type SourceAnchor = {
    file: string
    line: number
    column: number
    component: string | null
    hash: string
    salt: string
    snippet: string
    commit: string | null
  }
  export function captureSource(opts: {
    root: string
    file: string
    line: number
    column: number
    commit: string | null
  }): Promise<SourceAnchor>
  export function hashAt(
    source: string,
    line: number,
    column: number,
  ): {hash: string; salt: string; component: string | null; snippet: string}
  ```

  Uses `oxc-parser` (repo dep) to parse, find the JSX element whose span covers `line:col`, normalize (drop whitespace/positions, keep tag + structural shape), hash for `hash`; walk ancestors for `salt`; nearest component name for `component`; raw node text (≤ `SNIPPET_LIMIT`, redacted) for `snippet`. `hashAt` is pure over a source string; `captureSource` reads the confined file.

- [ ] **Step 1: Failing test** — given `<Foo><Bar/></Foo>`, `hashAt` at `Bar` returns a stable `hash`, a `salt` differing from `<Baz><Bar/></Baz>`, `component` = enclosing function component. Same source → same hash; whitespace edits do not change it; a structural change does.
- [ ] Step 2: FAIL. Step 3: implement against the real `oxc-parser` AST (`parseSync` → `{program}`; walk `JSXElement`; use `node.start`/`node.end`). Step 4: PASS. Step 5: Commit `feat(whiteboard): oxc AST-subtree capture (hash + salt + snippet)`.

---

### Task 4.3: git line-tracking (`git-track.ts`)

**Files:** Create `packages/whiteboard/src/anchor/git-track.ts`; Test `packages/whiteboard/test/git-track.it.test.ts` (real temp git repo).

**Interfaces:**

- Produces:

  ```ts
  export function headCommit(root: string): Promise<string | null>
  export function fileHash(root: string, file: string): Promise<string> // working-tree content hash
  export function isCommittedClean(root: string, file: string): Promise<boolean>
  export function mapLineAcrossCommits(opts: {
    root: string
    file: string
    fromCommit: string
    line: number
  }): Promise<number | null>
  ```

  Shell `git` via `node:child_process` `execFile` (no shell, no new dep). **argv safety:** put `--` before path args and pass the confined absolute path as a single argv element so a crafted `file` can't become a flag. Commit-granularity; no-ops for uncommitted edits (the content-hash is the dev-loop workhorse).

- [ ] **Step 1: Failing IT** — temp repo (`git init`, commit `A.tsx` with a JSX node on line 5), insert lines above + commit; `mapLineAcrossCommits({fromCommit: first, line: 5})` returns the new line; `headCommit` returns the SHA; `isCommittedClean` true after commit, false after an uncommitted edit.
- [ ] Step 2: FAIL. Step 3: implement (parse output functionally). Step 4: PASS. Step 5: Commit `feat(whiteboard): shell-git line tracking`.

---

### Task 4.4: `AnchorResolver` (default React/TSX impl) + `anchor.resolve` tool

**Files:** Create `packages/whiteboard/src/anchor/resolver.ts`, `src/tools/anchor.ts`; Modify `src/index.ts`; Test `packages/whiteboard/test/resolver.it.test.ts`.

**Interfaces:**

- Produces (matches the spec seam verbatim):
  ```ts
  export type Anchor = {source: SourceAnchor; instance?: {selector?: string; rect?: Rect; instanceKey?: string}}
  export type ResolveResult = {
    status: 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
    anchor?: Anchor
    dom?: {selector: string; rect: Rect; instanceKey?: string}
    candidates?: Anchor[]
    diff?: {before: string; after: string}
  }
  export type PickedTarget = {file: string; line: number; column: number; rect?: Rect; selector?: string}
  export type AnchorResolver = {
    capture(target: PickedTarget): Promise<Anchor>
    resolve(anchor: Anchor): Promise<ResolveResult>
    reanchor(anchor: Anchor, target: PickedTarget): Promise<Anchor>
  }
  export function createReactAnchorResolver(opts: {root: string}): AnchorResolver
  ```
  `resolve` layered authority: (1) re-hash at stored `file:line:col` vs working tree → match = `fresh`; (2) mismatch → search file for the hash: one = `moved` (re-anchor), >1 → tie-break by nearest line + instance agreement, still ambiguous = `ambiguous` (surface `candidates`, never auto-pick); (3) working-tree miss + committed-clean → `mapLineAcrossCommits`; (4) all fail → `dom` placement, flag `drifted` (+`diff`) or `orphaned`. Instance placement resolves **in parallel**, not as a fallback. Every `file` through `confineToRoot`; secret paths skip snippet.
- `anchor.resolve({cid})` → loads the comment's `anchor`, runs `resolver.resolve`, returns status + candidates/diff (does not mutate — doctor mutates).

- [ ] **Step 1: Failing IT** (real oxc + real temp git) — capture on a JSX node; **move** the node → `moved` with re-anchored `anchor`; **duplicate** the JSX → `ambiguous` with `candidates`, never silent; an **uncommitted edit** that shifts it → content-hash relocates where git can't (`moved`); a **`.env`** target → confinement/denylist rejects.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: Commit `feat(whiteboard): React/TSX AnchorResolver + anchor.resolve`.

**Phase 4 exit gate:** capture/resolve/reanchor work against real oxc + git; ambiguous never silently re-pins; secrets never egress; every file path confined.

---

## Phase 5 — Doctor (drift sweep + session_start auto-run + CLI)

### Task 5.1: Doctor sweep (`sweep.ts`)

**Files:** Create `packages/whiteboard/src/doctor/sweep.ts`, `src/tools/doctor-tool.ts`; Modify `src/index.ts` (register `doctor.run`, `mx.on('session_start', …)`); Test `packages/whiteboard/test/doctor.it.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  export type DoctorReport = {fresh: number; reanchored: number; drifted: number; orphaned: number}
  export function runDoctor(opts: {
    root: string
    previewId: string
    sessionId: string
    comments: ServerCollection<Comment>
    resolver: AnchorResolver
    room: SyncRoom
  }): Promise<DoctorReport>
  ```
  Sweeps comments (skips `kind:'floating'`). Per comment runs `resolver.resolve`: `fresh`→no-op; `moved`→re-anchor (`comments.update(cid, {anchor, anchor_file, anchor_component, anchor_hash, last_resolved_commit, last_resolved_file_hash})`, keep `open`); `drifted`/`ambiguous`→`{status:'drifted'}` + store diff/candidates; `orphaned`→`{status:'orphaned'}`. **Incremental & content-addressed:** re-resolve only when `current_commit != last_resolved_commit` OR `current_file_hash != last_resolved_file_hash`. Reconciles the row↔pin join: pin with no row → drop pin; row with no pin → re-materialize from the anchor rect or mark `orphaned`. Idempotent. A resolver failure on one comment flags it, never throws the sweep. **Run the pin-without-row reconciliation on canvas mount too, not only `session_start`.**
- `doctor.run({})` returns the report. `mx.on('session_start', …)` auto-runs.

- [ ] **Step 1: Failing IT** (real oxc + git + trail) — source-linked comment; edit source so the node drifts; sweep → `drifted` with a diff; a Yjs pin with no row → sweep drops it; counts correct; re-run with no changes is a no-op (assert resolver not re-invoked when commit+file-hash unchanged).
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: Commit `feat(whiteboard): doctor sweep + session_start auto-run`.

---

### Task 5.2: `mandarax doctor` CLI command

**Files:** Create `packages/cli/src/doctor.ts`; Modify `packages/cli/src/bin.ts`; Test `packages/cli/test/doctor.it.test.ts`.

**Interfaces:** a `mandarax doctor` command (citty, matching `packages/cli/src/*` which hit `cli-http`/`request.ts`) that calls `doctor.run` and prints `N fresh · M re-anchored · K drifted (review) · J orphaned`. Print + exit 0 unless `--strict` (exit 1 if drift > 0).

- [ ] **Step 1: Failing IT** — boot a stack with the whiteboard extension + a drifted comment; run the CLI; assert stdout contains the report line and drift count.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: Commit `feat(cli): mandarax doctor command`.

**Phase 5 exit gate:** drift detected on session start + on demand; join reconciled; CLI reports it; incremental re-resolution; one bad comment never throws.

---

## Phase 6 — Undo / redo: one cross-store stack

### Task 6.1: Inverse descriptors for every mutating tool (`inverses.ts`)

**Files:** Create `packages/whiteboard/src/undo/inverses.ts`; Modify each mutating tool to return `{__history:{label, inverse}}`; Test `packages/whiteboard/test/inverses.it.test.ts`.

**Interfaces:** inverse builders (functional) for `comment.create↔delete`, `comment.move↔move-back`, `comment.resolve↔reopen`, pin `disconnect↔reconnect`, `anchor.reanchor↔restore`, `canvas.draw↔erase`, `canvas.delete↔restore`, `canvas.clear↔restore-all`. Each `execute` returns `{result, __history:{label, inverse: () => Promise<void>}}` capturing the before-state at execute time. Core `History` (Phase 0) stores opaque `inverse` thunks per session (recorded at BOTH `run.ts` and `mcp.ts` chokepoints). Excalidraw internal undo stays disabled (we apply remote/AI with `captureUpdate: NEVER`; the cross-store stack is authoritative).

- [ ] **Step 1: Failing IT** — `comment.create` then core `history.undo` (run route, same session) removes BOTH row and pin; `canvas.draw` then `history.undo` erases the scene delta (element disappears in a `browser.newPage`); a new mutation invalidates redo.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: Commit `feat(whiteboard): cross-store inverse descriptors for undo/redo`.

---

### Task 6.2: `history.undo` / `history.redo` capabilities + UI hotkeys

**Files:** Create `packages/whiteboard/src/tools/history-tool.ts`; Modify `canvas-effect.ts` (⌘Z/⇧⌘Z); Test in `packages/widget/test`.

**Interfaces:** `history.undo({})`/`history.redo({})` tools (thin wrappers over the core history capability for the request session). UI: `⌘Z`/`⇧⌘Z` bound in the canvas effect call `mx.runTool`. Bounded 200/session. AI + user share the stack.

- [ ] **Step 1: Failing IT** — draw, `⌘Z` → disappears; `⇧⌘Z` → returns; AI `canvas.draw` then user `⌘Z` reverses the AI's draw.
- [ ] Step 2: FAIL. Step 3: implement (keydown in the effect host, reduced-motion-aware). Step 4: PASS. Step 5: Commit `feat(whiteboard): history.undo/redo capabilities + ⌘Z hotkeys`.

**Phase 6 exit gate:** a single `⌘Z` reverses the last action across stores; redo works; new mutation invalidates redo; AI + user share one bounded stack.

---

## Phase 7 — Polish: limits, empty state, notifications, a11y, security, skill

### Task 7.1: Limits enforced with clear errors (never silent truncation)

**Files:** Modify `schema.ts`, `tools/comment.ts`, `tools/canvas.ts`; Test `packages/whiteboard/test/limits.it.test.ts`.

Enforce with explicit thrown errors: comment text 16 KB/part · thread 500 replies · comments/session soft 2,000 (warn) · canvas 5,000 elements/scene · Mermaid `maxEdges` 500 (already in `canvas.diagram`) · blob 5 MB · anchor snippet 2 KB · undo history 200/session. No silent truncation; soft limits log via `harness-logger` (confirm the exact export in `packages/core/src/runtime/harness-logger.ts`).

- [ ] Steps: failing IT (17 KB part → error; 501st reply → error; 5,001st element → error) → FAIL → implement guards → PASS → Commit `feat(whiteboard): enforce limits with explicit errors`.

---

### Task 7.2: Empty state

**Files:** Create `packages/whiteboard/src/canvas/empty-state.ts` (JSX-free if mounted from `canvas-effect.ts`); Test in `packages/widget/test`.

When a session's canvas is empty, render a hand-drawn Excalidraw sketch ("Draw here, or ⌘-click an element to pin a comment →") — ephemeral, non-persisted (never written to the Yjs doc); removed on first real interaction, never returns for that session (per-session in-memory "dismissed" flag).

- [ ] Steps: failing IT (fresh session → prompt visible; draw once → gone, does not return on reload) → FAIL → implement → PASS → Commit `feat(whiteboard): ephemeral canvas empty state`.

---

### Task 7.3: Notifications via solid-sonner

> **INSTALL-APPROVAL GATE:** ASK to add `solid-sonner` to `packages/whiteboard` (or `@mandarax/widget`). Do not install until approved.

**Files:** Create `packages/whiteboard/src/notify.ts`; Modify relevant tools/effects; Test in `packages/widget/test`.

`solid-sonner` toasts (mounted where they're visible over the canvas — coordinate with the light-DOM layering). Fired on: AI left/replied a comment, doctor found drift, sync reconnected, sync failure. Clicking a toast jumps to the comment (pan/zoom, switching session via `session.switch` if needed). Animate on entry/exit only ([[motion-settled-not-constant]]).

- [ ] Steps: failing IT (AI `comment.reply` → toast with author by role/text; click → focuses the pin) → FAIL → implement → PASS → Commit `feat(whiteboard): solid-sonner notifications`.

---

### Task 7.4: Accessibility pass

**Files:** Modify `pins.tsx`, `thread.tsx`; Test in `packages/widget/test`. (No custom zoom controls — Excalidraw's native zoom is used.)

Pins/threads keyboard-navigable (focus ring, Enter opens, Esc closes), ARIA roles, author + status announced (`aria-label`/`aria-live`). Pin/tether motion animates on state transitions only; respects `ctx.env.reducedMotion()`.

- [ ] Steps: failing IT (Tab reaches a pin; Enter opens; Esc closes; accessible name includes author + status; reduced-motion → no transition animation) → FAIL → implement → PASS → Commit `feat(whiteboard): pin/thread keyboard nav + ARIA + reduced-motion`.

---

### Task 7.5: Security verification (closes the known gap classes)

**Files:** Test-only `packages/whiteboard/test/security.it.test.ts`; small hardening edits if a check fails.

Asserts end to end: `element.reference`/resolver confine every `file` to the project root (reject `../`/`file://`/symlink escape); secret denylist blocks `.env`/`*.pem`/`id_rsa`/key files from snippet egress; cross-origin `comment.update`/resolve/delete works (CORS `PATCH`) only from an allowed loopback origin, rejected from a disallowed origin; approval gate blocks destructive verbs until decided. **Document the trust assumption:** `sessionId` is derived from a forgeable header and `cors.ts` trusts all loopback origins, so room/comment isolation rests on session-id unguessability — assert the session token has sufficient entropy and is not enumerable (single-developer-localhost trust model). Observability through `harness-logger`; no telemetry egress.

- [ ] Steps: failing IT (`../` file → rejected; disallowed Origin → 403; `comment.delete` blocked until approval; session token entropy) → FAIL (or PASS if already enforced — assert it stays) → harden if needed → Commit `test(whiteboard): security guarantees`.

---

### Task 7.6: AI legibility — skill + prompt self-documentation

**Files:** Create `skills/whiteboard/SKILL.md` (+ worked examples); confirm every `defineTool` carries `promptSnippet` + `promptGuidelines`; Test: catalog check.

A `whiteboard` skill describing the canvas + comment loop with worked examples (pin a comment, draw a Mermaid diagram, re-anchor a drifted comment, list comments on a file). Each tool's `promptSnippet`/`promptGuidelines` self-document into the system prompt. Docs follow [[docs-writing-style]] (no em dashes, concise, example-first).

- [ ] Steps: write the skill + examples; assert all whiteboard tools expose a `promptSnippet`; Commit `docs(whiteboard): whiteboard skill + tool prompt self-documentation`.

**Phase 7 exit gate:** limits explicit; empty state ephemeral and non-returning; toasts fire and navigate; pins/threads accessible and reduced-motion-aware; confinement/denylist/CORS/approval verified; the AI can discover and drive the feature from the prompt + skill.

---

## Open risks carried into execution

- **Light-DOM canvas ↔ shadow/overlay pins (Phase 3):** the canvas is light DOM; the pins/threads layer sits above it. Getting pointer-events pass-through right (pins clickable, canvas drawable beneath) is the cross-DOM-tree interaction most likely to bite — test drawing-with-pins-present explicitly.
- **Solid JSX bundling (Phase 3+):** `pins.tsx`/`thread.tsx` are Solid JSX — test through the full widget (vite+solid) or write JSX-free; do not esbuild-bundle Solid JSX in a whiteboard fixture.
- **Instance anchoring** degrades to rect/position heuristics (no stable selector/fiber/key across the react-grab seam) — flag `drifted`, never silently re-pin (4.4).
- **`solid-sonner`** is the last install-approval gate (7.3).
- **Parallel IT flakiness:** the full whiteboard suite occasionally times out one heavy browser IT under load; reruns pass. Consider a `fileParallelism` cap if it worsens.
