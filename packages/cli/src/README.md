# cli/src

## Overview

The `conciv` CLI, routed with `@bomb.sh/router` (`main.ts`, `run.ts`). Five top-level commands: `init`, which sets up a
project (see [init/README.md](./init/README.md)), `tools`, which inspects and drives a running conciv engine over oRPC,
`auth`, which logs browsers in and manages the trusted ones, `mcp`, which connects outside agents to conciv and runs the
MCP server they use (`hub.ts`), and `plugin`, which calls a plugin's RPC methods on the running engine. Every engine
call goes through the typed oRPC client from `@conciv/client` (`makeRpcClient`). A parse failure becomes one JSON error
envelope with a suggested fix.

## Invariants

- The CLI carries no tool declarations of its own: `conciv tools` builds its commands from the running engine's
  registry catalog (`registry.catalog`), one group per tool-name prefix (`page_snapshot` is `page snapshot`) plus the
  fixed `tabs` command; every group verb calls `registry.call` (`tools.ts`). With no engine running, `conciv tools ...`
  (help included) fails with the `No conciv dev server` envelope.
- Engine lookup (`engine-origin.ts`): with `--tab`, the live engine whose core tab list (`tabs.list`) has the tab open, else a user
  failure naming the tab; otherwise `CONCIV_PORT`, `.conciv/server.json` in cwd or an ancestor, the most recently
  registered live engine in the home db (`CONCIV_HOME`), then port 5173. The home db is checked with 300 ms
  (`PROBE_MS`), and engines that stayed silent are asked once more with `ENGINE_READ_MS` (2 s) before the CLI reports
  `<root> did not answer (<error>)` (`engine-read.ts`).
- Outside calls ask first: a `--tab` call, or one to an engine found through the home db, carries `conciv-origin: hub`
  and `conciv-client: <agent>`, where the agent is the first harness whose `hub.shellEnv` is set in the CLI's env
  (`CLAUDECODE`, `CODEX_THREAD_ID`, `GEMINI_CLI`, `OPENCODE`), else `terminal`, so the engine asks the user for Allow
  and refuses a disconnected agent (`request.ts`). `conciv plugin call` and `conciv auth link` send none of these
  headers: the terminal calls as the owner.
- `conciv mcp serve --agent <agent>` is the stdio MCP server each harness's `hub.add` installs (`serve-argv.ts`:
  `npx -y @conciv/cli@<this version> mcp serve --agent <agent>`). It offers exactly three tools: `list_tabs`,
  `execute_typescript` and `discover_tools` (the last two with an optional `tab`). A tab open nowhere answers
  `TAB_NOT_OPEN: tab <id> is not open; call list_tabs` only when every engine answered; otherwise the reply names each
  engine that did not answer and runs nothing.
- The hub re-sends a call only when nothing ran: a connection refused (`ECONNREFUSED`) or `UNAUTHORIZED` (an engine
  restarted with a new token) is sent once more after a fresh pick; any other transport failure is never re-sent,
  since the block may already have acted on a page (`hub.ts`).
- Work a plugin started for the hub is reported once: each reply on a tab leads with the tab's undelivered core
  outside notices (`sessions.outsideNotices`), and a client that negotiated MCP tasks gets a task for the calls core
  still lists as pending, which completes once none of them are (`hub.ts`).
- `conciv mcp disconnect` revokes like the widget's: the disconnect it records in the home db voids every running
  engine's outside Allow (`mcp.ts`, `@conciv/harness/init/hub`).
- Errors: oRPC-defined errors, 4xx responses and an `APPROVAL_DENIED` refusal become user failures with no stack or
  bug hint; network failures read `No conciv dev server on <host>.`; any other error is 'unexpected' with a bug-report
  hint (`request.ts`, `failure.ts`). Unknown commands and flags name the closest match (`arguments.ts`).
- Option flags accept camelCase and kebab-case; toggles accept `--x` and `--no-x`; arguments after `--` are not bound;
  `-h`/`--help` and `-v`/`--version` are claimed anywhere in argv, and only the root supports version.

## Side Effects

- `bin.ts` sets `NO_COLOR=1` when stdout is not a TTY and `FORCE_COLOR` is unset, and sets `process.exitCode`.
- Reads `CONCIV_PORT`, `CONCIV_SESSION_ID`, `.conciv/server.json` walking up from cwd and the home db.
- `conciv mcp serve` serves on stdio until stdin ends; `conciv mcp connect` / `disconnect` run the agent CLI's own
  `hub.add` / `hub.remove` and write the home db.
- `conciv init` writes files and installs packages.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its
  dependencies first)
