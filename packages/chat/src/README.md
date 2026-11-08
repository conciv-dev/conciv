# chat/src

## Overview

The chat plane: `createChatPlane` builds on `@conciv/ai`'s chat server to run turns, hydrate and clear threads, import harness transcripts, gate tool calls behind approvals, and expose the chat HTTP and WebSocket routes.

## Interface

- `index.ts:createChatPlane` - async factory returning a `ChatPlane` with `routes`, `hydrate`, `history`, `stop`, `compact`, `clear`, `endAllRuns`, `live`, `record`, `running`, `decide`, `answerUi`, `askUi`, `codeRunner`, `admitCall`, `pendingAsks`, `allowOutside`; `deps.hubGeneration()` is the conciv home's hub generation (bumped by every disconnect), handed to the approval store; `codeRunner(sessionId, publish, capabilities?)` runs the given capability set instead of the session's own when one is passed; `record(sessionId, chunks)` appends the assistant messages those chunks build to the session's thread (an outside call's mirror run, so it outlives a reload).
- `index.ts:ChatPlane.routes` - a Hono app with `GET CHAT_WS_PATH` (WebSocket upgrade), `POST CHAT_SSE_PATH` (start events) and `GET CHAT_SSE_PATH` (resume; 400 `no resume offset` when there is none).
- `index.ts:CodeTool` / `CodeRunner` (carries `capabilities`, the name and description of every sandboxed capability) / `ChatPlane` - exported types; also re-exports `AttachmentExpanders` and `SessionPort` from `turn.ts`.
- `code-mode.ts:RESULT_CAP_CHARS` (50000), `cappedText`, `cappedValue`, `safeStringify`, `truncationEnvelope` - cap and serialize tool results.
- `code-mode.ts:registryCapabilities` / `assistCapabilities` / `chatToolSet` - build `CodeCapability` lists and the code-mode and asking tool sets.
- `approvals.ts:createApprovalStore` - pending approvals and grants per thread over the `metadata` chat store; `ApprovalScope` is `'once' | 'session'`.
- `approvals.ts:createUiChannel` - per-thread waiters for UI answers.
- `stores.ts:runningThreadIds` / `clearThread` - list threads with a `running` chat run, delete a thread's rows.
- `transcript.ts:createTranscriptImporter` - `sync` and `settle` a session's harness transcript into the message store; `toolNameNormalizer`, `normalizedChunk`, `normalizedMessages`.
- `turn.ts:turnHooks` / `systemTextOf` / `COMPACT_FALLBACK_PROMPT` - turn planning hooks and system prompt assembly.

## Invariants

- `index.ts:pendingAsks` - the session's waiting asks as `approval-requested` events, which a new event subscriber receives first so an ask published before it subscribed still reaches it
- `index.ts:admitCall` - returns null when the call may run, else `{reason, message}`: `missing` (`session "<id>" does not exist`, when `deps.sessions.row` is null), `denied`, or `asked` (the ask was just published). Given `until`, an ask holds the call until the user decides it (allowed: null, denied: `denied`) or `until` aborts (`asked`, the ask stays pending); every call waiting on the same approval resolves from one decision.
- `index.ts:FIRST_OUTPUT_TIMEOUT_MS` - a turn with no first output for 30000 ms (or `firstOutputTimeoutMs`) is treated as silent by the chat server.
- `approvals.ts:createApprovalStore.asked` - a pending approval with the same `approvalId` is not added twice.
- `approvals.ts:createApprovalStore(metadata, hubAccess, hubGeneration)` - an approved outside-session Allow stamps `outsideAllowedGeneration` (the home's hub generation then) on its grants holder (the session, or `project`); `admit` treats an outside Allow whose generation is below `hubGeneration()` as absent, so the card asks again. No clock is involved. An Allow is stored per tab (or per project), never per client, so any agent's disconnect anywhere in the conciv home voids every tab's outside Allow in every engine, lazily; Denies stay.
- `approvals.ts:createApprovalStore.decided` - resolves when `decide` records a decision for that approval (keyed by the grant holder, so under `hubAccess: 'project'` an outside allow in any session wakes every session) or when the signal aborts.
- `approvals.ts:createApprovalStore.forRun` - `once` and `denied` grants are cleared when a run reads them; `session` grants persist for the thread.
- `transcript.ts:createTranscriptImporter.sync` - messages already stored (by id) are skipped, and import resumes after the stored anchor `nativeId`; it reads only when the row's `harnessKind` is the session's harness, and stamps each imported assistant message with `metadata.conciv.harnessId`.
- `turn.ts:turnHooks` - every hook resolves the adapter with `deps.harnessFor(sessionId)`; a native id is resumed only when the row's `harnessKind` is that adapter, otherwise the full history is replayed.
- `index.ts:hydrate` - takes an optional `{limit, before}` window and returns that page plus `page`; `messageHarness` maps each assistant message id of the page to the harness that produced it: the `chat_runs.harness_id` of its run, else its import stamp. `pendingApprovals` and `lastRun` are never paged.
- `turn.ts:turnHooks` - throws `the message is empty` for an empty user message.
- `turn.ts:turnHooks` - plans the turn with `reasoning` set to the session row's `effort`, or none when it is null (the CLI's default).
- `code-mode.ts:cappedValue` - a result whose serialization exceeds `RESULT_CAP_CHARS` is replaced by a truncation payload keeping the first 4000 characters.

## Side Effects

- `stores.ts:clearThread` - one SQLite transaction deletes the thread's rows from the `@conciv/db` tables `runs`, `chatRuns`, `chatMessages`, `runMessages`, `sessionHistory`, and its `chatMetadata` keys prefixed `<threadId>:`.
- `index.ts:ChatPlane.compact` - inserts a row with `kind: 'compact'` into the `@conciv/db` `markers` table.
- `index.ts:createChatPlane` - the chat server writes run journals under `concivStateDir(stateRoot)/runs`.
- `approvals.ts:createUiChannel` - sets a `setTimeout` per wait that resolves with a fallback value.
- `turn.ts:turnHooks` - passes `deps.harnessEnv?.(sessionId) ?? process.env` to the harness process.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/chat` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
