# cli/src

## Overview

The `conciv` CLI, built with citty. Two top-level commands: `init`, which sets up a project, and `tools`, which inspects and drives a running conciv engine over oRPC. Every leaf command returns an outcome written to stdout as one JSON envelope (`{ok,data}` or `{ok:false,error}`); unknown commands and flags, extra positionals and an offline engine are reported as user errors with a suggested fix.

## Interface

- `main` (`main.ts`): root command 'conciv' with subCommands {tools, init}
- `conciv init` (`init.ts`): `initCommand` with --yes, --dry-run, --force, --json (all boolean, default false)
- `runInitCommand(options, overrides)` (`init.ts`): runs `runInit`; with --json it uses `silentOutput()` and returns {steps,next} or {dryRun:true,plan}; without --json exits 1 on refused or cancelled
- `conciv tools` (`tools.ts`): `toolsCommand` with subCommands {server, page, react, design, open}
- `conciv tools server <op>` (`server.ts`): one subcommand per BUILTIN_SERVER_TOOLS entry (config, urls, resolve, graph, transform, reload, restart), each calling `rpc.server[op]`
- `conciv tools open <file>` (`open.ts`): from BUILTIN_OPEN_TOOL; calls `rpc.editor.open`
- `conciv tools page <verb>` (`page.ts`): one verb per live catalog entry named `page_*`, offline fallback to PAGE_TOOL_DEFS; calls `rpc.registry.call({name, input})`
- `conciv tools page changes [--clear]` (`page.ts`): `changesCommand` calls `rpc.page.changes` or `rpc.page.clearChanges`
- `conciv tools react <verb>` (`page.ts`): `page_*` tools in category 'react'
- `conciv tools design <verb>` (`tools.ts`): `design_*` tools, offline fallback DESIGN_TOOL_DEFS
- `ENVELOPE_FLAGS` (`arguments.ts`): --json and --help/-h accepted on every command level
- `runCli(root, rawArgs)` (`run.ts`): resolves the leaf, prints help or validates and runs it, returns an exit code
- `resolveLeaf` / `commandProblem` / `argumentProblem` / `argsOf` (`arguments.ts`)
- `toolCommand` / `wireToolCommand` (`tool-command.ts`): turn a zod or wire JSON schema into a citty command
- `toolGroupCommand` / `groupHelpNote` (`tool-group.ts`): noun command whose verbs come from the live registry catalog
- `runRpc` / `runRpcWhenServing` (`request.ts`): oRPC call with the session header; the second returns null when offline
- `engineOrigin(cwd, env)` (`engine-origin.ts`): http://127.0.0.1:&lt;port&gt;
- `outcomeOf` / `writeOutcome` / `writeFailure` / `CliOutcome` (`envelope.ts`); `userFailure` / `failureOf` (`failure.ts`); `closest` (`suggest.ts`)
- Subdirectories:
  - init: [./init/README.md](./init/README.md) - the `conciv init` pipeline

## Invariants

- `resolveLeaf` (`arguments.ts`): a missing subcommand is 'missing', an unknown one 'unknown' with a `closest` suggestion; flags are validated at every level
- `flagProblem` (`arguments.ts`): rejects unknown flags with 'Did you mean --x?' and positionals passed as flags; accepts `--no` prefixes on booleans
- `positionalProblem` (`arguments.ts`): rejects extra positionals; arguments after `--` are not scanned
- `outcomeOf` (`envelope.ts`): a command must return {report:'json',data} or {report:'none',code}
- `failureOf` (`failure.ts`): tagged errors and citty CLIError become user errors; anything else is 'unexpected' with a bug-report hint
- `declaredSessionId` (`request.ts`): an invalid CONCIV_SESSION_ID throws a user failure
- `servedOutcome` (`request.ts`): oRPC-defined errors and 4xx responses become user failures; network failures are offline and `runRpc` throws 'No conciv dev server on &lt;host&gt;'
- `ServerStateSchema` (`engine-origin.ts`): port must be an integer 1-65535; lookup order CONCIV_PORT, .conciv/server.json in cwd or an ancestor, then 5173
- `toolInput` (`tool-command.ts`): CLI input is validated with the tool's zod inputSchema
- `verbSubCommands` (`tool-group.ts`): an empty capability list throws 'the running server declares no &lt;group&gt; capabilities'
- `callOperation` (`server.ts`): throws when rpc.server[op] is not a function

## Side Effects

- `bin.ts`: sets NO_COLOR=1 when stdout is not a TTY and FORCE_COLOR is unset; runs only when invoked directly; sets process.exitCode
- `writeOutcome` / `writeFailure` (`envelope.ts`): write JSON to stdout
- `runCli` (`run.ts`): prints usage and the offline note on --help
- `runRpc` / `runRpcWhenServing` (`request.ts`): network oRPC calls to the engine; read CONCIV_SESSION_ID and cache the resolved session id
- `engineOrigin` (`engine-origin.ts`): reads CONCIV_PORT and .conciv/server.json walking up from cwd
- `toolGroupCommand` (`tool-group.ts`): calls rpc.registry.catalog when resolving verbs and help
- `castScalar` (`tool-command.ts`): existsSync for path-format arguments
- `runInitCommand` (`init.ts`): runs the init pipeline, which writes files and installs packages

## Verification

- Run: `cd packages/cli && pnpm test`
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
