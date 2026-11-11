# cli/src

## Overview

The `conciv` CLI, routed with `@bomb.sh/router`. Four top-level commands: `init`, which sets up a project, `tools`, which inspects and drives a running conciv engine over oRPC, `auth`, which manages trusted browsers, and `mcp`, which connects outside agents to conciv and runs the MCP server they use. `run.ts` parses argv with the router and switches on the result: help prints the router's usage, version prints the CLI version, a parse failure becomes one JSON error envelope with a suggested fix, and an execute intent runs the handler attached to the route and prints one JSON envelope (`{ok,data}` or `{ok:false,error}`).

## Interface

- `main` (`main.ts`): root route 'conciv' with `version(package.json version)` and children {tools, init, auth, mcp}
- `conciv init` (`init.ts`): `initCommand` with toggles --yes, --dry-run, --force, --json (all default false)
- `runInitCommand(options, overrides)` (`init.ts`): runs `runInit`; with --json it uses `silentOutput()` and returns {steps,next} or {dryRun:true,plan}; without --json exits 1 on refused or cancelled
- `conciv mcp` (`mcp.ts`): `mcpRoute`, the group holding `serve`, `connect`, `disconnect` and `list`; `<agent>` is `HubAgentSchema` (`hub-agent.ts`): an init harness id whose init contribution has a `hub` (claude, codex, gemini-cli, opencode)
- `conciv mcp serve --agent <agent>` (`hub.ts`): `serveCommand`, an MCP server on stdio for outside agents with exactly two tools, `execute_typescript` and `discover_tools`, each with the engine's input plus an optional `tab` (zod `SessionId`). Every call to an engine goes through the typed oRPC contract (`makeRpcClient(apiBase)` from `@conciv/contract`, the `/rpc/*` fetch link, responses validated against the contract): `execute_typescript` is `code.execute`, `discover_tools` is `code.discover`, the tool descriptions are the runner's `code.describe` at startup (else fixed text naming `external_tabs({})` and the `tab` input). With `tab` the call goes to the engine holding that tab (`tabs.get` on every live engine in parallel, 300 ms, sent without hub headers so a probe never asks for consent) with `sessionId: <tab>`, `conciv-origin: hub` and `conciv-client: <agent>`, so it runs on that tab's session path; the hub keeps one entry per tab (its owner's rpc client, and whether the tab's instructions were sent) and looks up again only when the owner fails at the transport or answers with an error while it says the tab is not open; the first reply for a tab leads with the tab's instructions as a text part; a tab open nowhere answers `TAB_NOT_OPEN: tab <id> is not open; call external_tabs({})` only when every engine answered its probe; when no engine has it and a probe failed (an error answer, an engine without `tabs.get` or with an answer outside the contract, which is named 'engine too old; upgrade its @conciv packages', a transport error or timeout) the reply names each failing engine root and why instead, while a tab one engine reports open runs there whatever the others answered; one open on two engines names both roots. Without `tab` the call goes to its runner with no `sessionId` (the engine's outside run): the live engine registered longest ago in the conciv home db (`checkEngines`, 300 ms), picked at startup and kept, with no probe per call. On either path a call refused at connect (`cause.code === 'ECONNREFUSED'`, so nothing ran, e.g. a restarted dev server) is sent once, silently, after a fresh pick; any other transport failure is never re-sent (the block may already have acted on a page): the reply names the engine that failed and says nothing was retried; an error the engine answers (refusal, too old) becomes an `isError` reply. The hub formats the typed `code.execute` result into MCP content itself, with no parsing: the finished-queue notices lead (`queue <id> <status>: <n> played, <n> failed` and the result JSON), then `{result, logs}` as JSON text with images split out as image blocks (or the content parts as they are), or `{error, logs?}` as an error. A client that negotiated the MCP tasks extension and whose `code.execute` result lists `queued` queues gets a task (`taskId` the hub's own id for that call's queues); `tasks/get` polls `page.queue.wait({waitMs: 0})` for each and answers `completed` with every outcome appended once all are final, else `working` (a failed poll keeps the task working); `withTaskName` copies a `tasks/*` request's `params.taskId` into its `Mcp-Name` header (ponytail: `@tanstack/ai-mcp` 1.1.0 `serveMCPStdio` mirrors `Mcp-Name` only for `tools/call`, `prompts/get` and `resources/read`; delete `withTaskName` once ai-mcp mirrors the task id); this is the command each harness's `hub.add` installs (`serveArgv`, `serve-argv.ts`: `npx -y @conciv/cli@<this version> mcp serve --agent <agent>`)
- `conciv mcp connect <agent>` / `disconnect <agent>` / `list` (`mcp.ts`): `createHubConnections(concivHome)` from `@conciv/harness-init/hub`; connect runs the agent CLI's `hub.add` with `serveArgv` and records the connection, disconnect forgets it then runs `hub.remove` best-effort (opencode has none; the envelope's `note` says what was left behind), list prints `[{harness, name, connectedAt}]`; a failed connect or disconnect is a user error envelope. A CLI disconnect revokes like the widget's: the disconnect time it records in the home db voids every running engine's outside Allow
- `conciv auth revoke [ID] [--all]` (`auth.ts`): `runRevoke` lists, revokes one or revokes every trusted browser
- `conciv tools` (`tools.ts`): `toolsRoute`, whose children come from the running engine's registry catalog through `dynamic()`: one group per tool-name prefix (`page_snapshot` is `page snapshot`, `acme_beacon` is `acme beacon`), a `react` view of the `page_*` tools in category 'react', and one command per prefix-less tool (`open`, and `tabs`: the registry `tabs` tool, every open tab of every live engine)
- `conciv tools server <op>` (`server.ts`): the catalog's `server_*` tools, each calling `rpc.server[op]` (`callServerOperation`)
- `conciv tools open <file>` (`open.ts`): the catalog's `open` tool with `file` as its positional; validates with `EditorOpenInputSchema` and calls `rpc.editor.open`
- `conciv tools page changes [--clear]` (`page.ts`): `pageChangesCommand`, added to the `page` group; calls `rpc.page.changes` or `rpc.page.clearChanges`
- every other group verb calls `rpc.registry.call({name, input})`
- `envelopeFlag` (`envelope.ts`): the --json toggle accepted on every route that does not declare its own `json`
- `tabFlag` (`tab-flag.ts`): `--tab <id>`, zod-parsed as `SessionId`, declared on the root, the tools routes and every tool command that does not declare its own `tab`; `runCli` refuses route models whose `tab`s differ from the flagged one and hands handlers a `CliTarget`
- `runCli(app, argv)` (`run.ts`): parses, resumes the catalog checkpoint with the live catalog, prints help/version or runs the handler, returns an exit code
- `routeFailure` (`arguments.ts`): turns the router's method-not-allowed / unprocessable-content result into a user error envelope
- `handler` / `handlerOf` (`router/handler.ts`): attach a run function to a route definition and read it back from the parsed intent
- `wireToolCommand` (`tool-command.ts`): turns a catalog entry's JSON input schema into a router command (positional `argument`, boolean `toggle`, array `multiple()` option, every other field an `option` with a Standard Schema)
- `toolGroupRoute` (`tool-group.ts`): noun route with one verb per catalog entry (the verb is the name after the first `_`)
- `runRpc(target, call)` (`request.ts`): oRPC call with the session header; with a `--tab` the session is that tab; with `--tab` or an engine found through the home db fallback the call carries `conciv-origin: hub` and `conciv-client: <agent>`, where the agent is the first init harness whose `hub.shellEnv` is set in the CLI's env (`CLAUDECODE`, `CODEX_THREAD_ID`, `GEMINI_CLI`, `OPENCODE`), else `terminal`, so that engine asks the user before it runs and refuses a disconnected agent
- `engineOrigin(cwd, env, tab)` (`engine-origin.ts`, async): `{origin, outside}`; origin is http://127.0.0.1:&lt;port&gt; or a live engine's `apiBase`; `outside` is true when the engine was found through `--tab` or the home db fallback, and `runRpc` then sends `conciv-origin: hub` and `conciv-client: <agent>` (see `runRpc`) so that engine asks the user first
- `writeOutcome` / `writeFailure` / `CliOutcome` (`envelope.ts`); `userFailure` / `failureOf` (`failure.ts`); `closest` (`suggest.ts`)
- Subdirectories:
  - init: [./init/README.md](./init/README.md) - the `conciv init` pipeline

