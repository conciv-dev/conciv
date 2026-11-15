# conciv

The conciv front door. One command sets a project up; after that the same CLI is what coding agents
use to drive the running app.

## Set a project up

```bash
npx @conciv/cli@latest init
```

init detects your bundler, package manager, and installed agent harnesses, then prints the whole
plan and asks once before it writes anything. On approval it installs `@conciv/it`, wires your
config, teaches your agents the conciv CLI through AGENTS.md, and installs the conciv claude plugin.
Anything it cannot do for you comes back as a card with the snippet to paste.

`--yes` approves the plan up front, `--dry-run` prints it and exits, `--json` prints the result as JSON
and never asks (pair it with `--yes` or `--dry-run`). init refuses a dirty git tree; commit first or
pass `--force`. On a terminal it cannot ask in, it refuses unless you pass `--yes` or `--dry-run`.

## Log a browser in

```bash
conciv auth link http://localhost:5173/
conciv auth revoke
conciv auth revoke <id>
conciv auth revoke --all
```

`auth link` prints a link that logs a browser in to the engine without typing the code. `auth revoke`
with no id lists the logged-in browsers; with an id, or `--all`, it logs them out.
See [Logging in](https://conciv.dev/docs/usage/logging-in).

## Connect your agents

```bash
conciv mcp connect claude
conciv mcp disconnect claude
conciv mcp list
```

`mcp connect` adds conciv to an agent CLI (`claude`, `codex`, `gemini-cli` or `opencode`), so that
agent can find and drive your open conciv tabs. `mcp serve --agent <agent>` is the MCP server that
agent runs; `connect` registers it. See [Connect your agents](https://conciv.dev/docs/quick-start/agents).

## Call a plugin method

```bash
conciv plugin call <rpcId> <method> --data '{"word":"hi"}'
conciv plugin call server urls
conciv plugin call experimental.page run --data '{"sessionId":"conciv_...","action":{"type":"text","selector":"h1"}}'
```

Calls a method a plugin registered with `ctx.rpc.register` on the running dev server and prints its
output as `{"ok":true,"data":<output>}`. You name the plugin's RPC id and the method; the CLI does
not list them. `--data` (or `-d`) is the method's input as JSON, checked before anything is sent;
without it the call carries no input. An unknown plugin, an unknown method or a failing method
prints the engine's error and exits 1. It finds the dev server from the project (`CONCIV_PORT`,
then `.conciv/server.json` in this folder or a parent) or, from any other folder, the latest
running one.

## Who is asked

Nobody. The engine token is the one credential, so whoever holds it is the owner: this command
reads the token the dev server wrote and calls as the owner, never as an outside agent. A plugin
method called from here does not ask first; that includes running page script with an `eval`
action. The same action from an agent inside a chat turn still asks the user. The engine refuses
plugin calls, and listing plugins or reading their options, only to callers that announce
themselves as outside, such as agents connected through `conciv mcp`.

Every command prints one JSON document on stdout (`{"ok":true,"data":...}` or
`{"ok":false,"error":...}`); `--help` prints usage instead and `conciv --version` (or `-v`) prints
the CLI version.

Docs: [conciv.dev](https://conciv.dev/docs/quick-start). Part of
[conciv](https://github.com/conciv-dev/conciv).

## Overview

Package root of @conciv/cli, the `conciv` binary, built by tsdown from src/bin.ts into an ESM dist/bin.js that the build marks executable.

## Interface

- `bin.conciv` (`package.json`): ./dist/bin.js
- `exports['./bin']` (`package.json`): ./dist/bin.js is the only export
- `scripts` (`package.json`): build (`tsdown && chmod +x dist/bin.js`), typecheck, lint, test, publint, attw
- `tsdown.config.ts`: entry src/bin.ts, esm, dts false
- `tsconfig.json`: declaration off, matching `dts: false` (the router's inferred route types are not nameable in a .d.ts)
- `vitest.config.ts`: `ciTest()` from @conciv/vitest-config
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - commands, argument validation, JSON envelopes and engine RPC

## Invariants

- `scripts.build` (`package.json`): dist/bin.js must be made executable or the `conciv` bin will not run
- `dts: false` (`tsdown.config.ts`): the package exposes a binary and no library API

## Side Effects

- `scripts.build` (`package.json`): writes dist/ and changes the mode of dist/bin.js

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
