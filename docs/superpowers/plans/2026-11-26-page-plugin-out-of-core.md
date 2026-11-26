# Tabs Move to Core, Page Plugin Leaves Core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open widgets ("tabs") become a core engine concept stored in the core DB, read one way by everyone; no core package (cli, backend, app, defaults, kits, storybook, publish) imports `@conciv/plugin-page`; no feature is lost.

**Architecture:** The widget itself attaches to the engine as a tab (core contract `tabs.*`, core service `Tab`, core table `tabs`, core events `tab.*`). The page plugin stops owning tabs and reads the core list; it keeps only actions inside a tab (operate, snapshot, grab, react, queue, captures). The CLI and hub read tabs from core only and treat plugins generically. Plugins may call other plugins' exported rpc (ruled 2026-11-26, as opencode `gui-plugins/src/browser/pane.ts:2` importing `@opencode/plugin-browser/rpc`).

**Tech Stack:** Effect 4, oRPC contract (`@conciv/protocol`), drizzle sqlite (`backend-app-api/src/core/*/sql.ts`), Solid widget (`frontend-defaults`), zod.

**Spec:** maintainer rulings of 2026-11-26 in this conversation (recorded in the "Rulings" section below).

## Rulings (2026-11-26)

1. Nobody imports the page plugin except the page plugin. Applies to core packages; plugins may use another plugin's exported rpc.
2. Tabs are core: the widget registers with the engine, every hub sees all tabs regardless of the page plugin.
3. The tab list is stored in the core DB.
4. One way to get the data: whatever moves to core is deleted from the page plugin, no duplicate registry, no duplicate method.
5. The hub connects to every plugin the same way and has no page code.
6. No feature lost (feature list below is the acceptance check).

## How the work runs (tests and gates)

- Parallel lanes, one agent per worktree (each its own `git worktree` off `refactor/backstage-packages`, `pnpm install`
  run there; the orchestrator merges each lane into the branch):
  - Wave 1: lane CORE = Task 1; lane BUILTINS = Task 7 (app, backend start, vite config, storybook, publish; touches no
    tab file).
  - Wave 2, after CORE is merged: lane WIDGET-PAGE = Tasks 2 + 3 + the page half of Task 6 (`connection.ts:426-456`,
    one owner for page files); lane CLI-HUB = Task 5 + the core and hub half of Task 6 (`sessions.notices`, `hub.ts`,
    one owner for `hub.ts`); lane TANSTACK = Task 4.
  - Task 8 by the orchestrator after every lane is merged.
    Lanes never share a file; where two tasks touch one file, one lane owns it (listed above).
- Each lane's agent (opus). Its brief: write the task's code and its test changes; run only
  typecheck, build and lint on touched packages; commit locally; never push; no tests, fallow, guards or dry runs.
- After each lane the orchestrator reads the full diff and merges it. No tests run until the code is complete.
- Tests follow AGENTS.md Testing: act like a user (roles, labels, text), no mocks, no sleeps, no geometry; extend the
  existing journey and file, never a new file over the package budget; `test-budget.json` raised only with a
  per-test account in the PR body.
- Final gate, once, after Task 8, by the orchestrator: `pnpm lint`, `pnpm format`, fallow audit, `conciv-publish`
  guards (dependency loops, catalog, test budget, typecheck coverage, turbo dependsOn, changesets), the affected
  dry-run table, the full test suite in the background with a pid check, the widget shots. Then push; CI is the gate
  of record; each red is reproduced locally and fixed at its root.

## How the tab table stays valid (as opencode)

Read from `_ref/opencode/packages/core/src`:

- Tables are projections of durable events, written in the same transaction as the event: `bus.ts:107`
  (`commit` "projection committed atomically with a new durable event"), `bus.ts:883` `project(definition, projector)`,
  `session/projector.ts`. A row never disagrees with the event log.
- Rows describing live work are reconciled at boot: `job.ts:174` `runningBackground` and `job/recovery.ts` recover or
  close jobs a dead process left running.
- The client reads with solid-query and refreshes on the change stream (`app/package.json:82`); no client-side store of
  its own.

