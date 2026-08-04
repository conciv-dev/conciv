# TanStack AI 0.43 line — verified API notes

Facts verified against resolved sources under `node_modules/.pnpm/` on branch `conciv-init`
(ticket #239 migration). Every claim below was read from the listed dist file, not from docs.

## @tanstack/ai@0.43.0

Read: `node_modules/.pnpm/@tanstack+ai@0.43.0_@opentelemetry+api@1.9.1_zod@4.4.3/node_modules/@tanstack/ai/dist/esm/`

### Run store (moved here FROM @tanstack/ai-sandbox's removed `run-log`)

`dist/esm/activities/chat/middleware/run-store.d.ts`:

- `interface RunStore` — `createOrResume({runId, threadId, startedAt, status?}) => Promise<RunRecord>`,
  `update(runId, patch) => Promise<void>`, `get(runId) => Promise<RunRecord | null>`,
  `findActiveRun(threadId) => Promise<RunRecord | null>`, optional `listByThread`, `listReclaimable`.
- `class InMemoryRunStore implements RunStore` — exported as a value from the package root.
- `RunRecord` — `{runId, threadId, status, startedAt, finishedAt?, error?, usage?, sandboxKey?, detachedSince?, cancelRequested?, driverEpoch?}`.
  NOTE: field names changed from the old sandbox `RunRecord` (`createdAt/updatedAt/lastSeq` are gone;
  `startedAt/finishedAt` now).
- `TerminalRunStatus = 'completed' | 'failed' | 'aborted'` (was `'done' | 'error' | 'aborted'`),
  `RunStatus = 'running' | 'interrupted' | TerminalRunStatus`.
- Also exported: `isRunStatus`, `isTerminalRunStatus`, `defineRunStore`.

### Stream durability (the event-log half of the old RunEventLog)

`dist/esm/stream-durability.d.ts` / `.js`:

- `interface StreamDurability<TOffset extends string = string>` — `resumeFrom()`,
  `append(chunks: StreamChunk[]) => Promise<TOffset[]>`, `read(offset, signal?) => AsyncIterable<{offset, chunk}>`,
  `close() => Promise<void>`, `snapshot() => Promise<Array<{offset, chunk}>>`.
- `memoryStream(source: Request | {runId, offset?}, options?: {firstChunkDeadlineMs?}) => UpsertableStreamDurability`.
  Logs live in a PROCESS-GLOBAL module map keyed by runId (`memoryLogs`), not per instance:
  two `memoryStream({runId})` calls share one log. Completed logs evicted after
  `COMPLETED_LOG_TTL_MS = 5 * 60_000`; cap `MAX_MEMORY_RUNS = 1024` (active logs never evicted).
- `read('-1')` = from start, `read('now')` = tail only. A from-start read on an EMPTY log waits
  `firstChunkDeadlineMs` (default `DEFAULT_FIRST_CHUNK_DEADLINE_MS = 100`) for the first append, then
  REJECTS (`Memory stream run produced no data within ...`) and deletes the empty log. Raise the
  option when readers attach before a slow producer's first chunk.
- `replayRunStream(durability, offset?, signal?)` — bare-chunk replay helper, default offset `'-1'`.
- Offsets are strings `memory:v1:<encodeURIComponent(runId)>:<seq>`.

### Tools

`dist/esm/activities/chat/tools/tool-definition.d.ts`:

- `interface ServerTool<TInput extends SchemaInput | undefined = undefined, TOutput ... = undefined, TName, TContext, TNeedsApproval, TApprovalSchema>`.
  Bare `ServerTool` now means SCHEMA-LESS (`<undefined, undefined>`); annotate built tools with their
  real schema params.
- `toolDefinition(config).server(execute)` returns `ServerTool<...> & BuiltToolSchemaFields<TInput, TOutput, TApprovalSchema>`
  where `BuiltToolSchemaFields` makes `inputSchema`/`outputSchema`/`approvalSchema` REQUIRED (present)
  properties — so a schema-less built tool has `outputSchema: undefined` PRESENT, which under
  `exactOptionalPropertyTypes` is not assignable to `outputSchema?: SchemaInput`.
- `type AnyServerTool` exists for heterogeneous collections (execute loosened).

`dist/esm/types.d.ts`:

- `SchemaInput = StandardJSONSchemaV1<any, any> | StandardSchemaV1<any, any> | JSONSchema` (line 80).
- `ToolExecuteFunction` (line 441) return type WIDENED to `Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>` —
  sync handlers are legal; await results at our boundaries (pattern: `packages/tools/src/server.ts`).
- `AGUIEvent` (line 1461) is a NARROWED discriminated union; `StreamChunk = AGUIEvent`.
  Spreading/mutating `runId` on an unnarrowed `StreamChunk` is a type error (`ToolCallStartEvent` has
  no `runId`). Narrow by `chunk.type` against `EventType.RUN_STARTED/RUN_FINISHED/RUN_ERROR` first.
- `RunStartedEvent`/`RunFinishedEvent` carry `threadId`+`runId` (from `@ag-ui/core`);
  `RunErrorEvent` does NOT declare `runId`/`threadId` (only `message`, `code?`, plus tanstack's
  `model?`, `error?` deprecated) — `@ag-ui/core@0.1.1-canary.beta.0` `dist/events-JPFRVbr9.d.ts:329`.
- Output validation: the chat engine runs `parseWithStandardSchema(tool.outputSchema, result)` only
  when `outputSchema` is present and a standard schema
  (`dist/esm/activities/chat/tools/tool-calls.js:186,315,362`) — `z.unknown()` is behavior-neutral.

## @tanstack/ai-sandbox@0.3.0

Read: `node_modules/.pnpm/@tanstack+ai-sandbox@0.3.0_.../node_modules/@tanstack/ai-sandbox/dist/esm/`

- REMOVED (were in 0.2.4 `run-log.d.ts`, re-exported from index): `RunEventLog`,
  `InMemoryRunEventLog`, `RunEvent`, `RunEventLogReadOptions`, sandbox-local `RunRecord`/`RunStatus`/
  `TerminalRunStatus`/`RunError`/`isTerminalRunStatus`. Replacements: `RunStore` + `InMemoryRunStore`
  (records) and `StreamDurability` + `memoryStream` (events), both from `@tanstack/ai` — NOT from
  `@tanstack/ai-persistence`, which is not in this dependency graph at all.
- `dist/esm/run.d.ts`:
  - `interface RunDeps<TOffset extends string = string> { runs: RunStore; durability: (runId: string) => StreamDurability<TOffset>; logger?: InternalLogger }` —
    durability is a PER-RUN FACTORY.
  - `new RunController(deps: RunDeps)` (was `new RunController(log: RunEventLog)`).
  - `RunController.start({runId, threadId, stream, signal?})` — `threadId` now REQUIRED.
    `pipeToRunLog` calls `runs.createOrResume` itself; no caller-side `open()` step exists or is
    needed. It appends every chunk via `durability(runId).append([chunk])`, terminalizes with
    `runs.update(...)` + `durability.close()`, never rejects.
  - `RunController.attach(runId, fromOffset, signal?)` (was `attach(runId, {fromSeq?, signal?})`);
    yields `{offset, chunk}` (was `{seq, chunk}`). From-start offset is `'-1'`.
  - `RunController.status(runId)`, `drain()` unchanged in shape.
- `dist/esm/durability.d.ts`: `SandboxDurabilityOptions.adapter: StreamDurability`,
  `SandboxRunDurability = {runs: RunStore, adapter: Omit<StreamDurability, 'read'>, ...}` — confirms
  the two-store split (`RunStore` lifecycle + `StreamDurability` delivery) is the intended seam.

## @tanstack/ai-client@0.23.0

Read: `node_modules/.pnpm/@tanstack+ai-client@0.23.0_.../node_modules/@tanstack/ai-client/dist/esm/types.d.ts` (line 481).

- `ChatClientBaseOptions.id` still exists but is a `ChatClient`-construction-only escape hatch; the
  JSDoc states the framework hooks (`useChat` / `createChat`) do NOT expose `id` — a hook's identity
  is its `threadId`. `@tanstack/ai-solid@0.16.0`'s `useChat` options `Omit<...>` list includes `'id'`,
  so passing it is a compile error. Persistence keys on `threadId` by default.
- `forwardedProps` replaces the deprecated `body`.

## @tanstack/ai-code-mode@0.3.9

Read: `node_modules/.pnpm/@tanstack+ai-code-mode@0.3.9_.../node_modules/@tanstack/ai-code-mode/dist/esm/types.d.ts` (line 119).

- `type CodeModeTool = ServerTool<SchemaInput, SchemaInput, string, unknown>` — code-mode tools must
  be typed with REAL schema params; a bare/schema-less `ServerTool` (or a built tool with
  `outputSchema: undefined` present) is not assignable under `exactOptionalPropertyTypes`. Giving
  `toolDefinition` an `outputSchema` (e.g. `z.unknown()`) satisfies it without behavior change.
- Runtime does not require an output schema on bound tools (`ToolBinding.outputSchema` optional);
  only its own `execute_typescript` / `discover_tools` tools set one.

## @tanstack/ai-persistence

Not installed: no `@tanstack+ai-persistence@*` directory exists under `node_modules/.pnpm/` in this
workspace, and nothing in ai-sandbox 0.3.0's dist imports it. The run-event-log replacement lives in
`@tanstack/ai` itself (see above). Do not add it for #239-style migrations.

## Migration mapping applied in #239 (packages/core, packages/client)

- `new InMemoryRunEventLog()` + `new RunController(log)` →
  `makeRunControl()` in `packages/core/src/chat/runtime.ts`: `InMemoryRunStore` +
  `(runId) => memoryStream({runId}, {firstChunkDeadlineMs})` + `new RunController({runs, durability})`.
  `firstChunkDeadlineMs` = producer first-chunk timeout (30s default) + 5s grace, because core's
  subscribers attach before the harness's first chunk and the 100ms default would kill the tail.
- `runLog.open({runId, threadId})` before `start()` → deleted (`pipeToRunLog` createOrResumes).
- `runLog.append(runId, chunk)` → `durability(runId).append([chunk])`.
- `runControl.attach(runId, {signal})` → `runControl.attach(runId, '-1', signal)`.
- `useChat({id, threadId, ...})` → `useChat({threadId, ...})`.
- runId is now a PROCESS-GLOBAL resume key (`memoryStream` registry + `createOrResume`): reusing a
  runId means resuming that run. Tests must mint unique runIds per run (fixed in
  `packages/core/test/chat/tool-name-normalization.it.test.ts`).
