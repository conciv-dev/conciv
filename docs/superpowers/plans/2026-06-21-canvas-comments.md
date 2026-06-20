# Canvas + Source-Anchored Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A transparent infinite Excalidraw canvas overlay on the dev app where the user and the AI leave source-anchored, threaded comments that survive code edits via git-like content hashing, all local-first and exposed identically to AI (MCP), user (UI), and CLI.

**Architecture:** mandarax core (Node, 127.0.0.1) is the only process the browser talks to. Core owns the canvas Yjs `.ybin` blobs and is the sole client of TrailBase (an external `trail` binary). The canvas surface is an Excalidraw + y-excalidraw React island inside the Solid widget; pins/threads stay Solid (tool-ui). Comments use TanStack DB (browser, optimistic) syncing through core to TrailBase. canvas-comments ships as a first-party built-in authored with the merged `defineExtension`/`defineTool` contract.

**Tech Stack:** Solid (widget), React (Excalidraw island only), Yjs + y-excalidraw + y-indexeddb, @excalidraw/excalidraw, @tanstack/db, TrailBase (`trail` binary + SQLite/FTS5), oxc/babel parser + git for anchoring, solid-sonner, the merged `@mandarax/extensions` contract, h3 core server, Playwright ITs.

---

## How this plan is structured (read before executing)

This is a 10-phase feature spanning multiple independent subsystems. Rather than emit thousands of lines of speculative step-code up front, this document is:

1. A **complete phase roadmap** (Phase 0–9) — every spec section maps to a phase (see "Spec coverage map" at the end). Each phase has a goal, file list, interfaces, test strategy, dependencies, approval gates, and an explicit deliverable that is testable in the real app/browser.
2. **Phase 0 and Phase 1 fully broken into bite-sized TDD steps with code** — this is the immediate next work and it is execution-ready.
3. Phases 2–9 detailed at **task granularity**. Each is expanded into bite-sized TDD steps _just-in-time_, in this same document, immediately before it is executed — and re-approved then. This matches the "build incrementally with my approval at each phase" model and lets the Phase 1 spike's findings reshape later phases before their code is written.

**Approval checkpoint at every phase boundary.** Do not start a phase before its expansion is approved. Do not install any npm dependency before its named approval gate is cleared.

---

## Global Constraints

Copied verbatim from the spec and house rules. Every task's requirements implicitly include this section.

- **Worktree:** all work in `.claude/worktrees/canvas-comments` (branch `worktree-canvas-comments`, now merged up to `origin/main` 517ff92 which contains the extension system). Never `cd` to the main repo root or any other worktree.
- **Local-first, on disk:** durable artifacts under `<cwd>/.mandarax/`, owned by local processes. Browser uses an optimistic local cache; durable sync is background. Never the cloud.
- **Browser never talks to a backend directly.** TrailBase binds `127.0.0.1` and is reachable _only by core_. All comment sync is browser ↔ core (gated by `cors.ts`) ↔ TrailBase. The Yjs relay binds loopback, validates Origin + Host-header-loopback + per-session token.
- **Security parity with `cors.ts`:** Origin allowlist + Host-header loopback check + per-session token on every new surface. `AnchorResolver` + `element.reference` confine every `file` to project root (reject `../`, `file://`, symlink escape — reuse the `symbolicate.ts` fix) and apply a secret denylist (`.env`, `*.pem`, `id_rsa`, key files) at the snippet-capture redaction point.
- **TrailBase is an external `trail` binary on `PATH`** (like the `claude` harness binary) — NOT an npm dependency. Core spawns + supervises it.
- **Code style:** functions not classes; no IIFEs; one-line comments only (zero narration comments in production code; prefer map/reduce over if/else; clear names). oxfmt: no semicolons, single quotes.
- **Widget is Solid.** The Excalidraw island is the _only_ React. Pins/threads/tool-ui stay Solid.
- **Testing:** real browser via Playwright `newPage()` (never `newContext()` — leaks); native assertions (getByRole/getByText/toBeVisible/aria — never querySelector/class selectors/`toBe(true)` on DOM, including inside `page.evaluate`); reach the shadow root via `getByRole().getRootNode()`; no jsdom/happy-dom; no mocks/stubs — hit real core, real TrailBase, real Yjs, real oxc/babel, real git temp repos. Parallel browser tests need a unique `browser.api.port`.
- **Build/typecheck via turbo**, not manual dist rebuilds. Widget code changes → browser hard-reload; core/harness/tool-description/system-prompt changes → restart `pnpm dev`.
- **Ask before installing any npm dep.** The full dep list is enumerated per phase with named approval gates.
- **v0/pre-release:** reshape APIs freely, no back-compat shims, update all call sites.
- **AI canvas writes are never full-scene overwrites:** emit a skeleton or Mermaid → `convertToExcalidrawElements`/`parseMermaidToExcalidraw` → `updateScene({captureUpdate: NEVER})`, granular id-keyed ops only.
- **Limits (enforce with clear errors, never silent truncation):** comment text 16 KB/part · thread 500 replies · 2,000 comments/session (soft) · 5,000 canvas elements/scene · Mermaid maxEdges 500 · image/file blob 5 MB · anchor snippet 2 KB · undo history 200 entries/session.

