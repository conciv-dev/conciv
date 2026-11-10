# harness-testkit/src

## Overview

Test helpers for running the conciv engine against a scripted or real harness: boot an app on a local port, start chat turns, read run event streams, call tools over MCP, and auto-approve tool calls.

## Product path

Helpers talk to the engine the way the product caller they stand in for does: a browser caller through `makeBrowserRpcClient` / `browserRpcConnection` (the partysocket `/rpc-ws` socket), a node caller (the CLI, an MCP agent) over HTTP `/rpc` or `/api/mcp`. Only the LLM harness and the agent CLIs are faked.

## Interface

- `testkit.ts` - the package entry; re-exports the helpers below.
- `create-testkit.ts:createTestkit` - `(harness, boot, options)` returns `{setup}`; `setup()` boots the app and returns a `Kit` with `rpc`, `session`, `chat`, `events`, `join`, `hydrate`, `post`, `get`, `invokeTool`, `callTool`, `restartServer`, `cleanup`.
- `create-test-harness.ts:createTestHarness` - copies a real `HarnessAdapter` and replaces `chatConfig` with a scripted adapter (`script`).
- `create-fake-harness.ts:createFakeHarness` - a fake `HarnessAdapter` with options `id`, `text`, `resume`, `models`, `commands`, `history` (`FixtureSession`: session metas, each with an optional `text` its `messages` returns as one assistant message, or `messages` returned as given, and an optional `cwd`: a row without one belongs to whichever project a `{cwd}` listing asks for, except a folder another row names as its own (that folder is another project), and is left out of an `{everywhere: true}` listing, like a transcript that records no cwd; a row with one is listed only for that cwd or everywhere), `tty`; a fake with `history` carries `resume.command({nativeId})` = `{bin: <resumeBin ?? id>, args: ['--resume', nativeId]}`; `transcripts.hold()` / `transcripts.release()` hold the `messages` read of every session that carries `text` until released.
- `scripted-run.ts:makeScriptedRun` - scripted turns (`ScriptedTurn`, `PacedText`, `PacedRelease`) with hold and release.
- `harness-modes.ts:harnessModes` - returns a `fake` mode and a `real` mode for a harness.
- `harness-available.ts:harnessAvailable` - true when `command -v <binName>` succeeds.
- `call-tool.ts:makeCallTool` / `makeRunTypescript` / `makeDiscoverTools` - call tools through `<apiBase>/api/mcp` (`execute_typescript`, `discover_tools`).
- `call-tool.ts:autoApprove` / `withAutoApproval` / `approvePending` / `makeApprovingCallTool` / `makeApprovingRegistryCall` - approve pending tool calls during a run.
- `mcp-client.ts:connectMcpClient` - MCP client with `tools()`, `serverVersion()` and `close()`.
- `run-stream.ts:makeRunStream` - `RunStream` with `waitFor`, `waitForToolCall`, `done`; `run-events.ts:makeRunEvents`, `collectToolCalls`, `approvalIds`.
- `session.ts:makeRpcClient` / `resolveSession` / `makeSessionBoundRpcClient` - oRPC client against `<apiBase>/rpc`.
- `serve-app.ts:serveApp` - serves a fetch handler with `serveHono` and returns `base`, `wsBase`, `port`, `close`.
- `rpc-mounts.ts:serveRpcRouter` / `serveExtensionRpc` - serve an oRPC router over fetch (`RPC_PREFIX`) and WebSocket (`RPC_WS_PATH`); `./rpc-mounts` subpath.
- `rpc-websocket-client.ts:rpcOverWebsocket` - oRPC client over a WebSocket, one link per session; `./rpc-websocket-client` subpath.
- `until.ts:until` - polls a predicate; `./until` subpath.
- `chat-turn.ts:makeChatSockets` - `turn` and `join` open `<wsBase>CHAT_WS_PATH` connections as `RunStream`s; `closeAll` aborts every one, and `cleanup` calls it.

## Invariants

- `until.ts:until` - throws `until: stall` after `hangGuardMs` (default 5000) and throws when `failWhen` returns true first.
- `run-stream.ts:makeRunStream` - `waitFor` and `waitForToolCall` reject after 90000 ms by default, or when the run ends without a match; `done` has no timer and resolves on the terminal `RUN_FINISHED`/`RUN_ERROR` or when the source ends, so the test timeout bounds a real hang.
- `call-tool.ts:makeRunTypescript` - rejects after `deadlineMs` (default 60000) and throws when `execute_typescript` is not listed on `/api/mcp`.
- `mcp-client.ts:connectMcpClient` - a tool result with `isError: true` throws its text.
- `harness-modes.ts:harnessModes` - the `real` mode runs only when `CI` is unset and the harness binary is on `PATH`.
- `create-testkit.ts:cleanup` - closes the server first, then disposes the app (which ends live runs before closing the database); every step runs even when an earlier one fails, and the failures are rethrown as one `AggregateError`.

## Side Effects

- `create-testkit.ts:setup` - creates a temp state root `conciv-kit-*` with `mkdtempSync` unless `stateRoot` is passed; `cleanup` removes it with `rmSync`.
- `serve-app.ts:serveApp` / `rpc-mounts.ts:serveRpcRouter` - bind a port on `127.0.0.1`.
- `harness-available.ts:harnessAvailable` - runs `execSync('command -v ...')`.
- `harness-modes.ts:isCI` - reads `process.env.CI`.
- `call-tool.ts` / `session.ts` - HTTP and MCP calls to the served app.
- `scripted-run.ts:makeScriptedRun` - `setTimeout` timers for paced text and release.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness-testkit` from the repo root (turbo builds the package and its dependencies first)
