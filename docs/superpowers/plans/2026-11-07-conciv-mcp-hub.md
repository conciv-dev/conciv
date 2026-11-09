# conciv MCP hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any Claude Code / Codex / opencode / Gemini CLI session, in any directory, finds an open conciv tab by description and drives it with that tab's real tool set, after the user allows it in the tab.

**Architecture:** Each engine registers itself in a per-user SQLite home db. A stdio MCP server (`conciv mcp`, served as `conciv-hub`) reads that table, lists tabs through a new gated `GET /api/tabs`, and forwards `tools/list` / `tools/call` to the engine's existing `/api/mcp` with origin headers. The engine gates hub-origin calls through the existing deny-and-retry approvals, and marks their transcript chunks. The widget's launch menus are deleted and replaced by a "Connect agents" menu that runs each harness's `mcp add` on the engine.

**Tech Stack:** TypeScript (strict, NodeNext), `node:sqlite` + drizzle (`@conciv/db`), `env-paths`, Hono, oRPC, `@tanstack/ai` 1.2.0 family, `@tanstack/ai-mcp` 1.1.0 (`createMCPServer`, `serveMCPStdio` from `@tanstack/ai-mcp/server/stdio`, `createMCPClient({type: 'http', url, headers})` with `tools()` / `callTool`) (CLI imports `@tanstack/ai-mcp` directly; core through `@conciv/ai/server`), citty, Solid + Ark (`@conciv/ui-kit-system`), vitest (node + Playwright browser).

**Spec:** `docs/specs/conciv-mcp-hub.md` (revision 3). Read it before any task; this plan argues from it.

## Global Constraints

- Base: `feat/mcp-hub`, built on PR #739's branch (contains `main` with the ai 1.2.0 family). Commit locally only: do NOT push, do NOT open a PR. Before reading any `@tanstack/ai*` API, read its installed source in `node_modules` (catalog versions in `pnpm-workspace.yaml`); never rely on memory of older versions.
- Repo rules (`AGENTS.md`): functions not classes; no IIFEs; zero code comments; no `any` / `as` / `@ts-ignore` / non-null `!`; no `else` chains where an early return works; no em dashes in code; oxfmt style (no semicolons, single quotes, printWidth 120).
- Solid: no raw `createSignal` / `createEffect`; use `createMemo`, solid-query, or `@solid-primitives/*`.
- zod validates every untrusted input where it enters (query params, headers, RPC inputs, env, files read).
- Tests: no new test files; new `describe` blocks in the files named per task. No mocks (`vi.fn`, `vi.mock`, `vi.stubGlobal`), no CSS/DOM implementation assertions, no test-ids. UI tests act like a user (real pointer click, real typing).
- Test files over 1000 lines (`core-api.it.test.ts`, `cli.test.ts`, `conciv.browser.test.tsx`): every added line is paid for by deleting at least as many lines of duplicate or useless tests in that same file; list each deletion and its reason in the commit body.
- Tests never touch the real conciv home folder or any harness's real config.
- Agents run only the test files they touch (`pnpm --filter <pkg> exec vitest run <file> -t '<describe>'`), after building that package's dependencies with `pnpm turbo run build --filter=<pkg>^...`. Never `--force`, never an unfiltered turbo run. Headless browsers only.
- MCP server name: `conciv-hub`. Install command: `npx -y @conciv/cli@<engine's @conciv/cli version> mcp`.
- Header names: `conciv-origin` (value `hub`), `conciv-client` (max 64 chars). Approval target: `outside-session`.
- `hubAccess`: `'open' | 'session' | 'project'`, default `'session'`.
- Timeouts: page route probe 1500 ms; hub `/api/tabs` probe 2000 ms; install spawn 30000 ms; home db busy timeout 5000 ms.
- Modes: home folder `0700`, `home.db` `0600`.
- Stop and ask Omri (report back, do not improvise) when: deciding an outside-origin approval cannot skip the "Approved: ..." chat message; the session has no actions menu for "Allow outside agents"; the tool-call row has no existing slot for "from <client>"; `opencode mcp add` has no non-interactive local form; a cold `npx` start exceeds a harness's MCP startup timeout.
- Before each commit: `pnpm exec fallow audit --changed-since main --format json` shows nothing INTRODUCED.

## Review Focus