## Contract deltas (spec language vs. what actually merged)

The spec was written against an assumed contract. The merged `@mandarax/extensions` differs — **use the real names, build the real gaps:**

| Spec says                                             | Reality on the branch                                                                                               | Action                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `toolDefinition({...})`                               | `defineTool({...})` (`packages/extensions/src/contract.ts:120`)                                                     | Use `defineTool`.                                     |
| `mx.on('session_start' \| 'tool_execution_start')`    | **No event bus exists**                                                                                             | Build it (Phase 3).                                   |
| composer action `c.runTool(...)`                      | `ComposerActionCtx = {insert, notify}` only                                                                         | Add `runTool` (Phase 3).                              |
| "registered at engine boot as a built-in"             | Discovery is **file-based only** (`packages/plugin/src/core/extensions.ts`)                                         | Build a built-in registration path (Phase 3).         |
| react-grab `getElementContext()` (col/fiber/selector) | adapter uses `getSource()` → `{componentName,filePath,lineNumber}` (`packages/widget/src/react-grab/adapter.ts:56`) | Switch to `getElementContext()` (Phase 5).            |
| Approval in the shared core `execute`                 | `permission.ts` is **Bash-only**; no single shared tool `execute` chokepoint                                        | Generalize the gate + build the chokepoint (Phase 8). |

## File Structure (where each subsystem lives)

- `packages/protocol/src/canvas-comments/` — `Anchor`, `AnchorResolver`, capability IO Zod schemas, `Thread`/`Comment`/`Pin` types. (The `defineExtension`/`defineTool` factories come from `@mandarax/extensions`, not here.)
- `packages/extensions/src/contract.ts` — extend with the event bus (`mx.on`) + `ServerApi.emit` plumbing; `ComposerActionCtx.runTool`.
- `packages/core/src/extensions/builtins.ts` — engine-boot built-in registration path.
- `packages/core/src/canvas/` — `canvas-store.ts` (`.ybin` persistence, mirrors `store/session-store.ts`), Yjs relay (gated), `state-paths.ts` gets `canvasDir`.
- `packages/core/src/comments/` — TrailBase supervisor + sole client + migrations; the comment `execute` (writes row + Yjs pin); doctor.
- `packages/core/src/anchor/` — default `AnchorResolver` (oxc/babel + git, project-root-confined, secret denylist).
- `packages/core/src/execute/` — the shared tool `execute` chokepoint + generalized approval gate + undo/redo history stack.
- `packages/core/src/extensions/canvas-comments/` — the built-in extension (`defineExtension`) wiring all the above to capabilities.
- `packages/widget/src/canvas/` — the React island (`island.tsx` React root, `excalidraw-yjs.ts` y-excalidraw bridge), Solid `pins.tsx`/`threads.tsx`/`zoom-controls.tsx`, `comment-collection.ts` (TanStack DB), `shadow-react.ts` (mount React into the Solid shadow root).
- `packages/widget/vendor/y-excalidraw/` — vendored/forked binding (no npm release).
- `packages/cli/src/commands/doctor.ts` — `mandarax doctor`.
- `packages/widget/src/spike/` — **Phase 1 throwaway** spike entry (deleted or graduated after Phase 2).

---

## Phase 0 — Prerequisites: TrailBase binary + dependency approval + ground truth

**Goal:** `trail` runs locally and its supervisor contract is known; the npm dependency list is approved; a preflight script proves the environment. No feature code.

**Files:**

- Create: `scripts/preflight-canvas-comments.mjs` (throwaway env check)
- Create: `docs/superpowers/notes/trailbase-binary.md` (version, install method, spawn/migrate/query contract)

**Approval gate (deps for later phases — confirm the list now, install per-phase):**
`@excalidraw/excalidraw`, `react`, `react-dom`, `yjs`, `y-indexeddb`, `@tanstack/db`, `solid-sonner`, an oxc or babel parser (`oxc-parser` vs `@babel/parser` — decide in Phase 6), a git interface (shell `git` vs `simple-git` — decide in Phase 6). `y-excalidraw` is **vendored**, not installed. `trail` is a **PATH binary**, not npm.

- [ ] **Step 1: Confirm `trail` install method** — locate the official `trail` binary release (version + checksum + how it lands on PATH). Record in `docs/superpowers/notes/trailbase-binary.md`: exact version, the spawn command core will use, the migration command, and a one-row insert+select smoke query.

- [ ] **Step 2: Install `trail` on PATH and verify**

Run: `trail --version`
Expected: prints a version string (matches the recorded version).

- [ ] **Step 3: Write the preflight script**

