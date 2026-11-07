# conciv MCP hub: any agent session finds and drives any open conciv tab

Status: spec for implementation, revision 5 (2026-11-07; hub became a pass-through, tab picking moved into the
sandbox). Base: PR #739's branch `feat/ai-mcp-server` (already
contains `main` with the `@tanstack/ai` 1.2.0 family from #736, and `@tanstack/ai-mcp` 1.1.0); `feat/mcp-hub` is
rebased onto `main` once #739 merges. File
references are to #739's code. Revision 1 (2026-11-03) targeted the closed Devframe stack (#691-#709); the
Devframe exit decision (branch `docs/devframe-migration`, `docs/designs/devframe-exit.md`) rules out any Devframe
dependency on `main`. Revision 3 folds in two independent reviews (code accuracy; design and security) and
Omri's answers of 2026-11-07.

## Goal

Once the conciv hub is installed into a harness, the user says to any session of that harness (Claude Code, Codex,
opencode, Gemini CLI), in any directory, something like "find the conciv session in my tanstack project" or "use the
conciv tab on the settings page". The agent finds the tab and drives it with that tab's full conciv tool set. If
several tabs match, the agent asks which one. Nothing is pasted.

Every conciv tool is already callable from outside the browser: the engine serves them on `/api/mcp` (stateless
Streamable HTTP; `discover_tools`, `execute_typescript`, and one top-level tool per `approval: 'ask'` capability;
session routing by the `conciv-session-id` header; transcript mirroring through `scope.stream.publish`; result cap).
An outside session is missing: which engines are running, each engine's token, which tab is which, and the user's
consent. The hub supplies the first three and forwards calls to `/api/mcp`; the engine asks the tab for the fourth.

## Decisions

Standing from 2026-11-03:

- Calls go through conciv's own `/api/mcp`. No tool is rewritten.
- Tokens on every call. The engine gate (`makeEngineGate`, `packages/core/src/engine-login.ts`) accepts
  `/t/<agentToken>` or `Authorization: Bearer <token>`; `OPEN_PATHS` covers only `/health`, the auth procedures
  and the native page. The hub never has a tokenless path, and tokens never appear in any hub tool output.