1. **Unwritable or odd home folder** (read-only home in a container, `CONCIV_HOME` pointing at a file, folder owned by another user): the engine still starts and serves; registration logs once. Test in Task 2.
2. **Corrupt `home.db`**: `openHomeDb` throws; the engine still starts; `external_tabs()` reports the error with the home folder, no crash. Tests in Tasks 2 and 6a.
3. **Engine dies during a hub call** (connection drops mid forwarded call): a clear error, and the next `external_tabs()` no longer lists it. Test in Task 6a.
4. **User clicks Deny**: the refusal text reaches the outside agent unchanged and the call stays refused on retry until allowed. Test in Task 5.
5. **Install clicked when the harness already has `conciv-hub`** (or clicked twice): treated as connected, no error notice. Test in Task 7.

---

### Task 1: Home db in `@conciv/db`

**Files:**

- Create: `packages/db/src/home-schema.ts`, `packages/db/src/home-db.ts`, `packages/db/drizzle-home.config.ts`, `packages/db/drizzle-home/` (generated)
- Modify: `packages/db/scripts/gen-migrations.ts` (also emit `src/home-migrations.gen.ts` from `drizzle-home/`), `packages/db/src/index.ts` (exports), `packages/db/package.json` + `pnpm-workspace.yaml` catalog (`env-paths: ^3.0.0`), `packages/db/README.md`
- Test: `packages/db/test/db.test.ts`

**Interfaces:**

- Produces:
  - `concivHome(opts: {homeDir?: string; env: NodeJS.ProcessEnv}): string` (homeDir, else `env.CONCIV_HOME`, else `envPaths('conciv', {suffix: ''}).data`)
  - `openHomeDb(home: string): HomeDb` (prepares folder/file modes, opens `<home>/home.db`, WAL, `timeout: 5000`, migrates in `BEGIN IMMEDIATE`); `closeHomeDb(db: HomeDb): void`
  - `withHomeDb<T>(home: string, run: (db: HomeDb) => T): T` (open, run, close in `finally`)
  - `type EngineRow = {id: string; pid: number; root: string; apiBase: string}`
  - `registerEngine(db, row: EngineRow): void`, `retireEngine(db, id: string, now: number): void` (sets `deletedAt`, never deletes), `listEngines(db): EngineRow[]` (rows with `deletedAt IS NULL`)
  - `checkEngines(home: string, opts: {timeoutMs: number}): Promise<{live: EngineRow[]; unreachable: Array<{root: string; error: string}>}>` in `packages/db/src/engine-check.ts`: per live row GET `<origin>/health` in parallel; matching `id` → live; refused / other `id` / non-conciv body → `retireEngine`; timeout → unreachable
  - `recordHubConnection(db, harness: string, now: number): void`, `hubConnections(db): string[]`
  - `HomeFolderRefused` error (thrown for a symlink or foreign-owned folder; message names the path and reason)

- [ ] **Step 1: Write the failing tests** in `describe('home db')`:
  - `registers, lists and retires engines by id`: two rows with the same `pid` and different `id` both list; `retireEngine(db, idA, now)` leaves only B listed, and A's row still exists with `deletedAt === now` (read the table directly).
  - `checkEngines keeps a live engine, retires a refused port and a wrong id, reports a silent one`: real `node:http` listeners on 127.0.0.1 answering `/health` with `{ok: true, id}`; one row pointing at a closed port; one listener answering another id; one that accepts and never answers (`timeoutMs: 300`).
  - `records hub connections once per harness`: recording `codex` twice lists `['codex']`.
  - `two connections migrating a fresh db at once both succeed`: open two `openHomeDb(tmp)` before either runs a query (second opened while the first is mid-migration via two `DatabaseSync` handles); both list `[]`.
  - `creates the folder 0700 and home.db 0600` (`statSync(...).mode & 0o777`); skip on `process.platform === 'win32'`.
  - `refuses a symlinked home folder` (throws `HomeFolderRefused`).
  - `concivHome prefers homeDir, then CONCIV_HOME, then the platform folder`.
