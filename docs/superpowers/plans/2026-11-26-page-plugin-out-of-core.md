# Tabs Move to Core, Page Plugin Leaves Core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open widgets ("browser tabs") become a core engine concept stored in the core DB and read one way by everyone; no core package imports `@conciv/plugin-page`; no feature is lost.

**Architecture:** The widget attaches to the engine as a browser tab (core contract `tabs.*`, core service `Tab.Service`, core table `tabs` written only by a projector of durable `tab.*` events, boot reconcile). The page plugin stops owning tabs, reads the core list, and keeps only actions inside a tab. The CLI and hub read tabs from core and treat plugins generically. A plugin may call another plugin's exported rpc (ruled 2026-11-26, as opencode `packages/gui-plugins/src/browser/pane.ts:2` imports `@opencode/plugin-browser/rpc`).

**Tech Stack:** Effect 4, oRPC contract (`@conciv/protocol`), drizzle sqlite, Solid widget, solid-query, zod, vitest (node + browser mode).

**Spec:** maintainer rulings of 2026-11-26 (section "Rulings"); opencode reference `_ref/opencode/packages/core/src/{bus.ts,session/projector.ts,job.ts}`.

## Rulings (2026-11-26)

1. No core package imports the page plugin. Plugins may use another plugin's exported rpc.
2. Tabs are core: the widget registers with the engine; every hub sees all tabs whether or not the page plugin is installed.
3. The tab list is stored in the core DB.
4. One way to get the data: what moves to core is deleted from page; no duplicate registry, method or schema.
5. The hub connects to every plugin the same way and has no page code.
6. No feature lost.

## PR goals checklist (the work is not done until every line is true)

- [ ] Plugins out of core: no core package (cli, backend, backend-defaults, backend-app-api, app, frontend-defaults, frontend-app-api, kits, storybook, publish) imports any plugin; only the app's built-ins composition and the backend's built-in list name built-ins (as opencode `app/src/runtime/plugin/builtins.ts:1`). Proof: grep over every plugin package name.
- [ ] Every plugin tests fully from its own package with the test utilities it needs.
- [ ] Browser code never imports backend code (no `@conciv/backend*` reachable from widget, kit, plugin renderer/client entries; widget bundle contains none).
- [ ] Turbo `--affected` works: dry-run table after an edit in each plugin, `client`, `protocol`, `publish`.
- [ ] Every turbo.json hack removed; each remaining `turbo.json` listed with its reason.
- [ ] Tabs are core and in the core DB; page holds no tab data.
- [ ] No feature lost (table at the end).
- [ ] CI green on #1191.

## How the work runs

- Lanes in parallel, one agent per git worktree off `refactor/backstage-packages`, herdr tab per lane, reports as files in the orchestrator inbox. Lanes never share a file.
  - Wave 1: CORE = Task 1. BUILTINS = Task 7.
  - Wave 2 (after CORE merged): WIDGET-PAGE = Tasks 2, 3 and Task 6 page half. CLI-HUB = Task 5 and Task 6 core + hub half. TANSTACK = Task 4.
- Agents write code and test changes; run only typecheck, build, lint; commit locally; never push.
- The orchestrator reads each lane's full diff against this plan (every Interfaces block, every deletion listed) and merges it. No tests run until all code is complete.
- Final gate once, by the orchestrator: lint, format, fallow, every `conciv-publish` guard, affected table, full test suite (background, pid watched), widget shots, then push; CI is the gate of record.

## Global Constraints

- No comments in TS/JS; functions, not classes; no IIFEs; no `Of` suffix; no barrels; kebab-case files.
- Contract inputs zod-validated in `packages/protocol/src/contract.ts`.
- Core tables in `packages/backend-app-api/src/core/<name>/sql.ts`; migrations through the `gen-migrations` task.
- Durable events declared like `packages/protocol/src/schema/session-event.ts`.
- Tests: act like a user, no mocks, no sleeps, no geometry; extend the existing journey in the existing file; `test-budget.json` unchanged unless the PR body carries a per-test account. `@conciv/backend-app-api` has budget 0 and no tests: core behaviour is tested through the engine in `backend-defaults/test/it/`.
- One reconnect path: the widget's attach rides the engine client's single retry path (`client/src/connection/engine-connection.ts` `retryDelay`). Page's own back-off (`plugins/page/src/attachment-machine.ts:32-53`) is deleted, not moved.
- Naming: `MountedSession.tab` already exists (`frontend-defaults/src/runtime/plugin/mounted-session.ts:336`, `tab = id`, the panel tab) and `ctx.tabs` already exists in the widget plugin API (`host-apis.tsx:367`, panel view tabs). The new concept is the **browser tab**: contract group `tabs`, engine service `Tab`, engine plugin view `ctx.browserTabs`, widget field `MountedSession.browserTab`. Never reuse the widget's `tab`/`tabs` names.

