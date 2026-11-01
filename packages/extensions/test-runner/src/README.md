# test-runner/src

## Overview

Both entry points call `defineExtension` with name `test-runner`, `testRunnerConfig` and `TEST_RUNNER_PROMPT`. The server entry looks up the adapter for `config.runner`, creates a manager for `server.cwd`, exposes it as tool context and RPC router, and stops it on dispose. The client entry registers `testToolClient`, which renders `TestCard`.

## Interface

- `makeTestRunnerRouter(manager)` (`server.ts`): oRPC router with procedures `status`, `list` (input `{failedOnly}`), `ui`, `run` (input `RunArgsSchema`), `stop` (returns `{ok:true}`) and `stream` (an event iterator of `TestEvent`)
- `TestRunnerRouter` (`server.ts`): type of the router
- default export (`server.ts`): `defineExtension({...}).server(...)`, which returns `{context:{manager}, router, dispose: manager.stop}`
- default export (`client.ts`): `defineExtension` with `tools: [testToolClient]`
- Subdirectories:
  - [runner](./runner/README.md): Runner contract, adapter registry, NDJSON child-message schema, and the generic child-process driver that runs any adapter through a spawned Node child streaming messages on fd 3.
  - [shared](./shared/README.md): Shared zod schemas and types for test events, run results and the extension config, plus the extension name and system prompt constants.
  - [runners](./runners/README.md): Concrete runner adapters. jest.ts and node-test.ts are stubs that are not implemented. The vitest/ and playwright/ subdirectories hold the real child-process adapters.
  - [tool](./tool/README.md): The `test_runner` tool: a shared definition, a server handler that calls the manager, and a client registration that renders a Solid `TestCard`. The card shows a finished result or, while a run is in flight, subscribes to the live RPC stream.

## Invariants

- `RunArgsSchema` (`server.ts`): patterns is `string[]` and optional, testNamePattern is a string and optional, failedOnly defaults to false
- `guarded` (`server.ts`): a `RunnerUnavailableError` (checked directly or via `error.cause`) becomes typed error `UNAVAILABLE` with data `{available:false, error}`; any other error is rethrown
- Only `list`, `ui` and `run` are guarded; `status`, `stop` and `stream` do not declare UNAVAILABLE (`server.ts`)
- The adapter falls back to `vitest` when `getRunner(server.config.runner)` returns undefined (`server.ts`)
- `stream` (`server.ts`) emits `manager.emitSnapshot()` first, then subscribes through `subscribeRaw`, and unsubscribes when the signal aborts (`subscriptionIterator`)

## Side Effects

- The default export's `.server` (`server.ts`) calls `adapter.create(server.cwd)`. For the jest and node-test stubs that call throws synchronously during extension server setup.
- The `stop` procedure and `dispose` (`server.ts`) kill the active runner child process

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-test-runner` from the repo root (turbo builds the package and its dependencies first)