- [ ] **Step 2: Run, expect FAIL** (`openHomeDb` not exported): `pnpm turbo run build --filter=@conciv/db^... && pnpm --filter @conciv/db exec vitest run test/db.test.ts -t 'home db'`
- [ ] **Step 3: Write `home-schema.ts`** (tables `engines`: `id` text pk, `pid` integer not null, `root` text not null, `apiBase` text not null, `deletedAt` integer; `hub_connections`: `harness` text pk, `connectedAt` integer not null) and `drizzle-home.config.ts` (`schema: ['./src/home-schema.ts'], out: './drizzle-home'`). Generate: `pnpm --filter @conciv/db exec drizzle-kit generate --config drizzle-home.config.ts`. Extend `gen-migrations.ts` to write `src/home-migrations.gen.ts` exporting `homeMigrations`.
- [ ] **Step 4: Implement `home-db.ts`** with the Interfaces above. Folder prep: `lstat`; missing → `mkdirSync(home, {recursive: true, mode: 0o700})`; symlink or `uid !== process.getuid()` → throw `HomeFolderRefused`; else `chmodSync(0o700)` (POSIX only). Pre-create `home.db` with `openSync(path, 'a', 0o600)` + `chmodSync(0o600)`. Migration runs `migrateSync(homeMigrations, ...)` wrapped so the first statement is `BEGIN IMMEDIATE`; if drizzle cannot take an outer transaction, run `CREATE TABLE IF NOT EXISTS` statements from the generated SQL inside `BEGIN IMMEDIATE` instead and say so in the commit body.
- [ ] **Step 5: Run, expect PASS** (same command).
- [ ] **Step 6: Commit** `feat(db): per-user home db for the engines table and hub connections`.

### Task 2: Engines register; tests isolated from the real home

**Files:**

- Modify: `packages/vitest-config/src/reporters.ts` (`ciTest()` returns `env: {CONCIV_HOME: <mkdtempSync(join(tmpdir(), 'conciv-home-'))>}`), `packages/core/src/start.ts`, `packages/protocol/src/config-types.ts` (`homeDir?: string` beside `devEndpointDir`), `packages/plugin/src/core/vite.ts` + `packages/plugin/src/core/boot.ts` (pass `homeDir` like `devEndpointDir`), `packages/core/package.json` (dep `@conciv/db` if missing)
- Test: `packages/core/test/core-api.it.test.ts`

**Interfaces:**

- Consumes: Task 1 `concivHome`, `withHomeDb`, `registerEngine`, `listEngines`.
- Consumes also: Task 1 `retireEngine`, `checkEngines`.
- Produces: `StartOpts.homeDir?: string`; `MakeAppOpts.engineId: string`; `/health` response gains `id`; every started engine has an `engines` row `{id: engineId, pid: process.pid, root: opts.root, apiBase: tokenScopedBase()}`, retired on `stop()`.

- [ ] **Step 1: Confirm isolation first.** Grep every `start(` / plugin boot caller in tests (`packages/**/test`, `e2e/*`, `apps/*/test`); for any runner not built on `ciTest()` (e.g. Playwright configs), set `CONCIV_HOME` to a temp dir in that config too. List them in the commit body.
- [ ] **Step 2: Write the failing tests** in `describe('outside sessions')`:
  - `a started engine has a row and stop retires it`: `start({..., homeDir: tmp})`; `withHomeDb(tmp, listEngines)` has one row with `root` and an `apiBase` matching `/^http:\/\/127\.0\.0\.1:\d+\/t\/[0-9a-f-]{36}$/`; `GET /health` returns that row's `id`; after `stop()`, `listEngines` is empty.
  - `an engine retires stale rows when it starts`: pre-insert a row for a closed port; after `start()`, that row has `deletedAt`.
  - `two engines in one process keep two rows`.
  - `an engine starts when the home folder cannot be used`: `homeDir` = path of a regular file; `start()` resolves and `/health` answers.
  - `an engine starts when home.db is corrupt`: write garbage bytes to `<tmp>/home.db`; `start()` resolves.
