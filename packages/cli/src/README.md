# cli/src

## Overview

The `conciv` CLI, routed with `@bomb.sh/router`. Three top-level commands: `init`, which sets up a project, `tools`, which inspects and drives a running conciv engine over oRPC, and `auth`, which manages trusted browsers. `run.ts` parses argv with the router and switches on the result: help prints the router's usage, version prints the CLI version, a parse failure becomes one JSON error envelope with a suggested fix, and an execute intent runs the handler attached to the route and prints one JSON envelope (`{ok,data}` or `{ok:false,error}`).

## Interface

- `main` (`main.ts`): root route 'conciv' with `version(package.json version)` and children {tools, init, auth, mcp}
- `conciv init` (`init.ts`): `initCommand` with toggles --yes, --dry-run, --force, --json (all default false)
- `runInitCommand(options, overrides)` (`init.ts`): runs `runInit`; with --json it uses `silentOutput()` and returns {steps,next} or {dryRun:true,plan}; without --json exits 1 on refused or cancelled
- `conciv mcp` (`hub.ts`): `mcpCommand`, an MCP server on stdio for outside agents with exactly two tools, `execute_typescript` and `discover_tools`, each call forwarded unchanged to the `/api/mcp` of the most recently registered live engine in the conciv home db (`checkEngines`) with `conciv-origin: hub` and `conciv-client: <MCP client name>`; tool descriptions come from that engine's `tools/list` at startup, else fixed text naming `external_tabs({})` and `external_use_tab({id})`
- `conciv auth revoke [ID] [--all]` (`auth.ts`): `runRevoke` lists, revokes one or revokes every trusted browser
- `conciv tools` (`tools.ts`): `toolsRoute` with children {server, page, react, design, open, tabs}; `conciv tools tabs` is the registry `tabs` tool (every open tab of every live engine)
- `conciv tools server <op>` (`server.ts`): one command per BUILTIN_SERVER_TOOLS entry (config, urls, resolve, graph, transform, reload, restart), each calling `rpc.server[op]`
- `conciv tools open <file>` (`open.ts`): from BUILTIN_OPEN_TOOL; calls `rpc.editor.open`
- `conciv tools page <verb>` (`page.ts`): one verb per live catalog entry named `page_*`, offline fallback to PAGE_TOOL_DEFS; calls `rpc.registry.call({name, input})`
- `conciv tools page changes [--clear]` (`page.ts`): calls `rpc.page.changes` or `rpc.page.clearChanges`
- `conciv tools react <verb>` (`page.ts`): `page_*` tools in category 'react'
- `conciv tools design <verb>` (`tools.ts`): `design_*` tools, offline fallback DESIGN_TOOL_DEFS
- `envelopeFlag` (`envelope.ts`): the --json toggle accepted on every route that does not declare its own `json`
- `tabFlag` (`tab-flag.ts`): `--tab <id>`, zod-parsed as `SessionId`, declared on the root, the tools routes and every tool command that does not declare its own `tab`; `runCli` takes the first `tab` from any route model and hands handlers a `CliTarget`
- `runCli(app, argv)` (`run.ts`): parses, resumes catalog checkpoints, prints help/version or runs the handler, returns an exit code
- `routeFailure` (`arguments.ts`): turns the router's method-not-allowed / unprocessable-content result into a user error envelope
- `handler` / `handlerOf` (`router/handler.ts`): attach a run function to a route definition and read it back from the parsed intent
- `toolCommand` / `wireToolCommand` (`tool-command.ts`): turn a zod or wire JSON schema into a router command (positional `argument`, boolean `toggle`, array `multiple()` option, every other field an `option` with a Standard Schema)
- `toolGroupRoute` / `liveCatalog` (`tool-group.ts`): noun route whose verbs come from the live registry catalog through `dynamic()`
- `runRpc(target, call)` / `runRpcWhenServing(target, call)` (`request.ts`): oRPC call with the session header; with a `--tab` the session is that tab; with `--tab` or an engine found through the home db fallback the call carries `conciv-origin: hub` and `conciv-client: cli`, so that engine asks the user before it runs; the second returns null when offline
- `engineOrigin(cwd, env, tab)` (`engine-origin.ts`, async): `{origin, outside}`; origin is http://127.0.0.1:&lt;port&gt; or a live engine's `apiBase`; `outside` is true when the engine was found through `--tab` or the home db fallback, and `runRpc` then sends `conciv-origin: hub` and `conciv-client: cli` so that engine asks the user first
- `writeOutcome` / `writeFailure` / `CliOutcome` (`envelope.ts`); `userFailure` / `failureOf` (`failure.ts`); `closest` (`suggest.ts`)
- Subdirectories:
  - init: [./init/README.md](./init/README.md) - the `conciv init` pipeline

