# Whiteboard on Jazz — Migration Plan (replace Yjs + trailbase + TanStack DB with Jazz)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement task-by-task, TDD, checkpoint between phases. Work **inline** (no dispatched subagents — house rule [[work-inline-not-subagents]]). Steps use checkbox (`- [ ]`).

**Goal:** Re-home the whiteboard extension's realtime + persistence onto a single CRDT system — **Jazz** (CoJSON) — deleting Yjs, `y-excalidraw`, `y-websocket`, `y-protocols`, `y-indexeddb`, `lib0`, trailbase, `@tanstack/db`, `@tanstack/solid-db`, `@tanstack/trailbase-db-collection`, the db proxy, and the bespoke sync engine.

**Architecture:** One Jazz app schema (`s.defineApp`) holds `canvasElements`, `comments`, `pins`, `cursors`, all scoped by `room` (`<previewId>:<sessionId>`). The extension `.server()` supervises a self-hosted Jazz sync server (`jazz-tools server`) + deploys the schema, and exposes a Jazz **backend** db (`createJazzContext(...).asBackend()`) on the tool DI context so agent tools write rows. The widget `.client()` runs a Jazz **client** (`createSolidJazzClient` + `JazzProvider`), reads reactively with `useAll`, writes locally with `useDb` (so G3 HTTP action routes disappear — the client writes the synced db directly), and a custom **Excalidraw↔Jazz binding** replaces `y-excalidraw`. Presence/cursors ride a `cursors` table.

**Tech Stack:** Solid (widget), React 19 + `@excalidraw/excalidraw` 0.18.x (light-DOM island), **Jazz** (`jazz-tools@alpha`: `s.defineApp`/`s.table`, `createServer`/`createJazzContext().asBackend()`, `createSolidJazzClient`/`JazzProvider`/`useAll`/`useDb`, self-hosted `jazz-tools server` + `deploy`, OPFS persistence), `oxc-parser` + shell `git` (anchoring), h3, zod.

## STATUS

Phases 0–2 of the **prior** (Yjs+trailbase) migration are committed on this branch (`f701378` and earlier): main merged, `@mandarax/extension-whiteboard` scaffolded + registered as a built-in, G1 (per-request `{sessionId, previewId}`) + G2 (self-declared `approval:'ask'` native gate) landed, shared test helpers rewritten. Task 3.1 (Yjs sync engine on the sub-app) is committed (`757a5f5`) and **will be deleted** by this plan. Task 3.2 (trailbase db) is **uncommitted working-tree** and is discarded by this plan.

**This plan supersedes** `2026-06-26-whiteboard-extension-api-migration.md` from Phase 3 onward. Kept from that work: the package move/rename/registration (Phase 2), G1 (`ToolRequest`), G2 (the native approval gate). Replaced: all sync/db internals.

**Decision trail (why Jazz):** trailbase ships a broken published types path across 0.11–0.13 (`exports.types`→`./dist/index.d.ts`, file at `./dist/src/index.d.ts`) and its client hardcodes `/api/records/v1` (no subpath); ElectricSQL requires a full Postgres + a separate sync service (PGlite can only be a sync _destination_, never the source) — too heavy for a locally-installed dev tool. Jazz is a self-hostable, local-first CRDT db with first-class Solid + Node, replacing Yjs **and** the db layer with one system. Accepted risk: Jazz v2 is `@alpha`.

---

## Grounding (read before starting)