Ours already has the same pieces: `backend-app-api/src/core/bus.ts:109` (`commit`), `:159`/`:833` (`project`), our
`backend-defaults/src/core/session/projector.ts:53-88`, and the widget's `sessions.changes` stream with solid-query
(`frontend-defaults/src/app/live-sessions.ts`). So tabs follow it exactly:

- `tab.attached`, `tab.updated`, `tab.detached` are durable events; `backend-defaults/src/core/tab/projector.ts`
  projects them into the `tabs` table with `bus.project`. Nothing writes the table except the projector.
- Engine start publishes `tab.detached` for every row still `attached` (the boot reconcile, as opencode's job
  recovery), so after a crash or restart the table is valid before the first widget attaches.
- `tabs.attach` is a scoped call: acquiring publishes `tab.attached`, release (widget closed, socket dropped, engine
  stopping) publishes `tab.detached`. One writer path per transition.
- Contract `tabs.changes: oc.output(eventIterator(TabChangeSchema))`, like `sessions.changes`; CLI, hub, widget and
  plugins read `tabs.list` and refresh on `tabs.changes` (widget through solid-query invalidation). TanStack DB is not
  used here: it is for edited synced collections (ruling "one tool per job"), and tabs are read-only to clients.

## Global Constraints

- No comments in TS/JS; functions, not classes; no IIFEs; no `Of` suffix; no barrels; kebab-case files.
- zod validates every contract input (`oc.input(...)` in `packages/protocol/src/contract.ts`).
- Core tables live in `packages/backend-app-api/src/core/<name>/sql.ts` (as `session/sql.ts`, `kv/sql.ts`, `event/sql.ts`); migrations through the existing `gen-migrations` task.
- Durable events are declared like `packages/protocol/src/schema/session-event.ts` (`EventDefinition.durable`).
- Agents write code and run only typecheck, build and lint. The orchestrator runs tests.
- One reconnect path: the widget's tab attachment rides the engine connection's single retry path (`client/src/connection/engine-connection.ts` `retryDelay`, socket back-off in `engine-connection-machine.ts`). The page plugin's own attach back-off (`plugins/page/src/attachment-machine.ts:32-53`, 1 s to 30 s) is deleted, not moved.

## What moves out of the page plugin (deleted there, created once in core)

| Today in page                                                                                                                                                                                    | Becomes (core, the only copy)                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `rpc.ts:24-25` `TabId`, `rpc.ts:73-81` `Tab`, `State`                                                                                                                                            | `packages/protocol/src/schema/tab.ts` (`TabId`, `Tab`, `TabList = {tabs, focusedTabId}`)                                           |
| `rpc.ts:571-577` `attachment`, `Control.attached`; methods `attach`, `state`, `sessions.attached`, `tabs.list` (`rpc.ts:584-617`)                                                                | contract group `tabs`: `attach`, `state`, `list`, `attached` in `packages/protocol/src/contract.ts` next to `sessions` (~line 418) |
| `attachment.ts` `connectOnce` attach half, `readTab`, `reportChanges`, `reportRouteChanges` (`attachment.ts:102-227` attach part, `266-300`)                                                     | `packages/frontend-defaults/src/runtime/tab/attach-tab.ts`: the widget attaches once per mounted session                           |
| `attachment-machine.ts` (whole file)                                                                                                                                                             | deleted; the engine connection's retry path reopens `tabs.attach`                                                                  |
| `machine.ts` tab bookkeeping: `Attachment`, `attachments`, `focusedConnectionId`, `selectTabs`, `selectAttachedSessions`, `lastFocused`, `selectTarget` tab choice, `updateTabState`, `closeTab` | `packages/backend-app-api/src/core/tab.ts` (`Tab.Service`) + `core/tab/sql.ts` (table) + `core/tab/tab.ts` (implementation)        |
| `connection.ts:460-519` `attach`/`state` handlers, session location check (`480-481`)                                                                                                            | core `tabs.attach`/`tabs.state` handlers `packages/backend-defaults/src/engine/api/rpc/tabs.ts`                                    |
| `connection.ts:587-588` `sessions.attached`, `tabs.list`                                                                                                                                         | deleted (core `tabs.attached`, `tabs.list`)                                                                                        |