## Invariants

- `routeFailure` (`arguments.ts`): a route without a command is 'No command given', an unknown word under a route with children is 'Unknown command' with a `closest` suggestion, an unknown flag is 'Unknown flag' with 'Did you mean --x?', a positional passed as a flag says how to pass it, an extra word is 'Unexpected argument', and a schema issue is prefixed with the flag or `<ARG>` it belongs to
- option flags accept both the camelCase and the kebab-case spelling of the field name; toggles accept `--x` and `--no-x`; arguments after `--` are not bound
- `-h`/`--help` and `-v`/`--version` are claimed by the router anywhere in argv; only the root supports version
- `settle` (`run.ts`): every `dynamic()` increment is resumed with `liveCatalog(target)` before help, version or execute is decided; the catalog target is the first `--tab` in argv before `--` (root, tools route, group route or after the verb), and the handler runs on that same tab; a parsed `--tab` that differs from it fails as a user error
- `failureOf` (`failure.ts`): tagged errors become user errors; anything else is 'unexpected' with a bug-report hint
- `declaredSessionId` (`request.ts`): an invalid CONCIV_SESSION_ID throws a user failure
- `servedOutcome` (`request.ts`): oRPC-defined errors and 4xx responses become user failures; network failures are offline and `runRpc` throws 'No conciv dev server on &lt;host&gt;'
- `ServerStateSchema` (`engine-origin.ts`): port must be an integer 1-65535; lookup order: with `--tab` the live engine whose `/api/tabs?session=` says open (else a user failure naming the tab); otherwise CONCIV_PORT, .conciv/server.json in cwd or an ancestor, the most recently registered live engine in the home db (`CONCIV_HOME`), then 5173
- `validInput` (`tool-command.ts`): zod tool input is validated again as a whole object with the tool's inputSchema
- `verbCommands` (`tool-group.ts`): an empty capability list throws 'the running server declares no &lt;group&gt; capabilities'
- `callOperation` (`server.ts`): throws when rpc.server[op] is not a function

## Side Effects

- `hub.ts`: reads the conciv home db and probes each engine's `/health` per call; keeps one MCP client per runner `apiBase`, dropped on a transport error or when the runner changes; with no live engine a call answers an MCP error naming the home folder; serves until stdin ends

- `bin.ts`: sets NO_COLOR=1 when stdout is not a TTY and FORCE_COLOR is unset; runs only when invoked directly; sets process.exitCode
- `writeOutcome` / `writeFailure` (`envelope.ts`): write JSON to stdout
- `runCli` (`run.ts`): prints usage (the router's plain `printHelp`), the offline note, or the version with console.log
- `runRpc` / `runRpcWhenServing` (`request.ts`): network oRPC calls to the engine; read CONCIV_SESSION_ID and cache the resolved session id
- `engineOrigin` (`engine-origin.ts`): reads CONCIV_PORT and .conciv/server.json walking up from cwd, then the home db and each live engine's `/api/tabs`
- `liveCatalog` (`tool-group.ts`): calls rpc.registry.catalog when argv reaches a tool group route
- `existingPath` (`tool-command.ts`): existsSync for path-format arguments
- `runInitCommand` (`init.ts`): runs the init pipeline, which writes files and installs packages

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