```js
// scripts/preflight-canvas-comments.mjs
import {execFileSync} from 'node:child_process'

const checks = [
  ['trail', ['--version']],
  ['node', ['--version']],
  ['pnpm', ['--version']],
]

const results = checks.map(([bin, args]) => {
  try {
    const out = execFileSync(bin, args, {encoding: 'utf8'}).trim()
    return {bin, ok: true, out}
  } catch (e) {
    return {bin, ok: false, out: String(e.message)}
  }
})

for (const r of results) console.log(`${r.ok ? 'OK ' : 'FAIL'} ${r.bin}: ${r.out}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
```

- [ ] **Step 4: Run preflight, verify it passes**

Run: `node scripts/preflight-canvas-comments.mjs`
Expected: three `OK` lines, exit 0.

- [ ] **Step 5: Real TrailBase smoke test** — spawn `trail` against a throwaway `.mandarax/_smoke/comments.db`, run the migration, insert one row, select it back, confirm FTS5 is available. Record the exact commands that worked in the notes file (these become the supervisor + migration contract for Phase 4).

Run: the recorded spawn + migrate + insert + select sequence.
Expected: the inserted row comes back; FTS5 query returns it.

- [ ] **Step 6: Commit**

```bash
git add scripts/preflight-canvas-comments.mjs docs/superpowers/notes/trailbase-binary.md
git commit -m "chore(canvas-comments): phase 0 preflight + trailbase binary contract"
```

**Deliverable:** `trail` present and characterized; preflight green; dependency list approved. **Approval gate before Phase 1: confirm the Phase 1 dep subset (`react`, `react-dom`, `@excalidraw/excalidraw`, `yjs`, `y-indexeddb`) for install.**

---

## Phase 1 — Canvas spike: Excalidraw React island in the Solid shadow root + Yjs (local-only)

**Goal:** De-risk the single hardest integration before any core wiring: an Excalidraw + y-excalidraw React island, mounted _inside the Solid widget's shadow root_, bound to a Yjs doc, as a transparent infinite overlay, persisting locally via y-indexeddb. **No core, no TrailBase, no extension system.** This is a throwaway spike under `packages/widget/src/spike/` that either graduates into `packages/widget/src/canvas/` in Phase 2 or is deleted.

**Why first:** the spec calls out three real risks — the React-island-in-Solid-shadow-DOM bridge, the y-excalidraw vendoring, and the origin-tagged feedback-loop guard. All three are provable cheaply, locally, in a real browser, with zero backend.

**Files:**

- Create: `packages/widget/vendor/y-excalidraw/` (vendored binding)
- Create: `packages/widget/src/spike/canvas-island.tsx` (React root: `<Excalidraw>` + y-excalidraw)
- Create: `packages/widget/src/spike/mount-island.ts` (mount React into a Solid-owned shadow root node; transparent overlay + pointer-events flip)
- Create: `packages/widget/src/spike/yjs-doc.ts` (Y.Doc + y-indexeddb + origin-tagged transactions)
- Create: `packages/widget/test/spike-canvas.it.test.ts` (Playwright `newPage()`)
- Modify: `packages/widget/package.json` (add `react`, `react-dom`, `@excalidraw/excalidraw`, `yjs`, `y-indexeddb` — **after Phase 0 approval gate**)

**Interfaces:**

- Produces: `createCanvasDoc(): {doc: Y.Doc; elements: Y.Map; origin: {USER; AI; REMOTE; REHYDRATE}; localCache: IndexeddbPersistence}` — consumed by Phase 2 when the doc gains a core relay provider.
- Produces: `mountCanvasIsland(host: HTMLElement, doc: Y.Doc): () => void` (returns dispose) — the React-into-shadow mount, reused by Phase 2.

- [ ] **Step 1: Install the Phase 1 deps** (gate cleared in Phase 0)

Run: `pnpm --filter @mandarax/widget add react react-dom @excalidraw/excalidraw yjs y-indexeddb`
Expected: installs; `pnpm --filter @mandarax/widget exec tsc --noEmit` still resolves (types present).

- [ ] **Step 2: Vendor y-excalidraw** — copy the y-excalidraw source into `packages/widget/vendor/y-excalidraw/`, adapt imports to the installed `yjs`/`@excalidraw/excalidraw` versions, add a one-line provenance comment (source repo + commit). Export its binding factory.

- [ ] **Step 3: Write the failing IT** (real browser; asserts the island mounts in the shadow root and a drawn shape survives reload)

```ts
// packages/widget/test/spike-canvas.it.test.ts
import {test, expect} from '@playwright/test'
import {startWidgetServer} from './helpers/widget-server'

