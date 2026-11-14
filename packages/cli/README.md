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

`--yes` approves the plan up front, `--dry-run` prints it and exits. init refuses a dirty git tree;
commit first or pass `--force`.

## Drive the app

```bash
conciv tools --help
```

`conciv tools` is self-describing, and it finds your running dev server itself: no MCP config, no
addresses. Every tool group comes from the server's live tool catalog, so an extension's tools appear
as soon as the server mounts it; the CLI itself ships no extension code.

- `conciv tools page` - read and drive the live page; `--help` lists every capability
- `conciv tools react` - inspect and edit live React components
- `conciv tools design` - match the live page to a design image (when the design extension is mounted)
- `conciv tools server` - inspect and nudge the dev server; `--help` lists every capability
- `conciv tools open` - open a file in the user's editor
- `conciv tools tabs` - list every open conciv tab on this machine, from any folder

Add `--tab <id>` (an id from `conciv tools tabs`) to any command to act on that tab, on whichever dev
server holds it. The tab's page asks the user to allow the CLI the first time.

These commands, and their `--help`, need the dev server running; without one they print the
"No conciv dev server" error with how to start it. Every command prints one JSON document on stdout
(`{"ok":true,"data":...}` or `{"ok":false,"error":...}`); `--help` prints usage instead and
`conciv --version` (or `-v`) prints the CLI version.

## Call a plugin method

```bash
conciv plugin call <rpcId> <method> --data '{"word":"hi"}'
```

Calls a method a plugin registered with `ctx.rpc.register` on the running dev server and prints its
output as `{"ok":true,"data":<output>}`. You name the plugin's RPC id and the method; the CLI does
not list them. `--data` (or `-d`) is the method's input as JSON, checked before anything is sent;
without it the call carries no input. An unknown plugin, an unknown method or a failing method
prints the engine's error and exits 1. It finds the dev server like `conciv tools` does, from the
project or, from any other folder, the latest running one.

The engine token is the one credential, so whoever holds it is the owner: this command reads the
token the dev server wrote and calls as the owner, never as an outside agent. The engine refuses
plugin calls, and listing plugins or reading their options, only to callers that announce
themselves as outside, such as agents connected through `conciv mcp`.

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
