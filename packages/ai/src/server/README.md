# ai/src/server

## Overview

The server-side chat runtime. It runs turns through the TanStack `chat()` pipeline with middleware for persistence, locks, sandbox, code mode, tool approval and run lifecycle events, delivers runs over SSE and WebSocket with resume, and stores runs, threads and metadata in drizzle SQLite tables.

## Interface

- `chat-server.ts:createChatServer` - async factory returning a `ChatServer` (delivery plus `stop`, `endRuns`, `endAllRuns` (ends every live run on every thread the way `endRuns` does, waits for all of them to settle, disposes the code mode driver, then rethrows any failed cancel writes as one `AggregateError`), `settled`, `hydrate`, `record`, `codeRunner`).
- `chat-server.ts:record` - folds the given chunks through a `StreamProcessor` and appends the assistant messages to the thread the same way a stopped turn is saved, skipping tool calls the thread already holds.
- `chat-server.ts:TurnPlan.reasoning` - passed to `chat({reasoning})`; the adapter maps it for its model (`--effort` or `MAX_THINKING_TOKENS` for claude-code) and drops it for a model it has no reasoning data for.
- `chat-server.ts:ChatStores` / `TurnHooks` / `TurnPlan` / `ChatServerConfig` / `ChatThread` / `CodeRunner` / `Approvals` - exported types.
- `code-mode.ts:codeModeTools` - the code-mode `discover_tools` carries our own short description (`DISCOVER_DESCRIPTION`) in place of the library's, which embeds the whole capability catalog; the same tool serves chat turns and MCP.
- `chat-server.ts:toolApprovalId` - `approvalId({provider: 'conciv', kind: 'tool', target: name})`.
- `chat-server.ts:approvalNeeded` - returns an Error telling the model to retry once the user approves.
- `delivery.ts:createDelivery` - returns `socket`, `events` (SSE POST), `resume` and `drive` (headless run).
- `delivery.ts:terminalPhaseOf` - maps RUN_ERROR to `failed` and RUN_FINISHED (unless `tool_calls`) to `completed`; `endsTheRun` also counts a terminal run-lifecycle chunk.
- `chat-stores.ts:drizzleChatStores(db, {harnessOf})` - implements `ChatStores` (messages, runs, metadata) on a `NodeSQLiteDatabase`; a new run row records `harnessOf(threadId)` in `harness_id`. `messages.saveThread` upserts one `chat_messages` row per message (rewriting only rows whose JSON changed) and deletes rows past the new end. `messages.loadThread` with a `limit` reads one page: the end position (the row count, or the `before` message's row through the `thread_id, message_id` index), the nearest user row at or before `end - limit`, then only the rows in that range, and returns a `MessagePage`; the window starts on a user message so no turn is split, its `cursor` is that message's id, and an unknown `before` gives an empty complete page. Without a `limit` it returns the whole transcript, which every write path uses.
- `chatMessages` / `chatMetadata` / `chatRuns` tables come from `@conciv/db`.
- `image-tool-results.ts:imageToolProvisioner` - a `ToolBridgeProvisioner` that serves an MCP JSON-RPC bridge at `/mcp`.
- `image-tool-results.ts:imagesIn` / `withoutImages` / `imageBlocks` - find image parts, replace them with a stub, or convert them to MCP image blocks.
- `child-cards.ts:childCardChunks` / `childCards` - turn `code_mode:external_call/result/error` custom events into TOOL_CALL_* chunks linked to the parent `execute_typescript` call.
- `compaction-stamp.ts:compactionStamp` - middleware added only to `kind: 'compact'` runs: merges `compaction: true` into `metadata.conciv` (`CompactionMetadataSchema`, other `conciv` keys kept) on TEXT_MESSAGE_START, REASONING_MESSAGE_START and RUN_FINISHED chunks so the live message carries it, and on finish writes it onto the stored assistant messages of that run (`metadata.tanstack.run.id`; no write when the run stored none), so a reload carries it too.
- `code-mode.ts:loadIsolateDriver` / `codeModeTools` / `secretRefusalOf` - pick an isolate driver (with a `dispose`, a no-op for isolate-node), build code-mode tools, detect secret refusals.
- `code-mode.ts:stoppedWith` - wraps a driver so aborting the signal disposes the running context; a turn passes its run signal, so stopping the turn stops its program; a failed dispose is logged.
- `quickjs-thread.ts:quickJSThreadDriver` - an `IsolateDriver` with `dispose` that runs `createQuickJSIsolateDriver` in `tinypool` worker threads (task `quickjs-worker`, resolved beside the thread module with its extension: `dist/quickjs-worker.js` when built, `src/server/quickjs-worker.ts` run by Node's type stripping from source). One pool per driver, created with the driver: `minThreads: 1` keeps one worker warm (zod, oRPC and the QuickJS WASM module loaded at worker start), `maxThreads` is `max(2, availableParallelism())` so concurrent programs run side by side, and a worker above the minimum leaves after 60 s idle. Each execute is one task that builds a fresh QuickJS runtime and context and disposes it before the task ends. `dispose` destroys the pool; the next `createContext` or execute creates a new one.
- `run-guard.ts:guardedAdapter` - wraps `chatStream` with an end signal and a first-output timeout.

## Invariants

- `chat-server.ts:gatedTools` - a tool runs only when its approval is `true`; `false` throws the denied error, and a missing approval emits `APPROVAL_REQUESTED_EVENT` then throws `approvalNeeded`.
- `chat-server.ts:run` (`conciv-steer` middleware) - starting a run ends every other live run on the same thread.
- `chat-server.ts:planned` - an exception from `hooks.plan` becomes a `failed-launch` adapter that emits RUN_ERROR.
- `chat-server.ts:terminalChunk` - a `completed` phase is reported as `aborted` when the record has `cancelRequested`.
- `chat-server.ts` `onStart`: `hooks.started` (the run announcement) is skipped once the run's controller is aborted; `@tanstack/ai` calls `onStart` after setup even for a cancelled run.
- `chat-server.ts:endedWithItsRecord` - a run stream that ends without a terminal chunk (a stopped run) is closed with its recorded terminal run-lifecycle chunk, so a replay or join of a stopped run reads its `aborted` end; no `RUN_FINISHED` is added, because the run's owner reads the same log and a late `RUN_FINISHED` would settle the owner's next turn.
- `chat-server.ts:stop` - cancels only the thread's active run, and only if it is in `runIds` when given.
- `chat-server.ts:hydrate` - waits for aborted live runs to settle before reconstructing, passes the optional `limit` and `before` to `reconstructChat` (one window of the thread plus `page`), and validates the result with `ReconstructedSchema`. `activeRun` and `lastRun` are never paged.
- `code-mode.ts:refusingSecrets` - throws when a tool parameter was flagged as a secret; `codeModeTools` returns null when there are no `__toolSide === 'server'` tools.
- `code-mode.ts:DRIVER_CANDIDATES` - tries isolate-node first (the optional `@tanstack/ai-isolate-node`, used when it loads and `probeIsolatedVm().compatible`), then QuickJS in a worker thread (256 MB memory, 2 MB stack); timeout 150000 ms.
- `quickjs-thread.ts` - guest code never runs on the server thread, so a busy program cannot block HTTP, SSE or stop requests. Tool calls are oRPC calls (`toolRouter.call`, `RPCHandler` from `@orpc/server/message-port` on the host, `RPCLink` from `@orpc/client/message-port` in the worker) over a `MessageChannel` port handed to the task; the result crosses through oRPC's RPC serializer (JSON plus Date, BigInt, Map, Set, URL, RegExp, undefined), a missing binding is a `NOT_FOUND` error, and a tool error reaches the guest as an Error with the same message.
- `quickjs-thread.ts:run` - aborts the tinypool task, which terminates its worker (tinypool boots a replacement), when the program outlives its timeout by 1 s (reported as `TimeoutError`, like the QuickJS driver) or on context dispose (`AbortError`), and returns once that worker has exited; driver dispose ends a running execution as `AbortError`. A result whose error is `TimeoutError`, `MemoryLimitError`, `StackOverflowError`, `WasmRuntimeError` or `RuntimeError` retires only the worker that produced it, because the WASM module it shares across runtimes may hold a leaked or broken runtime: the worker sends the result through `toolRouter.retire` and never finishes the task, and the host keeps the result and aborts that task, so tinypool terminates exactly that worker and the result is returned once it has exited. A guest throw keeps the worker. tinypool is patched (`patches/tinypool@2.2.0.patch`) so a worker error during `destroy` neither throws on the server thread nor respawns a worker. Every worker error is logged, and the pool's `error` event has a listener, so an error outside an execution never reaches the server thread unhandled.
- `run-guard.ts:guarded` - the first-output timer fires `onSilence` unless a chunk other than RUN_STARTED/CUSTOM arrives first.
- `delivery.ts:events` - returns 400 for an invalid body, and replays from offset `-1` when `seenRun(runId)` is true.
- `chat-stores.ts:metadata.set` - throws a TypeError on a null or undefined value; `runs.createOrResume` throws if the row is missing after insert-or-ignore.
- `image-tool-results.ts:imageToolProvisioner` - responds 401 without a matching bearer token (`timingSafeBearerEqual`), 405 for non-POST, 400 for invalid JSON.

## Side Effects

- `image-tool-results.ts:imageToolProvisioner.provision` - starts a `node:http` server on `127.0.0.1` on a random port with a random 24-byte token.
- `chat-stores.ts:drizzleChatStores` - SQLite reads and writes on `chat_runs`, `chat_messages` and `chat_metadata`.
- `chat-server.ts:createChatServer` - on startup marks every `running` run as `aborted` (`sweepAbandonedRuns`) and calls `hooks.end`.
- `chat-server.ts:createChatServer` - creates a `localProcessSandbox` at `config.sandbox.dir` and writes the durability journal to `config.sandbox.journalDir`.
- `chat-server.ts:saveStoppedTurn` - on abort saves the partial assistant messages and marks the run `failed` if an error was seen.
- `chat-server.ts:createChatServer` - keeps an in-process `live` run map and an `InMemoryLockStore`.
- `code-mode.ts:loadIsolateDriver` - dynamically imports `@tanstack/ai-isolate-node` (which probes `isolated-vm` in a child process).
- `quickjs-thread.ts:quickJSThreadDriver` - starts one worker thread when the driver is created and keeps it; the worker imports `@tanstack/ai-isolate-quickjs` and loads the QuickJS WASM module before it reports ready. Workers are unref'd while idle, so they never hold the process open.
- `delivery.ts:drive` / `events` / `socket` - stream runs as SSE responses or WebSocket messages through in-memory `memoryStream` durability.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
