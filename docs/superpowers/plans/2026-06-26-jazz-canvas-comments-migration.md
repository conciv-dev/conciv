# Whiteboard on Jazz — Migration Plan (replace Yjs + trailbase + TanStack DB with Jazz)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement task-by-task, TDD, checkpoint between phases. Work **inline** (no dispatched subagents — house rule [[work-inline-not-subagents]]). Steps use checkbox (`- [ ]`).

**Goal:** Re-home the whiteboard extension's realtime + persistence onto a single CRDT system — **Jazz** (CoJSON) — deleting Yjs, `y-excalidraw`, `y-websocket`, `y-protocols`, `y-indexeddb`, `lib0`, trailbase, `@tanstack/db`, `@tanstack/solid-db`, `@tanstack/trailbase-db-collection`, the db proxy, and the bespoke sync engine.

**Architecture:** One Jazz app schema (`schema.defineApp`) holds `canvasElements`, `comments`, `pins`, `cursors`, all scoped by `room` (`<previewId>:<sessionId>`). The extension `.server()` supervises a self-hosted Jazz sync server (CLI `jazz-tools server`, run with `--allow-local-first-auth`) + deploys the schema (CLI `jazz-tools deploy`), and exposes a Jazz **backend** db (`createJazzContext(...).asBackend()`) on the tool DI context so agent tools write rows. The widget `.client()` runs a Jazz **client** (`jazz-tools/solid`: `createSolidJazzClient` + `JazzProvider`), reads reactively with `useAll`, writes locally with `useDb()()` (so G3 HTTP action routes disappear — the client writes the synced db directly), and a custom **Excalidraw↔Jazz binding** replaces `y-excalidraw`. Presence/cursors ride a `cursors` table. **Identity:** Jazz is NOT anonymous — anonymous writes are rejected (`AnonymousWriteDeniedError`); the client gets a persisted local-first `secret` from `useLocalFirstAuth()` and the server runs with local-first auth enabled.

**Tech Stack:** Solid (widget), React 19 + `@excalidraw/excalidraw` 0.18.x (light-DOM island), **Jazz** (`jazz-tools` pinned `2.0.0-alpha.52` — NOT floating `alpha`, which resolves to `.51` and lacks `./solid`: `schema.defineApp`/`schema.table`/`col.*`, `definePermissions`, `createJazzContext().asBackend()`, `jazz-tools/solid` `createSolidJazzClient`/`JazzProvider`/`useAll`/`useDb`/`useSession`/`useLocalFirstAuth`, self-hosted CLI `jazz-tools server`/`deploy`/`create app`, OPFS persistence), `oxc-parser` + shell `git` (anchoring), h3, zod.

## STATUS

Phases 0–2 of the **prior** (Yjs+trailbase) migration are committed on this branch (`f701378` and earlier): main merged, `@mandarax/extension-whiteboard` scaffolded + registered as a built-in, G1 (per-request `{sessionId, previewId}`) + G2 (self-declared `approval:'ask'` native gate) landed, shared test helpers rewritten. Task 3.1 (Yjs sync engine on the sub-app) is committed (`757a5f5`) and **will be deleted** by this plan. Task 3.2 (trailbase db) is **uncommitted working-tree** and is discarded by this plan.

**This plan supersedes** `2026-06-26-whiteboard-extension-api-migration.md` from Phase 3 onward. Kept from that work: the package move/rename/registration (Phase 2), G1 (`ToolRequest`), G2 (the native approval gate). Replaced: all sync/db internals.

**Decision trail (why Jazz):** trailbase ships a broken published types path across 0.11–0.13 (`exports.types`→`./dist/index.d.ts`, file at `./dist/src/index.d.ts`) and its client hardcodes `/api/records/v1` (no subpath); ElectricSQL requires a full Postgres + a separate sync service (PGlite can only be a sync _destination_, never the source) — too heavy for a locally-installed dev tool. Jazz is a self-hostable, local-first CRDT db with first-class Solid + Node, replacing Yjs **and** the db layer with one system. Accepted risk: Jazz v2 is `@alpha`.