- [ ] **Step 3: Run, expect FAIL**: `pnpm turbo run build --filter=@conciv/core^... && pnpm --filter @conciv/core exec vitest run test/core-api.it.test.ts -t 'outside sessions'`
- [ ] **Step 4: Implement** in `start.ts`: create `engineId = randomUUID()` and pass it into `makeApp`; `/health` adds `id: engineId` to `HealthSchema`; after `portRef.port` is set, `try { withHomeDb(concivHome({homeDir: opts.homeDir, env: process.env}), (db) => registerEngine(db, row)) } catch (error) { console.error('conciv: engine not registered for outside agents', error) }`; then `void checkEngines(home, {timeoutMs: 2000}).catch(logged)`; in `stop`, outside `clearEndpoint`, the same guarded `retireEngine(db, row.id, Date.now())`.
- [ ] **Step 5: Run, expect PASS.** Also run `pnpm --filter @conciv/vitest-config exec vitest run` (its own tests).
- [ ] **Step 6: Commit** `feat(core): engines register in the home db; tests use a temp CONCIV_HOME`.

### Task 3: `page_route` reports title and visibility

**Files:**

- Modify: `packages/extensions/page/src/shared/defs.ts` (`routeDef` output), `packages/extensions/page/src/client/bodies.ts` (route body)
- Test: `packages/extensions/page/test/page.browser.test.tsx`

**Interfaces:**

- Produces: `page_route` output `{pathname: string, search: string, href: string, title: string, state: 'visible' | 'hidden'}`.

- [ ] **Step 1: Failing test** `route reports the document title and visibility`: set `document.title = 'Settings'`; run the route tool through the file's existing tool-run helper; expect `{title: 'Settings', state: 'visible'}` within the result.
- [ ] **Step 2: Run, expect FAIL**: `pnpm turbo run build --filter=@conciv/extension-page^... && pnpm --filter @conciv/extension-page exec vitest run test/page.browser.test.tsx -t 'route'`
- [ ] **Step 3: Implement**: output schema adds `title: z.string()`, `state: z.enum(['visible', 'hidden'])`; body returns `document.title` and `document.visibilityState === 'visible' ? 'visible' : 'hidden'`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(extension-page): route reports title and visibility`.

### Task 4: `GET /api/tabs`

**Files:**

- Modify: `packages/core/src/page-bus.ts` (`openSessions`), `packages/core/src/README.md`, `packages/core/src/app.ts` (route inside `makeApp`, beside `/api/mcp`), `packages/protocol/src/chat-types.ts` (schemas)
- Create: `packages/core/src/api/tabs.ts` (Hono sub-app, same pattern as `api/mcp.ts` with its own `Variables`)
- Test: `packages/core/test/core-api.it.test.ts`

**Interfaces:**

- Consumes: Task 3 `page_route` output.
- Produces:
  - `PageBus.openSessions(): Array<{sessionId: SessionId; subscribers: number}>`
  - `TabsSchema` / `type Tabs` = spec's `/api/tabs` shape; `TabOpenSchema = z.object({open: z.boolean(), instructions: z.string().nullable()})` in `@conciv/protocol/chat-types`
  - `GET /api/tabs` → `Tabs`; `GET /api/tabs?session=<id>` → `{open}` (zod `SessionId.optional().catch(undefined)`)

- [ ] **Step 1: Failing tests** in `describe('outside sessions')`:
  - `/api/tabs and /api/mcp refuse a missing or wrong token` (401 each, both paths).
  - `/api/tabs lists a joined page`: engine rooted at a temp git repo whose `package.json` name is `tabs-fixture` and HEAD is `ref: refs/heads/feature-x`; a joined page subscriber answers `page_route` with `{href: 'http://localhost:5173/settings', title: 'Settings', state: 'visible', pathname: '/settings', search: ''}`. Expect `project: {name: 'tabs-fixture', branch: 'feature-x'}`, one tab with that `sessionId`, `browserTabs: 1`, `page.href` as given, `harness` = the session's `harnessKind`.
  - `a page that never answers is listed with page null` (subscriber that does not reply; response within 2.5 s).
  - `branch is re-read per request` (rewrite HEAD between two calls).
  - `?session= answers open and not open, with the engine's system prompt text as instructions` (engine started with `systemPromptText: 'be careful in this page'`).