- **Jazz docs/examples to mirror (exact API; alpha — verify against the installed version in Task A.0):**
  - Schema: `s.table`/`s.ref`/`s.defineApp` + `definePermissions` — docs `concepts/*`, examples `todo-client-localfirst-ts`.
  - Self-hosted server: CLI `npx jazz-tools@alpha server <appId> --port <p> --data-dir <dir> --admin-secret <s>`; programmatic `createServer({appId, schema, permissions, driver: Db.persistent({dataPath}), serverUrl, backendSecret})` (`docs/install/typescript-server`). Schema publish: `jazz-tools@alpha deploy <appId>`. Sync transport: `GET /apps/<appId>/ws`; health `GET /health`.
  - Backend worker: `createJazzContext({appId, app, permissions, driver, serverUrl, adminSecret, env, userBranch}).asBackend()` → `db.insert(table,row)` / `db.update` / `db.delete` / `await db.all(query)`.
  - Solid client: `createSolidJazzClient(() => ({appId, serverUrl}))` + `<JazzProvider client={} fallback={}>`; `useAll(() => ({query: app.table.where({...})}))` (returns `{data}`), `useDb()` (`.insert/.update/.delete`), `useSession()`. Anonymous local identity (no login) — examples `todo-client-localfirst-{ts,react}`.
  - Canvas/cursors shape: the `canvases`/`letters`/`cursors` table example in `docs/content/presentations/all-things-sync.mdx`.
- **Reference extension (contract template):** `packages/extensions/test-runner/src/{server.ts,client.ts,shared/meta.ts,tool/{def,server,client}.ts}`.
- **Our code to delete (this plan):** `packages/extensions/whiteboard/src/server/sync/**`, `src/server/db/**`, the working-tree trailbase db + tests, `.migration-stash/**`, all `yjs`/`y-*`/`lib0`/`trailbase`/`@tanstack/*db*` deps; old impl files under `src/{canvas,pins,tools,comments-store.ts,room.ts,schema.ts}` get rewritten or removed as ported.
- **Kept contract pieces:** `packages/extension/src/{types.ts,define-tool.ts}` (`ToolRequest`, `approval?:'ask'`), `packages/core/src/api/{mcp/mcp.ts,chat/permission.ts}`, `packages/core/src/app.ts` risky-set wiring — all already landed.
- **Excalidraw lessons (still apply):** [[excalidraw-needs-light-dom]], [[excalidraw-initialdata-clobbers-seed]], [[use-library-native-ui]].
- **Memory:** [[agent-mcp-needs-session-header]], [[native-approval-hybrid]], [[no-stubs-or-mocks]], [[test-assertions-native]], [[no-abbreviated-names]], [[work-inline-not-subagents]], [[use-turbo-build]], [[kill-server-listen-only]], [[code-style-hard-rules]] (ZERO comments), [[canvas-notes-stack-decision]] (now superseded — Jazz chosen).

## Global Constraints (every task)

- **Code style (hard):** functions not classes (lone exception: the React error boundary in `island.tsx`); NO IIFE; **ZERO comments**; no `any`; no casts except a localized assertion at a third-party branded-type boundary; no `else`; functional; spell names out fully.
- **Deps:** only `jazz-tools` is added (already approved by this plan). STOP and ask before adding any other dependency.
- **Testing:** real Jazz sync server (spawned) + real Chromium (`browser.newPage()`, never `newContext()`); no mocks/jsdom/stubs. Native assertions; vitest `expect` has no `toBeVisible`/`toBeAttached` — use Playwright `locator.waitFor({state})`; `getByRole` does not pierce the effects shadow. Run with `SKIP_STORYBOOK_TESTS=1`; fresh `getPort()` per suite.
- **Build/typecheck:** turborepo from the worktree root. Whiteboard's own `typecheck` stays out of CI until Phase F; its `build` must always pass (scoped `tsconfig.build.json`, grown per phase) so dependents stay green.
- **Commits:** TDD per step. `oxfmt` reformats on first commit — `git add -A` and re-run the SAME commit. Pre-commit hook needs `prek`: run commits as `PATH="$PWD/node_modules/.bin:$PATH" git commit …`. End every message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Workflow:** every command from the worktree; never `cd` to the main repo. Kill dev servers by LISTEN pid only.
- **Locked design:** one Jazz schema scoped by `room=<previewId>:<sessionId>`; agent tools write via the backend db on the DI context (G1 picks the room); destructive tools keep `approval:'ask'` (G2); the widget writes via `useDb` directly (no G3 routes, no proxy); the extension supervises the Jazz server like a child process and deploys the schema at boot.

---

## Phase A — Swap the platform: delete Yjs/trailbase/tanstack, add Jazz

### Task A.0: Pin the exact Jazz alpha API

