# @conciv/plugin-testkit

## Overview

Published test package that boots the real engine and widget with the fake model chat for widget and plugin tests. The root holds the manifest and the typecheck and test configs.

## Product path

The testkit runs the real product path: the page under test uses the same transports and clients as the product (browser rpc over the partysocket `/rpc-ws` socket), and only the expensive externals, the LLM harness and the agent CLIs, are faked. Interception with `page.routeWebSocket` observes or faults calls on that socket but never swaps the transport. Details in [src/README.md](./src/README.md#product-path).

Source and helper behaviour: [src/README.md](./src/README.md).

## Invariants

- `vitest.config.ts`: `fileParallelism: false`, `testTimeout` 60s
- `package.json`: exports point at the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-testkit` from the repo root (turbo builds the package's dependencies first)
- Typecheck and lint: `cd packages/plugin-testkit && pnpm typecheck && pnpm lint`
