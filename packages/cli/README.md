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
server holds it.

## Who is asked

Some tools ask first: running code in the page, reloading or restarting the dev server, clearing or
deleting on the whiteboard, resolving or deleting comments, building or running the iOS app. Who is
asked depends on how the CLI found the dev server:

- Inside the project, the CLI acts on your latest chat (an agent conciv started acts on its own).
  Unless an earlier approval still covers the call, an asking tool shows the Approve card in the tab,
  and the CLI gets an error saying the call needs the user. Run the command again once they approve.
  For these tools the card offers Approve and Deny: one Approve lets exactly one later call of that
  tool through; after that, or after a Deny (which is not kept), the next call asks again. An Approve
  given inside a chat turn does not carry over to the CLI.
- With `--tab`, the CLI is an outside agent that named its tab. Nobody is asked: an asking tool runs
  with no Approve card.
- With no `.conciv/server.json` in this folder or a parent and no `CONCIV_PORT`, the CLI uses the most
  recently started dev server on this machine and acts on that server's latest chat. It is an outside
  agent that named no tab, so an asking tool still shows the Approve card in the tab, on the same
  terms as inside the project. A
  `.conciv/server.json` left over from a stopped server still counts: the CLI uses it and fails with
  `No conciv dev server on 127.0.0.1:<port>.`

Outside agents get one more card only when the project sets `hubAccess` to `'session'` (an Allow card
per tab) or `'project'` (one for the whole project); the call waits for the answer. Once the user
allows, later calls run with no card until an agent is disconnected from conciv, which asks again.
Once the user denies, later calls are refused with no card until they choose Allow outside agents in
the tab. The default, `'open'`, asks nothing.

Whoever holds the engine's token is the owner. The CLI reads it from the project's `.conciv` folder,
and conciv hands it to the agents it starts. The Approve and Allow cards guard against the model's
mistakes inside a chat turn, not against another program running as you on this machine. The engine
listens on this machine only.

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
