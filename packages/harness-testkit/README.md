# @conciv/harness-testkit

## Overview

Starts the real conciv engine (`@conciv/core`) on a local port with a scripted AI chat, for tests. The one export is `createHarnessEngine(options)`: a harness author passes the real adapter, and its chat runs through the scripted replies while its models, commands and history stay its own. Without a harness the engine uses a fake one. `@conciv/plugin-testkit` builds its `createEngine` on it.

`package.json` exports the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`. Source: [src](./src/README.md).

## Product path

The engine is the product's own `makeApp`, and the kit talks to it the way the product callers do: turns, settings, sessions and permission answers over the browser socket from `@conciv/contract`, tool calls over `/api/mcp` as an agent does. Only the AI chat is scripted.

## Invariants

- The kit does not depend on a test runner.

## Side Effects

- Each engine makes a `conciv-kit-*` temp folder as its project root and binds a port on `127.0.0.1`; `stop` closes both.

## Verification

- `pnpm exec turbo run typecheck build --filter=@conciv/harness-testkit`; behaviour is proven by the plugin tests that use `@conciv/plugin-testkit`.
