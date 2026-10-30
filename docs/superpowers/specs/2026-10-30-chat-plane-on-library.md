# `@conciv/chat` on the library's run

Status: decided 2026-10-30 (user: "we must use the libraries we import", "just fix it"). Replaces
the chat plane carried over unchanged in step 4a (`deps-ai-server` 5b76776c). Builds on
`2026-10-30-conciv-ai-package.md` (package shape) and implements
`2026-10-29-approvals-deny-and-retry.md` in the same rewrite. Audit with file:line evidence:
session scratchpad `chat-plane-audit.md`; library docs read at the `@tanstack/ai@1.0.1` tag.

## Why

The plane ran `chat()` with only `withSandbox` and our gate, wrapped its stream in our own
generator, and re-implemented what the library ships: transcript and run-status persistence (a
full SQLite transaction per chunk), cancel (a 250 ms DB poll), detach on disconnect, locks, resume
offsets, hydrate, code-mode tool discovery. 34 files, 3052 lines, about a dozen silent
`.catch(() => {})`, and live defects: a throwing DB write in `finishRun` hangs the consumer
forever; the session lock covers only the claim, so two CLI runs can overlap and overwrite each
other's messages; the library's detach signal is keyed on the stream object `chat()` returns, so
wrapping it breaks detach; run end and lifecycle events go out twice on two channels; a failed
stream build drops the user's message.

## The run

A turn is `chat()` with:

- `withPersistence(stores)` from `@tanstack/ai-persistence`, `snapshotStreaming: true` (a crash
  keeps the partial reply), over our Drizzle stores of db's tables;
- `withLocks` from the same package (the lock covers the whole run);
- `withSandbox(sandbox, {runs, durability: {adapter}})`, one durability adapter per run;
- one conciv middleware for product hooks: the gate and approvals, the first-output timeout
  (`ctx.abort`), usage pricing with the model read once per turn, native session id capture,
  `onRunEnd` once.

`chat()`'s stream goes to delivery unwrapped. Delivery is the library's WebSocket/SSE response
functions on `memoryStream(request)` (it reads resume offsets itself). Hydrate is
`reconstructChat`. Stop is `requestRunCancel` plus abort with `RUN_CANCEL_REASON`, and returns at
once. A reused runId resumes the run. Run events travel on the run log only; the push bus carries
session-level events only. Errors are never swallowed: a failure ends the run as `RUN_ERROR` and
the run record settles.

## Decisions (user, 2026-10-30, each asked and answered)

1. Persistence: `withPersistence` with `snapshotStreaming: true` replaces option D's write-time fold; the CLI transcript importer
   stays and merges by message id (1.0 `chat-persistence-advanced.md` merge-by-id).
2. Stop returns immediately; the UI's stopping phase reads the run record.
3. Same runId resumes.
4. Code mode: the library's lazy tools and `discover_tools` replace our `catalog` tool; the category
   list in the prompt goes.
5. Code-mode child calls use the library's `code_mode:external_*` events. If they carry no id to
   pair parallel calls into cards, fill it through the library's event extension point; do not
   keep our parallel emitter.
6. Run events travel on the run log only; the push bus carries session-level events only.
7. Compaction keeps the stored thread and writes a boundary marker; it never deletes history.

## Package

Entries `.` and `./testkit`, explicit exports. About six source files, about 1000 lines:
`index.ts` (createChatPlane: routes, stop, compact, hydrate, boot sweep), `stores.ts` (the
Drizzle persistence), `turn.ts` (the conciv middleware, compaction), `transcript.ts` (the
importer), `approvals.ts` (deny-and-retry, grants, `conciv_ui`), `code-mode.ts`. App logic moves
to core: session rows, slash commands, the session bus. `@conciv/ai/server` shrinks to what the
plane needs that is ours (about 150 lines): no one-line renames of library names, no async queue,
no message fold.

## Tests

