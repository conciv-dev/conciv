# conciv MCP hub: every Claude Code session finds and drives any open conciv tab

Status: spec for implementation (2026-11-03). Base: top of the Devframe stack, branch `devframe-ext-ios` (#709).
All file references below are on that branch unless marked `main`.

## Goal

Once the conciv MCP server is installed, the user says to any Claude Code session, in any directory, something like
"find the conciv session in my tanstack project" or "use the conciv tab on the settings page". Claude finds the tab
and drives it with the full conciv tool set. If several tabs match, Claude asks which one. Nothing is pasted.

Every conciv tool is already callable from outside the browser: the engine serves them on `/api/mcp` (code mode
`execute_typescript` / `discover_tools`, session routing by `conciv-session-id`, chat mirroring, approval gate, result
cap). An outside session is missing only three things: which engines are running, each engine's token, and which tab
is which. The hub supplies exactly those and forwards calls to the existing `/api/mcp`. No tool is rewritten.

## Decisions (with Omri, 2026-11-03)

- Calls go through conciv's own `/api/mcp`, never Devframe's MCP route. Devframe's route stays closed (`mcp: false`,
  `packages/core/src/devframe-plane.ts:263`; decision commit `3d87a7a54` in `docs/designs/devframe-migration.md`):
  it has no chat session, so it cannot do code mode, session routing or transcript mirroring.
- Engine discovery uses Devframe's instance registry (`~/.devframe/instances/`), not a table of our own. Storage
  choice is not a product concern; the registry already exists, probes liveness and prunes dead records.
- Tokens are enforced on every call. The engine gate (`packages/core/src/engine-gate.ts`) already refuses any
  non-open path without `/t/<loginToken>` or a trusted browser token with 401, and every engine has a `loginToken`.
  The hub never has a tokenless path.
- Matching the user's words to a tab is Claude's job. The hub returns a small descriptive listing; no search logic.
- A tab is identified by its conciv session id.
- The widget's "Open in <harness>" launch menu is replaced by a "Connect Claude Code" install button.

## User flow

1. Install once: while `~/.claude.json` has no top-level `mcpServers.conciv`, the composer shows a "Connect Claude
   Code" button where the launch menu was. Clicking copies `claude mcp add -s user conciv -- npx -y @conciv/cli mcp`
   and posts a notice. After install the button disappears.
2. In any session the user describes the tab. Claude calls `list_tabs`, matches the words against the descriptors:
   - exactly one match: uses it and says which (project, branch, URL);
   - several: asks which, naming the field that differs; never guesses;
   - none: says so and lists what is open.
3. Claude calls `discover_tools` / `execute_typescript` with the chosen tab. Each call appears in that tab's widget
   transcript, labelled as coming from an external session.

## Architecture

```
Claude Code (any cwd) ──stdio──> conciv mcp (hub, @conciv/cli)
                                   │ 1. listLiveDevframeInstances()  (~/.devframe/instances, devframe)
                                   │ 2. <rootDir>/.conciv/mcp-endpoint.json  -> {mcpUrl, token}   (0600)
                                   ▼
                     engine A, engine B ...
                       GET  /t/<token>/api/tabs   -> project + tab descriptors
                       POST /t/<token>/api/mcp    (conciv-session-id, conciv-origin: hub)
```

### Discovery

- The engine passes `register` to `initHub` (`devframe-plane.ts`, the `initHub({...})` call at ~259) so it appears in
  Devframe's registry, with overrides `name: 'conciv'` and `rootDir: <project root>`. Registration never throws
  (Devframe degrades to warning `DF0045`).
- The token is NOT put in the registry: Devframe writes those records world-readable and other Devframe tools read
  them. The token stays where it is today, `<rootDir>/.conciv/mcp-endpoint.json` (`{mcpUrl, token}`, written 0600 by
  `start.ts:215`).
- The hub calls `listLiveDevframeInstances()` from `devframe/internal`. That is the only export carrying it in 1.3.0;
  Devframe's own `@devframes/agentic` connect gateway imports it from there too (`connect/index.mjs:2`), so it is
  the library's sanctioned path, but its name signals no stability promise: the cli test covers it, so a devframe
  bump that moves it fails loudly. The hub keeps records named `conciv`, reads each one's `mcp-endpoint.json`, and dedupes by `mcpUrl`.
  Other Devframe apps in the registry (Vite DevTools etc.) are ignored.
- Known limit: two conciv engines on the same `rootDir` share one `mcp-endpoint.json` (last writer wins), so only one
  is reachable. Worktrees have distinct roots, so this only bites two dev servers in one checkout. Accepted for now.

### Engine: `GET /api/tabs`

A Hono route beside `/api/mcp` in `packages/core/src/app.ts` (Hono routes stay; only oRPC procedures move to
Devframe), behind the engine gate. Response zod schema in `@conciv/protocol`:

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
- Open tabs come from the page tab registry that already exists at the stack top: `makePageTabs`
  (`packages/core/src/page-bus.ts:69-106`), filled by `conciv:page:join` (`packages/core/src/api/rpc/router.ts`
  `joiningTab`). For each live joined tab, ask its page for `route` (`tab.query`) with a 1.5s timeout, in parallel.
  A timeout gives `page: null`, `open: true`; the tab is not dropped.
- `?includeClosed=true` adds non-hidden sessions with no joined tab (`open: false`), newest first, capped at 20.
- `session` fields come from the existing `SessionMeta` (`title`, `updatedAt`, `running`).
- Devframe's own client sync (`devframe:agent:list-clients`, which also reports url/title/visible/focused) is not
  used: it only runs when Devframe's MCP route is mounted, which the design doc plans but no branch has built.
  If that lands later, `/api/tabs` may switch its `page` source to it; the response shape does not change.

