# @conciv/extension-test-runner

Runner-agnostic test-runner extension for conciv. It provides the `test_runner` tool, an oRPC router
(`status`, `list`, `ui`, `run`, `stop`, `stream`) and a live results card, on top of runner adapters
selected by the `runner` config field. vitest and playwright are implemented through the ChildRunnerSpec seam;
jest and node-test are registered stubs whose `create()` throws "not implemented". Each implemented adapter spawns
a child (with `NODE_OPTIONS` and `VIBE_*` removed from its env) that streams TestEvent, `list` and `error`
messages as NDJSON on fd 3. The playwright child in turn runs the app's Playwright CLI with the full environment.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `exports` (`package.json`): `.` (browser maps to client, import maps to server), `./client`, `./server`, `./vitest`, `./jest`, `./node-test`, `./playwright`, `./package.json`
- `build` script (`package.json`): `tsdown && vite build && tsc -p tsconfig.build.json`
- `testRunnerStream` Vite plugin (`vitest.config.ts`): sends `/rpc/*` to `makeTestRunnerRouter(fixtureManager)` under the composite key `ext['test-runner']`, starts `serveExtensionRpc({slug:'test-runner'})`, and answers `GET /__test-runner-fixture` with JSON `{base, wsUrl}`
- `fixtureManager` (`vitest.config.ts`): a `TestRunnerManager` stub that returns canned results and replays STREAM_EVENTS through setTimeout, 120ms apart, with run-end delayed to 2500ms
- `presetConciv` UnoCSS config (`uno.config.ts`): scans src/**/*.{ts,tsx}
- Subdirectories:
  - [src](./src/README.md): Contains the two extension entry points. server.ts builds the oRPC router and the server-side extension around the configured runner adapter. client.ts defines the browser-side extension with the rendering tool.

## Invariants

- Peer dependency `solid-js` ^1.9.13 (`package.json`)
- IT project sets `fileParallelism: false` and `testTimeout: 30_000`; the browser project sets `testTimeout: 60_000` and runs only chromium in headless mode (`vitest.config.ts`)
- The IT project excludes `test/fixtures/**` so the deliberately failing fixture tests are never collected (`vitest.config.ts`)

## Side Effects

- `testRunnerStream.configureServer` (`vitest.config.ts`) starts an extra RPC/WebSocket server through `serveExtensionRpc`, calls unref on it, and closes it on the Vite httpServer `close` event

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-test-runner` from the repo root (turbo builds the package and its dependencies first)