## Vocabulary (lint `conciv/banned-vocabulary` bans `attach` and `presence`, `packages/oxlint-plugin/src/vocabulary.js:165-180`)

The held call is `tabs.open` (returns `'closed' | 'replaced'`), not attach. Events `tab.opened`, `tab.updated`, `tab.closed`; table column `open`; `tabs.sessions()` lists sessions with an open tab (was `attached`); `Tab.Service.open/update/list/sessions/changes`; `BrowserTabOpen` input (was `BrowserTabAttach`). Every later task uses these names; wherever this plan still says attach/attached/detached, read open/opened/closed.

## How the tab table stays valid (as opencode)

- Table = projection of durable events written in the event's transaction (opencode `bus.ts:107` `commit`, `bus.ts:883` `project`; ours `backend-app-api/src/core/bus.ts:109,159,833`, used by `backend-defaults/src/core/session/projector.ts:53-88`). The projector is the table's only writer.
- Boot reconcile (opencode `job.ts:174` `runningBackground`): on engine start publish `tab.detached` for every row still attached.
- `tabs.attach` is scoped: acquire publishes `tab.attached`, release (widget gone, socket dropped, engine stopping) publishes `tab.detached`.
- Clients read `tabs.list` and refresh on `tabs.changes` (`eventIterator`, like `sessions.changes`, `contract.ts:423`, served at `backend-defaults/src/engine/api/rpc/sessions.ts:302`). No TanStack DB: tabs are read-only to clients.

## Core shapes (Task 1 produces; all later tasks consume)

- `packages/protocol/src/schema/browser-tab.ts`: `BrowserTabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)`; `BrowserTab = {id, url (max as page rpc.ts:73-80), title (max as rpc.ts), focused: boolean, visible: boolean}`; `BrowserTabList = {tabs: BrowserTab[], focusedTabId: BrowserTabId | null}`; `BrowserTabAttach = {sessionId: SessionId, connectionId: string, tab: BrowserTab}`; `BrowserTabsChange = {version: number}`.
- `packages/protocol/src/schema/browser-tab-event.ts`: durable, aggregate `sessionID`: `tab.attached {sessionID, tabId, connectionId, tab}`, `tab.updated {sessionID, tabId, tab}`, `tab.detached {sessionID, tabId, connectionId}`.
- Contract group `tabs` (after `sessions`, `contract.ts:~467`): `attach: oc.errors({...notFound, unavailable}).input(BrowserTabAttach).output(z.enum(['closed','replaced']))`; `state: oc.errors({unavailable}).input(BrowserTabAttach).output(Ok)`; `list: oc.input(z.object({sessionId: SessionId})).output(BrowserTabList)`; `attached: oc.output(z.array(SessionId))`; `changes: oc.output(eventIterator(BrowserTabsChange))`.
- `packages/backend-app-api/src/core/tab.ts`: `Interface {attach(input): Effect<'closed'|'replaced', NotFoundError|UnavailableError, Scope>; update(input): Effect<void, UnavailableError>; list(sessionId): Effect<BrowserTabList>; attached(): Effect<SessionId[]>; changes: Stream<BrowserTabsChange>}`, `Service = Context.Service<Interface>('@conciv/Tab')`.
- `packages/backend-app-api/src/core/tab/sql.ts`: `tabs(id text pk, session_id text not null references sessions.id on delete cascade, connection_id text not null, url text not null, title text not null, visible integer not null, focused_at integer, attached integer not null, updated_at integer not null)`, index `(session_id, attached)`.
- Engine plugin view: `backend-plugin-api` `Context.browserTabs: {list(sessionId), attached()}`, wired in `backend-app-api/src/core/plugin/host.ts:44-63` as `const browserTabs = yield* Tab.Service` next to `sessions` (line 58) and exposed beside `session` (lines 183-207); `plugin.ts:99` picks the requirement up from `PluginHost.make`'s services; `Tab.Service` is provided in `backend-defaults/src/engine/runtime/plugin-runtime.ts` next to `provideSessions` (line 284).
- Widget view: `frontend-plugin-api/src/host-apis.ts:210` `MountedSession.browserTab: {readonly id: BrowserTabId; readonly connectionId: string}`, built in `frontend-defaults/src/runtime/plugin/mounted-session.ts` `create` (line 327-355); ids made once per mounted widget.