- Matching the user's words to a tab is the agent's job. The hub returns a small descriptive listing; no search.
- A tab is identified by its conciv session id. Several browser tabs on one session are one tab here (see "Several
  browser tabs").

Omri, 2026-11-07:

- Engine discovery is a SQLite table in a per-user home db, not JSON files, not a fixed-port service, not Devframe.
- The home folder follows the platform-folder pattern via `env-paths` (approved as a direct dependency).
- Harnesses: Claude Code, Codex, opencode, Gemini CLI. pi has no MCP support and is out of v1.
- Consent: an outside session must be allowed before it can drive a tab. The policy is configurable (`hubAccess`:
  `'open' | 'session' | 'project'`), default `'session'` (one-time allow per conciv session). Deny sticks: a denied
  session (or project, under `'project'`) refuses outside calls without asking until the user allows it again.
- An outside agent gets the same conciv instructions the in-page agent gets (the engine's system prompt text),
  returned by `external_use_tab`.
- The composer launch menu AND the terminal panel's "Open externally" button are deleted, with every procedure,
  connect plan, type, doc and skill text that only they use. A "Connect agents" menu replaces the composer menu.
- Installing is done by the engine on click: picking "Connect <harness>" makes the engine run that harness's
  `mcp add` command itself. No copy-paste, no spawn-based "is it installed" check.
- No new MCP tools (revision 5). The hub is a pass-through: the agent sees conciv's own `execute_typescript` and
  `discover_tools`, nothing else. Finding and picking a tab are two sandbox capabilities, `external_list_tabs()` and
  `external_use_tab(id)`; `external_use_tab` returns that tab's tool signatures and instructions. The pick lasts for
  one `execute_typescript` block. Calls into a tab on another engine are forwarded engine to engine.
- The hub is the `conciv mcp` subcommand of `@conciv/cli`, started by the harness over stdio, with no arguments.
  Chosen over a fixed-port URL: no listener, no shared key, nothing to impersonate; `home.db` file permissions are
  the only check it needs.
- v1 limit: the three `approval: 'ask'` tools (`page_eval`, `server_reload`, `server_restart`) are not reachable
  from outside agents. They are top-level MCP tools that carry no tab, and the hub's tool list must stay fixed
  because harnesses do not reliably act on `tools/list_changed`.
- New tests go in as `describe` blocks in existing files; in files already over 1000 lines each addition is paid
  for by deleting at least as many lines of duplicate or useless tests in that file, listed in the PR body.

## User flow

1. Install once per harness: the composer shows a "Connect agents" menu listing harnesses on this machine that the
   hub is not yet connected to. Picking "Connect Codex" runs the install; the item turns into a "Connected" notice
   and leaves the menu. The menu is gone when every listed harness is connected.
2. In any session the user describes the tab. The agent runs `execute_typescript` with
   `return await external_list_tabs()` and matches the words:
   - exactly one match: uses it and says which (project, branch, URL);
   - several: asks which, naming the field that differs; never guesses;
   - none: says so and lists what is open.
3. The agent runs `return await external_use_tab(id)` once to learn that tab's tools and instructions, then each
   later block starts with `await external_use_tab(id)` and calls the tab's capabilities.
4. Under the default policy the first call into that session is refused with "waiting for the user to allow this
   session in the conciv tab". The tab's widget shows an Allow / Deny prompt naming the outside harness. After
   Allow, the agent retries and the call runs. Later calls into that session run without asking.
5. Each `execute_typescript` and approval-tool call appears in that tab's transcript, marked as coming from an
   outside session. `discover_tools` does not publish chunks today and still does not.

## Architecture

```
agent CLI (any cwd) ──stdio──> conciv-hub  (`conciv mcp`, @conciv/cli; pass-through, no tools of its own)
                                 │ picks any live engine from <conciv home>/home.db (the "runner")
                                 ▼
                    runner engine  POST <apiBase>/api/mcp   headers: conciv-origin: hub, conciv-client
                      execute_typescript runs in the runner's sandbox, outside run (no session):
                        external_list_tabs()   → GET <apiBase>/api/tabs of every live engine (home.db)
                        external_use_tab(id)   → owning engine's tools + instructions for that session
                        external_<anything>    → POST <owner apiBase>/api/mcp execute_typescript
                                                  `return await external_<name>(input)`,
                                                  headers: conciv-session-id, conciv-origin: hub, conciv-client
```

Every capability call after `external_use_tab` takes the same forwarding path, also when the owner is the runner
itself, so the owner's token gate, consent check and marker apply unchanged.

`apiBase` is the token-scoped base the engine already builds (`tokenScopedBase()` in `packages/core/src/start.ts`,
`http://127.0.0.1:<port>/t/<agentToken>`).

### Conciv home folder

- Path: the `homeDir` option when given, else `$CONCIV_HOME`, else `envPaths('conciv', {suffix: ''}).data`
  (`~/Library/Application Support/conciv` on macOS, `$XDG_DATA_HOME/conciv` defaulting to `~/.local/share/conciv`
  on Linux, `%LOCALAPPDATA%\conciv\Data` on Windows). `env-paths` goes into the pnpm catalog and is a direct
  dependency of `@conciv/db`.
- One resolver function, `concivHome({homeDir?, env})`, exported from `@conciv/db`; the engine, the hub and the
  install procedure all call it.
- Permissions (POSIX): if the folder does not exist, create it `0700`. If it exists, `lstat` it: refuse a symlink
  and a folder owned by another uid (log and skip registration; the hub reports it); otherwise `chmod 0700`.
  Create `home.db` with mode `0600` before SQLite opens it; SQLite gives `-wal` / `-shm` the db file's mode. On
  Windows `chmod` is a no-op; the per-user ACL of `%LOCALAPPDATA%` is the protection.
- Nothing is written at package install time; only a running engine, the hub, or the install click writes.
- `~/.conciv/dev-endpoint.json` (Swift native discovery) and the per-project `.conciv/server.json` /
  `.conciv/mcp-endpoint.json` are not moved (follow-up).

### Home db

- Separate from the project db: `packages/db/src/home-schema.ts` with its own drizzle config and migrations folder
  (`packages/db/drizzle-home/`, generated with `pnpm --filter @conciv/db exec drizzle-kit generate --config
  drizzle-home.config.ts`; the existing `gen-migrations` script is extended to bundle both sets). No legacy
  importers run on it.
- `openHomeDb(home)` opens `<home>/home.db` (WAL, busy timeout 5000) and migrates inside `BEGIN IMMEDIATE`, so two
  processes opening a fresh db at once serialize instead of both creating the table. Every caller opens, does its
  one operation and closes; no process holds the home db open. Any throw from opening or writing is caught by the
  caller and logged; registration failure never stops an engine.
- Tables:
  - `engines`: `id` text primary key (random UUID per `start()`), `pid` integer, `root` text, `apiBase` text,
    `deletedAt` integer nullable.
  - `hub_connections`: `harness` text primary key, `connectedAt` integer. A row means the engine ran that harness's
    install successfully (or the CLI reported the server already exists).
- Soft delete only: nothing in the home db is ever `DELETE`d. A row that stops being true gets `deletedAt`; every
  read filters `deletedAt IS NULL`. One row per engine start (Vite restarts included) is small enough to keep.
- Schema rule for version skew: the home schema only ever adds tables or nullable columns; readers ignore columns
  they do not know. A breaking change gets a new table name.
- Queries in `packages/db/src/home-queries.ts`, exported from the package index: `registerEngine`,
  `retireEngine(id, now)` (sets `deletedAt`), `listEngines` (live rows only), `recordHubConnection(harness)`, `hubConnections()`.

### Engine registration

- `start()` gains `homeDir?: string` (beside `devEndpointDir`), passed through from the vite plugin options the same
  way. After the port is known: `registerEngine({id, pid: process.pid, root, apiBase})`. In `stop` (not inside
  `clearEndpoint`, which returns early without `nativePageDir`): `retireEngine(id)`. After registering, the engine
  runs `checkEngines` (below) once in the background, so stale rows are retired even when no hub ever runs. Registration happens whether or
  not `nativePageDir` is set.
- Keying by a per-start `id` keeps the row correct when Vite restarts (the new server boots before the old one
  closes, in the same process) and when one process runs several engines (test workers do).
- Test isolation: the shared vitest setup in `@conciv/vitest-config` sets `CONCIV_HOME` to a fresh temp dir for
  every package, so no existing or new test that calls `start()` writes to the real home folder.

### Keeping rows true: identity check on read

Rows are claims, checked on every read; whoever finds a false row retires it. The same `id` is passed from
`start()` into `makeApp` (`engineId`), and the open `/health` route (`packages/core/src/app.ts`, `HealthSchema`) adds
`id: engineId` to its response. The id is not a secret: it opens nothing, the token still guards every call.

`checkEngines(home, opts: {timeoutMs: number}): Promise<{live: EngineRow[], unreachable: Array<{root, error}>}>` in
`@conciv/db` (`packages/db/src/engine-check.ts`), used by the hub and by the engine at start. For each live row, GET
`<origin>/health` (origin = `apiBase` without the `/t/<token>` path), in parallel:

- answers with this row's `id`: live;
- connection refused, a different `id`, or a body that is not a conciv health response: retire the row;
- timeout: keep the row, report it unreachable (a hung or sleeping engine).

### Engine: `GET /api/tabs`

Registered inside `makeApp` beside `/api/mcp` (it needs the page bus and the chat deps), behind the same gate.
Response zod schema in `@conciv/protocol`:

```ts
{
  project: {name: string | null, root: string, branch: string | null}
  tabs: Array<{
    sessionId: SessionId
    harness: string
    browserTabs: number
    session: {title: string, updatedAt: number, running: boolean}
    page: {href: string, title: string, state: 'visible' | 'hidden'} | null
  }>
}
```

- `project.name`: root `package.json` `name`, else null. `branch`: `.git/HEAD` (following a worktree's `.git`
  file), re-read on each request, else null.
- Tabs are the sessions with at least one page-bus subscriber. Add to `makePageBus`
  (`packages/core/src/page-bus.ts`) one accessor, `openSessions(): Array<{sessionId, subscribers: number}>`, beside
  `anySubscriber`; document it in `packages/core/src/README.md`.
- For each open session, `bus.ask(sessionId, {name: 'page_route', input: {}})` raced against
  `AbortSignal.timeout(1500)`, all in parallel. Timeout or a `no-widget` error gives `page: null`; the session stays
  listed.
- `harness` is the session's `harnessKind`; `session` fields come from `rpcSessionList(chatDeps, false)`
  (`packages/core/src/api/rpc/sessions.ts`). That reads native transcript lists; acceptable because only
  `external_list_tabs()` asks for the full listing.
- `?session=<id>` (zod: `SessionId.optional().catch(undefined)`) is the cheap form `external_use_tab` uses:
  it answers `{open: boolean, instructions: string | null}` from `openSessions()` membership and the engine's
  system prompt text, with no page query and no session listing.

### `route` page tool

`packages/extensions/page/src/shared/defs.ts` `routeDef` output gains `title` (`document.title`) and `state`:
`'visible'` when `document.visibilityState === 'visible'`, else `'hidden'`. (No `focused`: while the user types in a
terminal no browser tab has focus.) The page-side body in `packages/extensions/page/src/client/bodies.ts` fills both.

### Several browser tabs

`bus.ask` goes to every subscriber and the first reply wins, so `page` describes whichever browser tab answered first,
and page actions run in every browser tab of the session. The listing carries `browserTabs`; the instructions tell
the agent to warn the user when it is above 1.

### Engine: outside calls, consent and marker

- Headers on hub requests: `conciv-origin: hub` and `conciv-client: <harness name from the hub's MCP clientInfo>`.
  New constants beside `CONCIV_SESSION_HEADER` in `@conciv/protocol/chat-types`; both zod-parsed
  (`z.enum(['hub']).optional().catch(undefined)`, `z.string().max(64).optional().catch(undefined)`).
- Consent policy: `ConcivConfig.hubAccess?: 'open' | 'session' | 'project'` in
  `packages/protocol/src/config-types.ts`, default `'session'`:
  - `'open'`: no prompt.
  - `'session'`: the first hub call into a session goes through the existing deny-and-retry gate
    (`plane.admitCall`, `packages/chat/src/index.ts`) with a fixed approval target `outside-session` and input
    `{client}`. The call is refused with the gate's message until the user allows; the allow is recorded for that
    session only.
  - Deny sticks. Today a Deny outside a running turn records nothing (`approvals.decide` in
    `packages/chat/src/approvals.ts` only stores `denied` when `runId !== null`), so every retry would prompt again.
    For the `outside-session` target a Deny is stored for the session (for the engine under `'project'`), and later
    hub calls are refused with "the user denied outside agents for this session" without a new prompt. The
    session's existing actions menu gets "Allow outside agents", shown only while that deny stands, which clears
    it. If the session has no actions menu that can take the item, stop and ask Omri.
  - `'project'`: same prompt, but the allow is recorded once for the engine's project and covers every session.
  - Every hub-origin request in `/api/mcp` passes this check before any tool runs, including forwarded calls.
- Known conflict to resolve first: the widget posts "Approved: <title>" after a decision
  (`decisionText` in `packages/ai/src/session/session.ts`), which starts a run of the tab's own agent; the server's
  `decide` only records it and returns `startsTurn: false` for asks with no run. Deciding an ask that came from an
  outside call (the `outside-session` target, and any approval tool called through the hub) must not post that
  message. If the session code cannot skip it based on the pending approval's own data, stop and ask Omri.
- Marker: hub-origin `TOOL_CALL_START` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` chunks carry
  `metadata.conciv = {origin: 'hub', client}` (built in `packages/core/src/api/mcp.ts` `callStartChunks`,
  `executeResultChunk`; `TOOL_CALL_RESULT` already sets `metadata.tanstack`). The widget tool row shows
  "from <client>" using an existing slot; if the row has no slot that can show it, stop and ask Omri.

### Engine: outside runs (`external_list_tabs`, `external_use_tab`, forwarding)

An outside run is an `execute_typescript` call on `/api/mcp` with `conciv-origin: hub` and no `conciv-session-id`.
The engine that receives it (the runner) runs the code in its sandbox like any other run, with these differences:

- Two capabilities exist only in outside runs (defined beside the other core capabilities, not in an extension):
  - `external_list_tabs()`: `{tabs: [{tab, project, branch, root, href, pageTitle, sessionTitle, lastActive,
    running, state, harness, browserTabs}], unreachable: [{root, error}]}`. Flat rows, ISO `lastActive`, nulls
    omitted. Built from `checkEngines(home, {timeoutMs: 2000})` (`@conciv/db`), then `GET <apiBase>/api/tabs` of
    every live engine in parallel (2s timeout; the runner's own tabs too, through the same request). A 404 reports
    "engine too old for outside agents; upgrade its @conciv packages"; a 401 or timeout reports unreachable.
    Never returns a token.
  - `external_use_tab(id)`: zod-parses `id` as `SessionId`, finds the engine whose `/api/tabs?session=<id>` says
    open (all live engines in parallel), and returns `{instructions, tools}`: `instructions` is that engine's conciv
    system prompt text (the same text its in-page agent gets), `tools` is that session's capability signatures,
    the same content `discover_tools` returns there. Not open anywhere: throws `TAB_NOT_OPEN: tab <id> is not open;
    call external_list_tabs()`. Open on two engines: throws naming both roots and asking the user to close one
    browser tab. It also sets the run's tab for the rest of this `execute_typescript` block only; the next block
    starts with no tab.
  - Their descriptions carry the agent guidance below (harnesses read MCP instructions differently, and
    `createMCPServer` 1.1.0 has no server `instructions` option).
- Every other capability in an outside run is forwarded: before `external_use_tab` it throws `NO_TAB: call
  external_use_tab(id) first; external_list_tabs() lists the open tabs`. After it, the call becomes
  `execute_typescript` with code `return await external_<name>(<input as JSON>)` on the owning engine's
  `/api/mcp`, headers `conciv-session-id: <id>`, `conciv-origin: hub`, `conciv-client: <client>` (passed on from
  the runner's request), token from the owner's `apiBase`. The owner's reply becomes the capability's result, or
  its thrown error with the owner's declared code. The same path is used when the owner is the runner itself, so
  consent, the marker and the transcript mirroring happen once, on the owner, by the code that already does them.
- The runner's sandbox offers the runner's own capability set. A capability that the chosen tab's engine has and the
  runner lacks (a different extension set) is not callable in v1; `external_use_tab` lists the tab's real set, and
  calling a missing one fails with the sandbox's normal unknown-function error. Follow-up.
- The outside run itself (list and pick) needs no consent: it reads no page and changes nothing. Consent is asked by
  the owner on the first forwarded call, as described under "outside calls, consent and marker".
- Agent guidance, in the `external_list_tabs` and `external_use_tab` descriptions:

> conciv tabs are live web pages running the conciv widget. When the user refers to a conciv tab, session or page
> in words, call external_list_tabs() and match their words against project, branch, root, href, pageTitle and
> sessionTitle. If exactly one tab matches, use it and tell the user which one you picked (project, branch, URL). If
> more than one matches, do not guess: ask the user which one, naming the field that differs. Prefer a tab whose
> state is visible only when the user says "this one" or "the one I have open". If none match, say so and list what
> is open. Then call external_use_tab(id) once and follow the instructions it returns. Start every later block with
> await external_use_tab(id) and call the tools it listed. If browserTabs is above 1, tell the user page actions run
> in every browser tab of that session. If a call says the user must allow this session, tell the user to click
> Allow in the conciv tab, then retry; if it says the user denied outside agents, stop and tell the user, do not
> retry. If a call says the tab is not open, call external_list_tabs() again.

### Hub: `conciv mcp` (`@conciv/cli`)

- A citty subcommand `mcp` in `packages/cli/src/main.ts`, no arguments. Server built with `createMCPServer` and
  served with `serveMCPStdio(server)` from `@tanstack/ai-mcp/server/stdio`; engine calls use
  `createMCPClient({type: 'http', url, headers})`. `@conciv/cli` depends on `@conciv/db` and `@tanstack/ai-mcp`
  directly, never on `@conciv/ai` (the CLI `prod closure` test stays unchanged and passes).
- Its tool list is fixed for the life of the process: `execute_typescript` and `discover_tools` with the same names
  and input schemas as `/api/mcp`. No tool of its own. Descriptions come from the runner's `tools/list` when one is
  live at startup, else from fixed text that names `external_list_tabs()` and `external_use_tab(id)`.
- Each call: `checkEngines(home, {timeoutMs: 2000})`, pick the most recently registered live engine as runner,
  forward the call to its `/api/mcp` with `conciv-origin: hub` and `conciv-client: <clientInfo name>` (captured via
  the `setup` hook), and return the reply unchanged. One client per runner `apiBase`, dropped on a transport error.
  No live engine: reply with an MCP error "no conciv dev server is running; start one and open its page" and the
  home folder path read, so a hub started without the user's env is diagnosable.
- The hub holds no tab and no state between calls.

### Install: "Connect agents" menu

- MCP server name: `conciv-hub` (the project-scoped `conciv-connect` plugin already registers a server named
  `conciv`; `packages/harness-init/src/claude/names.ts`).
- Install line pinned to the engine's own `@conciv/cli` version: `npx -y @conciv/cli@<version> mcp`. Measure a cold
  `npx` start against each harness's MCP startup timeout (Codex defaults to about 10s); if it exceeds one, stop and
  ask Omri.
- Per-harness data on each init contribution in `@conciv/harness-init` (`packages/harness-init/src/registry.ts`,
  `HarnessInitContribution` in `@conciv/protocol/harness-types`): optional `hub: {add: (command: string[]) =>
  string[]}` returning the argv. Starting values, each verified against the CLI pinned in CI
  (`.github/workflows/ci.yml` "Install harness CLIs") before it ships:
  - claude: `claude mcp add -s user conciv-hub -- <command>`
  - codex: `codex mcp add conciv-hub -- <command>`
  - gemini-cli: `gemini mcp add -s user conciv-hub <command>`
  - opencode: unknown. `opencode mcp add` shows `--url` for remote servers; its local-command form may be
    interactive. If there is no non-interactive form, stop and ask Omri.
  - pi: no `hub` field.
- Which harnesses to list: `detectHarnesses` (`packages/harness-init/src/detect.ts`, bin on PATH or config dir)
  minus those with a `hub_connections` row. Served as a top-level `hubInstalls: Array<{harnessId, name}>` field of
  the `meta.models` output (`ChatModelsSchema`), not on the per-harness `HarnessMetaSchema`. Cheap: no spawning.
- Install procedure: a new oRPC procedure `meta.connectHub` (`oc.input(z.object({harness: z.enum(INIT_HARNESS_IDS)}))`, using `INIT_HARNESS_IDS` from `packages/harness-init/src/registry.ts`
  in `packages/contract/src/contract.ts`), callable only over a trusted connection. It spawns the harness's argv
  with `execFile` (no shell; argv from the registry only, never from input), 30s timeout, with the engine's PATH.
  Exit 0, or output saying the server already exists: `recordHubConnection(harness)` and return ok. Otherwise
  return the CLI's stderr; the widget shows it in a notice.
- Widget: in the composer slot the launch menu used, a `TooltipIconButtonSlot` + `Menu.Trigger asChild` (the
  pattern in today's `launch-menu.tsx`) labelled "Connect agents", shown only while `hubInstalls` is non-empty. Each
  item "Connect <name>" calls `meta.connectHub`, shows pending, and on success posts via `useNotices()`:
  "<name> connected. Ask any <name> session for your conciv tab." On failure the notice carries the CLI's message.
  `meta.models` is invalidated after success so the item leaves.

### Deletions (launch menu and "Open externally")

Run `pnpm exec fallow dead-code --trace '<file>:<symbol>'` before each deletion.

- Widget: `apps/conciv/src/composer/launch-menu.tsx`; in `apps/conciv/src/composer/actions.tsx` `openExternal`,
  `copyConnect`, `copyCommand`, `launchFailure`, the `rpcErrorCode` import and the `canLaunch` `<Show>`;
  `apps/conciv/src/composer/terminal-rpc.ts`.
- Terminal extension: in `packages/extensions/terminal/src/client/terminal-actions.tsx` the "Open externally"
  button, `openExternally`, `launch`, `copyCommand`, `launchFailure`; `packages/extensions/terminal/src/server/launch.ts`;
  in `packages/extensions/terminal/src/server.ts` `connectPlanFor`, the `launch` and `connectCommand` procedures,
  `noConnect`, `LaunchInputSchema`, the `openTerminal` option.
- Protocol and contracts: `canLaunch` in `HarnessMetaSchema` (`packages/protocol/src/chat-types.ts`) and
  `harnessMetaOf` (`packages/core/src/api/rpc/sessions.ts`); `HarnessConnect`, `HarnessConnectPlan`,
  `TerminalOpener`, `TerminalOpenRequest` (`packages/protocol/src/harness-types.ts`); `connectPlan` in
  `packages/core/src/app.ts` and `packages/extension/src/types.ts`; `HarnessAdapter.connect?`
  (`packages/harness/src/_shared/contract.ts`).
- Harnesses and testkits: the `connect` plans in `packages/harness/src/{claude,codex,opencode,pi}/index.ts`;
  `connect` in `packages/extension-testkit/src/core-kit.ts` and `packages/harness-testkit/src/create-fake-harness.ts`.
- Stay: `claudeConnectArgs` and `HarnessConnectContext` (used by `packages/harness/src/claude/tty.ts`),
  `HarnessConnectFile` (used by `HarnessInitPlan` and `claudeConnectEndpointFile`).
- Docs and skills that lint will not flag: `apps/conciv/src/composer/README.md`,
  `packages/extensions/terminal/src/README.md`, `.../src/client/README.md`, `.../src/server/README.md`,
  `packages/harness/src/claude/README.md`, `packages/protocol/src/README.md`,
  `packages/skills/skills/conciv-harness/SKILL.md` (teaches `connect`), and the `connect` sidecar in `AGENTS.md`
  "Harness & runner adapters".
- Tests: `packages/extensions/terminal/test/terminal.test.ts` connect-command cases and the `connectPlan` fake in
  `test/helpers.ts`; `apps/conciv/test/commands/core-control.ts` `openedTerminal` and its `connect` plan;
  `describe('launch actions')` and `CONNECT_COMMAND_PATH` in `apps/conciv/test/conciv.browser.test.tsx`; the
  `canLaunch: false` assertions in `packages/core/test/core-api.it.test.ts`.

## Out of scope / follow-ups

- Moving `dev-endpoint.json` (Swift), `.conciv/server.json` and `.conciv/mcp-endpoint.json` readers onto the home db
  (`mcp-endpoint.json` is also never removed on stop today).
- Removing the project-scoped `conciv-connect` plugin and its stdio bridge (`packages/harness-init/src/claude/bridge.ts`);
  needs Omri's yes.
- pi (needs a pi extension). Windows `cmd /c npx` wrapping for stdio installs.
- Hub calls landing while the tab's own turn is running (`scope.stream.publish` interleaving; inherited from #739).

## Tests (existing files only, new `describe` blocks; no mocks)

- `packages/db/test/db.test.ts` (404 lines), `describe('home db')`: register, list, retire by id (the row stays
  with `deletedAt`, `listEngines` hides it); `checkEngines` against real started HTTP listeners keeps a matching id,
  retires a refused port and a mismatched id, and reports a listener that never answers; two engines with
  one pid keep two rows; `hub_connections` record and list; a fresh db opened by two connections at once migrates
  once; folder and file modes are `0700` / `0600`; a symlinked home folder is refused.
- `packages/core/test/core-api.it.test.ts` (over 1000; pay for additions), `describe('outside sessions')`:
  - a started engine has a row with its root and token-scoped `apiBase`, and `/health` returns its `id`; `stop`
    sets `deletedAt`; two engines in one
    process keep two rows;
  - `/api/tabs` and `/api/mcp` return 401 with no token and with a wrong token;
  - `/api/tabs` returns project name and branch and a joined page with href, title, state and `browserTabs`;
    `?session=` answers open / not open;
  - under `hubAccess: 'session'` a hub-origin call is refused, an allow lets the retry through, a second session is
    refused again; after a Deny, retries are refused without a new pending approval until "Allow outside agents"
    clears it; under `'project'` the second session passes; under `'open'` nothing is refused;
  - an allowed hub-origin `execute_typescript` publishes chunks carrying `metadata.conciv.origin === 'hub'`.
- `packages/core/test/core-api.it.test.ts`, same `describe('outside sessions')`, two engines in one process with a
  fake page subscriber (`answerNextQuery`): an in-page call (session header, no hub origin) sees neither
  `external_list_tabs` nor `external_use_tab`; an outside run's `external_list_tabs()` lists the tabs of both engines
  and no token; a capability before `external_use_tab` throws `NO_TAB`; `external_use_tab` on the other engine's tab
  returns its instructions and tools, and a following capability call is refused until allow, then runs on the
  owner and its chunks carry the marker on the owner's transcript; the next block starts with no tab; an unknown tab
  throws `TAB_NOT_OPEN`.
- `packages/cli/test/cli.test.ts` (over 1000; pay for additions), `describe('conciv mcp hub')`, using `startEngine`:
  spawn the hub over stdio with a temp `CONCIV_HOME`; `tools/list` is exactly `execute_typescript` and
  `discover_tools`; an `execute_typescript` of `return await external_list_tabs()` returns the engine's tab; after
  restarting the engine on another port the same call still works; with no engine running the call returns the
  "no conciv dev server is running" error naming the home folder.
- `packages/extensions/page/test/page.browser.test.tsx` (702 lines): `page_route` returns `title` and `state`.
- `apps/conciv/test/conciv.browser.test.tsx` (over 1000; pay for additions; the deleted launch tests pay most of
  it): the menu lists a harness found by detection with no `hub_connections` row; a real pointer click on its item
  calls the install, and the item leaves on success; a failing install shows the CLI's message. The browser test
  uses a harness whose argv points at a test bin on a temp PATH, not a real CLI.
- The e2e harness shard (`conciv-e2e-harnesses`, where CI installs the real claude, codex, gemini and opencode):
  `connectHub` for each of claude, codex and gemini against temp config dirs (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
  gemini's home) adds `conciv-hub` to that CLI's config, verified by the CLI's own read command.

Tests never touch the real conciv home folder or any harness's real config.

## Changeset

One patch changeset naming `@conciv/cli` (the fixed group bumps every `@conciv/*`).

## Acceptance (Fable runs these live before calling it done)

1. Click "Connect" for each of Claude, Codex, opencode and Gemini CLI (install Gemini CLI at the CI-pinned version
   first). Start the tanstack-start example and `apps/conciv`, one tab each. In a session of each harness in `~`:
   "find the conciv session in my tanstack project" picks the tanstack tab and says so.
2. The first call shows Allow / Deny in that tab. Deny: the agent stops, retries show no new prompt; "Allow outside
   agents" in the session menu lifts it. Allow: the retry runs and no run of the tab's own agent starts. Calling an
   approval tool from outside and approving it also starts no run in the tab.
3. `external_use_tab` returns the same instructions text the in-page agent gets.
4. Two tabs of one project on different pages: the same request makes the agent ask which, naming the URLs.
5. Restart that dev server, and separately edit its `vite.config` (Vite restart): the next call on the chosen tab
   still works.
6. `kill -9` a dev server: it disappears from `external_list_tabs()` and its row gets `deletedAt`. Start another dev server on
   the same port: the old row is retired by the id check, the new one is listed.
7. A call from the outside session shows in that tab's transcript with "from <harness>".
8. Set `hubAccess: 'open'`: no prompt. Set `'project'`: one prompt covers a second session.
9. `ls -l ~/Library/Application\ Support/conciv` shows the folder `drwx------` and `home.db` `-rw-------`.