### `route` page tool

`packages/extensions/page/src/shared/defs.ts` `routeDef` output gains `title` (`document.title`) and
`state`: `'focused'` when `document.hasFocus()`, else `'visible'` when `document.visibilityState === 'visible'`,
else `'hidden'`. Additive; the page-side implementation fills both.

### Engine: external-call marker

`/api/mcp` requests with header `conciv-origin: hub` (new constant beside `CONCIV_SESSION_HEADER` in
`@conciv/protocol/chat-types`) publish their TOOL_CALL chunks with metadata marking them external. The widget shows
that marker in the tool-call row using an existing slot; if none fits, stop and ask (no new slot without approval).

### Hub: `conciv mcp` (`@conciv/cli`)

Stdio MCP server (`@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport`; already a catalog dep).
Fixed tool list:

- `list_tabs({includeClosed?})`: discovery, then `GET <base>/api/tabs` per engine (2s timeout, parallel). Returns
  `{tabs: [{tab, open, project, branch, root, href, pageTitle, sessionTitle, lastActive, running, state, harness}],
  unreachable: [{project, root, error}]}`. Flat rows, ISO `lastActive`, nulls omitted. A 401 or network failure puts
  the engine in `unreachable` with the reason; it never retries without the token.
- `discover_tools({tab, toolNames})`, `execute_typescript({tab, typescriptCode})`: resolve `tab` (a `SessionId`) to
  the engine whose `/api/tabs` lists it as open (fresh lookup per call, so a restarted engine on a new port still
  resolves), then POST JSON-RPC `tools/call` to its `mcpUrl` with `conciv-session-id: <tab>` and
  `conciv-origin: hub`; return the reply verbatim. Not open anywhere: error "tab <id> is not open; call list_tabs".
  Open on two engines: refuse and name both.
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

- Delete `apps/conciv/src/composer/launch-menu.tsx` and its wiring in `composer/actions.tsx` (`openExternal`,
  `copyConnect`, the `canLaunch` gate), `launch` / `connectCommand` in `packages/extensions/terminal/src/server.ts`,
  the per-harness `connect` plans (`packages/harness/src/{claude,codex,opencode}/index.ts`, `connectPlan` in
  `packages/core/src/app.ts`), `canLaunch` in `packages/core/src/api/rpc/sessions.ts`, and whatever becomes dead
  after (`claudeConnectArgs` etc.). `fallow dead-code --trace` before each deletion. Note for the terminal lane:
  the design doc's "launch in the OS terminal" port item (line ~301) is dropped by this.
- New `conciv:hub:installed` Devframe function (`defineConcivFunction`, type query) returning a boolean: reads
  `~/.claude.json` (`CLAUDE_CONFIG_DIR` honoured), zod-parses top-level `mcpServers`, true when `conciv` exists.
  Missing or unreadable file = false.
- In the launch menu's composer slot: a `TooltipIconButton` "Connect Claude Code", shown only while `installed` is
  false. Click copies the install line and notifies via `useNotices()`: "Copied. Run it in a terminal once; then ask
  any Claude Code session for your conciv tab."
- Claude only. Codex / opencode install lines are a follow-up.

## Out of scope / follow-ups

- Removing the project-scoped `conciv-connect` plugin (`conciv init` would register the hub at user scope instead).
  Needs Omri's yes.
- Codex / opencode install lines.
- Two engines on one `rootDir`.
- Switching `/api/tabs` to Devframe's client sync once Devframe's MCP route is mounted.

## Tests (existing files only, new `describe` blocks; no mocks)

- `packages/core/test/core-api.it.test.ts`, `describe('outside sessions')`:
  - a started engine appears in a temp `DEVFRAME_INSTANCES_DIR` with `name: 'conciv'` and the project `rootDir`;
  - `/api/tabs` and `/api/mcp` return 401 with no token and with a wrong token;
  - `/api/tabs` with the token returns project name and branch, and a joined page with href, title and state;
    `includeClosed` adds a session with no tab;
  - an `/api/mcp` call with `conciv-origin: hub` publishes chunks carrying the external marker;
  - `conciv:hub:installed` is false then true against a temp `CLAUDE_CONFIG_DIR`.
- `packages/cli/test/cli.test.ts`, `describe('conciv mcp hub')`: spawn the hub over stdio with temp
  `DEVFRAME_INSTANCES_DIR` and a real engine with a joined page: `list_tabs` returns the tab with descriptors;
  `execute_typescript` on it runs; after restarting the engine on another port the same tab id resolves; an unknown
  tab returns the `list_tabs` error; a Devframe record not named `conciv` is ignored; an engine whose token file is
  wrong lands in `unreachable`.
- `packages/extensions/page` existing browser test file: `route` returns `title` and `state`.
- Widget: existing app browser test file: the button shows with a temp config lacking `conciv`, copies the install
  line, and is absent once `mcpServers.conciv` exists. The launch-menu ITs are deleted with the feature.

Tests never touch the real `~/.devframe`, `~/.conciv` or `~/.claude.json`.

## Changeset

One patch changeset naming `@conciv/cli`.

## Acceptance (Fable runs these live before calling it done)

1. Run the copied install line. Start the tanstack-start example and `apps/conciv`, one tab each. In a Claude
   session in `~`: "find the conciv session in my tanstack project" picks the tanstack tab and says so.
2. Two tabs of one project on different pages: the same request makes Claude ask which, naming the URLs.
3. Restart that dev server: the next call on the chosen tab still works.
4. Kill a dev server: it disappears from `list_tabs`.
5. A call from the outside session shows in that tab's widget transcript with the external marker.
6. Remove `mcpServers.conciv` from `~/.claude.json`: the button comes back.