What STAYS in the page plugin (page-only behaviour):

- Commands into a tab: `command`, `result`, `operate`, `hmr.wait` and the `control` event's `command`/`cancel` (`rpc.ts:576-577`), keyed by the core tab's `connectionId`.
- The page permission grant while a session has a tab and revoke when its last tab closes (`machine.ts` `sync-permissions`, `reconcilePagePermissions`, `connection.ts:241-263`), now driven by core `tab.attached` / `tab.detached` events.
- Queue, captures, grabs, symbolicate, every action file (`react.ts`, `act.ts`, `snapshot.ts`, `grab*.ts`, `screenshot.ts`, ...).
- Target choice reads the core list: `selectTarget(tabs: TabList, tabId?)` keeps its error texts, pointing to core `tabs.list` instead of `page.tabs.list`.

## Core shapes (produced by Task 1, used by every later task)

```ts
// packages/protocol/src/schema/tab.ts
export const TabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)
export const Tab = z.object({
  id: TabId,
  url: z.string().max(2048),
  title: z.string().max(512),
  focused: z.boolean(),
  visible: z.boolean(),
})
export const TabList = z.object({tabs: z.array(Tab), focusedTabId: TabId.nullable()})
export const TabAttachInput = z.object({sessionId: SessionId, connectionId: z.string(), tab: Tab})
```

