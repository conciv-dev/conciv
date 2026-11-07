# conciv MCP hub: any agent session finds and drives any open conciv tab

Status: spec for implementation, revised 2026-11-07 against `main`. Base: stacked on PR #739
(`feat/ai-mcp-server`, `/api/mcp` on `createMCPServer`); branch `feat/mcp-hub`. The first version (2026-11-03)
was written on the Devframe stack (#691-#709), which is closed; `docs/designs/devframe-exit.md` rules out any
Devframe dependency on `main`, so discovery, the tab list and the install check are redesigned below on
`main`'s own plumbing. File references are on `feat/ai-mcp-server` unless marked.

## Goal

Once the conciv MCP server is installed, the user says to any session of a supported harness (Claude Code, Codex,
opencode, Gemini CLI), in any directory, something like
"find the conciv session in my tanstack project" or "use the conciv tab on the settings page". Claude finds the tab
and drives it with the full conciv tool set. If several tabs match, Claude asks which one. Nothing is pasted.

Every conciv tool is already callable from outside the browser: the engine serves them on `/api/mcp` (code mode
`execute_typescript` / `discover_tools`, session routing by the `conciv-session-id` header, chat mirroring through
`scope.stream.publish`, approval gate, result cap). An outside session is missing only three things: which engines
are running, each engine's token, and which tab is which. The hub supplies exactly those and forwards calls to the
existing `/api/mcp`. No tool is rewritten.

## Decisions

From 2026-11-03, still standing:

- Calls go through conciv's own `/api/mcp`.
- Tokens are enforced on every call. The engine refuses every non-open path without `/t/<agentToken>` or a trusted
  browser (`makeConnectionTrust`, `packages/core/src/app.ts`). The hub never has a tokenless path.
- Matching the user's words to a tab is Claude's job. The hub returns a small descriptive listing; no search logic.
- A tab is identified by its conciv session id. Several browser tabs on one session are one "tab" here.
- The widget's terminal launch menu ("Open in <harness>" / "Copy command") is replaced by a "Connect agents"
  install menu.

New, 2026-11-07 (Omri):

- Engine discovery is a SQLite table in a home-level conciv db, not JSON files and not Devframe. `@conciv/db`
  already runs on `node:sqlite` with drizzle and migrations; no new dependency.
- The work stacks on #739 and its PR targets `feat/ai-mcp-server` until #739 merges.
- Every harness we support that can load an MCP server gets the hub: Claude Code, Codex, opencode, Gemini CLI.
  pi has no MCP support (extensions only) and is out of v1.
- New tests go in as `describe` blocks in the existing files; each one is paid for by deleting the same number of
  duplicate or useless lines in that file, so no file grows.

## User flow

1. Install once per harness: while any harness installed on the machine lacks the `conciv` MCP server, the composer
   shows a "Connect agents" menu where the launch menu was, with one item per such harness. Picking one copies that
   harness's install line and posts a notice. The item disappears once that harness has it; the menu disappears
   when none are left.
2. In any session the user describes the tab. Claude calls `list_tabs`, matches the words against the descriptors:
   - exactly one match: uses it and says which (project, branch, URL);
   - several: asks which, naming the field that differs; never guesses;
   - none: says so and lists what is open.
3. Claude calls `discover_tools` / `execute_typescript` with the chosen tab. Each call appears in that tab's widget
   transcript, marked as coming from an outside session.

## Architecture

```
agent CLI (any cwd) ──stdio──>   conciv mcp (hub, @conciv/cli)
                                   │ 1. SELECT * FROM engines   (<conciv home>/conciv.db, dir 0700)
                                   │    prune rows whose pid is dead
                                   ▼
                     engine A, engine B ...
                       GET  <apiBase>/api/tabs   -> project + tab descriptors
                       MCP  <apiBase>/api/mcp    (SDK client; conciv-session-id, conciv-origin: hub)
```

`apiBase` is the token-scoped base the engine already builds (`tokenScopedBase()` in `packages/core/src/start.ts`,
`http://127.0.0.1:<port>/t/<agentToken>`).

### Discovery: the `engines` table

- Home db: the conciv home folder is `$CONCIV_HOME` when set, else the platform data folder from `env-paths`
  (`envPaths('conciv', {suffix: ''}).data`): `~/Library/Application Support/conciv` on macOS,
  `$XDG_DATA_HOME/conciv` (default `~/.local/share/conciv`) on Linux, `%LOCALAPPDATA%\conciv\Data` on Windows. This
  is the pattern `conf` uses for Next.js, Astro, Wrangler and others. `env-paths@3.0.0` is already in the lockfile
  as a transitive dependency; adding it as a direct dependency of `@conciv/db` needs Omri's yes (given 2026-11-07:
  "use well known patterns"). The folder is created with mode `0700`. `~/.conciv/dev-endpoint.json` (Swift) is
  not moved. `@conciv/db` opens `<conciv home>/conciv.db` with the existing migrations, so no second
  migration set; `openDb` gains a way to open a db at a given folder rather than under `<root>/.conciv`. Nothing is
  written at install time, only by a running engine or hub. The hub and the engine both call it. Before opening, the conciv home folder is created (or chmodded)
  to `0700`, because the table holds tokens; that covers the db and its `-wal` / `-shm` files.
