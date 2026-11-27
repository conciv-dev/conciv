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

## Drive the app

```bash
conciv tools --help
```

`conciv tools` is self-describing, and it finds your running dev server itself: no MCP config, no
addresses. Every tool group comes from the server's live tool catalog, so a plugin's tools appear
as soon as the server loads it; the CLI itself ships no plugin code.

- `conciv tools page` - read and drive the live page; `--help` lists every capability
- `conciv plugin call server <method>` - inspect the dev server (`config`, `urls`, `resolve`, `graph`, `transform`) or open a file in the user's editor (`open`); pass the input with `--data '<json>'`
- `conciv tools tabs` - list every open conciv tab on this machine, from any folder

Add `--tab <id>` (an id from `conciv tools tabs`) to any command to act on that tab, on whichever dev
server holds it.

## Who is asked

Some tools ask first: running code in the page,
clearing or deleting on the whiteboard, resolving or deleting comments, building or running the iOS app.
Restarting the dev server is the agent's `server_restart` tool and it asks too; the terminal has no restart
command, so restart your own dev server in your terminal. Who is asked depends on how the CLI found the dev
server:

- Inside the project, the CLI acts on your latest chat (an agent conciv started acts on its own).
  Unless a rule already covers the call, an asking tool shows the permission card in the tab and the
  command waits on it, with no timeout: Allow once runs it, Deny fails it with `APPROVAL_DENIED`, and
  leaving the command (Ctrl-C) stops the wait. Each call asks again.
- With `--tab`, the CLI is an outside agent that named its tab; an asking tool waits on its permission card
  the same way.
- With no `.conciv/server.json` in this folder or a parent and no `CONCIV_PORT`, the CLI uses the most
  recently started dev server on this machine and acts on that server's latest chat. It is an outside
  agent that named no tab, so an asking tool still shows the permission card in the tab, on the same
  terms as inside the project. A
  `.conciv/server.json` left over from a stopped server still counts: the CLI uses it and fails with
  `No conciv dev server on 127.0.0.1:<port>.`

Outside agents get one more card only when the project sets `hubAccess` to `'project'`; the call
waits for the answer with no timeout. Allow once admits that call; Allow always saves a project rule,
so later calls in every tab run with no card. A deny refuses that call only; the next call asks again.
The default, `'open'`, asks nothing.

Whoever holds the engine's token is the owner. The CLI reads it from the project's `.conciv` folder,
and conciv hands it to the agents it starts. The permission cards guard against the model's
mistakes inside a chat turn, not against another program running as you on this machine. The engine
listens on this machine only.

These commands, and their `--help`, need the dev server running; without one they print the
"No conciv dev server" error with how to start it. Every command prints one JSON document on stdout
(`{"ok":true,"data":...}` or `{"ok":false,"error":...}`); `--help` prints usage instead and
`conciv --version` (or `-v`) prints the CLI version.

## Headless and CI

With nobody at the tab to answer a permission card, decide ahead of time in the options of the conciv
plugin in your bundler config:

```ts
conciv({permission: {page_eval: 'allow'}})
```

`permission` takes three short forms: one effect for every tool (`permission: 'allow'`), one effect
per tool (`permission: {page_eval: 'deny'}`), or one effect per tool and resource
(`permission: {page_eval: {'document.title': 'allow'}}`). `permissions` takes the full rules,
`[{action, resource, effect}]`, with `allow`, `deny` or `ask` as the effect. The short forms come
first and `permissions` after them; when two rules match, the later one wins.

These rules are a project default for every agent. Approvals given in the tab come after them, and
the page's own guard comes after both: a rule in these options never opens the page tools to a chat whose tab
has not connected. A blanket allow (`permission: 'allow'`, or a rule whose action is `*`) does not
switch a tool's own ask off: the rule must name the action, `permission: {page_eval: 'allow'}`.

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

The package root of `@conciv/cli`: the `conciv` binary, built by `vite build` from `src/bin.ts` into ESM,
`dist/bin.js`, that the build marks executable. The package has no library API. The commands, their argument checks,
the JSON envelopes and the engine calls are in [src](./src/README.md).

## Invariants

- `dist/bin.js` must be executable, or the `conciv` bin does not run (`scripts.build` runs `chmod +x`).
- `types: false` (`vite.config.ts`): the router's inferred route types cannot be named in a `.d.ts`, so no types ship.
- Every pure-JS dependency is a devDependency and is bundled into `dist/bin.js`; only the native `@ast-grep/napi` stays
  a runtime dependency (the `onlyImport` plugin in `vite.config.ts` fails the build on any other import). The harness
  runtime and the agent SDKs are never bundled (`external`), so reaching one fails the build.

## Side Effects

- `scripts.build`: writes `dist/` and changes the mode of `dist/bin.js`.

## Verification

- `turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first).
