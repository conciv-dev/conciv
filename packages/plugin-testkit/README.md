# @conciv/plugin-testkit

## Overview

Private dev-only package that boots the real engine and widget with the fake model chat for widget and plugin tests. The root holds the manifest and the typecheck and test configs.

## Product path

The testkit runs the real product path: the page under test uses the same transports and clients as the product (browser rpc over the partysocket `/rpc-ws` socket), and only the expensive externals, the LLM harness and the agent CLIs, are faked. Interception with `page.routeWebSocket` observes or faults calls on that socket but never swaps the transport. Details in [src/README.md](./src/README.md#product-path).

## Interface

- `exports` subpaths (`package.json`): ./connect-handshake, ./core-kit, ./host/grab, ./widget-suite, ./page-plane, ./listen-local, ./navigation-state, ./rpc-counts, ./rpc-wire, ./chat-wire, ./push-wire, ./rpc-fault, ./rpc-socket, ./rpc-observer, ./chat-fault
- `scripts` (`package.json`): typecheck, lint, test
- `vitest.config.ts`: project 'plugin-testkit', node env, test/**/*.test.ts
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - core kit, wire observers and fault injectors

## Invariants

- `vitest.config.ts`: `fileParallelism: false`, `testTimeout` 60s
- `package.json`: exports point at TypeScript source, so consumers need a TS-aware loader

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-testkit` from the repo root (turbo builds the package's dependencies first)
- Typecheck and lint: `cd packages/plugin-testkit && pnpm typecheck && pnpm lint`
