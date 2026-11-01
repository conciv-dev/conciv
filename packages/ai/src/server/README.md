# ai/src/server

## Overview

The server-side chat runtime. It runs turns through the TanStack `chat()` pipeline with middleware for persistence, locks, sandbox, code mode, tool approval and run lifecycle events, delivers runs over SSE and WebSocket with resume, and stores runs, threads and metadata in drizzle SQLite tables.

## Interface

- `chat-server.ts:createChatServer` - async factory returning a `ChatServer` (delivery plus `stop`, `endRuns`, `settled`, `hydrate`, `codeRunner`).
- `chat-server.ts:ChatStores` / `TurnHooks` / `TurnPlan` / `ChatServerConfig` / `ChatThread` / `CodeRunner` / `Approvals` - exported types.
- `chat-server.ts:toolApprovalId` - `approvalId({provider: 'conciv', kind: 'tool', target: name})`.
- `chat-server.ts:approvalNeeded` - returns an Error telling the model to retry once the user approves.
- `delivery.ts:createDelivery` - returns `socket`, `events` (SSE POST), `resume` and `drive` (headless run).
- `delivery.ts:terminalPhaseOf` - maps RUN_ERROR to `failed` and RUN_FINISHED (unless `tool_calls`) to `completed`.
- `chat-stores.ts:drizzleChatStores` - implements `ChatStores` (messages, runs, metadata) on a `NodeSQLiteDatabase`.
- `chat-tables.ts:chatRuns` - table `chat_runs` (PK `run_id`; indexes `chat_runs_status_detached`, `chat_runs_thread_started`).
- `chat-tables.ts:chatThreads` / `chatMetadata` - tables `chat_threads` (PK `thread_id`) and `chat_metadata` (composite PK namespace + key).
- `image-tool-results.ts:imageToolProvisioner` - a `ToolBridgeProvisioner` that serves an MCP JSON-RPC bridge at `/mcp`.
- `image-tool-results.ts:imagesIn` / `withoutImages` / `imageBlocks` - find image parts, replace them with a stub, or convert them to MCP image blocks.
- `child-cards.ts:childCardChunks` / `childCards` - turn `code_mode:external_call/result/error` custom events into TOOL_CALL_* chunks linked to the parent `execute_typescript` call.
- `code-mode.ts:loadIsolateDriver` / `codeModeTools` / `secretRefusalOf` - pick an isolate driver, build code-mode tools, detect secret refusals.
- `code-mode.ts:stoppedWith` - wraps a driver so aborting the signal disposes the running context; a turn passes its run signal, so stopping the turn stops its program.
- `quickjs-thread.ts:quickJSThreadDriver` - an `IsolateDriver` that runs `createQuickJSIsolateDriver` in a `node:worker_threads` worker (entry `quickjs-worker.ts`, built as `dist/quickjs-worker.js`), one worker per context.
- `run-guard.ts:guardedAdapter` - wraps `chatStream` with an end signal and a first-output timeout.

## Invariants

- `chat-server.ts:gatedTools` - a tool runs only when its approval is `true`; `false` throws the denied error, and a missing approval emits `APPROVAL_REQUESTED_EVENT` then throws `approvalNeeded`.
- `chat-server.ts:run` (`conciv-steer` middleware) - starting a run ends every other live run on the same thread.
- `chat-server.ts:planned` - an exception from `hooks.plan` becomes a `failed-launch` adapter that emits RUN_ERROR.
- `chat-server.ts:terminalChunk` - a `completed` phase is reported as `aborted` when the record has `cancelRequested`.
- `chat-server.ts:stop` - cancels only the thread's active run, and only if it is in `runIds` when given.
- `chat-server.ts:hydrate` - waits for aborted live runs to settle before reconstructing, and validates the result with `ReconstructedSchema`.
- `code-mode.ts:refusingSecrets` - throws when a tool parameter was flagged as a secret; `codeModeTools` returns null when there are no `__toolSide === 'server'` tools.
- `code-mode.ts:DRIVER_CANDIDATES` - tries isolate-node first (the optional `@tanstack/ai-isolate-node`, used when it loads and `probeIsolatedVm().compatible`), then QuickJS in a worker thread (256 MB memory, 2 MB stack); timeout 150000 ms.
- `quickjs-thread.ts` - guest code never runs on the server thread, so a busy program cannot block HTTP, SSE or stop requests. Tool calls cross the worker port as `call` / `result` messages, every message is zod-parsed on both sides, and a tool error reaches the guest as an Error with the same message.
- `quickjs-thread.ts:threadContext` - terminates the worker when the program outlives its timeout by 1 s (reported as `TimeoutError`, like the QuickJS driver), on dispose (`AbortError`), on an unreadable message, and a worker that errors or exits ends the execution with that error.
- `run-guard.ts:guarded` - the first-output timer fires `onSilence` unless a chunk other than RUN_STARTED/CUSTOM arrives first.
- `delivery.ts:events` - returns 400 for an invalid body, and replays from offset `-1` when `seenRun(runId)` is true.
- `chat-stores.ts:metadata.set` - throws a TypeError on a null or undefined value; `runs.createOrResume` throws if the row is missing after insert-or-ignore.
- `image-tool-results.ts:imageToolProvisioner` - responds 401 without a matching bearer token (`timingSafeBearerEqual`), 405 for non-POST, 400 for invalid JSON.

## Side Effects

- `image-tool-results.ts:imageToolProvisioner.provision` - starts a `node:http` server on `127.0.0.1` on a random port with a random 24-byte token.
- `chat-stores.ts:drizzleChatStores` - SQLite reads and writes on `chat_runs`, `chat_threads` and `chat_metadata`.
- `chat-server.ts:createChatServer` - on startup marks every `running` run as `aborted` (`sweepAbandonedRuns`) and calls `hooks.end`.
- `chat-server.ts:createChatServer` - creates a `localProcessSandbox` at `config.sandbox.dir` and writes the durability journal to `config.sandbox.journalDir`.
- `chat-server.ts:saveStoppedTurn` - on abort saves the partial assistant messages and marks the run `failed` if an error was seen.
- `chat-server.ts:createChatServer` - keeps an in-process `live` run map and an `InMemoryLockStore`.
- `code-mode.ts:loadIsolateDriver` - dynamically imports `@tanstack/ai-isolate-node` (which probes `isolated-vm` in a child process).
- `quickjs-thread.ts:threadContext` - starts a worker thread per code-mode context; the worker imports `@tanstack/ai-isolate-quickjs`.
- `delivery.ts:drive` / `events` / `socket` - stream runs as SSE responses or WebSocket messages through in-memory `memoryStream` durability.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
