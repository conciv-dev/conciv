# @conciv/extension-testkit

## Overview

Private dev-only package that mounts a conciv extension in a real browser against a real server. The root holds the manifest and build and test configs; the default test-host build uses the ping fixture as the extension under test.

## Interface

- `exports['.']` (`package.json`): ./src/get-extension-test-api.ts
- `exports` subpaths (`package.json`): ./card-harness, ./connect-handshake, ./core-kit, ./framework-fake, ./host/grab, ./widget-suite, ./test-host, ./page-plane, ./listen-local, ./serve-host, ./navigation-state, ./rpc-counts, ./rpc-wire, ./chat-wire, ./push-wire, ./rpc-fault, ./chat-fault
- `scripts` (`package.json`): build (`vite build -c vite.test-host.config.ts`), typecheck, lint, test
- `vite.test-host.config.ts`: `testHostConfig({clientEntry: fixtures/ping/client.tsx, outDir: dist/test-host})`
- `vitest.config.ts`: project 'extension-testkit', node env, test/**/*.test.ts
- `uno.config.ts`: `presetConciv` over src and fixtures
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - test API, servers, wire observers and fault injectors
  - `fixtures/ping/`: the fixture extension the default test-host build mounts (client buttons for ping, grab pick, an oRPC round trip and composer actions; server with three tools and a one-procedure router)

## Invariants

- `vitest.config.ts`: `fileParallelism: false`, `testTimeout` 60s
- `package.json`: exports point at TypeScript source, so consumers need a TS-aware loader
- `fixtureHost` (`src/fixture-host.ts`): the build must run first; a missing dist/test-host throws

## Side Effects

- `vite.test-host.config.ts`: the build writes dist/test-host

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-testkit` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension-testkit && pnpm typecheck && pnpm lint`