### Pinned Jazz API — verified Task A.0 against `jazz-tools@2.0.0-alpha.52` (read from the published `.d.ts`)

> **Version gotcha:** the `./solid` binding landed in **alpha.52**; **alpha.51 does NOT ship it** (verified: `npm view jazz-tools@2.0.0-alpha.51 exports` has no `./solid`; `.52` does). The floating `alpha` dist-tag currently resolves to `.51` → pin **exact `2.0.0-alpha.52`** in `package.json`. **BLOCKER:** the workspace pnpm `minimumReleaseAge` supply-chain policy rejects `.52` (published 2026-06-25, under the maturity cutoff) — `pnpm install` fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. Needs the user to relax/override `minimumReleaseAge` for jazz packages or wait for the cutoff. The API below was read from the `.52` tarball (`npm pack`), not the blocked install.

- **Schema DSL (`jazz-tools`):** namespace `schema` (alias `s`) exposes `schema.table(columns)`, `schema.defineApp(def)`, `schema.defineSchema`, `schema.definePermissions`, plus `col`. Columns: `col.string()`, `col.int()`, `col.float()`, `col.boolean()`, `col.timestamp()`, `col.bytes()`, `col.json()` / `col.json(standardSchema)`, `col.enum(...variants)`, `col.ref(targetTable)`, `col.array(el)`; each chainable `.optional()` / `.default(v)` / `.merge(strategy)` (`"lww"` default; `"counter"`/`"g-set"` for CRDT merges). `defineApp(def)` where `def` is `{ [tableName]: schema.table({...}) }`; each row auto-gets an `id`. `definePermissions(app, (ctx) => void): CompiledPermissions` (policy builder over `read`/`insert`/`update`/`delete`; supports session-ref / row-ref / exists / relation conditions, `anyOf`/`allOf`).
- **Backend worker (`jazz-tools/backend`):** `createJazzContext({ appId, app: WasmSchemaSource, permissions: CompiledPermissions, driver: {type:'persistent', dataPath} | {type:'memory'}, serverUrl?, adminSecret?, backendSecret?, env?, userBranch? }) → JazzContext`. `ctx.asBackend(): Db` (backend-authenticated), also `ctx.db()`, `ctx.forRequest(req)`, `ctx.forSession(session)`, `ctx.withAttribution(principalId)`, `ctx.shutdown()`. Schema is a `WasmSchema`/`WasmSchemaSource` (compile via exported `schemaToWasm` / `resolveSchemaSource`).
- **Core `Db` (`jazz-tools` `createDb(config)`):** `insert/restore/update/upsert/delete` are **sync** local-first (return `WriteResult<T>`/`WriteHandle`; call `.wait()` for durable confirm); `all/one` are **async**; `subscribeAll(query, (delta)=>…, options?, session?) → unsubscribe` (`delta.all` is a fresh array each time — reconcile by id; `delta.delta` are row-level changes w/ `RowChangeKind`). `beginTransaction`/`transaction`/`beginBatch`/`batch`. Query via `app.table.where({...})` (`QueryBuilder`). **No programmatic `createServer`** — sync server is the CLI only.
- **Solid client (`jazz-tools/solid`):**
  - `createSolidJazzClient(config: Accessor<DbConfig>)` → reactive `{ db: Db|undefined, session, authState, manager, loading, error, state, shutdown }` (`PendingSolidJazzClient`; `db` is `undefined` until ready).
  - `JazzProvider(props: { client: PendingSolidJazzClient; fallback?: JSX.Element; children })`.
  - `useDb<TDb=Db>(): Accessor<TDb>` → call as `useDb()()` to get the `Db`; then `.insert/.update/.delete`.
  - `useSession(): Accessor<Session|null>`; `useAuthState(): () => AuthState|null`; `useJazzClient(): SolidJazzClient`.
  - `useAll<T>(args: Accessor<{ query: QueryBuilder<T>|undefined; options? }>): { data: T[]|undefined; isLoading: boolean; error: Error|null }` — note the arg is an **accessor returning `{query}`**, and the result is `{data,isLoading,error}` (not bare `{data}`).
  - `useLocalFirstAuth(store?): { secret: string|null; isLoading: boolean; error; login(secret); signOut() }` — **required for writes**; persists the device secret (localStorage). Pass `secret` into the client `DbConfig`.
  - `DbConfig` (client): `{ appId, serverUrl?, secret?, driver?: {type:'persistent'|'memory'}, runtimeSources?, env?, userBranch? }`. Browser default driver is `{type:'persistent'}` (OPFS). `runtimeSources` ({baseUrl|wasmUrl|workerUrl|wasmModule|wasmSource}) overrides WASM/worker asset URLs — **likely needed in the widget's vite bundle / shadow-DOM context** (risk, prove in E.1).