- [ ] **Step 2: Run, expect FAIL** (404): `pnpm --filter @conciv/core exec vitest run test/core-api.it.test.ts -t 'outside sessions'`
- [ ] **Step 3: Implement** `openSessions` (sessions whose page has `subscribers.size > 0`); `tabs.ts` handler: `Promise.all` over open sessions of `Promise.race([bus.ask(id, {name: 'page_route', input: {}}), abort after 1500 ms])`, `no-widget` and timeout → `page: null`; session fields from `rpcSessionList(chatDeps, false)`; project name from root `package.json` (zod-parsed, missing → null); branch from `.git/HEAD` (or the `gitdir:` file of a worktree), each request.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(core): GET /api/tabs lists open sessions for outside agents`.

### Task 5: Hub-origin calls: consent and transcript marker (engine side)

**Files:**

- Modify: `packages/protocol/src/chat-types.ts` (`CONCIV_ORIGIN_HEADER = 'conciv-origin'`, `CONCIV_CLIENT_HEADER = 'conciv-client'`), `packages/protocol/src/config-types.ts` (`hubAccess?: 'open' | 'session' | 'project'`), `packages/chat/src/approvals.ts` (sticky deny for `outside-session`), `packages/core/src/api/mcp.ts`, `packages/core/src/app.ts` (pass `hubAccess` and the gate into `McpDeps`), `packages/ai/src/session/session.ts` (no chat message when deciding an outside-origin approval), the session actions menu in `apps/conciv` ("Allow outside agents")
- Test: `packages/core/test/core-api.it.test.ts`; `packages/ai/test/ai.test.ts` for the session decision path

**Interfaces:**

- Consumes: `plane.admitCall(sessionId, toolName, input, publish)` and `plane.decide(sessionId, approvalId, approved, scope)` (`packages/chat/src/index.ts`).
- Produces:
  - `hubOriginFromHeaders(headers): {client: string} | null` in `mcp.ts`
  - Every hub-origin `/api/mcp` request (including `tools/list`) passes `admitCall(scope.id, 'outside-session', {client}, publish)` first under `'session'`; under `'project'` a granted decision is stored once for the engine and checked before `admitCall`; under `'open'` no check.
  - Hub-origin TOOL_CALL chunks carry `metadata.conciv = {origin: 'hub', client}`.

- [ ] **Step 1: Read the decision path** in `packages/ai/src/session/session.ts` (`decisionText`, line ~74), `packages/chat/src/approvals.ts` (`decide`, `admit`) and the widget approval strip. Confirm a decision for an outside-origin ask (the `outside-session` target, and an approval tool called through the hub, both with `runId: null`) can be recorded without sending the "Approved: ..." message, from the pending approval's own data. Find the session actions menu for "Allow outside agents". If either needs a new slot or API, STOP and report to Omri.
- [ ] **Step 2: Failing tests** in `describe('outside sessions')`, all through `connectMcpClient(url, {[CONCIV_SESSION_HEADER]: id, 'conciv-origin': 'hub', 'conciv-client': 'codex'})`:
  - `session policy refuses a hub call until the user allows`: `tools/call execute_typescript` returns the gate's refusal text and a pending approval with target `outside-session` exists; after `decide(..., true, 'session')` the retry runs; a second session is refused again.
  - `a denied outside session stays refused without asking again` (Review Focus 4): `decide(..., false, ...)`; two retries return "the user denied outside agents for this session" and no new pending approval appears; clearing the deny (the procedure behind "Allow outside agents") makes the next call ask again.
  - `approving an approval tool called from outside starts no run in the tab`.
  - `project policy allows every session after one allow`.
  - `open policy never asks`.
  - `allowed hub calls are marked in the transcript`: subscribe to the session stream; the TOOL_CALL_START chunk has `metadata.conciv` `{origin: 'hub', client: 'codex'}`.
  - In `packages/ai/test/ai.test.ts`: `deciding an outside-origin approval sends no chat message`.
  - In `apps/conciv/test/conciv.browser.test.tsx` (pay for the lines): `allow outside agents lifts a deny` (real pointer click on the menu item; the item disappears).
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** per Interfaces. Headers zod-parsed (`z.enum(['hub']).optional().catch(undefined)`, `z.string().max(64).optional().catch(undefined)`).
- [ ] **Step 5: Run, expect PASS** (both files).
- [ ] **Step 6: Commit** `feat(core): outside agents need the user's allow; their calls are marked`.

### Task 6a: Engine: the `tabs` registry tool, outside runs (`external_use_tab`), forwarding

Spec sections: "Tool: `tabs`" and "Engine: outside runs" (revision 6). Includes widening `ChatPlane.codeRunner` with optional `capabilities` and adding `tools` to the `/api/tabs?session=` answer (both approved by Omri 2026-11-07). Done before 6b and 6c.

