# cli/src

## Overview

The `conciv` CLI, routed with `@bomb.sh/router`. Three top-level commands: `init`, which sets up a project, `tools`, which inspects and drives a running conciv engine over oRPC, and `auth`, which manages trusted browsers. `run.ts` parses argv with the router and switches on the result: help prints the router's usage, version prints the CLI version, a parse failure becomes one JSON error envelope with a suggested fix, and an execute intent runs the handler attached to the route and prints one JSON envelope (`{ok,data}` or `{ok:false,error}`).

## Interface

- `main` (`main.ts`): root route 'conciv' with `version(package.json version)` and children {tools, init, auth}
- `conciv init` (`init.ts`): `initCommand` with toggles --yes, --dry-run, --force, --json (all default false)
- `runInitCommand(options, overrides)` (`init.ts`): runs `runInit`; with --json it uses `silentOutput()` and returns {steps,next} or {dryRun:true,plan}; without --json exits 1 on refused or cancelled
- `conciv auth revoke [ID] [--all]` (`auth.ts`): `runRevoke` lists, revokes one or revokes every trusted browser
- `conciv tools` (`tools.ts`): `toolsRoute`, whose children come from the running engine's registry catalog through `dynamic()`: one group per tool-name prefix (`page_snapshot` is `page snapshot`, `acme_beacon` is `acme beacon`), a `react` view of the `page_*` tools in category 'react', and one command per prefix-less tool
- `conciv tools server <op>` (`server.ts`): the catalog's `server_*` tools, each calling `rpc.server[op]` (`callServerOperation`)
- `conciv tools open <file>` (`open.ts`): the catalog's `open` tool with `file` as its positional; validates with `EditorOpenInputSchema` and calls `rpc.editor.open`
- `conciv tools page changes [--clear]` (`page.ts`): `pageChangesCommand`, added to the `page` group; calls `rpc.page.changes` or `rpc.page.clearChanges`
- every other group verb calls `rpc.registry.call({name, input})`
- `envelopeFlag` (`envelope.ts`): the --json toggle accepted on every route that does not declare its own `json`
- `runCli(app, argv)` (`run.ts`): parses, resumes the catalog checkpoint with the live catalog, prints help/version or runs the handler, returns an exit code
- `routeFailure` (`arguments.ts`): turns the router's method-not-allowed / unprocessable-content result into a user error envelope
- `handler` / `handlerOf` (`router/handler.ts`): attach a run function to a route definition and read it back from the parsed intent
- `wireToolCommand` (`tool-command.ts`): turns a catalog entry's JSON input schema into a router command (positional `argument`, boolean `toggle`, array `multiple()` option, every other field an `option` with a Standard Schema)
- `toolGroupRoute` (`tool-group.ts`): noun route with one verb per catalog entry (the verb is the name after the first `_`)
- `runRpc` (`request.ts`): oRPC call with the session header
- `engineOrigin(cwd, env)` (`engine-origin.ts`): http://127.0.0.1:&lt;port&gt;
- `writeOutcome` / `writeFailure` / `CliOutcome` (`envelope.ts`); `userFailure` / `failureOf` (`failure.ts`); `closest` (`suggest.ts`)
- Subdirectories:
  - init: [./init/README.md](./init/README.md) - the `conciv init` pipeline

## Invariants

- `routeFailure` (`arguments.ts`): a route without a command is 'No command given', an unknown word under a route with children is 'Unknown command' with a `closest` suggestion, an unknown flag is 'Unknown flag' with 'Did you mean --x?', a positional passed as a flag says how to pass it, an extra word is 'Unexpected argument', and a schema issue is prefixed with the flag or `<ARG>` it belongs to
- option flags accept both the camelCase and the kebab-case spelling of the field name; toggles accept `--x` and `--no-x`; arguments after `--` are not bound
- `-h`/`--help` and `-v`/`--version` are claimed by the router anywhere in argv; only the root supports version
- `settle` (`run.ts`): every `dynamic()` increment is resumed with the live catalog before help, version or execute is decided; with no engine running, `conciv tools ...` (help included) fails with the 'No conciv dev server' envelope
- the CLI carries no tool declarations of its own: no `@conciv/extension*` or `@conciv/tools` import, guarded by the dependency-closure and prod-closure tests
- `failureOf` (`failure.ts`): tagged errors become user errors; anything else is 'unexpected' with a bug-report hint
- `declaredSessionId` (`request.ts`): an invalid CONCIV_SESSION_ID throws a user failure
- `servedOutcome` (`request.ts`): oRPC-defined errors and 4xx responses become user failures; network failures are offline and `runRpc` throws 'No conciv dev server on &lt;host&gt;'
- `ServerStateSchema` (`engine-origin.ts`): port must be an integer 1-65535; lookup order CONCIV_PORT, .conciv/server.json in cwd or an ancestor, then 5173
- `validInput` (`tool-command.ts`): zod tool input is validated again as a whole object with the tool's inputSchema
- `callOperation` (`server.ts`): throws when rpc.server[op] is not a function

## Side Effects

- `bin.ts`: sets NO_COLOR=1 when stdout is not a TTY and FORCE_COLOR is unset; runs only when invoked directly; sets process.exitCode
- `writeOutcome` / `writeFailure` (`envelope.ts`): write JSON to stdout
- `runCli` (`run.ts`): prints usage (the router's plain `printHelp`) or the version with console.log
- `runRpc` (`request.ts`): network oRPC calls to the engine; read CONCIV_SESSION_ID and cache the resolved session id
- `engineOrigin` (`engine-origin.ts`): reads CONCIV_PORT and .conciv/server.json walking up from cwd
- `liveCatalog` (`run.ts`): calls rpc.registry.catalog when argv reaches `conciv tools`
- `existingPath` (`tool-command.ts`): existsSync for path-format arguments
- `runInitCommand` (`init.ts`): runs the init pipeline, which writes files and installs packages

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