- **CLI (`jazz-tools` bin → native binary):** `jazz-tools create app --name <stable>` (deterministic appId from name), `jazz-tools server <appId> --port <p> --data-dir <dir> --admin-secret <s> --backend-secret <s> --allow-local-first-auth` (default port 1625; `--in-memory` for tests; health/ws on the listen port), `jazz-tools deploy <appId>` (publishes schema.ts + permissions; needs admin secret), `jazz-tools validate`, `jazz-tools mcp`. **No `--data-dir`/identity persistence needed if appId is derived deterministically via `create app --name`.**
- **Programmatic server API (`jazz-tools/dev`) — CHOSEN for Phase C (replaces spawn):** `startLocalJazzServer({appId?, port?, dataDir?, inMemory?, allowLocalFirstAuth?, adminSecret?, backendSecret?, …}) → Promise<{appId, port, url, dataDir, adminSecret, backendSecret, stop()}>`. Starts the native server in-process (manages its own child), resolves when ready, auto free-port, generates secrets, owns/cleans a temp dir, idempotent `stop()`. No `onExit`/auto-restart (accepted tradeoff). Schema publish: `deploy`/`pushSchema`/`pushPermissions`/`pushMigration` (all read `schema.ts`/`permissions.ts` from a `schemaDir`). Test helpers: `getAvailablePort`, `createTempRootTracker`. Also `jazz-tools/dev/vite` `jazzPlugin()` (embedded server + auto-push + env injection) for the widget vite dev loop only — not used by `.server()`.
- **NodeNext:** `jazz-tools` `exports` map points every subpath `types` at real emitted `.d.ts` (`./dist/**`), incl. `./solid`, `./backend`, `./permissions` — resolves clean under NodeNext (unlike trailbase). The whiteboard tsconfig does **not** need `moduleResolution: "bundler"` for Jazz.

---

## Grounding (read before starting)

- **Jazz API to mirror — VERIFIED in Task A.0 against `jazz-tools@2.0.0-alpha.52` (see the "Pinned Jazz API" block in STATUS for exact signatures). Summary of what changed vs the original assumptions:**
  - Schema: `schema.table({...})` / `schema.defineApp({...})` with `col.string()/int()/json()/timestamp()/boolean()/ref(t)/enum(...)` (NOT `s.ref` — refs are `col.ref(targetTable)`); `definePermissions(app, (ctx)=>void)`.
  - Self-hosted server: **CLI only, no programmatic `createServer`.** `jazz-tools server <appId> --port <p> --data-dir <dir> --admin-secret <s> --allow-local-first-auth`; appId from `jazz-tools create app --name <stable>`; publish via `jazz-tools deploy <appId>`. Health/ws ride the listen port. There is **no `Db.persistent({dataPath})` factory** — driver is a plain object `{type:'persistent', dataPath}`.
  - Backend worker: `createJazzContext({appId, app, permissions, driver:{type:'persistent',dataPath}, serverUrl, adminSecret, backendSecret}).asBackend()` → sync `db.insert/update/delete` (`.wait()` for durability) / async `db.all(query)` / `db.subscribeAll(query, cb)`.
  - Solid client (`jazz-tools/solid`): `createSolidJazzClient(() => ({appId, serverUrl, secret}))` → reactive `{db, loading, …}` (`db` undefined until ready) + `<JazzProvider client fallback>`; `useAll(() => ({query: app.table.where({...})}))` returns `{data, isLoading, error}`; `useDb()` returns `Accessor<Db>` → write via `useDb()().insert/update/delete`; `useSession()`. **NOT anonymous** — `useLocalFirstAuth()` supplies the persisted `secret` (anonymous writes throw `AnonymousWriteDeniedError`).
  - Examples to mirror: `todo-client-localfirst-{ts,solid}`, the Client Setup doc's Solid tab, and the `canvases`/`letters`/`cursors` shape in `all-things-sync.mdx`.
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

