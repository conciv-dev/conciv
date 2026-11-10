# conciv MCP hub: any agent session finds and drives any open conciv tab

Status: revision 7 (2026-11-10) adds the section "Revision 7" near the end: speed, routing, one browser tab per
call. Below it, revision 6 (2026-11-07; hub is a pass-through; `tabs` is a normal registry tool;
`conciv tools` gains `--tab` and home-db discovery). Base: PR #739's branch `feat/ai-mcp-server` (already
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
  `'open' | 'session' | 'project'`), default `'open'` since Revision 7 (`'session'` is the one-time allow per conciv session). Deny sticks: a denied
  session (or project, under `'project'`) refuses outside calls without asking until the user allows it again.
- An outside agent gets the same conciv instructions the in-page agent gets (the engine's system prompt text),
  as the leading text part of the hub's first reply for that tab (Revision 7, part 7).
- The composer launch menu AND the terminal panel's "Open externally" button are deleted, with every procedure,
  connect plan, type, doc and skill text that only they use. A "Connect agents" menu replaces the composer menu.
- Installing is done by the engine on click: picking "Connect <harness>" makes the engine run that harness's
  `mcp add` command itself. No copy-paste, no spawn-based "is it installed" check.
- No new MCP tools (revision 5). The hub is a pass-through: the agent sees conciv's own `execute_typescript` and
  `discover_tools`, nothing else. Finding tabs is one normal registry tool, `tabs` (revision 6): `external_tabs({})` in
  the sandbox, `conciv tools tabs` in the CLI, in every run. Picking a tab is the hub tools' optional `tab` input
  (Revision 7, part 7), and `--tab <id>` (or `CONCIV_SESSION_ID`) in the CLI; with neither, tools act on the default
  as today. A call with `tab` goes straight to the engine holding that tab; nothing is forwarded engine to engine.
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
   `return await external_tabs({})` and matches the words:
   - exactly one match: uses it and says which (project, branch, URL);
   - several: asks which, naming the field that differs; never guesses;
   - none: says so and lists what is open.
3. The agent passes that tab's id as `tab` on every later `execute_typescript` and `discover_tools` call; the first
   reply for the tab starts with its instructions.
4. Under the default policy the first call into that session waits while the tab's widget shows an Allow / Deny
   prompt naming the outside harness (a badge on the mascot when the panel is closed). Allow lets the same call run
   and return its result; Deny fails it at once. With no decision after 50 s the call is refused with "waiting for
   the user to allow it in the conciv tab"; the prompt stays, and a retry after Allow runs. Later calls into that
   session run without asking.
5. Each `execute_typescript` and approval-tool call appears in that tab's transcript, marked as coming from an
   outside session. `discover_tools` does not publish chunks today and still does not.

## Architecture

```
agent CLI (any cwd) ──stdio──> conciv-hub  (`conciv mcp`, @conciv/cli; two tools, each with an optional `tab`)
                                 │
                 no tab ─────────┼──────── tab: <session id>
                                 │
   runner (live engine registered longest ago)     owner (the engine whose /api/tabs?session=<tab> says open)
   POST <apiBase>/api/mcp                           POST <owner apiBase>/api/mcp
   headers: conciv-origin: hub, conciv-client       headers: conciv-session-id: <tab>, conciv-origin: hub, conciv-client
   outside run: external_tabs({}) lists the tabs    session path: the tab's own capabilities, consent and marker
   of every live engine; anything else is NO_TAB
```

A block that drives a tab runs in the owner's sandbox on that tab's session, so the owner's token gate, consent check
and marker apply unchanged.

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
    browserTabs: Array<{id: string, page: {href: string, title: string, state: 'visible' | 'hidden'} | null}>
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
  200 ms (Revision 7: under the 300 ms its callers wait), all in parallel. Timeout or a `no-widget` error gives `page: null`; the session stays
  listed.
- `harness` is the session's `harnessKind`; `session` fields come from `rpcSessionList(chatDeps, false)`
  (`packages/core/src/api/rpc/sessions.ts`). That reads native transcript lists; acceptable because only
  `external_tabs({})` asks for the full listing.
- `?session=<id>` (zod: `SessionId.optional().catch(undefined)`) is the cheap form the hub's tab lookup uses:
  it answers `{open: boolean, instructions: string | null}` from `openSessions()` membership and the engine's
  system prompt text, with no page query and no session listing.

### `route` page tool

`packages/extensions/page/src/shared/defs.ts` `routeDef` output gains `title` (`document.title`) and `state`:
`'visible'` when `document.visibilityState === 'visible'`, else `'hidden'`. (No `focused`: while the user types in a
terminal no browser tab has focus.) The page-side body in `packages/extensions/page/src/client/bodies.ts` fills both.

### Several browser tabs

Revision 7: `bus.ask` sends each query to exactly one browser tab, the one focused last (each widget reports focus
and visibility in its `page-serving` push frame), so `page` describes that browser tab. The listing carries
`browserTabs: [{id, href, pageTitle, state}]`, the browser tab a call goes to listed first.

### Engine: outside calls, consent and marker

- Headers on hub requests: `conciv-origin: hub` and `conciv-client: <harness name from the hub's MCP clientInfo>`.
  New constants beside `CONCIV_SESSION_HEADER` in `@conciv/protocol/chat-types`; both zod-parsed
  (`z.enum(['hub']).optional().catch(undefined)`, `z.string().max(64).optional().catch(undefined)`).
- Consent policy: `ConcivConfig.hubAccess?: 'open' | 'session' | 'project'` in
  `packages/protocol/src/config-types.ts`, default `'open'` (Revision 7):
  - `'open'`: no prompt.
  - `'session'`: the first hub call into a session goes through the existing deny-and-retry gate
    (`plane.admitCall`, `packages/chat/src/index.ts`) with a fixed approval target `outside-session` and input
    `{client}`. The gate holds the call until the user decides, the client disconnects, or 50 s pass
    (`OUTSIDE_DECISION_WAIT_MS`, below Codex's 60 s tool timeout); only then is it refused with the gate's
    message. One click releases every call waiting on that grant. The allow is recorded for that session only.
    The check runs when a tool is called, never on `initialize` or `tools/list`, so listing tools never prompts.
    Under `'project'` one Allow or Deny covers the engine, so the server also clears the `outside-session` card
    stored in every other session (`metadataKeysEndingWith` in `packages/chat/src/stores.ts`); those tabs drop the
    card on their next history read. No new event.
    A session event stream (the tab's push socket and `rpc.chat.events`) subscribes first, then replays the
    session's waiting asks (`ChatPlane.pendingAsks`), then streams live, so a tab that connects while an
    outside agent is waiting still shows the Allow.
  - Deny sticks. Today a Deny outside a running turn records nothing (`approvals.decide` in
    `packages/chat/src/approvals.ts` only stores `denied` when `runId !== null`), so every retry would prompt again.
    For the `outside-session` target a Deny is stored for the session (for the engine under `'project'`), and later
    hub calls are refused with "the user denied outside agents for this session" without a new prompt. The
    session's existing actions menu gets "Allow outside agents", shown only while that deny stands, which clears
    it. If the session has no actions menu that can take the item, stop and ask Omri.
  - `'project'`: same prompt, but the allow is recorded once for the engine's project and covers every session.
  - Every hub-origin request in `/api/mcp` that names a session passes this check before any tool runs.
- Known conflict to resolve first: the widget posts "Approved: <title>" after a decision
  (`decisionText` in `packages/ai/src/session/session.ts`), which starts a run of the tab's own agent; the server's
  `decide` only records it and returns `startsTurn: false` for asks with no run. Deciding an ask that came from an
  outside call (the `outside-session` target, and any approval tool called through the hub) must not post that
  message. If the session code cannot skip it based on the pending approval's own data, stop and ask Omri.
- Marker: hub-origin `TOOL_CALL_START` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` chunks carry
  `metadata.conciv = {origin: 'hub', client}` (built by `callTrace` in `packages/core/src/api/call-trace.ts`, shared by `/api/mcp` and the RPC router;
  `TOOL_CALL_RESULT` already sets `metadata.tanstack`). The widget tool row shows
  "from <client>" using an existing slot; if the row has no slot that can show it, stop and ask Omri.

### Tool: `tabs` (registry, every surface)

- A builtin tool beside `open` in `packages/tools/src/builtins/server-tools.ts`: `BUILTIN_TABS_TOOL`, name `tabs`,
  category `read`, no input, not mutating, no approval. Registered in `packages/core/src/tool-registry.ts` like the
  others, with a context `{listTabs: () => Promise<TabsListing>}` that core implements. Because `/api/mcp` and
  `conciv tools` both call the one registry, it is `external_tabs({})` in every sandbox (in-page and outside runs) and
  `conciv tools tabs` in the CLI with no extra wiring.
- Output (zod in `@conciv/protocol`): `{tabs: [{tab, project, branch, root, href, pageTitle, sessionTitle,
  lastActive, running, state, harness, browserTabs}], unreachable: [{root, error}]}`. Flat rows, ISO `lastActive`,
  nulls omitted, never a token.
- Core's `listTabs`: `checkEngines(home, {timeoutMs: 300})` (`@conciv/db`), then `GET <apiBase>/api/tabs` of every
  live engine in parallel (300 ms timeout; its own engine through the same request). A 404 reports "engine too old;
  upgrade its @conciv packages"; a 401 or timeout reports unreachable. A corrupt `home.db` throws a clear error
  naming the home folder.
- Its description carries the agent guidance below.

### CLI: `conciv tools` finds engines and tabs anywhere

- Engine discovery (`packages/cli/src/engine-origin.ts`, now async): with `--tab`, the engine that owns that tab
  from the home db (wherever the CLI runs); else `CONCIV_PORT`, else `.conciv/server.json` in the current folder
  (today's default, unchanged), else the most recently registered live engine in the home db. When `--tab` is held
  by more than one live engine, the CLI fails and names each engine's project root instead of picking one. The token comes from that engine's `apiBase`.
- Tab choice (`packages/cli/src/request.ts`): a global `--tab <id>` flag, zod-parsed as `SessionId`, wins over
  `CONCIV_SESSION_ID`; with neither, today's `sessions.resolve` default. A `--tab` call sends `conciv-origin: hub` and
  `conciv-client: cli`, so the owner's Allow card and marker apply exactly as for MCP. An engine found through the home-db fallback (no `CONCIV_PORT`, no `.conciv/server.json`)
  is an outside caller too and sends the same headers; only the current folder's own engine is an inside caller. The
  CLI reads the first `--tab` from argv before loading any dynamic catalog, so the catalog and the call target the
  same engine. The engine enforces this on
  its RPC path too (decided 2026-11-07): the RPC mount (`packages/core/src/api/rpc/mount.ts`) reads the hub headers
  and runs the same `admitOutside` check before any procedure that names a session (session header or input
  `sessionId`) from a hub-origin request; procedures that name no session (catalog, list, create, resolve) never prompt. A hub-origin
  `chat.permissionDecision` or `chat.allowOutside` is always refused (decided 2026-11-08): only a click in the tab
  answers a permission card. Extension routers mounted on the engine get the same admission, and its tool chunks carry the
  same `metadata.conciv` marker. Consent lives in the engine, never in a client.
- `--tab` is declared on every route and command the way `envelopeFlag` is (router options belong to the segment
  that declares them).
- Built on citty now; moved to `@bomb.sh/router` when PR #749 merges (small follow-up on this branch).
- `@conciv/cli` gains `@conciv/db` (light since the chat tables moved into it) and no `@conciv/ai`; the `prod
  closure` test stays unchanged and passes.

### Engine: outside runs

An outside run is an `execute_typescript` call on `/api/mcp` with `conciv-origin: hub` and no `conciv-session-id`.
Since Revision 7, part 7, it only lists tabs: a block that drives a tab comes from the hub with that tab's session
header and runs on the owner's session path, so nothing is forwarded between engines.

- `external_tabs({})` is the registry `tabs` tool above, present in every run. The outside run's capability set is
  built per request and passed through `ChatPlane.codeRunner(sessionId, publish, capabilities?)` (the optional
  argument approved 2026-11-07; in-page calls pass nothing): `external_tabs` as is, every other non-ask capability
  throws `NO_TAB: pass tab to execute_typescript; external_tabs({}) lists the open tabs`.
- The outside run needs no consent: it reads no page and changes nothing. Consent is asked by the owner on the first
  call naming the tab, as described under "outside calls, consent and marker".
- `registry.call` keeps assist tools, declared error codes and `HANDLER_ERROR` wrapping, since the CLI's `--tab` uses
  it.
- Agent guidance, in the `tabs` tool hint (`TABS_GUIDANCE`):

> conciv tabs are live web pages running the conciv widget. When the user refers to a conciv tab, session or page
> in words, call external_tabs({}) and match their words against project, branch, root, href, pageTitle and
> sessionTitle. If exactly one tab matches, use it and tell the user which one you picked (project, branch, URL). If
> more than one matches, do not guess: ask the user which one, naming the field that differs. Prefer a tab whose
> state is visible only when the user says "this one" or "the one I have open". If none match, say so and list what
> is open. Then pass the id of that tab as tab on every execute_typescript and discover_tools call; the first reply
> for a tab starts with its instructions, follow them. When a session has more than one browser tab (browserTabs lists
> each with its href), calls go to the one focused last, which is the first listed; tell the user which one (href).
> If a call says you are waiting for the user to allow it, tell the user to click Approve in that conciv tab, then
> retry; if it says the user denied you access, stop and tell the user, do not retry. If a call says the tab is not
> open, call external_tabs({}) again.

### Hub: `conciv mcp serve` (`@conciv/cli`)

- A citty subcommand `mcp` in `packages/cli/src/main.ts`, no arguments. Server built with `createMCPServer` and
  served with `serveMCPStdio(server)` from `@tanstack/ai-mcp/server/stdio`; engine calls use
  `createMCPClient({type: 'http', url, headers})`. `@conciv/cli` depends on `@conciv/db` and `@tanstack/ai-mcp`
  directly, never on `@conciv/ai` (the CLI `prod closure` test stays unchanged and passes).
- Its tool list is fixed for the life of the process: `execute_typescript` and `discover_tools` with the same names
  and input schemas as `/api/mcp` plus the optional `tab` (Revision 7, part 7), stripped before sending. No tool of
  its own. Descriptions come from the runner's `tools/list` when one is live at startup, else from fixed text that
  names `external_tabs({})` and the `tab` input.
- A call with `tab`: see Revision 7, part 7.
- A call without `tab` (Revision 7): forward the call to the kept runner's `/api/mcp` with `conciv-origin: hub` and
  `conciv-client: <agent>`, with no probe, and return the reply unchanged. The runner is the live engine registered
  longest ago (`checkEngines(home, {timeoutMs: 300})` at startup and after a failure only). A transport error drops
  the runner and picks again. A refused connection (`ECONNREFUSED`: nothing ran) sends the same call once to the
  new runner, silently; any other failure replies that the call failed on that engine and was not retried.
  No live engine: reply with an MCP error "no conciv dev server is running; start one and open its page" and the
  home folder path read, so a hub started without the user's env is diagnosable.
- The hub keeps its runner client and one entry per tab it resolved (that tab's owner client, and whether the
  tab's instructions were sent).

### Install: "Connect agents" menu

- MCP server name: `conciv-hub` (the project-scoped `conciv-connect` plugin already registers a server named
  `conciv`; `packages/harness-init/src/claude/names.ts`).
- Install line pinned to the engine's own `@conciv/cli` version: `npx -y @conciv/cli@<version> mcp serve --agent <harness>` (see Disconnect). Measure a cold
  `npx` start against each harness's MCP startup timeout (Codex defaults to about 10s); if it exceeds one, stop and
  ask Omri.
- Per-harness data on each init contribution in `@conciv/harness-init` (`packages/harness-init/src/registry.ts`,
  `HarnessInitContribution` in `@conciv/protocol/harness-types`): optional `hub: {add: (command: string[], env:
  Record<string, string>) => string[]}` returning the argv. The installer passes `{CONCIV_HOME: <engine's home>}` so the
  hub reads the same home db as the engine that installed it (a custom `homeDir` or `CONCIV_HOME` included). Starting values, each verified against the CLI pinned in CI
  (`.github/workflows/ci.yml` "Install harness CLIs") before it ships:
  - claude: `claude mcp add -s user conciv-hub -e K=V -- <command>`
  - codex: `codex mcp add conciv-hub --env K=V -- <command>`
  - gemini-cli: `gemini mcp add -s user --env=K=V conciv-hub <command>`
  - opencode: `opencode mcp add conciv-hub --env=K=V -- <command>`
- `hub.remove` (argv, optional): when the add reports the entry already exists, the installer runs remove then add so
  the entry pins this engine's home. claude `claude mcp remove -s user conciv-hub`, codex `codex mcp remove conciv-hub`,
  gemini-cli `gemini mcp remove -s user conciv-hub`; opencode has no non-interactive remove, so a connect that finds
  an existing opencode entry keeps it and records the connection.
  - pi: no `hub` field.
- Which harnesses to list: `detectHarnesses` (`packages/harness-init/src/detect.ts`, bin on PATH or config dir)
  minus those with a `hub_connections` row. Served by its own procedure `meta.hubAgents` as `{installs, connections}`
  (`HubAgentsSchema`, each `{harnessId, name}`), apart from `meta.models`. Cheap: PATH detection and the home db, no
  spawning, so the widget polls it every 3 s and on window focus to pick up connects and disconnects made outside it.
- Install procedure: a new oRPC procedure `meta.connectHub` (`oc.input(z.object({harness: z.enum(INIT_HARNESS_IDS)}))`, using `INIT_HARNESS_IDS` from `packages/harness-init/src/registry.ts`
  in `packages/contract/src/contract.ts`), callable only over a trusted connection. It spawns the harness's argv
  with `execFile` (no shell; argv from the registry only, never from input), 30s timeout, with the engine's PATH.
  Exit 0, or output saying the server already exists: `recordHubConnection(harness)` and return ok. Otherwise
  return the CLI's stderr; the widget shows it in a notice.
- Widget: in the composer slot the launch menu used, a `TooltipIconButtonSlot` + `Menu.Trigger asChild` (the
  pattern in today's `launch-menu.tsx`) labelled "Connect agents", shown only while `installs` is non-empty. Each
  item "Connect <name>" calls `meta.connectHub`, shows pending, and on success posts via `useNotices()`:
  "<name> connected. Ask any <name> session for your conciv tab." On failure the notice carries the CLI's message.
  `meta.hubAgents` is invalidated after success so the item leaves.

### Disconnect and `conciv mcp connect` (decided 2026-11-08)

No tokens. Every agent runs as the user, so any token on disk is readable by every agent and buys nothing over the
agent's name; the per-tab Allow card is the security boundary. Disconnect is for honest agents: it stops the
engine answering them and makes the user click Allow again.

- Agent name: the hub command written into each agent's config is `npx -y @conciv/cli@<version> mcp serve --agent
  <harness>` (bare `conciv mcp` becomes a group; `serve` is the old server). `serve` sends `conciv-client:
  <harness>` from `--agent`, not the MCP clientInfo name. `conciv tools` on the outside path
  (`packages/cli/src/request.ts`, home-db fallback) names the agent from the env var each agent CLI sets for its
  shell commands (verify each name against the CLI pinned in CI before shipping; Claude Code sets `CLAUDECODE`),
  else `terminal`.
- Engine gate, before `admitOutside`, at both doors (`/api/mcp` in `packages/core/src/api/mcp.ts` and
  `makeHubAdmission` in `packages/core/src/api/rpc/mount.ts`): a hub-origin call whose client is a harness with a
  `hub` contribution must have a `hub_connections` row, else refused with "<name> is disconnected from conciv;
  reconnect it from the conciv widget or run `conciv mcp connect <harness>`". This applies whatever
  `hubAccess` says. `terminal` and unknown clients skip this check and still go through the Allow card. The gate
  runs again after the Allow card resolves, so an Allow clicked after a disconnect still refuses the waiting call.
- Disconnect: delete the row FIRST (the gate then refuses the agent, whatever its config says) and, in the same
  home db transaction, bump the home's hub generation (an autoincrement row in `hub_revocations`); then run
  `hub.remove` best-effort. Every agent CLI change (add, remove) runs under a per-harness `hub_operations` lease
  (owner pid + start time, plus the pid of the agent CLI it spawned; stale after 10 minutes, or once both pids are
  gone, so a remove orphaned by a killed owner still holds the lease until it exits); a connect that finds a live lease answers "<Name>
  is still being (dis)connected; try again in a moment", and a connect only records its row when the generation
  has not moved since it started, so neither a slow remove nor a slow add can undo a later change.
  Revocation is lazy and home-wide (decided 2026-11-08, PR #775 review): an Allow is kept per tab (or per
  project), never per client, and each engine has its own project db, so instead of clearing grants the outside
  Allow records the home's hub generation when it was granted (`outsideAllowedGeneration` in the grants entry) and
  admission ignores an Allow from an older generation, so the card asks again. No clock is involved. This covers every engine sharing the
  home and a `conciv mcp disconnect` from the terminal alike. Denies stay. opencode has no remove: its entry stays in `opencode.json` and the result says it is refused until
  reconnected.
- One shared implementation, `@conciv/harness-init/hub` (new subpath; harness-init gains `@conciv/db`):
  `connectHub({harness, home, command})`, `disconnectHub({harness, home})`, `listHubConnections(home)`. Connect =
  `hub.add` (remove-then-add on "already exists", as today) + record the row. Core's `hub.ts` becomes a thin caller
  (`HUB_COMMAND` gains `serve --agent <harness>`); add `removeHubConnection(db, harness, now)` to `packages/db`. Planning reads (`list`, the init
  plan, `--dry-run`, a cancelled wizard) never create the home db or its folder: an absent db is no connections.
- CLI commands, JSON envelope like every route: `conciv mcp connect <agent>`, `conciv mcp disconnect <agent>`,
  `conciv mcp list` (`[{harness, name, connectedAt}]`). `<agent>` is a zod `z.enum` of the harnesses with a `hub`
  contribution. The CLI writes its own installed version into the command.
- `conciv init`: after its existing steps, offers to connect each detected harness with a `hub` contribution that
  is not connected (clack multiselect; `--yes` connects all; `--dry-run` lists them in the plan; `--json` reports
  them in `steps`).
- Widget: every connected agent gets Disconnect (no `canDisconnect` field); the opencode notice names the leftover
  `opencode.json` entry. `meta.connectHub` / `meta.disconnectHub` are refused for hub origin.
- Entries written before this ship run bare `mcp` and send no `--agent`; they are refused as unconnected-looking
  until reconnected (pre-release, no migration).
- Not built (stronger option, only if ever needed): an in-memory token the engine hands the `serve` process when
  the user clicks Allow, killed on disconnect. One-shot `conciv tools` runs cannot hold it.

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

## Revision 7 (2026-11-10): every call in milliseconds, one browser tab per call, no borrowed engine can kill a call

Branch `fix/hub-fast-routing`, worktree `aidx-wt-hub-fast`. Where this section disagrees with the text above, this
section wins; the implementing change also corrects the older paragraphs it replaces ("Several browser tabs", the
forwarding bullet, the hub's "Each call" bullet, the agent guidance text).

### What was measured (2026-11-10, tanstack-start example, all on localhost)

| Step                                                      | Time                                                     |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `/health`, `/api/tabs?session=`                           | 1 to 60 ms                                               |
| `/api/mcp` `initialize`, `tools/list`                     | 10 to 12 ms                                              |
| `/api/mcp` `discover_tools`                               | 31 ms                                                    |
| `/api/mcp` `execute_typescript` `return 1`                | 150 to 200 ms idle, 450 to 1000 ms with the machine busy |
| same with `return await external_page_route({})`          | 30 to 60 ms more                                         |
| one forwarded capability call seen from the agent's block | 240 to 490 ms, first of a block up to 1800 ms            |
| one `page_fill` seen from the agent's block               | 1400 to 1700 ms                                          |
| a block of 16 page calls                                  | about 8 s                                                |

Causes, each confirmed in code:

1. Every `execute_typescript` boots a new sandbox: `threadContext` in `packages/ai/src/server/quickjs-thread.ts`
   starts a new `Worker`, and `quickjs-worker.ts` imports its modules and builds a QuickJS context, per call.
2. That boot is paid again for every capability call from outside: `forward` in
   `packages/core/src/api/outside-run.ts` opens a new MCP client and runs a nested `execute_typescript`
   (`return await external_<name>(...)`) on the owner.
3. `checkEngines` (`packages/db/src/engine-check.ts`) probes `/health` of every registered engine and waits up to
   2 s for the slowest. It runs on every hub call (`packages/cli/src/hub.ts`), every `external_tabs` and every
   `external_use_tab` (`packages/core/src/api/outside-tabs.ts`). One hung engine costs 2 s each time.
4. The hub runs every call on the newest registered live engine (`.live.at(-1)`). Any engine on the machine
   qualifies, including one a script started seconds ago and is about to stop. A call routed through it fails with
   "the conciv engine at <unrelated root> stopped answering".
5. `bus.ask` (`packages/core/src/page-bus.ts`) sends each page query to every browser tab of the session and keeps
   the first reply. With two browser tabs, reads come from either one, actions run in both, and a ref taken from
   one tab's snapshot is stale in the other, so the fast tab answers "stale ref" while the slow one performs the
   action.
6. Page actions wait on the simulated pointer (`packages/extensions/page/src/client/simulator.ts`): smooth scroll
   and a wait for `scrollend` (1500 ms fallback), 300 ms pointer move, 100 ms ripple, 200 ms click, 100 ms after
   input. A hidden browser tab throttles those timers and never fires `scrollend`, which is the likely cause of
   the `PAGE_TIMEOUT` (5 s bus limit) seen on a fill whose text still landed. Not yet reproduced.

### Budgets (acceptance, measured the same way as the table)

- A capability call inside a block that needs no page: under 20 ms. A page call: under 20 ms plus the page's own time.
- `execute_typescript` `return 1` on a warm engine: under 20 ms.
- `external_tabs({})` with every engine healthy: under 100 ms. The hub's tab lookup (first call on a tab): under 20 ms.
- A registered engine that hangs adds at most 300 ms, and only to `external_tabs({})`.
- A block of 16 page reads: under 500 ms. A block of 16 page actions: under 500 ms once part 6 is decided.

### 1. Forwarded calls skip the sandbox on the owner (superseded by part 7)

Built, then deleted by part 7: there is no forwarding left. What it gave `registry.call` stays (assist tools, kept
error codes, `HANDLER_ERROR` wrapping), since the CLI's `--tab` uses it.

### 2. The sandbox starts in milliseconds (built in a separate worktree by the session that owns `packages/ai`)

- The quickjs thread driver keeps one booted spare ready (worker started, modules loaded, QuickJS module
  instantiated). An execution takes the spare and a new spare is booted in the background. An execution still gets
  a context no other execution has used or will use: no state carries over, and the limits (timeout, memory,
  stack) are unchanged.
- The spare is started when the driver is created, replaced after each use, and terminated on engine stop. A worker
  that fails to boot is logged and the execution falls back to booting its own, as today.
- The `@tanstack/ai-isolate-node` driver is measured the same way; if `return 1` misses the budget there, the
  finding is reported before any change to it.

### 3. No engine is probed that the call does not use

- Hub (`packages/cli/src/hub.ts`): keeps its runner client between calls and sends the call without probing. Only
  when a call fails at the transport does it run `checkEngines`, pick again and report. It never re-sends the
  failed call: the block may already have acted on a page, so the reply says the call failed, names the engine
  that failed and says nothing was retried.
- Runner choice: the live engine registered longest ago, not the newest. An engine that has been up for hours is a
  dev server someone is using; the newest row is whatever started last. The choice is sticky: the hub changes
  runner only after the current one fails.
- `checkEngines` itself is unchanged; callers pass a 300 ms timeout instead of 2000 (every engine is on loopback).
- The hub's runner serves only blocks without `tab` (part 7). A block with `tab` goes to the engine holding that tab,
  found once and kept (part 7); the runner's "last listing" memory and `find` are deleted.
- `external_tabs({})` keeps asking every engine in parallel, with the 300 ms timeout.

### 4. One browser tab per call

- Each browser tab that subscribes to a session's page queries gets an id from the engine, and `bus.ask` sends a
  query to exactly one of them and accepts the reply only from that one. Broadcast and first-reply-wins are
  deleted.
- Which one: the one the agent named, else the browser tab of that session that was focused most recently. Each
  page reports focus and visibility changes over the subscription it already holds, so the engine knows without
  asking.
- `external_tabs({})` rows gain `browserTabs: [{id, href, pageTitle, state}]` in place of the count. The row's
  `href`, `pageTitle` and `state` are those of the browser tab a call would go to.
- Naming one browser tab from outside (`browserTab`) is not built (part 7); calls go to the browser tab focused
  last.
- Guidance text (`TABS_GUIDANCE`, `packages/tools/src/builtins/server-tools.ts`): the sentence about actions
  running in every browser tab is replaced by: when a session has more than one browser tab, calls go to the one
  focused last; say which (href).
- In-page agent calls (no hub) get the same single-target rule, since they use the same `bus.ask`.

### 5. Outside approvals off for now (Omri, 2026-11-10)

- `hubAccess` defaults to `'open'` (`packages/core/src/config.ts`). `'session'` and `'project'` stay selectable
  and keep working; only the default changes. Tests that relied on the default name `'session'` explicitly.

### 6. Page actions do not wait on the simulated pointer (Omri's yes, 2026-11-10: for every caller)

- Today the action happens after the pointer animation and the reply after that
  (`packages/extensions/page/src/client/simulator.ts`). Now the action and the reply happen at once, for the in-page
  agent and outside callers alike. The field fills before the pointer arrives; that is accepted.
- An element that is out of view is scrolled to instantly (the path reduced motion already takes), so the hit point
  is known without waiting for `scrollend`. `SCROLL_SETTLE_MS` and `scrollEnded` are deleted.
- The pointer move and the ripple are still started for the same point, and nothing awaits them: `MOVE_MS`,
  `AFTER_RIPPLE_MS`, `AFTER_CLICK_MS` and `AFTER_INPUT_MS` stop being waits in the action path. Whatever of them
  still times the decoration stays inside the decoration.
- The events an action dispatches, and their order, do not change.
- If an existing test only passes because of one of these waits (the page had time to react before the reply),
  that is a finding to report, not a wait to put back.
- Actions whose reply reports state read back from the page (fill, select, check, uncheck) let one turn of the
  page's event loop run after dispatching, then read the result once (Omri's go, 2026-11-10). The turn is a
  `MessageChannel` message to ourselves: it runs after the microtasks and the tasks the app already queued, so a
  framework that reconciles in a microtask (Vue, Svelte, Angular) or a queued task is reflected. It is not
  `requestAnimationFrame` (paused in a hidden tab), not `setTimeout` (throttled in a hidden tab) and not
  `scheduler.yield()` (its continuation can run before the app's queued work). No retries. Click, hover, scroll and
  press carry no read-back state and reply synchronously. An app that undoes a change on its own timer is not
  caught.
- Known edge: an action can now land within the same frame as the one before it. An agent click that opens an
  Ark menu, followed at once by a fill outside it, leaves the menu open, because the menu's outside-press listener
  is not armed yet.

### 7. The hub sends a block to the engine that owns the tab (Omri's yes, 2026-11-10)

Replaces the runner for every block that drives a tab, and with it parts 1 and 3's runner choice for those blocks.
The hub's two tools are conciv's own definitions (`packages/cli/src/hub.ts`); `@tanstack/ai-code-mode` only runs
the code inside an engine and is not changed.

- The hub's `execute_typescript` and `discover_tools` each gain one optional input, `tab` (a `SessionId`, zod
  parsed). The engine's `/api/mcp` tools do not change.
- With `tab`: the hub finds the engine where that tab is open (`GET <apiBase>/api/tabs?session=<tab>` on every
  live engine in parallel, 300 ms), keeps one MCP client per tab (an MCP client's headers are fixed at connect, and
  the session header differs per tab), and sends the call there with
  `conciv-session-id: <tab>`, `conciv-origin: hub`, `conciv-client`. That is the session path `/api/mcp` already
  serves: the block runs in the owner's sandbox with that tab's own capability set, consent and the "from
  <client>" marker are applied by the owner as today, and no call is forwarded between engines.
- The hub remembers the owner of each tab it resolved. It asks again only when the kept owner fails at the
  transport or answers that the tab is not open. "Answers not open" is read only on an error reply: the hub then asks
  that owner's `/api/tabs?session=` once and, when it says not open, forgets the owner so the next call looks up
  again. A refused connection is resent once after a fresh lookup; any other failure is reported and not retried
  (the rule from part 3).
- Not open on any engine: the reply is `TAB_NOT_OPEN: tab <id> is not open; call external_tabs({})`. Open on two
  engines: the reply names both roots and asks the user to close one browser tab.
- The first reply for a tab in a hub process carries that tab's instructions (the `instructions` of the same
  `/api/tabs?session=` answer) as a leading text part, so the agent gets them without a separate call.
- Without `tab`: the block runs on the kept engine exactly as in part 3. It is for `external_tabs({})`; a page or
  server capability called there fails with `NO_TAB: pass tab to execute_typescript; external_tabs({}) lists the
  open tabs`.
- Deleted, because there is now one way to drive a tab: `external_use_tab`, the forwarding in
  `packages/core/src/api/outside-run.ts`, `packages/core/src/api/owner-calls.ts`, and the `find` half of
  `outside-tabs.ts`, and the `tools` field of the `/api/tabs?session=` answer (only `external_use_tab` read it, and
  computing it ran discover per lookup, past the hub's 300 ms on a busy machine). `registry.call` keeps what part 1 gave it (assist tools, kept error codes), since the CLI's
  `--tab` uses it.
- `TABS_GUIDANCE` and the `tab` input's description say: list with `external_tabs({})`, match the user's words,
  then pass that tab's id as `tab` on every `execute_typescript` and `discover_tools` call.
- Naming one browser tab from outside stays unbuilt; calls go to the browser tab focused last.

### Tests (existing files only; one journey per file, no timing guesses)

- `packages/cli/test/cli.test.ts`, `describe('conciv mcp hub')`, part 7: two engines, one tab each. A block with
  each `tab` runs on that tab's engine (its own route comes back) and the first reply for a tab leads with its
  instructions; stopping the other engine changes nothing for the first; an unknown `tab` gives `TAB_NOT_OPEN`; a
  page capability in a block without `tab` gives `NO_TAB`; `discover_tools` with `tab` returns that engine's
  signatures.

- `packages/core/test/core-api.it.test.ts`, the existing `describe('outside sessions')`:
  - two page subscribers on one session: a query reaches only the one focused last; after the other reports focus
    it reaches that one; `browserTab` pins it; the listing names both; closing the pinned one gives
    `TAB_NOT_OPEN`;
  - part 7: a hub-origin `execute_typescript` with the tab's session header runs that tab's capabilities after
    allow, lands in its chat with the client marker and passes image parts on; an outside run's page capability
    gives the `NO_TAB` message;
  - with a second registered engine whose `/health` never answers, `external_tabs({})` still lists the healthy
    engine's tab and names the hung one under `unreachable`.
- `packages/cli/test/cli.test.ts`, the existing `describe('conciv mcp hub')`: with an older and a newer engine
  registered, the hub's call runs on the older; stopping the newer changes nothing; stopping the older makes the
  next call fail naming it and the one after succeed on the survivor.
- `packages/ai` node test file: two executions in a row on the quickjs driver do not see each other's globals;
  an execution started before the spare is ready still completes.
- No test asserts milliseconds. The budgets above are checked by hand with the commands that produced the table,
  and the numbers go in the PR description.

### Not in this change

- One WebSocket for all browser RPC (#798). Part 4 lands after it: two browser tabs exhaust the browser's six
  HTTP connections per host today, and the second tab's page replies never leave.

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
  - under `hubAccess: 'session'` a hub-origin call started before the click returns its result after Allow, a
    call started before Deny fails, an aborted waiting call leaves its prompt pending, listing tools prompts
    nothing, a second session prompts again; after a Deny, retries are refused without a new pending approval until "Allow outside agents"
    clears it; under `'project'` the second session passes; under `'open'` nothing is refused;
  - an allowed hub-origin `execute_typescript` publishes chunks carrying `metadata.conciv.origin === 'hub'`.
- `packages/core/test/core-api.it.test.ts`, same `describe('outside sessions')`, two engines in one process with a
  fake page subscriber: an in-page call (session header, no hub origin) sees `external_tabs`; an outside run's
  `external_tabs({})` lists the tabs of both engines and no token, and any other capability throws `NO_TAB`; a
  hub-origin call with the other engine's tab as session header is refused until allow, then runs there and its
  chunks carry the marker on that transcript (Revision 7, part 7).
- `packages/cli/test/cli.test.ts` (over 1000; pay for additions), `describe('conciv mcp hub')`, using `startEngine`:
  spawn the hub over stdio with a temp `CONCIV_HOME`; `tools/list` is exactly `execute_typescript` and
  `discover_tools`; an `execute_typescript` of `return await external_tabs({})` returns the engine's tab; after
  restarting the engine on another port the same call still works; with no engine running the call returns the
  "no conciv dev server is running" error naming the home folder.
- `packages/cli/test/cli.test.ts`, `describe('conciv tools on any tab')`: from a temp folder with no
  `.conciv/server.json`, `conciv tools tabs` lists the engine's tab from the temp home db; `--tab <id>` runs a tool on
  that tab and is refused until allow; an invalid `--tab` fails with a clear message; inside a project folder with
  no `--tab` the call goes to that folder's engine exactly as today.
- `packages/core/test/core-api.it.test.ts`: an in-page `execute_typescript` can call `external_tabs({})`.
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
3. The hub's first reply for a tab leads with the same instructions text the in-page agent gets.
4. Two tabs of one project on different pages: the same request makes the agent ask which, naming the URLs.
5. Restart that dev server, and separately edit its `vite.config` (Vite restart): the next call on the chosen tab
   still works.
6. `kill -9` a dev server: it disappears from `external_tabs({})` and its row gets `deletedAt`. Start another dev server on
   the same port: the old row is retired by the id check, the new one is listed.
7. A call from the outside session shows in that tab's transcript with "from <harness>".
8. Set `hubAccess: 'open'`: no prompt. Set `'project'`: one prompt covers a second session.
9. `ls -l ~/Library/Application\ Support/conciv` shows the folder `drwx------` and `home.db` `-rw-------`.