**Why:** Jazz v2 is `@alpha`; exact signatures must be read from the installed package, not assumed, so later tasks have real types.

**Files:** none (investigation note appended to this plan's STATUS).

- [ ] **Step 1:** Add `"jazz-tools": "alpha"` to `packages/extensions/whiteboard/package.json` deps; `pnpm install`.
- [ ] **Step 2:** Read the installed surface: `node -e` / inspect `node_modules/.pnpm/jazz-tools@*/node_modules/jazz-tools/dist/**/*.d.ts` for the EXACT signatures of `s.table`/`s.ref`/`defineApp`, `definePermissions`, `createServer`, `createJazzContext`/`asBackend`, `Db.persistent`, `createSolidJazzClient`, `JazzProvider`, `useAll`, `useDb`, `useSession`, and the `server`/`deploy` bin. Confirm the `jazz-tools/solid` subpath export and that the package's `exports.types` resolves under NodeNext (if not, set the whiteboard `tsconfig` `moduleResolution` to `"bundler"` — it is bundled by tsdown/vite anyway).
- [ ] **Step 3:** Record the confirmed signatures in this plan's STATUS as a short "Pinned Jazz API" block. No commit (info only) — fold into Task A.1's commit.

### Task A.1: Remove Yjs + trailbase + TanStack from the package + deps

**Files:** `packages/extensions/whiteboard/package.json` (deps), delete `src/server/sync/**`, `src/server/db/**`, `src/canvas/canvas-sync.ts`, `src/canvas/glue.ts`, `src/canvas/ai-draws.ts`, `src/canvas/presence.ts`, `src/comments-store.ts`, `src/room.ts` (room helper is re-added pure in B), the trailbase/sync ITs (`test/{sync,sync-route,db-proxy,live-db,trail-config,trail-supervisor}.it.test.ts`), and `.migration-stash/`. Reset `tsconfig.build.json` include to `["src/server.ts","src/client.ts","src/shared/**/*.ts"]`.

- [ ] **Step 1:** `git rm` the sync/db source + their ITs + `.migration-stash`; remove `yjs y-excalidraw y-websocket y-protocols y-indexeddb lib0 trailbase @tanstack/db @tanstack/solid-db @tanstack/trailbase-db-collection crossws p-retry p-wait-for srvx get-port` from whiteboard deps where now unused; keep `@excalidraw/*`, `react`, `react-dom`, `solid-js`, `oxc-parser`, `zod`, `h3`, `@mandarax/*`; add `jazz-tools` (A.0).
- [ ] **Step 2:** Revert `server.ts`/`client.ts` to the minimal shells (defineExtension with empty tools + `.server(()=>({context:{cwd}}))` / `.client(()=>({value:{}}))`).
- [ ] **Step 3:** `pnpm install`; `pnpm turbo run build --filter @mandarax/extension-whiteboard` PASS (shell builds); `pnpm turbo run typecheck --filter='!@mandarax/extension-whiteboard'` PASS (37/37+).
- [ ] **Step 4:** Commit.

**Checkpoint:** report Phase A (clean Jazz-only baseline; everything else green).

---

## Phase B — Schema + room scoping (shared, pure)

### Task B.1: Define the Jazz app schema

**Files:** `packages/extensions/whiteboard/src/shared/schema.ts`, `src/shared/room.ts`. Test: `test/schema.test.ts`, `test/room.test.ts`.

**Interfaces — Produces:**

- `roomId(previewId: string, sessionId: string): string` → `\`${previewId}:${sessionId}\``(empty session →`<previewId>:local`).
- `whiteboardApp` = `s.defineApp({ canvasElements: s.table({room, elementId, data, version}), comments: s.table({room, cid, body, anchorJson, threadId, parentId, resolved, author, createdAt}), pins: s.table({room, cid, x, y, state}), cursors: s.table({room, sessionId, x, y, name, color}) })` with `whiteboardPermissions = definePermissions(...)` (anonymous world read/write for the local dev tool).

- [ ] **Step 1:** Failing `room.test.ts` — `roomId('local','mandarax_x') === 'local:mandarax_x'`; empty session → `'local:local'`.
- [ ] **Step 2:** FAIL → implement `room.ts` → PASS.
- [ ] **Step 3:** Failing `schema.test.ts` — `whiteboardApp` exposes `canvasElements`/`comments`/`pins`/`cursors`; each table's columns include `room`; `whiteboardPermissions` is defined. (Assert on the schema object shape per A.0's pinned API.)
- [ ] **Step 4:** FAIL → implement `schema.ts` (mirror `all-things-sync` + `todo-client-localfirst`) → PASS.
- [ ] **Step 5:** Extend `tsconfig.build.json` include with `src/shared/**`; `build` PASS. Commit.