All of `packages/core/test/chat` (82 files) and `packages/chat/test` are deleted. `@conciv/chat`
gets two files: one unit file and one integration file that boots the app once, each with a
`describe` per behaviour in the acceptance list of `2026-10-30-conciv-ai-package.md` and the
approvals spec. A future bug adds an `it`, never a file.

## Verify first (before relying on them)

- `withPersistence` saves before the consumer sees `RUN_FINISHED`.
- `emitCustomEvent` reaches the stream for tools bridged to a CLI.
- Whether 1.0 adapters still need our message-id and run-id stamping.
- The library's default log level (no noise in the dev server).

## `@conciv/ai/server` is an abstraction, not a re-export layer (user, 2026-10-30)

The first cut exported 54 names, nearly all 1:1 renames of library names. Consumers need none of
that. `./server` exports one abstraction: `createChatServer(config): ChatServer` (owns `chat()`,
persistence, locks, sandbox, code mode, delivery, stop, hydrate) plus its types `ChatServerConfig`,
`ChatServer`, `ChatStores`, `TurnHooks`. Everything else is internal to `packages/ai/src/server/`.
`@conciv/chat` is thin product logic on top. Every entry (`.`, `./server`, `./testkit`) exports
only names a consumer imports.

Tests go through the public entries only: no export, flag or relative `src/` import that exists for a test. `./testkit` holds fixtures, not backdoors.

## Decisions after the first build (user, 2026-10-30)

- Code-mode child calls: the library's `code_mode:external_*` events carry no call id and
  `aroundCalls` cannot add one. APPROVED: a small local `pnpm patch` of `@tanstack/ai-code-mode`
  that adds a `callId` to the `external_call` / `external_result` / `external_error` payloads.
  Cards pair by it; no parallel emitter.
- External MCP: register the library's `discover_tools` as an MCP tool beside
  `execute_typescript`; it replaces `external_catalog`.
- The 50k result cap still applies to the `execute_typescript` result (feature kept, through a
  library hook).
- `withPersistence` settles the run record only after the stream ends (proof 1), so the conciv
  middleware emits the terminal run lifecycle before `RUN_FINISHED` / `RUN_ERROR`.
- `minimumReleaseAgeExclude` shrinks to `@tanstack/*` only: drop the unused jazz entries and every
  entry whose locked version is older than 48h; pin `nitro-nightly` to a nightly at least 48h old.
- Tools that require approval (`approval: 'ask'`) never go through code mode: one filter where the code-mode tool set is built. They stay normal tool calls (separate MCP tools on the external MCP), gated by deny-and-retry. The library refuses `needsApproval` both in code mode and on CLI bridges. `discover_tools` works in turns and on the external MCP, with `includeDescription: 'first-sentence'`.

## Decisions after the second build (user, 2026-10-30)

- Code-mode child cards survive a reload: a wrapper around the adapter streams them as adapter
  chunks, so `withPersistence` saves them like any part. One wrapper in `@conciv/ai/server`.
- Stop with a CLI that ignores SIGTERM: extend the existing approved
  `@tanstack/ai-sandbox-local-process` patch to escalate to SIGKILL for THAT run's process tree a
  few seconds after abort. Not `destroyOnComplete`: with one shared project dir, provider destroy
  retires the oldest run's handle (`provider.js:72-89`) and would kill another session's CLI.
- Reused runIds: accepted as the library keys them. Run ids are client UUIDs; reuse means a retry
  of the same run. The two tests that pinned two-instances-in-one-process are dropped.
- Store contract: the Drizzle stores move into `@conciv/ai/server` (they depend on db's schema
  only) and are proven in `packages/ai`'s tests with the library's `runPersistenceConformance`. No
  lint exception.
- Claude's allowed tools include the bridged ask tools (approvals spec), so the CLI does not ask a
  second time before our gate.
- On abort the middleware emits the terminal `aborted` lifecycle so the widget shows it without
  waiting for the next hydrate.