- New drizzle table `engines` in `packages/db/src/schema.ts` plus a generated migration (`pnpm --filter @conciv/db
  gen-migrations`): `pid` integer primary key, `root` text (project root), `apiBase` text, `startedAt` integer.
  The token is part of `apiBase`; no separate column.
- Queries in a new `packages/db/src/engine-queries.ts`, exported from the package index: `registerEngine(db, row)`
  (upsert by pid), `removeEngine(db, pid)`, `listEngines(db)`.
- Engine side (`start.ts`, next to where `mcp-endpoint.json` is written today): after the port is known, register;
  on close, remove (same place as `clearEndpoint`). A failed register logs and does not stop the engine. The engine
  registers whether or not `nativePageDir` is set.
- Hub side: list rows; a row whose pid is not alive (`process.kill(pid, 0)` throws `ESRCH`) is deleted and skipped.
  An `EPERM` from `kill` means alive. A live pid whose `/api/tabs` probe fails lands in `unreachable` (covers pid
  reuse and a stuck engine); the row is not deleted on a network failure.
- Two engines on one root are two rows with different pids, both reachable. The old "last writer wins" limit is gone.
- `~/.conciv/dev-endpoint.json` (read by the Swift native discovery) and the per-project `.conciv/server.json` /
  `.conciv/mcp-endpoint.json` are left as they are. Moving those readers onto the table is a follow-up.

### Engine: `GET /api/tabs`

A Hono route beside `/api/mcp` in `packages/core/src/app.ts`, under the same token gate. Response zod schema in
`@conciv/protocol`:

```ts
{
  project: {name: string | null, root: string, branch: string | null}
  harness: string
  tabs: Array<{
    sessionId: SessionId
    open: boolean
    session: {title: string, updatedAt: number, running: boolean}
    page: {href: string, title: string, state: 'focused' | 'visible' | 'hidden'} | null
  }>
}
```