- [x] **Step 1:** ~~Add `"jazz-tools": "alpha"`~~ → pin **exact `"jazz-tools": "2.0.0-alpha.52"`** (floating `alpha` resolves to `.51`, which has no `./solid`). Added to `packages/extensions/whiteboard/package.json`. **`pnpm install` BLOCKED by `minimumReleaseAge`** (`.52` too new) — see the blocker note in STATUS; unblock before A.1 Step 3.
- [x] **Step 2:** API read from the published `.52` tarball (install blocked). Findings recorded — see "Pinned Jazz API" block in STATUS. Key corrections: no `s.ref` (use `col.ref`); no programmatic `createServer` (CLI only); no `Db.persistent()` (plain `{type:'persistent',dataPath}`); `useAll`→`{data,isLoading,error}` with an accessor arg; `useDb()`→`Accessor<Db>`; **not anonymous — `useLocalFirstAuth` secret required**; `exports.types` resolves clean under NodeNext (no `moduleResolution:"bundler"` needed for Jazz).
- [x] **Step 3:** Pinned Jazz API block recorded in STATUS. No commit (info only) — fold into Task A.1's commit.

### Task A.1: Remove Yjs + trailbase + TanStack from the package + deps

**Files:** `packages/extensions/whiteboard/package.json` (deps), delete `src/server/sync/**`, `src/server/db/**`, `src/canvas/canvas-sync.ts`, `src/canvas/glue.ts`, `src/canvas/ai-draws.ts`, `src/canvas/presence.ts`, `src/comments-store.ts`, `src/room.ts` (room helper is re-added pure in B), the trailbase/sync ITs (`test/{sync,sync-route,db-proxy,live-db,trail-config,trail-supervisor}.it.test.ts`), and `.migration-stash/`. Reset `tsconfig.build.json` include to `["src/server.ts","src/client.ts","src/shared/**/*.ts"]`.

- [ ] **Step 1:** `git rm` the sync/db source + their ITs + `.migration-stash`; remove `yjs y-excalidraw y-websocket y-protocols y-indexeddb lib0 trailbase @tanstack/db @tanstack/solid-db @tanstack/trailbase-db-collection crossws p-retry p-wait-for srvx get-port` from whiteboard deps where now unused; keep `@excalidraw/*`, `react`, `react-dom`, `solid-js`, `oxc-parser`, `zod`, `h3`, `@mandarax/*`; add `jazz-tools` pinned exact `2.0.0-alpha.52` (A.0). **Note:** `get-port` is still used by the IT suites' fresh-port-per-suite rule (Global Constraints) — keep it in devDependencies; only drop it if no test imports it.
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
- `whiteboardApp` = `schema.defineApp({ canvasElements: schema.table({room: col.string(), elementId: col.string(), data: col.json(), version: col.int()}), comments: schema.table({room: col.string(), cid: col.string(), body: col.string(), anchorJson: col.json().optional(), threadId: col.string().optional(), parentId: col.string().optional(), resolved: col.boolean().default(false), author: col.string(), createdAt: col.timestamp()}), pins: schema.table({room: col.string(), cid: col.string(), x: col.float(), y: col.float(), state: col.string()}), cursors: schema.table({room: col.string(), sessionId: col.string(), x: col.float(), y: col.float(), name: col.string(), color: col.string()}) })` with `whiteboardPermissions = definePermissions(whiteboardApp, (ctx) => { … })`. **Permissions are NOT anonymous** (anonymous writes are rejected) — grant every authenticated local-first identity full `read`/`insert`/`update`/`delete` on all tables (this is a local single-user dev tool; all device identities are trusted). The exact policy-builder calls come from A.0's `definePermissions` shape — mirror the `todo-client-localfirst` permissions.ts. The `schema.ts` file is also the deploy source for the CLI `deploy`/dev-plugin auto-push, so keep it a standalone module with no server-only imports.