## Review Focus (each pinned by a test in its task)

1. Two widgets on one session: both listed, the last focused first, `focusedTabId` follows focus (today `machine.ts:507-514`). Task 1.
2. The same widget reattaches after a socket drop: one row, the older attach returns `replaced` (today `machine.ts:161-205`). Task 1.
3. Engine restart: no row is attached until a widget attaches again (`engine.restart()`). Task 1.
4. Session deleted: its rows go; page cancels its pending commands (today `connection.ts:604-618`). Tasks 1 and 3.
5. Session from another project location: `tabs.attach` refuses `unavailable` (today `connection.ts:480-481`). Task 1.

---

### Task 1: Core browser tabs (lane CORE)

**Files:** create the shapes above; `contract.ts`; `backend-app-api/src/core/tab.ts`, `core/tab/sql.ts`; `backend-defaults/src/core/tab/projector.ts` (only writer), `backend-defaults/src/core/tab/tab.ts` (service layer), `backend-defaults/src/engine/api/rpc/tabs.ts` + `router.ts:404` (`tabs: tabsRouter(deps)`); `plugin-runtime.ts:284` (provide); `host.ts` + `backend-plugin-api` (`ctx.browserTabs`); `frontend-plugin-api/src/host-apis.ts:210` (`browserTab` type only); migration via `gen-migrations`.
**Test:** extend `packages/backend-defaults/test/it/session.it.test.ts` with one journey test (the session file already tests engine session behaviour through `createEngine`): a fake widget is an `EngineClient` from `makeRpcClient(engine.address.apiBase, {token: engine.address.token})` (`client/src/connection/rpc-client.ts:37`).

- [ ] Test "a browser tab attaches, a second joins, focus moves, the first reattaches, closes, the engine restarts and a deleted session takes its tabs": steps assert `tabs.list` (`tabs` ids in order, `focusedTabId`), `tabs.attached()`, the first attach resolving `'replaced'`, after `engine.restart()` `tabs.attached()` is `[]`, after session delete `tabs.list` is empty; a session of another location refused with `unavailable`. (Covers Review Focus 1, 2, 3, 5 and the core half of 4.)
- [ ] Commit `feat(engine): browser tabs are core, stored by a projector of tab events`.

### Task 2: The widget attaches as a browser tab (lane WIDGET-PAGE)