**Checkpoint:** report Phase B.

---

## Phase C — Supervise the Jazz server + wire `.server()` + sync proof

### Task C.1: Jazz server supervisor

**Why:** the extension must spawn + health-check + restart the local Jazz sync server and deploy the schema, like the old trail-supervisor.

**Files:** `src/server/jazz/supervisor.ts`, `src/server/jazz/identity.ts` (generate+persist `appId`+`adminSecret` under the data dir), `src/server/jazz/index.ts`. Test: `test/jazz-supervisor.it.test.ts`.

**Interfaces — Produces:**

- `createJazzSupervisor({dataDir, port}): {start():Promise<void>; stop():Promise<void>; onExit(cb); baseUrl; wsUrl; appId; pid}` — spawns `jazz-tools server <appId> --port <port> --data-dir <dataDir> --admin-secret <secret>`, waits for `GET /health`, restart-on-crash with a ceiling (mirror the old trail-supervisor lifecycle), `deploy`s the schema after ready.
- `loadOrCreateIdentity(dataDir): {appId, adminSecret}` (persisted JSON; generated once).

- [ ] **Step 1:** Failing `jazz-supervisor.it.test.ts` — `start()` resolves once `GET ${baseUrl}/health` answers; `appId` is stable across restarts (persisted); `stop()` exits the child.
- [ ] **Step 2:** FAIL → implement (spawn CLI, `pWaitFor` health via `fetch`, persist identity, deploy schema via the `deploy` bin or programmatic publish per A.0) → PASS. Commit.

### Task C.2: Wire `.server()` + expose Jazz config + backend db on the DI context

**Files:** `src/server.ts`; `src/server/jazz/backend.ts` (`createBackendDb({appId, adminSecret, serverUrl, dataDir}) → db` via `createJazzContext(...).asBackend()`). The `.server()` factory: start the supervisor, build the backend db, register `GET /config` on `server.app` returning `{wsUrl, appId}`, return `{context: {cwd, db, room: (request)=>roomId(request.previewId, request.sessionId)}, dispose}`. Test: `test/server-config.it.test.ts`.

- [ ] **Step 1:** Failing `server-config.it.test.ts` — boot the engine with whiteboard built-in; `GET /api/ext/whiteboard/config` returns `{wsUrl, appId}` and the wsUrl health-answers.
- [ ] **Step 2:** FAIL → implement; rewrite `test/helpers/boot-stack.ts` to expose `extBase` + the Jazz config; extend `tsconfig.build.json` include with `src/server/**` → PASS. Commit.

### Task C.3: Two-client sync proof over the Jazz server

**Files:** `test/jazz-sync.it.test.ts` (two backend `createJazzContext` clients, OR two Node Jazz clients, on the same `appId`+room converge).

- [ ] **Step 1:** Failing — client A `db.insert(canvasElements, {room, elementId:'r1', ...})`; client B `db.subscribeAll(canvasElements.where({room}))` observes it.
- [ ] **Step 2:** FAIL → implement against the booted supervisor → PASS. Commit.

**Checkpoint:** report Phase C (platform foundation — riskiest; the supervisor + sync proof).

---

## Phase D — Agent tools write via the backend db (G1 + G2)

### Task D.1: Port `canvas.*` tools

