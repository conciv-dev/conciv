# @conciv/harness-testkit

## Overview

Package root for `@conciv/harness-testkit`. `package.json` exports the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`.

## Product path

The testkit runs the real product path and fakes only the expensive externals, the LLM harness and the agent CLIs. A helper talks to the engine the way the product caller it stands in for does: a browser caller goes through the product's browser transport, the partysocket `/rpc-ws` socket from `@conciv/contract`, and a node caller (the CLI, an MCP agent) uses HTTP `/rpc` or `/api/mcp`. Interception observes or faults calls but never swaps the transport.

## Interface

- `package.json:exports` - `.` (`src/testkit.ts`), `./until`, `./login`, `./rpc-mounts`.
- `./login` reads the local engine's port and token from the project's `.conciv/server.json` to build the authenticated engine URL and mint a login code or trusted browser token.
- `vitest.config.ts` - `ciTest()` with the `node` environment.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- The package root (configs and manifest) has none. At runtime `setup` creates a `conciv-kit-*` temp state root and boots an engine; `cleanup` removes it. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness-testkit` from the repo root (turbo builds the package and its dependencies first)