**Files:**

- Modify: `packages/core/src/api/mcp.ts` (outside run = hub origin and no session header), the core capability set (where the other core `external_*` capabilities are defined), `packages/core/src/README.md`
- Test: `packages/core/test/core-api.it.test.ts`, `describe('outside sessions')`

**Interfaces:**

- Consumes: Task 1 `concivHome`, `checkEngines`; Task 4 `/api/tabs` + `?session=`; Task 5 header names and consent; `createMCPClient` from `@conciv/ai/server` (core already uses it).
- Produces: in an outside run only, `external_tabs()` and `external_use_tab(id)` with the spec's shapes and error codes `NO_TAB`, `TAB_NOT_OPEN`; every other capability forwarded as `execute_typescript` `return await external_<name>(<json>)` to the owner with `conciv-session-id`, `conciv-origin: hub`, `conciv-client` passed on.

- [ ] **Step 1: Failing tests** (two engines in one process, fake page subscriber, `CONCIV_HOME` temp):
  - `an in-page call does not see the outside capabilities`.
  - `external_tabs lists both engines' tabs and no token`.
  - `a capability before external_use_tab throws NO_TAB`.
  - `external_use_tab on the other engine returns its instructions and tools`.
  - `a forwarded call is refused until allow, then runs on the owner with the marker` (Review Focus 4 path).
  - `the next block starts with no tab`.
  - `an unknown tab throws TAB_NOT_OPEN`.
  - `an owner that stops mid call returns an error and the next external_tabs no longer lists it` (Review Focus 3).
- [ ] **Step 2: Run, expect FAIL**: `pnpm --filter @conciv/core exec vitest run --project node test/core-api.it.test.ts -t 'outside sessions'` (after `pnpm turbo run build --filter=@conciv/core^...`).
- [ ] **Step 3: Implement** per the spec; descriptions carry the spec's agent guidance verbatim; corrupt `home.db` makes `external_tabs` throw a clear error naming the home folder (Review Focus 2).
- [ ] **Step 4: Run, expect PASS.** Pay for added lines by deleting duplicate tests in the same file.
- [ ] **Step 5: Commit** `feat(core): outside agents find and pick a conciv tab inside execute_typescript`.

### Task 6b: The hub, `conciv mcp` (pass-through)

Spec section: "Hub: `conciv mcp`".

**Files:**

- Create: `packages/cli/src/hub.ts`
- Modify: `packages/cli/src/main.ts` (citty `mcp` subcommand, no args), `packages/cli/package.json` (deps `@conciv/db`, `@tanstack/ai-mcp`; NOT `@conciv/ai`), `packages/cli/src/README.md`
- Test: `packages/cli/test/cli.test.ts`

**Interfaces:**

- Consumes: Task 1 `concivHome`, `checkEngines`; Task 5 header names; `createMCPServer`, `serveMCPStdio`, `createMCPClient` from `@tanstack/ai-mcp`.
- Produces: `runHub(opts: {env: NodeJS.ProcessEnv; stdin: Readable; stdout: Writable}): Promise<void>`; fixed tools `execute_typescript`, `discover_tools`, forwarded unchanged to the runner.

- [ ] **Step 1: Failing tests** in `describe('conciv mcp hub')` using `startEngine`, hub spawned over stdio with temp `CONCIV_HOME`:
  - `tools/list is exactly execute_typescript and discover_tools`.
  - `execute_typescript of external_tabs returns the engine's tab`.
  - `a restarted engine on another port still answers`.
  - `with no engine running the call names the home folder`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** per the spec. The `prod closure` test stays unchanged and passes.
- [ ] **Step 4: Run, expect PASS.** Pay for added lines in `cli.test.ts`.
- [ ] **Step 5: Measure** a cold `npx -y @conciv/cli@<local pack> mcp` start (packed tarball, fresh npm cache). Record seconds in the commit body; over 10 s → STOP and report.
- [ ] **Step 6: Commit** `feat(cli): conciv mcp passes outside agents through to a running conciv engine`.

### Task 6c: `conciv tools` finds engines and tabs anywhere

Spec section: "CLI: `conciv tools` finds engines and tabs anywhere". After 6a. On citty now; PR #749 moves the CLI to `@bomb.sh/router` later (separate small follow-up).