- [ ] **Step 1:** Failing `room.test.ts` — `roomId('local','mandarax_x') === 'local:mandarax_x'`; empty session → `'local:local'`.
- [ ] **Step 2:** FAIL → implement `room.ts` → PASS.
- [ ] **Step 3:** Failing `schema.test.ts` — `whiteboardApp` exposes `canvasElements`/`comments`/`pins`/`cursors` as `QueryBuilder`s (each has `.where`); `whiteboardApp.<table>.where({room})` builds; `whiteboardPermissions` is a `CompiledPermissions`. (Assert on the schema object shape per A.0's pinned API — the table objects expose `.where`/`_table`, not a raw column map.)
- [ ] **Step 4:** FAIL → implement `schema.ts` using `import { schema, col, definePermissions } from "jazz-tools"` (alias `schema as s` if preferred); mirror `all-things-sync` + `todo-client-localfirst` → PASS.
- [ ] **Step 5:** Extend `tsconfig.build.json` include with `src/shared/**`; `build` PASS. Commit.

**Checkpoint:** report Phase B.

---

## Phase C — Run the Jazz server + wire `.server()` + sync proof

> **Approach (revised A.0 finding, user-approved):** Jazz ships a programmatic Node API — `startLocalJazzServer` from `jazz-tools/dev` — so there is **NO `child_process.spawn`, no `jazz-tools create app`, no CLI shelling, no hand-rolled health-poll, no `p-wait-for`/`p-retry`, no identity-persistence file**. `startLocalJazzServer(options?) => Promise<LocalJazzServerHandle>` starts the native server (managing the child process itself), resolves only when ready, auto-picks a free port, generates admin/backend secrets, and owns/cleans a temp data dir. Schema publish is also programmatic: `deploy`/`pushSchema`/`pushPermissions` from `jazz-tools/dev`. `jazz-tools/dev` is plain Node (what the vite plugin uses internally) and is the intended path for a locally-installed dev tool. **Tradeoff accepted:** the handle exposes `stop()` but no `onExit`/auto-restart — no crash-restart-with-ceiling (recoverable by restarting the extension; add a thin restart wrapper later only if it proves flaky).

**Pinned `jazz-tools/dev` API (verified A.0):**

- `startLocalJazzServer({appId?, port?, dataDir?, inMemory?, allowLocalFirstAuth?, adminSecret?, backendSecret?, jwksUrl?, upstreamUrl?, telemetryCollectorUrl?, enableLogs?}) → Promise<{appId, port, url, dataDir, adminSecret, backendSecret, stop():Promise<void>}>`. `allowLocalFirstAuth: true` is REQUIRED (without it local-first clients can't authenticate → every write rejected). `inMemory: true` for tests.
- `pushSchema/pushPermissions/deploy({appId, serverUrl, adminSecret, schemaDir, onEvent?})` — these read `schema.ts` (+ optional `permissions.ts`) **from `schemaDir` on disk** and publish to the server. (`pushPermissions` also needs `schemaHash`.)

### Task C.1: Jazz server runner + schema publish

**Why:** the extension must start the local Jazz sync server, publish the schema/permissions, and expose a stable `appId` + `serverUrl`.

**Files:** `src/server/jazz/runner.ts` (import it directly — NO `index.ts` barrel [[no-barrel-files]]). Test: `test/jazz-runner.it.test.ts`.

**CORRECTED (probe-verified, supersedes the earlier "in-memory is enough"):** the backend context's in-memory schema lets the backend read/write **its own** rows, but a **separate client** (browser / any `createDb`) cannot sync until the schema is **published to the server**. Proven: a local-first client's `all()`/`wait({tier:'edge'})` hang until `deploy`/`pushSchema`; `adminSecret` on the backend does NOT auto-publish; `publishStoredSchema` (object-based) is internal/unexported. The only public publish is **file-based** `deploy({serverUrl, appId, adminSecret, schemaDir})` (from `jazz-tools/dev` or `jazz-tools/testing`) — it loads `schemaDir/schema.ts` (must `export const app`/`schema`/`default` — our `whiteboardApp` name is rejected) + `schemaDir/permissions.ts` (`export default`), publishing two versioned artifacts (schema hash, then permissions against it). So:

- Reshape `src/shared/schema.ts` → `export const app = schema.defineApp({...})`; move policies to `src/shared/permissions.ts` → `export default definePermissions(app, …)`. These two are the canonical schema + the deploy source (one definition, no duplication).
- `startJazzRunner` exposes `adminSecret`; `.server()` `await deploy({serverUrl, appId, adminSecret, schemaDir: <src/shared>})` after start. Idempotent ("already-stored") on a persistent server.
- Writes still need `.wait({tier:'edge'})` for cross-client visibility (`'local'` only confirms local durability — the reader never sees it).
- **Runtime packaging follow-up (deferred):** `deploy` reads the `.ts` source at runtime; the ITs run from `src/` so this works now. For the published `dist`-only package, emit `src/shared/{schema,permissions}.ts` into `dist/` at build (rides the existing `dist` files entry — no `files` change). Resolve `schemaDir` via `new URL('./shared', import.meta.url)` so it lands on `src/shared` in dev and `dist/shared` in prod.
- **E.1 widget needs** `vite-plugin-wasm` + `vite-plugin-top-level-await` for the in-browser Jazz client (the Solid example's deps) — new dev deps, get approval at E.1.

**Interfaces — Produces:**

- `startJazzRunner({dataDir, inMemory?}): Promise<{appId, serverUrl, backendSecret, stop():Promise<void>}>` — thin wrapper over `startLocalJazzServer({dataDir, inMemory, allowLocalFirstAuth: true})`. `serverUrl` = the handle's `url`. No separate publish step (schema rides the backend context in C.2).

- [ ] **Step 1:** Failing `jazz-runner.it.test.ts` (`inMemory: true`, fresh port via `startLocalJazzServer`'s auto-pick) — `startJazzRunner(...)` resolves with a reachable `serverUrl` + `appId`; a backend `createJazzContext({appId, app: whiteboardApp, permissions: whiteboardPermissions, driver:{type:'memory'}, serverUrl, backendSecret}).asBackend()` can `insert` into `whiteboardApp.canvasElements` (`.wait({tier:'local'})`) and read it back via `db.all(...where({room}))`; `stop()` shuts it down.
- [ ] **Step 2:** FAIL → implement (`startLocalJazzServer`) → PASS. Commit.

### Task C.2: Wire `.server()` + expose Jazz config + backend db on the DI context

**Files:** `src/server.ts`; `src/server/jazz/backend.ts` (`createBackendDb({appId, backendSecret, serverUrl}) → Db` via `createJazzContext({appId, app: whiteboardApp, permissions: whiteboardPermissions, driver: {type:'memory'}, serverUrl, backendSecret}).asBackend()` — schema rides in-memory, no deploy; backend driver can be `memory` since the sync hub persists). The `.server()` factory: `await startJazzRunner(...)` (C.1), build the backend db from its `{appId, serverUrl, backendSecret}`, register `GET /config` on `server.app` returning `{serverUrl, appId}` (the client needs the http `serverUrl` for `DbConfig.serverUrl`; secret is minted client-side by `useLocalFirstAuth`, never sent by the server), return `{context: {cwd, db, room: (request)=>roomId(request.previewId, request.sessionId)}, dispose: () => runner.stop()}`. Agent tool writes use `.wait({tier:'local'})`. Test: `test/server-config.it.test.ts`.

- [ ] **Step 1:** Failing `server-config.it.test.ts` — boot the engine with whiteboard built-in; `GET /api/ext/whiteboard/config` returns `{serverUrl, appId}` and the server answers on it.
- [ ] **Step 2:** FAIL → implement; rewrite `test/helpers/boot-stack.ts` to expose `extBase` + the Jazz config; extend `tsconfig.build.json` include with `src/server/**` → PASS. Commit.

### Task C.3: Two-client sync proof over the Jazz server

**Files:** `test/jazz-sync.it.test.ts` (two backend `createJazzContext` clients, OR two Node Jazz clients, on the same `appId`+room converge).

- [x] **Step 1:** DONE — `test/jazz-sync.it.test.ts`: after `startJazzRunner` + `deploy(schemaDir)`, two `createJazzContext(...).asBackend()` connections on the same appId+room; the reader's `subscribeAll(app.canvasElements.where({room}))` observes the writer's `insert(...).wait({tier:'edge'})`. Event-driven (resolve in the callback, 15s reject guard), no fixed sleep.
- [x] **Step 2:** PASS. **Note:** the local-first `createDb` **browser** client can't run under vitest's node env (its WASM/worker runtime hangs) — proven working in raw node (deploy + backend writer(edge) + `createDb` reader synced), and exercised for real in Phase E (Chromium). C.3 proves server relay between two connections; E.2 proves the actual agent→browser path. Commit.

**Checkpoint:** report Phase C (platform foundation — riskiest; the server runner + sync proof).

---

## Phase D — Agent tools write via the backend db (G1 + G2)

### Task D.1: Port `canvas.*` tools

**Files:** rewrite `src/tool/canvas/{def,server,client}.ts` (from the old `tools/canvas.ts`). Server `execute(input, ctx, request)`: `const room = ctx.room(request)`; `canvas.draw` → `await ctx.db.insert(whiteboardApp.canvasElements, {room, elementId, data, version}).wait({tier:'local'})` (insert is sync; `.wait({tier})` ensures the row is durable before the tool result returns so the asserting client sees it); `canvas.delete`/`canvas.clear` declare `approval:'ask'` and `db.delete` rows for the room (query `db.all(...where({room}))` then delete by id). Test: `test/canvas-tools.it.test.ts` — `canvas.draw` via MCP with `mandarax-session-id: mandarax_x` writes a row into the `local:mandarax_x` room (assert via a Jazz client `db.all`/`subscribeAll`); `canvas.delete` is gated (not 403).

- [x] **Step 1+2:** DONE. Ported `canvas.{read,draw,update,delete,clear}` to `src/tool/canvas/{def,server}.ts` on the new `defineTool` contract over a shared `WhiteboardToolContext` ({cwd, db, room}) in `src/server/jazz`→`src/server/context.ts`. `draw` inserts one `canvasElements` row per skeleton (data=element, `.wait({tier:'edge'})`); `read` lists the room; `update`/`delete` query by `elementId`; `delete`/`clear` declare `approval:'ask'`. Wired into `defineExtension({tools: canvasTools})`; `tsconfig.build.json` includes `src/tool/**`. The `data` json write needs one localized `as JsonValue` at the jazz branded-type boundary (sanctioned by the code-style rule). Test `test/canvas-tools.it.test.ts`: draw→read round-trips, sessions are room-isolated (G1), destructive tools self-declare approval (G2). MCP path doesn't gate (gate is the chat/permission layer — tested in core + live smoke F.2). **Deferred to E.2** (need the binding's `data` contract): `canvas.{diagram,connect,export}`.

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

**Files:** `src/client.ts` + `src/client/jazz-client.ts`. `.client()` reads `api.apiBase`, fetches `/api/ext/whiteboard/config` → `{serverUrl, appId}`, gets a persisted local-first `secret` via `useLocalFirstAuth()` (generate-on-first-run; without it writes throw `AnonymousWriteDeniedError`), builds `createSolidJazzClient(() => ({appId, serverUrl, secret}))`, wraps overlays in `<JazzProvider client={client} fallback={…}>`. Gate rendering on the client being ready (`client.db` is `undefined`/`client.loading` until connected — mirror the doc's `<Show when={!auth.isLoading && auth.secret}>`). Session room from `api.client.sessionId()` (reactive) → `roomId(previewId, sessionId)`. **WASM/worker asset resolution:** the widget bundles via vite into a shadow-DOM island — if Jazz can't auto-locate its wasm/worker assets, pass `runtimeSources` ({baseUrl|wasmUrl|workerUrl}) in the `DbConfig` (prove this in Step 1; it's the most likely client-side failure). Test: restore a widget IT on `startWidgetServer` asserting the client connects + a seeded row renders.

- [ ] **Step 1:** Failing widget IT — boot the engine + a Jazz client; the overlay reads `canvasElements` for the room via `useAll(() => ({query: whiteboardApp.canvasElements.where({room})}))` and shows a seeded element (assert via Playwright `locator.waitFor({state:'visible'})`).
- [ ] **Step 2:** FAIL → implement (mirror test-runner `.client()` + the `jazz-tools/solid` Client Setup doc's local-first-auth tab) → PASS. Commit.

### Task E.2: Excalidraw↔Jazz binding (replaces y-excalidraw)

**Files:** `src/client/canvas/binding.ts`, keep `canvas/{island.tsx,island-types.ts}`; delete `canvas/canvas-effect.ts`. Binding: read with `const rows = useAll(() => ({query: whiteboardApp.canvasElements.where({room})}))` and a Solid effect maps `rows.data` → `excalidrawAPI.updateScene({elements})`; Excalidraw `onChange` → diff vs last → `const db = useDb(); db().insert/update(whiteboardApp.canvasElements, …)` for changed element rows (skip echoes by version/origin). NOTE `useDb()` returns an `Accessor<Db>` → call `db()` to get the `Db`; writes are sync (no await needed for local paint). Keep the [[excalidraw-initialdata-clobbers-seed]] rAF seed + light-DOM `<Portal>`. Tests: restore `canvas-overlay.it`, `canvas-persist.it`, `canvas-ai-draw.it` retargeted to Jazz.

- [ ] **Step 1:** Failing IT — open canvas, draw a rectangle, assert a `canvasElements` row exists for the room; an AI-side `db.insert` paints into the open canvas (full stack).
- [ ] **Step 2:** FAIL → implement the binding → PASS. Commit.

### Task E.3: Pins + thread + comment-action via `useAll`/`useDb`

**Files:** rewrite `src/pins/{pins,thread,drag-prompt,comment-action}.tsx` to read `comments`/`pins` with `useAll(() => ({query: whiteboardApp.comments.where({room})}))` (result `{data, isLoading, error}`) and write with `useDb()().insert/update/delete` (no HTTP action route — direct Jazz writes). `.client()` `Component` renders the composer "Open the whiteboard canvas" button (`useSlot()==='composer'`) + `useContext((c)=>c.toggle)`. Tests: restore `pins.it`, `pin-drag.it`, `comment-action.it`, `comments-collection.it` retargeted.

- [ ] **Step 1:** Failing — composer button mounts the canvas; creating a comment via the action writes a `comments` row (client `useDb`) that the agent-side query sees; pins render from `useAll`.
- [ ] **Step 2:** FAIL → implement → PASS. Commit.

### Task E.4: Presence / cursors

**Files:** `src/client/canvas/presence.ts` — write the local cursor to `cursors` (throttled) via `useDb()().upsert/update` (one row per sessionId — `upsert` by a caller-supplied id keyed on sessionId avoids row spam); read peers via `useAll(() => ({query: whiteboardApp.cursors.where({room})}))` → Excalidraw collaborators (filter out own sessionId). Test: `test/presence.it.test.ts` (two clients see each other's cursor).

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
