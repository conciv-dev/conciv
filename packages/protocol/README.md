# @conciv/protocol

Wire types shared by the conciv vite-plugin and widget.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Package root for the wire types package. It builds 24 ESM entry points from src with tsdown, and tsc emits the declarations.

## Interface

- `exports` (`package.json`): 24 subpaths: ./chat-types, ./push-types, ./chat-busy, ./chat-message-types, ./chat-event-types, ./chat-tool-types, ./usage-types, ./ui-types, ./editor-types, ./harness-types, ./framework-types, ./rpc-types, ./terminal-types, ./bundler-types, ./config-types, ./page-types, ./element-capture-sanitize, ./element-capture-types, ./page-introspect-types, ./tool-icon-types, ./tool-view-types, ./connect-ports, ./state-types, ./event-bus
- `dependencies` (`package.json`): @tanstack/ai and zod
- `scripts` (`package.json`): build (`tsdown && tsc -p tsconfig.build.json`), typecheck, lint, test, publint, attw
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - schemas, types and wire constants

## Invariants

- `entry` (`tsdown.config.ts`): every package.json export needs a matching tsdown entry, since tsdown emits .js and tsc emits .d.ts (dts: false)

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/protocol` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/protocol && pnpm typecheck && pnpm lint`