## Invariants

- `routeFailure` (`arguments.ts`): a route without a command is 'No command given', an unknown word under a route with children is 'Unknown command' with a `closest` suggestion, an unknown flag is 'Unknown flag' with 'Did you mean --x?', a positional passed as a flag says how to pass it, an extra word is 'Unexpected argument', and a schema issue is prefixed with the flag or `<ARG>` it belongs to
- option flags accept both the camelCase and the kebab-case spelling of the field name; toggles accept `--x` and `--no-x`; arguments after `--` are not bound
- `-h`/`--help` and `-v`/`--version` are claimed by the router anywhere in argv; only the root supports version
- `settle` (`run.ts`): every `dynamic()` increment is resumed with the live catalog of the target engine before help, version or execute is decided; with no engine running, `conciv tools ...` (help included) fails with the 'No conciv dev server' envelope; the catalog target is the first `--tab` in argv before `--` (root, tools route, group route or after the verb), and the handler runs on that same tab; a parsed `--tab` that differs from it fails as a user error
- the CLI carries no tool declarations of its own: no `@conciv/extension*` or `@conciv/tools` import, guarded by the dependency-closure and prod-closure tests
- `failureOf` (`failure.ts`): tagged errors become user errors; anything else is 'unexpected' with a bug-report hint
- `declaredSessionId` (`request.ts`): an invalid CONCIV_SESSION_ID throws a user failure
- `servedOutcome` (`request.ts`): oRPC-defined errors, 4xx responses and an `APPROVAL_DENIED` refusal (the user declined, or the agent is disconnected) become user failures, printed with the message and no stack or bug hint; network failures are offline and `runRpc` throws 'No conciv dev server on &lt;host&gt;'
- `ServerStateSchema` (`engine-origin.ts`): port must be an integer 1-65535; lookup order: with `--tab` the live engine whose `tabs.get` says open (else a user failure naming the tab); otherwise CONCIV_PORT, .conciv/server.json in cwd or an ancestor, the most recently registered live engine in the home db (`CONCIV_HOME`), then 5173
- `callOperation` (`server.ts`): throws when rpc.server[op] is not a function

## Side Effects

- `hub.ts`: reads the conciv home db and probes each engine's `/health` per call; keeps one MCP client per runner `apiBase`, dropped on a transport error or when the runner changes; with no live engine a call answers an MCP error naming the home folder; serves until stdin ends

- `bin.ts`: sets NO_COLOR=1 when stdout is not a TTY and FORCE_COLOR is unset; runs only when invoked directly; sets process.exitCode
- `writeOutcome` / `writeFailure` (`envelope.ts`): write JSON to stdout
- `runCli` (`run.ts`): prints usage (the router's plain `printHelp`) or the version with console.log
- `runRpc` (`request.ts`): network oRPC calls to the engine; read CONCIV_SESSION_ID and cache the resolved session id
- `engineOrigin` (`engine-origin.ts`): reads CONCIV_PORT and .conciv/server.json walking up from cwd, then the home db and each live engine's `tabs.get`
- `liveCatalog` (`run.ts`): calls rpc.registry.catalog on the target engine when argv reaches `conciv tools`
- `existingPath` (`tool-command.ts`): existsSync for path-format arguments
- `runInitCommand` (`init.ts`): runs the init pipeline, which writes files and installs packages

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
