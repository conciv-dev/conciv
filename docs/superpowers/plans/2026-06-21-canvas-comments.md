# Canvas + Source-Anchored Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A transparent infinite Excalidraw canvas overlay on the dev app where the user and the AI leave source-anchored, threaded comments that survive code edits via git-like content hashing, all local-first and exposed identically to AI (MCP), user (UI), and CLI.

**Architecture:** mandarax core (Node, 127.0.0.1) is the only process the browser talks to. Core owns the canvas Yjs `.ybin` blobs and is the sole client of TrailBase (an external `trail` binary). The canvas **sync/store layer is plain framework-agnostic TypeScript** (Yjs + our own thin glue against Excalidraw's official `onChange`/`updateScene` API). React renders _only_ the `<Excalidraw>` component (it ships React-only); Solid renders pins/threads/composer. Both frameworks are dumb edges that call the same plain-TS store. Comments use TanStack DB (browser, optimistic) syncing through core to TrailBase. canvas-comments ships as a first-party built-in authored with the merged `defineExtension`/`defineTool` contract.

**Tech Stack:** plain TypeScript sync layer (the brain), Solid (widget UI), React (renders the `<Excalidraw>` component only), Yjs + y-indexeddb, @excalidraw/excalidraw, @tanstack/db, TrailBase (`trail` binary + SQLite/FTS5), oxc/babel parser + git for anchoring, solid-sonner, the merged `@mandarax/extensions` contract, h3 core server, Playwright ITs.

**Stack decisions made during execution (override the spec where they conflict):**

- **No vendoring.** Never copy third-party source into the repo. `y-excalidraw` is **dropped entirely** (obscure single-maintainer). We write our own ~150-line plain-TS Yjs↔Excalidraw glue against Excalidraw's official API.
- **Jazz evaluated and rejected** for the canvas: it's a whole data-layer framework (would replace Yjs _and_ TrailBase _and_ TanStack DB, with a client-connects-to-sync-server model that fights our browser-talks-only-to-core rule) and still wouldn't bind Excalidraw for us. Yjs (mainstream CRDT) + our glue is the lean choice.
- **The sync/store layer is plain TS**, not Solid or React — both frameworks just consume it.

---

## Build status (as of this session)

Branch `worktree-canvas-comments`, all committed, **~82 tests green (real Yjs / sqlite / oxc-parser / http, no mocks)**.

- **Phase 0** ✅ trail verified, preflight, contract notes.
- **Phase 1** ✅ spike proved Excalidraw-in-Solid-shadow + our own Yjs glue, then deleted (findings kept).
- **Phase 2** ✅ core `.ybin` store + `CanvasRelay` + gated SSE/POST canvas routes + widget relay-client.
- **Phase 3** ✅ extension event bus (`mx.on`) + composer `runTool` + canvas-comments built-in + shared `/api/tools/run`.
- **Phase 4** ✅ `node:sqlite` comment store + FTS5 + commentId join (row + Yjs pin in one execute) + comment tools.
- **Phase 5** 🟡 backend done (comment.create captures source anchor from a pick; browser comment-client). **UI pending** (see blocker).
- **Phase 6** ✅ AnchorResolver (AST content-hash + ancestor salt, confinement + secret denylist).
- **Phase 7** ✅ doctor sweep + CLI + `session_start` auto-run + `/api/canvas/doctor`.
- **Phase 8** ⬜ not started (AI streaming/undo/approval gate).
- **Phase 9** ⬜ not started (hardening/polish/ship).

**Deviations (all flagged in commits, reversible behind seams):** no vendoring / dropped y-excalidraw (own glue); `node:sqlite` instead of trail Record-API; line-only anchoring (react-grab 0.1.44 has no structured column/fiber/selector); deferred: relay per-session token, git commit-granularity anchor fallback, doctor incrementality.

**Phase 5 UI blocker — packaging decision:** the widget ships as a single **IIFE global** which can't code-split, so a `dynamic import()` of the Excalidraw island (~1MB React) inlines into the initial bundle, defeating lazy-load. Options: (a) build the overlay as a _separate_ prod IIFE that core serves and the widget injects on toggle (productionize the spike pattern); (b) accept Excalidraw in the main bundle for v1; (c) switch the widget to a code-splitting format. This gates the real Excalidraw-overlay + Solid pins/threads UI.

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
- `packages/widget/src/canvas/` — **plain-TS** `store.ts` (Y.Doc + elements + y-indexeddb + origin-tagged writes + `bind(excalidrawApi)` glue, framework-agnostic), `excalidraw-island.ts` (minimal React render of `<Excalidraw>` wired to the store — the only React), Solid `pins.tsx`/`threads.tsx`/`zoom-controls.tsx`, `comment-collection.ts` (TanStack DB), `mount-island.ts` (mount the React render into the Solid shadow root).
- `packages/cli/src/commands/doctor.ts` — `mandarax doctor`.
- `packages/widget/src/spike/` — **Phase 1 throwaway** spike entry (deleted or graduated after Phase 2).

---

## Phase 0 — Prerequisites: TrailBase binary + dependency approval + ground truth

**Goal:** `trail` runs locally and its supervisor contract is known; the npm dependency list is approved; a preflight script proves the environment. No feature code.

**Files:**

- Create: `scripts/preflight-canvas-comments.mjs` (throwaway env check)
- Create: `docs/superpowers/notes/trailbase-binary.md` (version, install method, spawn/migrate/query contract)

**Approval gate (deps for later phases — confirm the list now, install per-phase):**
`@excalidraw/excalidraw`, `react`, `react-dom`, `yjs`, `y-indexeddb` (Phase 1 — **installed**), `@tanstack/db`, `solid-sonner`, an oxc or babel parser (`oxc-parser` vs `@babel/parser` — decide in Phase 6), a git interface (shell `git` vs `simple-git` — decide in Phase 6). **No `y-excalidraw`** (dropped — we write our own glue). **No vendoring** of any third-party source. `trail` is a **PATH binary**, not npm.

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

## Phase 1 — Canvas spike: plain-TS Yjs store + our own Excalidraw glue + Solid shadow-root mount (local-only)

**Goal:** De-risk the hardest integration before any core wiring, with **no third-party binding** and a **framework-agnostic core**:

1. A **plain-TS** `store.ts` (Yjs doc + elements + y-indexeddb + origin-tagged writes + a `bind(excalidrawApi)` that wires Excalidraw's official `onChange`/`updateScene` to Yjs). No React, no Solid — this is the testable brain.
2. A **minimal React render** of `<Excalidraw>` (the only React) that calls `store.bind(api)`.
3. Mount that render into the **Solid widget's shadow root** as a transparent infinite overlay; persist locally via y-indexeddb.

**No core, no TrailBase, no extension system, no y-excalidraw, no vendoring.** Throwaway spike under `packages/widget/src/spike/` that graduates into `packages/widget/src/canvas/` in Phase 2 or is deleted.

**Why first:** three real risks — (a) our own Yjs↔Excalidraw glue (no library), (b) the React-render-inside-a-Solid-shadow-root bridge, (c) the origin-tagged feedback-loop guard (so a Yjs change we apply via `updateScene` doesn't bounce back through `onChange` into Yjs forever). All provable cheaply, locally, real browser, zero backend.

**Files:**

- Create: `packages/widget/src/spike/store.ts` — **plain TS**, framework-agnostic (the heart)
- Create: `packages/widget/src/spike/excalidraw-render.ts` — minimal `React.createElement(Excalidraw, …)`, calls `store.bind` (no JSX → sidesteps the Solid JSX transform)
- Create: `packages/widget/src/spike/mount.ts` — mount the React render into a Solid-owned shadow root; transparent overlay + pointer-events flip
- Create: `packages/widget/src/spike/entry.ts` — isolated IIFE spike entry (own vite build → `dist/spike-canvas.global.js`; zero prod-bundle pollution)
- Create: `packages/widget/vite.spike.config.ts` + a `build:spike` script
- Create: `packages/widget/test/spike-canvas.it.test.ts` (Playwright `newPage()`)
- Modify: `packages/widget/package.json` — deps already installed (`react`, `react-dom`, `@excalidraw/excalidraw`, `yjs`, `y-indexeddb`, `@types/react*`); add `fractional-indexing`? **No** — our own glue uses Yjs array order, not fractional indices.

**Interfaces:**

- Produces: `createCanvasStore(roomId): {doc; elements; bind(api): () => void; addElement(el); count(): number; origin: {USER; REMOTE; REHYDRATE}; dispose()}` — plain TS, consumed unchanged by Phase 2 (which adds a core relay provider to the same doc) and by the Solid pins layer (reads geometry).
- Produces: `mountCanvasSpike(shadowRoot): () => void` (dispose) — the React-into-shadow mount.

- [ ] **Step 1: Write the failing test for the plain-TS store** (Yjs glue, no browser needed for this unit — runs under vitest node, real Yjs)

```ts
// packages/widget/test/spike-store.test.ts — real Yjs, no mocks
import {test, expect} from 'vitest'
import {createCanvasStore} from '../src/spike/store'

test('a USER write lands in the elements array and a REMOTE-origin apply does not echo back', () => {
  const a = createCanvasStore('room-1')
  const b = createCanvasStore('room-1')
  // simulate sync: pipe a's updates into b and vice versa via Y.applyUpdate with REMOTE origin
  a.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== b.origin.REMOTE) b.applyRemote(u)
  })
  b.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== a.origin.REMOTE) a.applyRemote(u)
  })
  a.addElement({id: 'r1', version: 1})
  expect(a.count()).toBe(1)
  expect(b.count()).toBe(1) // synced
  // no echo: b applying a's update as REMOTE must not re-emit a USER update back to a
  a.addElement({id: 'r2', version: 1})
  expect(b.count()).toBe(2)
  expect(a.count()).toBe(2) // stable, no duplicate from echo
})
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm --filter @mandarax/widget test spike-store` → FAIL (no `store.ts` yet).

- [ ] **Step 3: Build `store.ts`** (plain TS) — `createCanvasStore(roomId)`: a `Y.Doc`, `elements = doc.getArray('elements')`, `IndexeddbPersistence(roomId, doc)` (guarded so it no-ops under node/vitest where IndexedDB is absent), origin tags `{USER, REMOTE, REHYDRATE}`. `addElement` wraps `doc.transact(fn, origin.USER)`; `applyRemote(update)` calls `Y.applyUpdate(doc, update, origin.REMOTE)`; `bind(api)` (added in Step 6) subscribes `api.onChange` (push USER edits → elements) and `elements.observe` (non-USER origin → `api.updateScene({captureUpdate: NEVER})`), skipping its own origin so no echo.

- [ ] **Step 4: Run it, verify it passes** — `pnpm --filter @mandarax/widget test spike-store` → PASS.

- [ ] **Step 5: Write the failing browser IT** (real browser; the React render mounts inside the Solid shadow root and a drawn element persists across reload)

```ts
// packages/widget/test/spike-canvas.it.test.ts
import {afterAll, beforeAll, expect, it, describe} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {readFileSync} from 'node:fs'
import {startWidgetServer} from './helpers/widget-server.js'

const spikeBundle = readFileSync(new URL('../dist/spike-canvas.global.js', import.meta.url), 'utf8')
const SPIKE_HTML = `<!doctype html><html><head><meta name="pw-api-base" content=""></head>
  <body><script>${spikeBundle}</script></body></html>`

describe('canvas spike (it) — real browser', () => {
  let browser: Browser
  let close: (() => Promise<void>) | undefined
  const state = {base: ''}
  beforeAll(async () => {
    ;({base: state.base, close} = await startWidgetServer(SPIKE_HTML))
    browser = await chromium.launch()
  }, 90_000)
  afterAll(async () => {
    await browser?.close()
    await close?.()
  })

  it('mounts the excalidraw render in the shadow root and persists across reload', async () => {
    const page = await browser.newPage()
    await page.goto(state.base, {waitUntil: 'domcontentloaded'})
    await expect(page.getByTestId('spike-count')).toHaveText('0')
    await page.evaluate(() => (window as any).__SPIKE__.addRect())
    await expect(page.getByTestId('spike-count')).toHaveText('1')
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByTestId('spike-count')).toHaveText('1') // y-indexeddb rehydrated, no backend
    await page.close()
  })
})
```

- [ ] **Step 6: Build the glue + render + mount + entry + spike vite config** — `bind(api)` in `store.ts` (origin-guarded onChange↔elements↔updateScene); `excalidraw-render.ts` (`createElement(Excalidraw, {excalidrawAPI: api => store.bind(api), viewModeEnabled:false, ...transparent + zen + chrome-hidden})`, inject Excalidraw's CSS into the shadow root); `mount.ts` (`createShadowRoot()` reuse → host div pointer-events flip → `createRoot` React → render); `entry.ts` exposes `window.__SPIKE__.addRect()` + a `spike-count` testid node reading `store.count()`; `vite.spike.config.ts` (solid() plugin, entry `src/spike/entry.ts`, IIFE → `dist/spike-canvas.global.js`).

- [ ] **Step 7: Build the spike bundle + run the IT** — `pnpm --filter @mandarax/widget build:spike && pnpm --filter @mandarax/widget test spike-canvas` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/widget/src/spike packages/widget/test/spike-*.test.ts packages/widget/vite.spike.config.ts packages/widget/package.json pnpm-lock.yaml
git commit -m "feat(canvas-comments): phase 1 spike — plain-ts yjs store + own excalidraw glue in solid shadow root (local-only)"
```

**Deliverable:** proven plain-TS Yjs store + our own Excalidraw glue, rendered inside the Solid shadow root, persisting locally, with a working origin-tag feedback guard — no backend, no third-party binding.

### Phase 1 outcome — PROVEN, then deleted (rebuild clean in Phase 2)

The spike validated the approach end-to-end (Excalidraw rendered in a shadow root, our own Yjs glue applied elements, a drawn element survived reload via y-indexeddb, all in real Chromium). The throwaway code (incl. all test-ids/hooks) was then **deleted**; Phase 2 rebuilds the canvas for real, wired into the actual widget + core. **Confirmed findings to apply in Phase 2 (these are the real deliverable):**

1. **No third-party binding needed.** Our own ~40-line plain-TS Yjs↔Excalidraw glue against Excalidraw's official `onChange`/`updateScene` works. `y-excalidraw` stays dropped.
2. **React MUST be deduped** — `resolve: {dedupe: ['react', 'react-dom']}`. Without it, Excalidraw's hooks read `null` (`Cannot read properties of null (reading 'useLayoutEffect')`) because pnpm resolves React twice.
3. **Excalidraw in a browser bundle needs** `define: {'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"'}`. Its font-subsetting worker uses `import.meta` (harmless warning in non-ESM output; affects only font subsetting/export, not rendering).
4. **Excalidraw renders inside an open shadow root** with its CSS (`@excalidraw/excalidraw/index.css?inline`) injected as a `<style>` into that root. No portal/measurement breakage observed.
5. **Excalidraw 0.18.1 + React 19.2 work together** despite the `^0.17` peer range.
6. **Origin-tag model** (`USER` / `EXCALIDRAW` / `REMOTE` / `REHYDRATE`): the Yjs→Excalidraw `updateScene` applier skips `EXCALIDRAW`-origin changes (no echo); the network relay skips `REMOTE`-origin updates (no ping-pong). Excalidraw→Yjs writes only version-changed elements.
7. **Build/test isolation:** a feature build that doesn't use UnoCSS must bypass postcss discovery (`css: {postcss: {plugins: []}}`) or it fails loading the unbuilt `@mandarax/uno-preset`. Widget ITs can run their own tiny http server instead of the bundle-coupled `widget-server.ts` helper.

**Approval gate before Phase 2:** approve the Phase 2 expansion (core canvas store + `.ybin` + gated relay, built against these findings).

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