(`url`/`title` maxima copied from today's `rpc.ts:73-80`.)

Contract (`contract.ts`, group `tabs`):

- `attach: oc.errors({...notFound, unavailable}).input(TabAttachInput).output(z.enum(['closed', 'replaced']))` held open while the widget lives.
- `state: oc.input(TabAttachInput).output(Ok)`.
- `list: oc.input(z.object({sessionId: SessionId})).output(TabList)`.
- `attached: oc.output(z.array(SessionId))`.

Core service (`backend-app-api/src/core/tab.ts`):

```ts
export interface Interface {
  readonly attach: (
    input: TabAttachInput,
  ) => Effect.Effect<'closed' | 'replaced', NotFoundError | UnavailableError, Scope.Scope>
  readonly update: (input: TabAttachInput) => Effect.Effect<void, UnavailableError>
  readonly list: (sessionId: SessionId) => Effect.Effect<TabList>
  readonly attached: () => Effect.Effect<SessionId[]>
}
export const Service = Context.Service<Interface>('@conciv/Tab')
```

Table (`core/tab/sql.ts`): `tabs(id text pk, session_id text not null references sessions.id on delete cascade, connection_id text not null, url text, title text, focused_at integer, visible integer, attached integer not null, updated_at integer not null)`; index on `(session_id, attached)`. Engine start sets every row `attached = 0`.

Events (`protocol/src/schema/tab-event.ts`, durable, aggregate `sessionID`): `tab.attached {sessionID, tabId, connectionId}`, `tab.updated {sessionID, tabId}`, `tab.detached {sessionID, tabId, connectionId}`.

Plugin view (`backend-plugin-api`): `ctx.tabs.list(sessionId)`, `ctx.tabs.attached()`; events reach plugins through the existing `ctx.event.subscribe`.
Widget view (`frontend-plugin-api`): `MountedSession` gains `tab: {id: TabId, connectionId: string}` so the page renderer uses the core tab's ids instead of making its own (`renderer.tsx:35-36`).

## Review Focus

- Two widgets on the same session: both rows listed, focused one first, `focusedTabId` follows the last focused (today `lastFocused`, `machine.ts:507-514`).
- Same widget reconnects (socket drop): row is re-attached, not duplicated, and the old attach call returns `replaced` (today `machine.ts:161-205`).
- Engine restart: no row reports `attached` until a widget attaches again.
- Session deleted: its rows go (cascade) and page cancels its pending commands (today `connection.ts:604-618`).
- Session from another project location: `tabs.attach` refuses with `unavailable` (today `connection.ts:480-481`).

---

### Task 1: Core tab schema, contract, table and service

**Files:**

- Create: `packages/protocol/src/schema/tab.ts`, `packages/protocol/src/schema/tab-event.ts`
- Modify: `packages/protocol/src/contract.ts` (group `tabs` after `sessions`, ~line 467)
- Create: `packages/backend-app-api/src/core/tab.ts`, `core/tab/sql.ts`, `core/tab/tab.ts`
- Modify: backend-defaults DB migrations via `gen-migrations` (new folder under `packages/backend-defaults/drizzle/`, regenerated `src/db/migrations.gen.ts`)
- Create: `packages/backend-defaults/src/engine/api/rpc/tabs.ts`; Modify: `packages/backend-defaults/src/engine/api/rpc/router.ts:404` (add `tabs: tabsRouter(deps)`)
- Test: `packages/backend-app-api/src/core/tab/tab.test.ts`

**Interfaces:** Produces every shape in "Core shapes".

- [ ] Write `tab.test.ts`: `it.each` over attach / second widget / reconnect replaced / detach / engine start / session deleted; assertions on `list(sessionId)` (`tabs`, `focusedTabId`) and `attached()`.
- [ ] Orchestrator runs it: FAIL (no service).
- [ ] Implement schema, table, events, `backend-defaults/src/core/tab/projector.ts` (only writer of the table, `bus.project` per event), service (`attach` publishes `tab.attached` on acquire and `tab.detached` on release; `update` publishes `tab.updated`; `list` reads the table, focused first then newest), boot reconcile (publish `tab.detached` for rows still attached), `tabs.changes` stream, router handlers (location check as `connection.ts:480-481`), migration.
- [ ] Orchestrator runs it: PASS. Commit `feat(engine): tabs are a core table and contract`.

### Task 2: The widget attaches as a tab

**Files:**

- Create: `packages/frontend-defaults/src/runtime/tab/attach-tab.ts` (`attachTab(session, connection): Effect<void, never, Scope>`; `readTab(id)`, `reportChanges(report, signal)` moved verbatim from `plugins/page/src/attachment.ts:266-300`)
- Modify: `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx` (each mounted session gets `tab: {id, connectionId}` and runs `attachTab`)
- Modify: `packages/frontend-plugin-api/src/host-apis.ts:210` (`MountedSession.tab`)
- Test: the app's browser test file for the panel area (`frontend-defaults/test/e2e/...`, the existing one that opens the panel): "an open widget is listed by the engine as a tab" via `engine.rpc` `tabs.list`.

**Interfaces:** Consumes Task 1 `tabs.attach`/`tabs.state`. Produces `MountedSession.tab`.

- [ ] Add the assertion to the existing panel journey (no new test file). Orchestrator runs: FAIL.
- [ ] Implement; the attach call goes through the engine client like every streaming call (one retry path), no own back-off.
- [ ] Orchestrator runs: PASS. Commit `feat(widget): every open widget is a tab the engine knows`.

### Task 3: The page plugin uses core tabs and drops its own

**Files:**

- Modify: `packages/plugins/page/src/rpc.ts` (delete `TabId`, `Tab`, `State`, `attachment` part of `Control`, methods `attach`, `state`, `sessions.attached`, `tabs.list`; import tab shapes from `@conciv/protocol/schema/tab`)
- Delete: `packages/plugins/page/src/attachment-machine.ts`
- Modify: `packages/plugins/page/src/attachment.ts` (keep only the command half: subscribe to `control`, answer `command`, send `result`; `connectionId` from `session.tab`), `renderer.tsx:35-36,60-90` (no own ids, no `keepAttached` of tabs)
- Modify: `packages/plugins/page/src/machine.ts` (delete tab bookkeeping listed above; keep permission sync driven by `tab.attached`/`tab.detached`; `selectTarget(tabs: TabList, tabId?)`)
- Modify: `packages/plugins/page/src/connection.ts` (delete `attach`/`state`/`sessions.attached`/`tabs.list` handlers; subscribe to core tab events; targets via `ctx.tabs.list`); error texts name core `tabs.list`
- Modify: `packages/plugins/page/src/tools.ts` and `skill.ts` where they tell the agent to call `page.tabs.list`
- Test: page's existing test files (`packages/plugins/page/test/...`), adjusted, no new file.

**Interfaces:** Consumes `ctx.tabs`, `MountedSession.tab`, tab events.

- [ ] Adjust page tests to attach through core. Orchestrator runs: FAIL.
- [ ] Implement deletions and rewiring.
- [ ] Orchestrator runs page tests: PASS. Commit `refactor(plugin-page): tabs come from core; the plugin keeps only actions in a tab`.

### Task 4: TanStack reads tabs from core

**Files:** Modify `packages/plugins/tanstack/src/tools.ts:9,33,109-193` (`State`/`TabId` from `@conciv/protocol/schema/tab`, tab list from `ctx.tabs.list`; `operate` still through page's exported rpc, ruling 1). Test: `packages/plugins/tanstack/test/e2e/tanstack.e2e.test.tsx` "the TanStack tab list names the focused tab" unchanged and passing.

- [ ] Implement. Orchestrator runs tanstack tests: PASS. Commit.

### Task 5: The CLI and hub read core tabs and know no plugin

**Files:**

- Modify: `packages/cli/src/engine-read.ts` (delete `pageCall`, `readState` via page; use `rpc.tabs.list` / `rpc.tabs.attached`; `TabRow` fields unchanged)
- Modify: `packages/cli/src/hub.ts` (delete `PAGE_*`, `PageMethods`, `PolledState`, `PageQueueResult`, `PageQueueHandle`, `QueueTask`, `finishedQueues`, `startedQueues`, `settleClaimed`, `pollQueue`, `withFinished`, `queueNoticePart`, `goneNotice`, `notePageTools`, `tasks/get` handler; `TabOwner.page` field)
- Modify: `packages/cli/package.json` (drop `@conciv/plugin-page`)
- Modify: `packages/cli/test/it/{hub,engine-origin,tools}.it.test.ts` (no page import; tabs come from a widget attached through core in the test, using the existing CLI fixtures)
- Move: page-specific hub assertions (queued action finished, task polling) to page's tests per Task 6.

- [ ] Adjust tests. Orchestrator runs: FAIL. Implement. Orchestrator runs cli tests: PASS. `conciv tools list_tabs` JSON identical to before on the same fixture (orchestrator diff). Commit.

### Task 6: Queued page results reach a hub agent without hub page code

Today the hub polls page's queue and appends "queued actions finished" notices to every reply, and serves MCP `tasks/get` for queued work (`hub.ts:274-410, 599-644`); page skips its in-chat notice when `origin === 'hub'` (`connection.ts:451`).

**Design:** page's queue result is posted through core for every origin: `ctx.session.synthetic` with `metadata: {source: 'page-queue', queueId, toolCallId, origin}` (the `origin === 'hub'` skip at `connection.ts:451` goes). Core gains one generic read for outside agents: contract `sessions.notices({sessionId, origin, toolCallIds?, waitMs})` returning the session's synthetic notices for that origin not yet delivered to it, and marks them delivered; synthetic notices whose `origin` is `hub` are not sent into conciv's own chat run. The hub appends `sessions.notices` results to each reply and serves MCP `tasks/get` by waiting on `sessions.notices` for the call's tool call ids. No plugin name in the hub; any plugin's notices for an outside agent arrive the same way.

**Files:** `packages/protocol/src/contract.ts` (`sessions.notices`), `packages/backend-app-api/src/core/session.ts` (`notices`), session inbox delivery filter in `backend-defaults` (where synthetic inbox entries are delivered to the run), `plugins/page/src/connection.ts:426-456`, `cli/src/hub.ts` (generic notices + tasks), page's queue test (moved hub assertions), cli `hub.it.test.ts`.

- [ ] Move the hub queue assertions into page's queue test, driven through `sessions.notices`. Orchestrator runs: FAIL. Implement. Orchestrator runs page + cli tests: PASS. Commit.

### Task 7: Built-ins wired as opencode; backend, app, storybook, publish

**Files:**

- `packages/plugins/page/src/builtins.ts` (new export `./builtins`: renderer entry, tool group `pageSessionEntry` + `createPageSessionGrouper`, `engineHalf: true`); `packages/app/src/builtins.ts` composes it with terminal's and the drive entry, no page id or function named
- `packages/backend/src/start.ts`: built-in engine plugins come from the defaults' built-in list by package name; `packages/backend/package.json` drops `@conciv/plugin-page`
- `packages/app/vite.config.ts:9-14` inline list names the built-ins entries; `:24` widget entry is `src/` not `test/fixtures/global-entry.ts` (shipping bug)
- `apps/storybook/package.json:22` drops page (stories already globbed, `main.ts:13`)
- `packages/publish/src/workspace-imports.ts:16` `KIT_BUILT_INS` read from the built-ins list

- [ ] Implement. Orchestrator runs app + backend tests, a widget bundle build, and opens the widget: page renderer loads, sidebar groups page tool calls per session. Commit.

### Task 8: Proof

- [ ] `grep -rn "plugin-page" packages apps --include=*.ts --include=*.tsx --include=package.json` outside `packages/plugins/` returns only `packages/app` built-ins composition if any remains by name, and nothing in cli, backend, defaults, kits, storybook, publish.
- [ ] `grep -rn "tabs.list\|sessions.attached\|selectTabs\|TabId =" packages/plugins/page/src` returns nothing that defines tabs (one way to get the data).
- [ ] `TURBO_SCM_BASE=<base> turbo run build test typecheck --affected --dry=json` after a page edit: page plugin + app bundle only.
- [ ] Full test suite; CLI `list_tabs` and hub journey output identical; widget shots of page cards and sidebar grouping.

## PR goals checklist (the plan is not done until every line is true)

Goals of PR #1191, set by the maintainer:

- [ ] Plugins move out of core: no core package (cli, backend, backend-defaults, backend-app-api, app, frontend-defaults, frontend-app-api, kits, storybook, publish) imports any plugin; only the app's built-ins composition and the backend's built-in list name built-ins by package (as opencode `app/src/runtime/plugin/builtins.ts:1`). Proof: grep over every plugin name, not only page.
- [ ] Every plugin tests fully from its own package, with test utilities that provide every fake it needs. Proof: each plugin's `test` passes with only its own devDependencies; page's moved hub/CLI assertions run in page.
- [ ] Browser code never imports backend code. Proof: no `@conciv/backend*` import reachable from `frontend-*`, `ui-kit-*`, `app` widget entries, plugin renderer/client entries; widget bundle contains none.
- [ ] Turbo `--affected` works: dry-run table after an edit in each plugin, in `client`, in `protocol`, in `publish`, each selects only real dependents.
- [ ] Every turbo.json hack removed: no `$TURBO_ROOT$` inputs, no root workspace dependencies, no cross-package task edges beyond `^build`/`^sync-injected`; list every remaining `turbo.json` and why it exists.
- [ ] Tabs are core and stored in the core DB, synced as above; the page plugin holds no tab data (one way to get the data).
- [ ] No feature lost (table below).
- [ ] CI green on #1191.

## Feature check (nothing lost)

| Feature                                                           | Proved by                |
| ----------------------------------------------------------------- | ------------------------ |
| List open tabs (CLI `tools list_tabs`, hub `list_tabs`)           | Task 5 output diff       |
| Hub routes a call to the engine holding the tab                   | cli `hub.it`             |
| Page actions target focused / named tab, same error texts         | page tests (Task 3)      |
| Page permission granted while a tab is open, revoked after        | page tests (Task 3)      |
| Queued page action result reaches the in-widget agent             | page queue test          |
| Queued page action result reaches a hub agent (notice + MCP task) | Task 6 tests             |
| TanStack tab list names the focused tab                           | tanstack e2e             |
| Recorder, whiteboard, terminal journeys with page                 | their e2e suites         |
| Sidebar groups page tool calls per session                        | app test + shot (Task 7) |