**Files:** rewrite `src/tool/canvas/{def,server,client}.ts` (from the old `tools/canvas.ts`). Server `execute(input, ctx, request)`: `const room = ctx.room(request)`; `canvas.draw` → `ctx.db.insert(canvasElements, {room, elementId, data, version})`; `canvas.delete`/`canvas.clear` declare `approval:'ask'` and delete rows for the room. Test: `test/canvas-tools.it.test.ts` — `canvas.draw` via MCP with `mandarax-session-id: mandarax_x` writes a row into the `local:mandarax_x` room (assert via a Jazz client query); `canvas.delete` is gated (not 403).

- [ ] **Step 1:** Failing test (draw → row in the session room; a second client sees it; delete is gated).
- [ ] **Step 2:** FAIL → implement → PASS. Commit.

### Task D.2: Port `comment.*` tools (+ pins)

**Files:** rewrite `src/tool/comment/{def,server,client}.ts`; pin write helpers. Server execute writes `comments` (+ `pins`) rows scoped by room; `comment.delete`/`comment.resolve` declare `approval:'ask'`. Test: `test/comment-tools.it.test.ts`.

- [ ] **Step 1:** Failing — `comment.create` via MCP inserts a `comments` row + a `pins` row in the room; a client query sees both; resolve flips `resolved`.
- [ ] **Step 2:** FAIL → implement → PASS. Commit.

### Task D.3: Port `anchor.*` / `element.*` + assemble `tools`

**Files:** move `src/anchor/*` (pure: `confine.ts`/`oxc-capture.ts`/`git-track.ts`/`resolver.ts`/`load-resolver.ts`) unchanged; rewrite `src/tool/{anchor,element}/*` using `ctx.cwd`; add all tools to `server.ts`'s `defineExtension({tools:[...]})`. `RequiredContext<Tools>` forces the DI context to satisfy every tool. Tests: move `anchor`/`resolver`/`git-track`/`element-reference`/`confine`/`oxc-capture`/`mermaid` tests; retarget.

- [ ] **Step 1:** Wire tools; `pnpm turbo run typecheck --filter @mandarax/extension-whiteboard` PASS for the server half (extend `tsconfig.build.json` include with `src/tool/**`, `src/anchor/**`).
- [ ] **Step 2:** Run moved server ITs (anchor/resolver/git-track/element/confine/oxc/mermaid/canvas-tools/comment-tools) PASS. Commit.

**Checkpoint:** report Phase D.

---

## Phase E — Client half (Solid + Jazz + Excalidraw binding)

### Task E.1: Jazz client bootstrap in `.client()`

**Files:** `src/client.ts` + `src/client/jazz-client.ts`. `.client()` reads `api.apiBase`, fetches `/api/ext/whiteboard/config` → `{wsUrl, appId}`, builds `createSolidJazzClient(() => ({appId, serverUrl: wsUrl}))`, wraps overlays in `<JazzProvider client fallback>`. Session room from `api.client.sessionId()` (reactive). Test: restore a widget IT on `startWidgetServer` asserting the client connects + a seeded row renders.

- [ ] **Step 1:** Failing widget IT — boot the engine + a Jazz client; the overlay reads `canvasElements` for the room via `useAll` and shows a seeded element.
- [ ] **Step 2:** FAIL → implement (mirror test-runner `.client()` + the Solid install doc) → PASS. Commit.

### Task E.2: Excalidraw↔Jazz binding (replaces y-excalidraw)

**Files:** `src/client/canvas/binding.ts`, keep `canvas/{island.tsx,island-types.ts}`; delete `canvas/canvas-effect.ts`. Binding: a Solid effect subscribes (`useAll(canvasElements.where({room}))`) → map rows → `excalidrawAPI.updateScene({elements})`; Excalidraw `onChange` → diff vs last → `useDb().insert/update` changed element rows (skip echoes by version/origin). Keep the [[excalidraw-initialdata-clobbers-seed]] rAF seed + light-DOM `<Portal>`. Tests: restore `canvas-overlay.it`, `canvas-persist.it`, `canvas-ai-draw.it` retargeted to Jazz.