- `project.name`: root `package.json` `name`, else null. `branch`: `.git/HEAD` (follow a worktree's `.git` file),
  else null. Read once at start.
- Open tabs come from the page bus (`packages/core/src/page-bus.ts`, `makePageBus`): a session is open while it has
  at least one subscriber. Add one accessor, `openSessions(): SessionId[]`, beside `anySubscriber`. For each open
  session, `bus.ask(sessionId, {name: <route tool name>, input: {}})` with a 1.5s timeout, in parallel. A timeout
  gives `page: null`, `open: true`; the session is not dropped.
- `?includeClosed=true` adds non-hidden sessions with no subscriber (`open: false`), newest first, capped at 20.
  The query param is zod-parsed (`.default(false).catch(false)`).
- `session` fields come from the existing session listing (`title`, `updatedAt`, `running`).

### `route` page tool

`packages/extensions/page/src/shared/defs.ts` `routeDef` output gains `title` (`document.title`) and
`state`: `'focused'` when `document.hasFocus()`, else `'visible'` when `document.visibilityState === 'visible'`,
else `'hidden'`. Additive; the page-side body (`packages/extensions/page/src/client/bodies.ts`) fills both.

### Engine: outside-call marker

`/api/mcp` requests with header `conciv-origin: hub` (new constant `CONCIV_ORIGIN_HEADER` beside
`CONCIV_SESSION_HEADER` in `@conciv/protocol/chat-types`, zod-parsed as `z.enum(['hub']).optional().catch(undefined)`)
publish their TOOL_CALL chunks with metadata marking them as outside calls. The chunks are built in
`packages/core/src/api/mcp.ts` (`callStartChunks`, `executeResultChunk`). Sessions already carry an `external`
origin, but tool calls have no per-call marker. The widget shows the marker in the tool-call row using an existing
slot or metadata field; if none fits, stop and ask Omri (no new slot without approval).

### Hub: `conciv mcp` (`@conciv/cli`)

Stdio MCP server. Use the same library the engine uses in #739 if it supports a stdio transport
(`@tanstack/ai-mcp`, read its source first); otherwise `@modelcontextprotocol/sdk` `McpServer` +
`StdioServerTransport` (catalog dep, already used by core). `@conciv/cli` gains `@conciv/db` and the chosen MCP
package as dependencies. Fixed tool list:

- `list_tabs({includeClosed?})`: discovery, then `GET <apiBase>/api/tabs` per engine (2s timeout, parallel).
  Returns `{tabs: [{tab, open, project, branch, root, href, pageTitle, sessionTitle, lastActive, running, state,
  harness}], unreachable: [{project, root, error}]}`. Flat rows, ISO `lastActive`, nulls omitted. A 401 or network
  failure puts the engine in `unreachable` with the reason; it never retries without the token.
- `discover_tools({tab, toolNames})`, `execute_typescript({tab, typescriptCode})`: resolve `tab` to the engine whose
  `/api/tabs` lists it as open (fresh lookup per call, so a restarted engine on a new port still resolves), then call
  the same-named tool on that engine's `/api/mcp` through an MCP SDK `Client` with `StreamableHTTPClientTransport`
  (headers `conciv-session-id: <tab>` and `conciv-origin: hub`), and return the result content unchanged. No
  hand-built JSON-RPC. Not open anywhere: error "tab <id> is not open; call list_tabs". Open on two engines:
  refuse and name both.
- Inputs zod-validated; `tab` must parse as `SessionId`.

Server instructions (also in the `list_tabs` description):

> conciv tabs are live web pages running the conciv widget. When the user refers to a conciv tab, session or page
> in words, call list_tabs and match their words against project, branch, root, href, pageTitle and sessionTitle.
> If exactly one tab matches, use it and tell the user which one you picked (project, branch, URL). If more than one
> matches, do not guess: ask the user which one, naming the field that differs. A tab whose state is focused is the
> one the user is looking at; prefer it only when the user says "this one" or "the one I have open". If none match,
> say so and list what is open. Keep using the chosen tab id for later calls; if a call says the tab is not open,
> call list_tabs again.

### Widget: replace the launch menu

- Delete `apps/conciv/src/composer/launch-menu.tsx` and its wiring in `apps/conciv/src/composer/actions.tsx`
  (`openExternal`, `copyConnect`, the `canLaunch` gate at the `<Show>` around the menu); `canLaunch` in
  `HarnessMetaSchema` (`packages/protocol/src/chat-types.ts`) and `harnessMetaOf`
  (`packages/core/src/api/rpc/sessions.ts`); `connectPlan` in `packages/core/src/app.ts` and
  `packages/extension/src/types.ts`; `connectPlanFor` and the launch / connect-command procedures in
  `packages/extensions/terminal/src/server.ts`; the per-harness `connect` plans in
  `packages/harness/src/{claude,codex,opencode}/index.ts`; and whatever becomes dead after. Run
  `pnpm exec fallow dead-code --trace '<file>:<symbol>'` before each deletion. `claudeConnectArgs` stays: it is
  also used by `packages/harness/src/claude/tty.ts`.
- Per-harness install data lives with each harness's existing init contribution in `@conciv/harness-init`
  (`packages/harness-init/src/registry.ts`, `HarnessInitContribution` in `@conciv/protocol/harness-types`), which
  already carries `detection: {bin, configDir}`. Add an optional `hub` field: `{install: string[], check: string[]}`,
  both argv arrays run through the harness's own CLI, so conciv parses no TOML or JSONC config of any CLI. Starting
  values, each verified against the real CLI's `--help` and a real install before it ships:

  | harness | `install` | `check` (installed = exit 0 and `conciv` listed) |
  | --- | --- | --- |
  | claude | `claude mcp add -s user conciv -- npx -y @conciv/cli mcp` | `claude mcp get conciv` |
  | codex | `codex mcp add conciv -- npx -y @conciv/cli mcp` | `codex mcp get conciv` |
  | gemini-cli | `gemini mcp add -s user conciv npx -y @conciv/cli mcp` | `gemini mcp list` |
  | opencode | to be found: `opencode mcp add` takes `--url` for remote servers but its local-command form may be interactive; if no non-interactive form exists, stop and ask Omri | `opencode mcp list` |

  pi gets no `hub` field.
- Install check: a `hubInstalls: Array<{harnessId, name, install: string}>` field on the same meta query the
  composer already reads for `canLaunch` (it replaces that field, so no new procedure). It lists harnesses whose
  `bin` is on PATH, that have a `hub` field, and whose `check` says not installed. Checks run in parallel with a 3s
  timeout each; a timeout or spawn failure counts as not installed. Results are cached for the engine's life and
  refreshed when the composer refetches meta.
- In the launch menu's composer slot: a `TooltipIconButton` "Connect agents" opening a `Menu`, shown only while
  `hubInstalls` is non-empty, with one item per entry ("Connect <name>"). Picking one copies its install line and
  notifies via `useNotices()`: "Copied. Run it in a terminal once; then ask any <name> session for your conciv tab."
- The CLIs read the server's instructions differently; the `list_tabs` description repeats them so every harness
  sees them.

## Out of scope / follow-ups

- Moving `dev-endpoint.json` (Swift), `.conciv/server.json` and `.conciv/mcp-endpoint.json` readers onto the
  `engines` table.
- Removing the project-scoped `conciv-connect` plugin and its stdio bridge
  (`packages/harness-init/src/claude/bridge.ts`); `conciv init` would register the hub at user scope instead.
  Needs Omri's yes.
- pi: needs a pi extension (pi has no MCP support).

## Tests (existing files only, new `describe` blocks; no mocks)

Each file below is already over 1000 lines. Every added `describe` is paid for by deleting at least as many lines of
duplicate or useless tests in the same file, listed in the PR body with the reason for each.

- `packages/db` existing node test file, `describe('engines table')`: register, list, remove; upsert by pid.
- `packages/core/test/core-api.it.test.ts`, `describe('outside sessions')`:
  - a started engine has a row in a temp home db with its root and a token-scoped `apiBase`; closing removes it;
  - `/api/tabs` and `/api/mcp` return 401 with no token and with a wrong token;
  - `/api/tabs` with the token returns project name and branch, and a joined page with href, title and state;
    `includeClosed` adds a session with no tab;
  - an `/api/mcp` call with `conciv-origin: hub` publishes chunks carrying the outside-call marker;
  - `hubInstalls` lists claude, then drops it after a real `claude mcp add` against a temp `CLAUDE_CONFIG_DIR`
    (the only harness CLI guaranteed on CI; the others are covered by the live acceptance run).
- `packages/cli/test/cli.test.ts`, `describe('conciv mcp hub')`: spawn the hub over stdio with a temp home and a real
  engine with a joined page: `list_tabs` returns the tab with descriptors; `execute_typescript` on it runs; after
  restarting the engine on another port the same tab id resolves; an unknown tab returns the `list_tabs` error; a
  row whose pid is dead is pruned; an engine whose `apiBase` token is wrong lands in `unreachable`.
- `packages/extensions/page` existing browser test file: `route` returns `title` and `state`.
- `apps/conciv/test/conciv.browser.test.tsx`: the menu shows with a temp config lacking `conciv`, a real pointer
  click on the Claude item copies its install line, and the menu is absent once the hub is installed. The launch-menu tests
  are deleted with the feature.

Tests never touch the real conciv home folder, any harness's real config or the user's home db: `CONCIV_HOME` (and each
harness's own config env, e.g. `CLAUDE_CONFIG_DIR`) points at a temp dir.

## Changeset

One patch changeset naming `@conciv/cli` (the fixed group bumps every `@conciv/*`).

## Acceptance (Fable runs these live before calling it done)

1. Run the copied install line for each of Claude, Codex, opencode and Gemini CLI (install Gemini CLI first; it is
   not on this machine). Start the tanstack-start example and `apps/conciv`, one tab each. In a session of each
   harness in `~`: "find the conciv session in my tanstack project" picks the tanstack tab and says so.
2. Two tabs of one project on different pages: the same request makes Claude ask which, naming the URLs.
3. Restart that dev server: the next call on the chosen tab still works.
4. Kill a dev server with `kill -9`: it disappears from `list_tabs` (pid pruned).
5. A call from the outside session shows in that tab's widget transcript with the outside-call marker.
6. `claude mcp remove -s user conciv`: the Claude item comes back in the menu.
7. `ls -ld ~/Library/Application\ Support/conciv` shows `drwx------`.