**Files:** create `frontend-defaults/src/runtime/browser-tab/attach-browser-tab.ts` (`attachBrowserTab(input: {client: EngineClient; sessionId: string; browserTab: {id; connectionId}}): Effect<void, never, Scope>`; `readBrowserTab(id)`, `reportBrowserTabChanges(report, signal)` moved verbatim from `plugins/page/src/attachment.ts:266-300`); `mounted-session.ts` `create` sets `browserTab` and the mounted memo runs `attachBrowserTab` scoped to the mounted session (released when the panel's session changes or the widget unmounts).
**Test:** extend `frontend-defaults/test/e2e/sessions.e2e.test.tsx` (sessions journey, browser mode, real engine): "an open widget is a browser tab the engine lists, and switching sessions moves it": render the app on a session, assert core `tabs.list` for that session names one tab with the page title, switch session, assert the old list is empty and the new one has it.

- [ ] Commit `feat(widget): every open widget is a browser tab the engine knows`.

### Task 3: The page plugin uses core tabs (lane WIDGET-PAGE)

**Delete from page:** `rpc.ts` `TabId`, `Tab`, `State` (24-25, 73-81), `attachment` + `Control.attached` (571-575), methods `attach`, `state`, `sessions.attached`, `tabs.list` (584-617); `attachment-machine.ts` (file); `attachment.ts` attach half (`connectOnce` attach/state parts, `keepAttached`, `readTab`, `reportChanges`, `reportRouteChanges`); `machine.ts` tab bookkeeping (`Attachment`, `attachments`, `focusedConnectionId`, `attach`, `join`, `closeTab`, `updateTabState`, `selectTabs`, `selectAttachedSessions`, `lastFocused`); `connection.ts` handlers `attach`, `state`, `sessions.attached`, `tabs.list` (460-519, 587-588); `renderer.tsx:35-36` own ids.
**Keep and rewire:** command channel (`command`, `result`, `operate`, `hmr.wait`, control `command`/`cancel`) keyed by `browserTab.connectionId`; `selectTarget(list: BrowserTabList, tabId?)` with its error texts naming core `tabs.list`; permission grant/revoke (`reconcilePagePermissions`, `syncPermissions`) driven by `tab.attached`/`tab.detached` events via `ctx.event.subscribe`; the agent tool `page_tabs_list` (`tools.ts:61`) answers from `ctx.browserTabs.list` (same output shape); session-deleted cancel (604-618).
**Tests:** rewrite `plugins/page/test/utils/page-attachment.ts` `attachPage` to attach through core `tabs.attach` (fake widget client as Task 1) then answer commands as today; `test/unit/machine.unit.test.ts` keeps the permission and target tests over a `BrowserTabList` input (its tab-bookkeeping cases move to Task 1's journey); `test/unit/attachment.unit.test.ts` ("a browser without the Navigation API") moves with `reportBrowserTabChanges` to frontend-defaults `test/unit/` (same name). `test/it/tools.it.test.ts` and `test/e2e/page.e2e.test.tsx` unchanged in behaviour, passing.

- [ ] Commit `refactor(plugin-page): tabs come from core; the plugin keeps only actions in a tab`.

### Task 4: TanStack reads core tabs (lane TANSTACK)

**Files:** `plugins/tanstack/src/tools.ts:9,33-37,109-193`: `TabId`/`State` from `@conciv/protocol/schema/browser-tab`; tab list from `ctx.browserTabs.list`; `operate` stays on page's exported rpc. **Test:** `tanstack/test/e2e/tanstack.e2e.test.tsx` "the TanStack tab list names the focused tab" unchanged, passing.

- [ ] Commit.

### Task 5: CLI and hub read core tabs (lane CLI-HUB)

**Files:** `cli/src/engine-read.ts:80-150` (delete `pageCall`; `readState` = `rpc.tabs.list`; `engineTabs` uses `rpc.tabs.attached`); `cli/src/hub.ts` (delete `Page` import, `PAGE_TOOL_PREFIX`, `PAGE_TOOLS_NOTE` and its use in descriptions `:97,102,502`, `notePageTools` `:676-683`, `TabOwner.page`); `cli/package.json` drops `@conciv/plugin-page`.
**Tests:** `cli/test/it/hub.it.test.ts` and `tools.it.test.ts`: drop `import page`; open a browser tab through core with the fake widget client; `list_tabs` lists it (JSON shape unchanged); `tools.it` "a page tool with no page open answers that no page is open" keeps its assertion via the page plugin loaded by name only if it is a page assertion, else moves to page `tools.it`. `engine-origin.it.test.ts` drops `import page`.

- [ ] Commit.

### Task 6: Port opencode's Job; queued page work is a core job (lanes CLI-HUB core+hub, WIDGET-PAGE page)

Ruled 2026-11-26: opencode has a core concept for work a tool call starts that finishes later (`_ref/opencode/packages/core/src/job.ts`, `job/sql.ts`, `job/recovery.ts`, `job/list.ts`, used by `codemode/job.ts` and `session/background.ts`); we port it. The bespoke `outside_notice` table, `expectOutside`, `notifyOutside` and `sessions.outsideNotices` are deleted.

**Core (CLI-HUB):** port, keeping opencode's names and structure: `backend-app-api/src/core/job.ts` (`Info`, `Status`, `StartInput`, `WaitInput`, `Interface` with `get`, `start`, `wait`, `cancel`, `cancelSession`, `runningBackground`, `Service` `'@conciv/Job'`), `core/job/sql.ts` (`JobTable` as opencode `job/sql.ts`), `core/job/recovery.ts` (`RecoverySchema` with our kind `page-queue {sessionID, queueId}`; opencode's shell/image/subagent/codemode kinds only when a caller exists), implementation in `backend-defaults/src/core/job/job.ts`, boot recovery as opencode `runningBackground` (a job left running by a dead engine ends `cancelled` with opencode's "Interrupted by server restart." notice text pattern from `codemode/job.ts:12-19`). Plugin view `ctx.job.{start, get, wait, cancel}` wired in `backend-app-api/src/core/plugin/host.ts`. Job metadata carries `toolCallId` and `origin`. Contract `jobs.list({sessionId, toolCallIds?})` and `jobs.wait({ids, waitMs})` (or opencode's exact read surface if it has one), served in backend-defaults.
**Hub (CLI-HUB):** after each tab reply, prepend the notices of jobs that finished for hub-origin calls of that session and were not yet reported to the hub (opencode's consumed/reported flags); open an MCP task only when `jobs.list({toolCallIds: calls})` has running jobs; `tasks/get` waits with `jobs.wait`.
**Page (WIDGET-PAGE):** the queue starts a core job (`ctx.job.start({type: 'page-queue', recovery: {kind: 'page-queue', sessionID, queueId}, metadata: {toolCallId, origin}, run})`); the in-widget agent hears the result through the job's session notice (as opencode `codemode/job.ts` notice), replacing page's own `ctx.session.synthetic` queue notice; page's `queue.startedBy`, `queue.undelivered`, `queue.settle`, `queue.claim` lose their hub callers and go if nothing else calls them (grep).
**Tests:** page `tools.it` "the agent reads the page in code mode" gains: an outside call queues an action, its job ends `completed`, the next hub-style read returns its notice once. CLI `hub.it` gains: a queued page action from the hub comes back on the next reply, and an MCP task completes when its job does. backend-defaults `session.it` journey gains: a running job is cancelled by an engine restart with the restart notice.

### Task 7: Built-ins as opencode; backend, app, storybook, publish (lane BUILTINS)

**Files:** `plugins/page/src/builtins.ts` (export `./builtins`); `app/src/builtins.ts` composes built-ins exports, names no page id or function; `backend/src/start.ts` + `package.json` (built-ins by package name from the defaults' list, no page import); `app/vite.config.ts:9-14` inline list, `:24` widget entry from `src/` (move `test/fixtures/global-entry.ts`'s behaviour into a src entry); `apps/storybook/package.json:22`; `publish/src/workspace-imports.ts:16`.
**Tests:** app and backend existing tests pass; a widget bundle build; the shipped bundle's entry is not under `test/`.

- [ ] Commit.

### Task 8: Proof (orchestrator)

- [ ] grep every plugin package name outside `packages/plugins/`: only built-ins composition.
- [ ] grep page src for `tabs.list` definitions, `selectTabs`, `TabId =`, `attach:`: none (one way).
- [ ] Affected dry-run table; full test suite; lint, format, fallow, guards; shots of page cards and sidebar grouping; then the goals checklist above.

## Feature check (nothing lost)

| Feature                                                         | Proved by                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| List open tabs (CLI `tools list_tabs`, hub `list_tabs`)         | Task 5 tests, JSON shape unchanged                                                |
| Agent lists tabs (`page_tabs_list`)                             | page `tools.it`                                                                   |
| Hub routes a call to the engine holding the tab                 | cli `hub.it`                                                                      |
| Page actions target focused / named tab, same error texts       | page `machine.unit` + `page.e2e`                                                  |
| Page permission granted while a tab is open, revoked after      | page `machine.unit`                                                               |
| Queued page result reaches the in-widget agent                  | page `tools.it`                                                                   |
| Queued page result reaches an outside agent (notice + MCP task) | Task 6 tests                                                                      |
| TanStack tab list names the focused tab                         | tanstack e2e                                                                      |
| Recorder, whiteboard, terminal journeys with page               | their e2e suites                                                                  |
| Sidebar groups page tool calls per session                      | app test + shot                                                                   |
| Widget follows the session the user switches to                 | page `page.e2e` "the page follows the session the user switches to" + Task 2 test |