- [ ] **Step 1:** Failing IT — open canvas, draw a rectangle, assert a `canvasElements` row exists for the room; an AI-side `db.insert` paints into the open canvas (full stack).
- [ ] **Step 2:** FAIL → implement the binding → PASS. Commit.

### Task E.3: Pins + thread + comment-action via `useAll`/`useDb`

**Files:** rewrite `src/pins/{pins,thread,drag-prompt,comment-action}.tsx` to read `comments`/`pins` with `useAll` and write with `useDb` (no HTTP action route — direct Jazz writes). `.client()` `Component` renders the composer "Open the whiteboard canvas" button (`useSlot()==='composer'`) + `useContext((c)=>c.toggle)`. Tests: restore `pins.it`, `pin-drag.it`, `comment-action.it`, `comments-collection.it` retargeted.

- [ ] **Step 1:** Failing — composer button mounts the canvas; creating a comment via the action writes a `comments` row (client `useDb`) that the agent-side query sees; pins render from `useAll`.
- [ ] **Step 2:** FAIL → implement → PASS. Commit.

### Task E.4: Presence / cursors

**Files:** `src/client/canvas/presence.ts` — write the local cursor to `cursors` (throttled) via `useDb`; read peers via `useAll(cursors.where({room}))` → Excalidraw collaborators. Test: `test/presence.it.test.ts` (two clients see each other's cursor).

- [ ] **Step 1:** Failing — client A moves; client B's `cursors` query shows A.
- [ ] **Step 2:** FAIL → implement → PASS. Commit.

**Checkpoint:** report Phase E.

---

## Phase F — Re-validate, live smoke, final cleanup

### Task F.1: Tool-card audit + full suite

- [ ] **Step 1:** Reconcile whiteboard tool cards with main's `tool-ui`/`protocol` `__render`/`streamTitle` shape (carried from the prior plan's Phase 6.1).
- [ ] **Step 2:** `pnpm turbo run build` (all) + `pnpm turbo run typecheck` (all, **including** whiteboard now) PASS; remove the whiteboard typecheck exclusion.
- [ ] **Step 3:** `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/extension-whiteboard exec vitest run` — all PASS.

### Task F.2: Live smoke + memory

- [ ] **Step 1:** Rebuild server packages; restart dev (kill by LISTEN pid). Open the canvas via the composer button; agent `canvas.draw` → rectangle paints (G1 routing); agent `canvas.clear` → native approval card (G2) → decision resolves; a comment created in the UI shows up for the agent.
- [ ] **Step 2:** Grep the repo for any lingering `yjs`/`y-`/`trailbase`/`@tanstack/*db*` references; delete. Confirm `pnpm-lock.yaml` has no Yjs/trailbase entries.
- [ ] **Step 3:** Update memories: supersede [[canvas-notes-stack-decision]] (Jazz chosen; record why trailbase/Electric rejected), add "whiteboard runs on Jazz (self-hosted sync server supervised by .server(); Solid useAll/useDb; backend asBackend() for agent writes; Excalidraw↔Jazz custom binding)", update [[trailbase-client-pinned-0-10-0]] (dropped). Update both plan STATUS sections.

---

## Coverage checklist (every concern has a task)

- **Deletes:** Yjs+y-\* + trailbase + tanstack-db + proxy + sync engine + stash (A.1); old canvas-sync/glue/ai-draws/presence/comments-store/canvas-effect (A.1/E.2).
- **Schema/room:** B.1. **Supervisor + identity + deploy + config route:** C.1/C.2. **Sync proof:** C.3.
- **Tools (G1 room + G2 approval):** canvas (D.1), comment+pins (D.2), anchor+element+mermaid (D.3).
- **Client:** bootstrap (E.1), Excalidraw binding (E.2), pins/thread/comment-action (E.3), presence (E.4).
- **G3 removed:** clients write Jazz directly via `useDb`; no HTTP action routes, no proxy.
- **Validate:** tool cards + full build/typecheck/tests (F.1), live smoke + cleanup + memory (F.2).
- **Deferred (unchanged from prior plan):** drift doctor + `mandarax doctor` CLI, cross-store undo/redo, limits/empty-state/toasts/a11y/security IT/SKILL.md.