test('excalidraw island mounts in the shadow root and persists a shape across reload', async ({browser}) => {
  const page = await browser.newPage()
  const {base, close} = await startWidgetServer(SPIKE_HTML)
  try {
    await page.goto(base, {waitUntil: 'domcontentloaded'})
    // Reach the Excalidraw canvas through the widget shadow root (house rule).
    const canvas = page.getByRole('img', {name: /excalidraw/i})
    await expect(canvas).toBeVisible()
    // Draw one rectangle programmatically through the spike's test hook (sets a Y.Map element).
    await page.evaluate(() => (window as any).__SPIKE__.addRect())
    await expect(page.getByTestId('spike-element-count')).toHaveText('1')
    await page.reload({waitUntil: 'domcontentloaded'})
    // y-indexeddb rehydrates: the element is still there with no backend.
    await expect(page.getByTestId('spike-element-count')).toHaveText('1')
  } finally {
    await page.close()
    await close()
  }
})
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm --filter @mandarax/widget test spike-canvas`
Expected: FAIL (island/test hook not built yet).

- [ ] **Step 5: Build `yjs-doc.ts`** — `createCanvasDoc()` with a `Y.Map` of elements, `IndexeddbPersistence` cache, and the origin enum. All writes wrap in `doc.transact(fn, origin)`; rehydrate uses `origin.REHYDRATE`.

- [ ] **Step 6: Build `canvas-island.tsx`** — a React component rendering `<Excalidraw>` with `viewBackgroundColor: 'transparent'`, zen mode on, chrome hidden, bound to the Y.Doc via the vendored y-excalidraw binding. The outbound Excalidraw→Yjs writer fires only for local user edits (tag `origin.USER`); inbound applies non-user origins with `captureUpdate: NEVER`. Expose `window.__SPIKE__.addRect()` and a `spike-element-count` testid reading `elements.size`.

- [ ] **Step 7: Build `mount-island.ts`** — create a host `div` (transparent, `position: fixed; inset: 0`, `pointer-events: none` idle), append it into a Solid-owned shadow root, `createRoot` a React root on it, render the island, flip `pointer-events: auto` when active. Return a dispose that unmounts the React root and removes the host. `SPIKE_HTML` injects the built widget bundle and calls `mountCanvasIsland`.

- [ ] **Step 8: Run the IT, verify it passes**

Run: `pnpm --filter @mandarax/widget build && pnpm --filter @mandarax/widget test spike-canvas`
Expected: PASS (island visible in shadow root; count `1` survives reload).

- [ ] **Step 9: Add the two-writer feedback-loop guard test** — second test: open the same doc twice (two `createCanvasDoc` over one IndexeddbPersistence room in one page, or two pages on the same room) and assert a `USER`-origin write in one shows up in the other via `REMOTE` origin **without** echoing back (no duplicate element, no infinite loop). Assert the local undo stack ignored the remote edit.

Run: `pnpm --filter @mandarax/widget test spike-canvas`
Expected: PASS (no echo, count stable, remote edit not in local undo).

- [ ] **Step 10: Commit**

```bash
git add packages/widget/src/spike packages/widget/vendor/y-excalidraw packages/widget/test/spike-canvas.it.test.ts packages/widget/package.json pnpm-lock.yaml
git commit -m "feat(canvas-comments): phase 1 spike — excalidraw react island in solid shadow root + yjs (local-only)"
```

**Deliverable:** proven React-island-in-Solid-shadow + Yjs transparent canvas, persisting locally, with a working origin-tag feedback guard — no backend. **Approval gate before Phase 2:** review the spike; decide graduate-vs-rewrite of `src/spike/` into `src/canvas/`.

---

## Phase 2 — Core canvas store: `.ybin` persistence + gated Yjs relay

**Goal:** Move authority of the canvas doc to core. Core persists `Y.encodeStateAsUpdate` to `<cwd>/.mandarax/canvas/<previewId>/<sessionId>.ybin`, rehydrates on boot, and serves a gated Yjs relay; the widget syncs to it (y-indexeddb demoted to offline cache).

**Files:**

- Create: `packages/core/src/canvas/canvas-store.ts` (mirrors `packages/core/src/store/session-store.ts`: unstorage fs-lite, one blob per room)
- Modify: `packages/core/src/runtime/state-paths.ts` (add `canvasDir`)
- Create: `packages/core/src/canvas/relay.ts` (Yjs sync over the existing h3 server; gated: Origin allowlist + Host loopback + per-session token, reusing `cors.ts`)
- Modify: widget `src/spike/yjs-doc.ts` → graduate to `src/canvas/yjs-doc.ts`, add the core relay provider; keep y-indexeddb as cache
- Create: `packages/core/test/canvas-store.it.test.ts`, `packages/widget/test/canvas-relay.it.test.ts`

**Interfaces:**

- Consumes: `createCanvasDoc` / `mountCanvasIsland` (Phase 1).
- Produces: `canvasStore.load(room): Uint8Array | null`, `canvasStore.persist(room, update)` (debounced), `room = ${previewId}:${sessionId}`.
- Produces: relay endpoint URL + handshake contract (token in WS URL/first frame).

**Tasks (expand to bite-sized before executing):**

1. `canvasDir` in state-paths + `canvas-store.ts` with debounced persist + boot rehydrate (origin `core-rehydrate` so load never re-broadcasts). Test: persist update → read back equal bytes; rehydrate a fresh store from disk.
2. Gated relay on the h3 server: reject bad Origin, non-loopback Host, missing/wrong token; accept valid. Test: real WS handshake — bad token rejected, good token syncs an update core→browser and browser→core.
3. Widget doc connects to relay; draw in browser → `.ybin` on disk grows → restart core → element rehydrates into a fresh page. Test: full round-trip IT.

**Deliverable:** canvas survives core restart from `.ybin`; relay enforces the security gate; two browsers on one room converge through core. **No comments yet.**

---

## Phase 3 — canvas-comments as a first-party built-in + the missing extension-system seams

**Goal:** Build the three extension-system gaps (event bus, composer `runTool`, built-in registration) and stand up the canvas-comments extension skeleton registered at engine boot, exposing the first canvas capabilities (`canvas.read`, `canvas.draw`) end-to-end (MCP + a composer action + a tool renderer).

**Files:**

- Modify: `packages/extensions/src/contract.ts` (add `ServerApi.on(event, handler)` + the event-name union `'session_start' | 'tool_execution_start'`; add `runTool` to `ComposerActionCtx`)
- Modify: `packages/extensions/src/index.ts` + `collectServerContributions` (collect handlers)
- Create: `packages/core/src/extensions/builtins.ts` (register a built-in extension at engine boot, alongside file-discovered ones — `packages/core/src/engine.ts`)
- Modify: `packages/core/src/engine.ts` / `turn.ts` (emit `session_start` on session start, `tool_execution_start` before a tool runs)
- Modify: widget extension-runtime (`packages/widget/src/extension-runtime.ts`) to supply `runTool` into the composer-action ctx (wire to the session client's tool-run path)
- Create: `packages/core/src/extensions/canvas-comments/index.ts` (the `defineExtension` skeleton)
- Create: `packages/protocol/src/canvas-comments/schemas.ts` (Zod IO for the first capabilities)
- Tests: `packages/extensions/test/event-bus.test.ts`, `packages/core/test/builtin-registration.it.test.ts`, `packages/widget/test/composer-runtool.it.test.ts`

**Interfaces:**

- Produces: `mx.on('session_start' | 'tool_execution_start', handler)` on `ServerApi`.
- Produces: `ComposerActionCtx = {insert; notify; runTool: (name, input) => Promise<unknown>}`.
- Produces: `registerBuiltinExtension(ext: MandaraxExtension)` consumed by the engine boot path.
- Produces: `canvas.read` / `canvas.draw` capabilities (Zod schemas in protocol).

**Tasks (expand before executing):**

1. Event bus on the contract + `collectServerContributions` collects handlers; engine emits the two events. Test (unit): registering an `on('session_start')` handler fires when the engine emits.
2. Built-in registration path: a `defineExtension` registered at boot without a `mandarax/extensions/*` file; its tools land in the same `extensionTools` list + catalog. Test: built-in tool appears in `mandarax_extensions catalog`.
3. Composer `runTool` wired through the widget extension-runtime → session client. Test (IT): a registered composer action invokes a tool and the result renders.
4. canvas-comments skeleton: `canvas.read` returns the scene; `canvas.draw` applies a skeleton via `convertToExcalidrawElements` → `updateScene({captureUpdate: NEVER})` (core writes the authoritative doc; relay fans out). Renderer registered. Test (IT): `canvas.draw` from the agent path appears on the canvas; `canvas.read` returns it.

**Deliverable:** the extension contract has the seams the spec assumed; canvas-comments is a real built-in; AI can draw and read the canvas through MCP and a composer action.

---

## Phase 4 — Comments store: TanStack DB (browser) ↔ core ↔ TrailBase + the commentId join

**Goal:** Durable comments. Core spawns/supervises TrailBase (the sole client), runs migrations, exposes a gated comment-sync endpoint; the browser holds an optimistic TanStack DB collection in IndexedDB; `comment.create`/`comment.delete` are single core executes writing **both** the TrailBase row and the Yjs pin, joined by a client-generated UUID.

**Dependency approval gate:** `@tanstack/db` (install). `trail` already present (Phase 0).

**Files:**

- Create: `packages/core/src/comments/trailbase-supervisor.ts` (spawn + restart `trail`, bound 127.0.0.1, reachable only by core)
- Create: `packages/core/src/comments/trailbase-client.ts` (sole client; SQL + FTS5)
- Create: `packages/core/src/comments/migrations/` (the `comments` + `comments_fts` schema from the spec)
- Create: `packages/core/src/comments/comment-execute.ts` (create/delete: row + Yjs pin in one execute; verbatim UUID)
- Create: `packages/core/src/api/comments/sync.ts` (gated endpoint — `cors.ts` Origin + Host + token)
- Create: `packages/widget/src/canvas/comment-collection.ts` (TanStack DB, IndexedDB persistence, upsert-by-pk dedupe, background sync through core; degraded local-only mode)
- Tests: `packages/core/test/comments-store.it.test.ts` (real `trail`), `packages/widget/test/comment-sync.it.test.ts`

**Interfaces:**

- Consumes: canvas Yjs doc + relay (Phase 2), `comment.create`/`comment.delete` capability registration (Phase 3 pattern).
- Produces: `comments.create(input): Comment` and `comments.delete(id)` (core executes) writing row + pin atomically.
- Produces: the `comments` table schema + `Comment` type (`packages/protocol/src/canvas-comments/`).

**Tasks (expand before executing):**

1. Supervisor + client + migrations on boot (cold-start order: spawn → ready → migrate → open endpoint). Test (real trail): boot, migrate, insert+select a row, FTS5 search hits.
2. `comment-execute.ts`: one execute writes the TrailBase row + the Yjs pin keyed by the same UUID; delete removes both. Test: create → row exists AND pin exists with matching id; delete → both gone.
3. Browser TanStack DB collection: optimistic create (instant local), background sync through core, upsert-by-pk collapses the echo. Test (IT): create offline-fast → row appears with no node round-trip, then syncs.
4. Degraded mode: kill `trail` → browser still reads/writes local; mutations queue; reconcile on restart. Test (IT): kill supervisor, create a comment, restart, confirm reconcile.

**Deliverable:** durable comments through core to real TrailBase, optimistic in the browser, one UUID joining row+pin, degraded-mode safe.

---

## Phase 5 — Pins, threads, overlay UI (Solid) + composer comment action + react-grab redirect

**Goal:** The user-facing comment surface. Solid pins/threads render over the canvas (tool-ui parts), a composer "Comment" action pins from a react-grab pick, and the dead react-grab `comment()` sink is redirected into a persisted comment. Drag rule + pin state + tether.

**Files:**

- Modify: `packages/widget/src/react-grab/adapter.ts` (switch `getSource()` → `getElementContext()` for `columnNumber`/`fiber`/`selector`/`stack`; redirect the `comment()` sink into `comment.create`)
- Create: `packages/widget/src/canvas/pins.tsx` (Solid; geometry from Yjs pin, appearance = fn(row.status, geometry); locked/offset + tether)
- Create: `packages/widget/src/canvas/threads.tsx` (Solid; renders `parts[]` by `part.name`, reading `part.arguments` since `part.input` is often empty — per the tool-ui convention)
- Create: `packages/widget/src/canvas/zoom-controls.tsx` (in/out/reset-100/fit; comment list doubles as nav)
- Create: composer action registration in the canvas-comments client half (`registerComposerAction` + `runTool`)
- Tests: `packages/widget/test/comment-pin.it.test.ts`, `packages/widget/test/pin-drag.it.test.ts`

**Interfaces:**

- Consumes: `comment.create` (Phase 4), `getElementContext()` output, the Yjs pin geometry.
- Produces: `PickedTarget` (file:line:col + fiber + selector + rect) consumed by the Phase 6 resolver `capture()`.

**Tasks (expand before executing):**

1. react-grab `getElementContext` switch + `PickedTarget` shape. Test: picking `<Icon/>` on a shared JSX line yields a distinct column from `<Label/>`.
2. Redirect `comment()` sink + composer "Comment" action → `comment.create` from a pick. Test (IT): ⌘-click element → pin appears → thread renders.
3. Pins/threads Solid rendering (tool-ui parts, in-thread). Test (IT): a comment with a text part + a tool part renders both via tool-ui.
4. Drag rule: Disconnect / Keep-link-accept-drift / Cancel; `pinState` locked vs offset + tether line. Test (IT): drag a source-linked pin → three choices behave correctly; floating pins drag freely.

**Deliverable:** a user can pin a source-linked comment on an element, thread on it, and drag it with the three-way prompt — all persisted.

---

## Phase 6 — Source anchoring: the `AnchorResolver` seam (two coordinates)

**Goal:** Make a source-linked comment survive code edits. Capture a **source anchor** (file:line:col + normalized AST-subtree hash + ancestor-path salt + component + git SHA + snippet) and an **instance anchor** (fiber/selector/key/rect); resolve via AST content-hash → git line-tracking → DOM/visual, never silently wrong. Project-root-confined + secret denylist.

**Dependency approval gate:** the oxc-vs-babel parser choice and the git interface choice (shell `git` vs `simple-git`) — decide and install here.

**Files:**

- Create: `packages/protocol/src/canvas-comments/anchor.ts` (the `Anchor` + `AnchorResolver` types from the spec)
- Create: `packages/core/src/anchor/resolver.ts` (default React/TSX impl: parser + git, confinement, denylist)
- Create: `packages/core/src/anchor/ast-hash.ts` (normalized AST-subtree hash + ancestor salt)
- Create: `packages/core/src/anchor/confine.ts` (reuse the `symbolicate.ts` path-traversal fix; secret denylist at snippet capture)
- Modify: `comment-execute.ts` (call `resolver.capture()` on create; promote `anchor_file`/`anchor_component`/`anchor_hash`)
- Tests: `packages/core/test/anchor.test.ts` (real parser + real git temp repo)

**Interfaces:**

- Consumes: `PickedTarget` (Phase 5), the `comments` table `anchor`/promoted columns (Phase 4).
- Produces: `AnchorResolver = {capture; resolve; reanchor}` exactly as the spec's seam; consumed by doctor (Phase 7) and `comment.reanchor` (Phase 8).

**Tasks (expand before executing):**

1. `Anchor`/`AnchorResolver` schemas + AST-hash with ancestor salt. Test: identical leaf JSX under different parents hash differently.
2. `capture()` from `PickedTarget`; confinement + denylist. Test: `.env`/`*.pem`/`../escape` rejected; in-project path captures a 2 KB-capped snippet.
3. `resolve()` layered authority: re-hash at file:line:col (fresh) → search file for hash (1 match = moved, >1 = ambiguous, surface candidates) → git line-map (committed-clean only) → DOM/visual fallback (drifted/orphaned). Instance placement runs every sweep. Tests (real git temp repo): move a JSX node → `moved`; duplicate JSX → `ambiguous` (never silent); uncommitted edit → content-hash relocates where git can't.

**Deliverable:** the resolver correctly classifies fresh/moved/drifted/orphaned/ambiguous against real parser + git, confined + redacted.

---

## Phase 7 — Doctor: re-anchor sweep + drift surfacing

**Goal:** `mandarax doctor` (CLI) + an auto-run on the `session_start` event (built in Phase 3) that sweeps comments, re-anchors `moved`, flags `drifted`/`ambiguous` with diff/candidates, marks `orphaned`, skips `floating`, and reconciles the commentId join — incrementally via content-hash.

**Files:**

- Create: `packages/cli/src/commands/doctor.ts` (thin citty command over the core sweep)
- Create: `packages/core/src/comments/doctor.ts` (the sweep; status mapping; `last_resolved_commit` + `last_resolved_file_hash` incrementality; join reconcile)
- Modify: canvas-comments built-in `.server` → `mx.on('session_start', () => doctor.run())`
- Create: drift UI in `pins.tsx`/`threads.tsx` (diff view, candidate picker, drifted/orphaned badges; never silently re-snap a user offset)
- Tests: `packages/core/test/doctor.it.test.ts`, `packages/widget/test/drift-ui.it.test.ts`

**Interfaces:**

- Consumes: `AnchorResolver.resolve` (Phase 6), the comment store (Phase 4), the event bus (Phase 3).
- Produces: `doctor.run(): {fresh; reAnchored; drifted; orphaned}` printed as `N fresh · M re-anchored · K drifted (review) · J orphaned`.

**Tasks (expand before executing):**

1. The sweep + status mapping + skip-floating + incrementality (re-resolve only when commit or file-hash changed; mtime is a pre-filter). Test (real git): edit a file → only the affected comment re-resolves.
2. Join reconcile (pin-no-row → drop pin; row-no-pin → re-materialize or `orphaned`). Test: orphan a pin → doctor drops it.
3. CLI command + `session_start` auto-run. Test (IT): boot a session → doctor runs → drifted comment shows a diff badge in the UI.

**Deliverable:** drift is detected and surfaced (diff/candidates), the AI/user can act on it, and it runs both manually and on session start.

---

## Phase 8 — AI collaborator: MCP tools + the shared execute + generalized approval + streaming + undo/redo

**Goal:** Close the parity loop. Generalize the approval gate, route every surface (MCP/UI/CLI) through one core `execute` chokepoint, give the AI the full capability set, stream replies over ui-bus SSE tagged by commentId, and build the unified undo/redo stack.

**Files:**

- Create: `packages/core/src/execute/execute.ts` (the single chokepoint: approval gate + undo `{label, inverse}` recording, per-session stack)
- Modify: `packages/core/src/api/chat/permission.ts` (generalize Bash-only → tool-agnostic gate keyed by per-tool approval policy; policy declared as tool metadata / a core policy map)
- Create: `packages/core/src/execute/history.ts` (per-session bounded stack; create↔delete, move↔move-back, resolve↔reopen, disconnect↔reconnect, re-anchor↔restore, draw↔erase; `history.undo`/`history.redo` as capabilities)
- Modify: canvas-comments built-in (full capability set: `canvas.connect/diagram/export/update/delete[ask]/clear[ask]`, `comment.list/read/reply/resolve[ask]/reanchor/move`, `pin.setState`, `element.reference`, `anchor.resolve`, `session.switch`, `history.undo/redo`)
- Modify: harness context injection (push: auto-inject open+drifted comments for a touched file via `systemPrompt.append`/context event; pull: `comment.list`)
- Modify: streaming via `packages/core/src/runtime/ui-bus.ts` (tag the part envelope with `commentId`; insert row on first token, patch `parts` optimistically)
- Modify: Excalidraw island (disable internal undo; `Y.UndoManager` scoped to user origin for pins); in-thread hybrid approval (native `part.approval` + out-of-band decision)
- Tests: `packages/core/test/approval-gate.it.test.ts`, `packages/widget/test/ai-comment.it.test.ts`, `packages/widget/test/undo-redo.it.test.ts`, `packages/widget/test/streaming-reply.it.test.ts`

**Interfaces:**

- Consumes: every capability execute from Phases 3–7 (re-routed through the chokepoint).
- Produces: `execute(tool, input, origin): result` (the single path); `history.undo()/redo()`; the approval policy map.

**Tasks (expand before executing):**

1. The shared `execute` chokepoint + generalized approval (policy: additive/reversible → `auto`; destructive/source-reading → `ask`). Test (IT): a UI-origin `comment.delete` is blocked until the confirm; an AI-origin destructive call prompts in-thread; both gated identically.
2. Full AI capability set incl. `canvas.diagram` (Mermaid → `parseMermaidToExcalidraw`) + AI collaborator cursor; ported sanitize/repair/few-shot from the local-model spike. Test (IT): AI `comment.create` renders in the thread via tool-ui; AI `canvas.diagram` draws a Mermaid diagram.
3. Push/pull context injection. Test (IT): ask the AI to work on `Foo.tsx` → it already sees the pinned open/drifted comments anchored there.
4. Streaming over ui-bus tagged by commentId. Test (IT): an AI reply streams token-by-token into the right thread; abort leaves no orphan row.
5. Unified undo/redo (one stack across both stores; Excalidraw internal undo off; Y.UndoManager for pins; comment ops via recorded inverse). Test (IT): AI draws + pins → one ⌘Z reverses the last action regardless of store; redo invalidated by a new mutation.

**Deliverable:** AI and user reach the same capabilities through one gated, undoable execute; comments are durable place-anchored agent memory; replies stream; approvals are in-thread.

---

## Phase 9 — Hardening, polish, ship

**Goal:** Everything the spec lists as resilience, security, a11y, and ship readiness.

**Files (modify across packages):** error boundaries (React island + each pin/thread); limits enforcement with clear errors; security review pass (TrailBase loopback-only, relay gating, resolver confinement + denylist — close the `page-bus-security-gaps` classes); `canvas.export` (.excalidraw/SVG/PNG); a11y (keyboard-nav pins/threads, ARIA roles, labelled zoom buttons, reduced-motion); `solid-sonner` toasts mounted in the shadow root (EnvironmentProvider); the self-deleting empty-state sketch (ephemeral, not in the Yjs doc); observability through `harness-logger`; versioning/migration (`anchor.version`, rebuildable promoted columns); the `canvas-comments` skill + worked examples.

**Dependency approval gate:** `solid-sonner` (install).

**Tasks (expand before executing):**

1. Error boundaries + limits (each limit a clear error). Test: one bad element doesn't crash the widget; over-limit gives a clear error, not silent truncation.
2. Security review (dedicated pass with the security-and-hardening skill): DNS-rebinding/Origin/Host/token on every surface; `.env`/key egress blocked at snippet capture; symlink/`../` escape rejected. Test: the spec's security ITs (`.env` denylist, bad-origin relay reject, browser-can't-reach-TrailBase).
3. Polish: toasts (jump-to on click), empty-state self-delete, `canvas.export`, a11y, reduced-motion, observability logs.
4. The `canvas-comments` skill + worked examples (pin a comment, Mermaid diagram, re-anchor a drifted comment); confirm `promptSnippet`/`promptGuidelines` self-document into the system prompt and the catalog lists everything live.

**Deliverable:** production-quality, secure, accessible, observable canvas-comments. Then `superpowers:finishing-a-development-branch` for merge/PR.

---

## Spec coverage map (self-review)

| Spec section                                                                                                | Phase(s)                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Prerequisites (extension system, TrailBase)                                                                 | 0 (TrailBase), 3 (extension seams)                                 |
| Architecture / two sync paths / commentId join                                                              | 2 (Yjs), 4 (comments + join)                                       |
| Stores — Canvas (Yjs, .ybin, three writers, origin tag, export)                                             | 1, 2, 8 (export in 9)                                              |
| Stores — Comments (TanStack DB ↔ core ↔ TrailBase, degraded)                                                | 4                                                                  |
| Cold start                                                                                                  | 4                                                                  |
| Scoping (previewId+sessionId, show-all, switch-session)                                                     | 2 (room), 4 (filters), 8 (session.switch)                          |
| The overlay (React island, transparent/infinite, zoom, AI cursor)                                           | 1 (island), 5 (zoom), 8 (AI cursor)                                |
| Comments — kinds, two coordinates, pin state, drag rule, drifts, authorship/status/threads/parts, streaming | 5 (pins/threads/drag), 6 (two coordinates), 8 (streaming/parts/AI) |
| Comment record (TrailBase schema)                                                                           | 4                                                                  |
| Source anchoring (layered authority, capture, resolve, seam)                                                | 6                                                                  |
| Doctor                                                                                                      | 7                                                                  |
| Capabilities + approval + capability set                                                                    | 3 (first tools), 8 (full set + gate)                               |
| Security                                                                                                    | 2 (relay), 4 (TrailBase fronting), 6 (resolver), 9 (review)        |
| AI consumption (push/pull)                                                                                  | 8                                                                  |
| AI legibility & discovery (promptSnippet, catalog, skill)                                                   | 3 (catalog), 9 (skill)                                             |
| Testing strategy                                                                                            | every phase (real browser/TrailBase/git ITs)                       |
| Error handling & resilience                                                                                 | 9                                                                  |
| Versioning & migration                                                                                      | 4 (schema), 9 (anchor.version)                                     |
| Accessibility, notifications, resolve workflow, empty state, observability                                  | 9                                                                  |
| Undo/redo                                                                                                   | 8                                                                  |
| Limits                                                                                                      | 9                                                                  |

**Open decisions deferred into phases (not blocking):** oxc vs babel + git interface (Phase 6 gate); graduate-vs-rewrite of the spike (Phase 2 gate); each npm install behind its named gate.