**Files:** Modify `packages/cli/src/engine-origin.ts`, `packages/cli/src/request.ts`, `packages/cli/src/main.ts` (global `--tab`), `packages/cli/package.json` (`@conciv/db`), `packages/cli/src/README.md`. Test: `packages/cli/test/cli.test.ts` `describe('conciv tools on any tab')`.

- [ ] **Step 1: Failing tests** as listed in the spec's Tests section.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** per the spec. `prod closure` test unchanged and passing.
- [ ] **Step 4: Run, expect PASS.** Pay for added lines in `cli.test.ts`.
- [ ] **Step 5: Commit** `feat(cli): conciv tools lists every open tab and acts on one with --tab`.

### Task 7: Install on click (engine side)

**Files:**

- Modify: `packages/protocol/src/harness-types.ts` (`HarnessInitBase.hub?: {add: (command: string[]) => string[]}`), `packages/harness-init/src/{claude/init.ts,codex.ts,gemini-cli.ts,opencode.ts}`, `packages/protocol/src/chat-types.ts` (`ChatModelsSchema.hubInstalls`), `packages/core/src/api/rpc/router.ts` (`meta.models` adds `hubInstalls`; new `meta.connectHub`), `packages/contract/src/contract.ts` (`connectHub: oc.input(z.object({harness: z.enum(INIT_HARNESS_IDS)})).output(z.object({ok: z.literal(true)}).or(z.object({ok: z.literal(false), message: z.string()})))`)
- Test: `packages/core/test/core-api.it.test.ts`; `e2e/harnesses/tests/harnesses.spec.ts`

**Interfaces:**

- Consumes: Task 1 `recordHubConnection`, `hubConnections`; `detectHarnesses(env)` (`packages/harness-init/src/detect.ts`).
- Produces: `meta.models` output `hubInstalls: Array<{harnessId: string; name: string}>`; `meta.connectHub({harness})`.
- Argv: claude `['claude','mcp','add','-s','user','conciv-hub','--',...cmd]`; codex `['codex','mcp','add','conciv-hub','--',...cmd]`; gemini-cli `['gemini','mcp','add','-s','user','conciv-hub',...cmd]`; opencode: determine (see Step 1); pi none. `cmd = ['npx','-y',`@conciv/cli@${version}`,'mcp']`, where `version` is `@conciv/core`'s own package version (all `@conciv/*` share one version).

- [ ] **Step 1: Verify each argv** against the CI-pinned CLIs (`.github/workflows/ci.yml` "Install harness CLIs"): run each `mcp add --help` and one real add into a temp config dir (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, gemini via a temp `HOME`). opencode: find a non-interactive local-server form; none → STOP and report. Record the exact "already exists" output of each CLI.
- [ ] **Step 2: Failing tests** in `core-api.it.test.ts` `describe('outside sessions')`, with `PATH` pointing at a temp bin dir holding a `claude` script (`#!/bin/sh`; records argv to a file; exit 0, or prints the recorded "already exists" text and exits 1 when a flag file exists):
  - `hubInstalls lists a detected harness that is not connected`.
  - `connectHub runs the harness add command and the harness leaves the list` (argv file equals the claude argv above).
  - `connectHub treats an already-installed hub as connected` (Review Focus 5).
  - `connectHub returns the CLI's message on failure` (script exits 2 with stderr `boom`).
  - `connectHub refuses an untrusted connection`.
- [ ] **Step 3: Failing e2e test** in `e2e/harnesses/tests/harnesses.spec.ts`: for claude, codex, gemini, `connectHub` against temp config dirs, then the CLI's own `mcp get`/`mcp list` shows `conciv-hub`.
- [ ] **Step 4: Run, expect FAIL**: core command as in Task 4; e2e: `pnpm --filter conciv-e2e-harnesses exec playwright test -g 'connect hub'` (only where the CLIs are installed).
- [ ] **Step 5: Implement**: `execFile(argv[0], argv.slice(1), {timeout: 30000, env: process.env})`, argv only from the registry; success or "already exists" → `recordHubConnection`; `hubInstalls` = `detectHarnesses` with a `hub` field minus `hubConnections()`, no spawning.
- [ ] **Step 6: Run, expect PASS.**
- [ ] **Step 7: Commit** `feat(core): connect a harness to the conciv hub from the widget`.

### Task 8: Widget: "Connect agents" menu, launch menus deleted

**Files:**

- Create: `apps/conciv/src/composer/connect-agents-menu.tsx`
- Delete/modify per the spec's "Deletions" section (all listed files, symbols, docs, skill text, `AGENTS.md` connect sidecar, and tests).
- Modify: `apps/conciv/src/composer/actions.tsx` (menu in the launch menu's slot)
- Test: `apps/conciv/test/conciv.browser.test.tsx`; `packages/extensions/terminal/test/terminal.test.ts` (deletions only)

**Interfaces:**

- Consumes: Task 7 `meta.models().hubInstalls`, `meta.connectHub`.
- Produces: `ConnectAgentsMenu(props: {class: string}): JSX.Element` built like today's `launch-menu.tsx` (`Action.Action` → `Action.Inline` → `Menu.Root` → `TooltipIconButtonSlot` + `Menu.Trigger asChild`), label "Connect agents", items "Connect <name>", notices via `useNotices()`: success "<name> connected. Ask any <name> session for your conciv tab."; failure carries the CLI's message.

- [ ] **Step 1: Failing tests** in a new `describe('connect agents')` (the deleted `describe('launch actions')` pays for it), engine started with the temp-bin `PATH` from Task 7:
  - `the menu lists a harness that is not connected` (open by real pointer click; item "Connect Claude Code" visible by role and name).
  - `connecting a harness removes it from the menu` (click item; success notice text; reopen; item gone; menu trigger gone when list is empty).
  - `a failed connect shows the CLI's message`.
- [ ] **Step 2: Run, expect FAIL**: `pnpm turbo run build --filter=@conciv/embed && pnpm --filter @conciv/app exec vitest run test/conciv.browser.test.tsx -t 'connect agents'`
- [ ] **Step 3: Implement** the menu (solid-query mutation for `connectHub`, invalidate `meta.models` on success).
- [ ] **Step 4: Delete** every item in the spec's "Deletions" list, running `pnpm exec fallow dead-code --trace '<file>:<symbol>'` first for each; keep `claudeConnectArgs`, `HarnessConnectContext`, `HarnessConnectFile`.
- [ ] **Step 5: Run, expect PASS**, plus `pnpm --filter @conciv/extension-terminal exec vitest run test/terminal.test.ts`, plus typecheck of every touched package (`pnpm turbo run typecheck --filter=<pkg>` each).
- [ ] **Step 6: Commit** `feat(app): Connect agents replaces the terminal launch menus`.

### Task 9: Widget shows "from <client>" on outside calls

**Files:**

- Modify: the tool-call row that renders `TOOL_CALL_*` metadata (find it from the chunk's `metadata.tanstack` consumer in `packages/ui-kit-chat` / `apps/conciv`)
- Test: `apps/conciv/test/conciv.browser.test.tsx`

**Interfaces:**

- Consumes: Task 5 `metadata.conciv = {origin: 'hub', client}`.

- [ ] **Step 1: Find an existing slot** in the tool-call row that can show a short secondary label. None → STOP and report to Omri.
- [ ] **Step 2: Failing test** `an outside call shows which agent made it`: drive a hub-origin `execute_typescript` into the session (via `connectMcpClient` with the hub headers, `hubAccess: 'open'`); the row shows text "from codex".
- [ ] **Step 3: Run, expect FAIL**; **Step 4: Implement**; **Step 5: Run, expect PASS.**
- [ ] **Step 6: Commit** `feat(app): mark tool calls made by outside agents`.

### Task 10: Changeset and lane gate (Fable)

- [ ] **Step 1:** Add `.changeset/conciv-mcp-hub.md` (patch, naming `@conciv/cli`).
- [ ] **Step 2:** `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main` passes.
- [ ] **Step 3:** Fable runs the affected gates once (`TURBO_CONCURRENCY=1 VITEST_MAX_FORKS=1 pnpm test:affected`, `pnpm typecheck:affected`, `pnpm lint`, `pnpm format:check`, fallow audit) and the spec's Acceptance list live, all eight items, before any handoff.
- [ ] **Step 4: Commit** `chore: changeset for the conciv MCP hub`.
