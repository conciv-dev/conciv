# chat/src

## Overview

The chat plane: `createChatPlane` builds on `@conciv/ai`'s chat server to run turns, hydrate and clear threads, import harness transcripts, gate tool calls behind approvals, and expose the chat HTTP and WebSocket routes.

## Interface

- `index.ts:createChatPlane` - async factory returning a `ChatPlane` with `routes`, `hydrate`, `history`, `stop`, `compact`, `clear`, `live`, `running`, `decide`, `answerUi`, `askUi`, `codeRunner`, `admitCall`.
- `index.ts:ChatPlane.routes` - a Hono app with `GET CHAT_WS_PATH` (WebSocket upgrade), `POST CHAT_SSE_PATH` (start events) and `GET CHAT_SSE_PATH` (resume; 400 `no resume offset` when there is none).
- `index.ts:CodeTool` / `CodeRunner` / `ChatPlane` - exported types; also re-exports `AttachmentExpanders` and `SessionPort` from `turn.ts`.
- `code-mode.ts:RESULT_CAP_CHARS` (50000), `cappedText`, `cappedValue`, `safeStringify`, `truncationEnvelope` - cap and serialize tool results.
- `code-mode.ts:registryCapabilities` / `assistCapabilities` / `chatToolSet` - build `CodeCapability` lists and the code-mode and asking tool sets.
- `approvals.ts:createApprovalStore` - pending approvals and grants per thread over the `metadata` chat store; `ApprovalScope` is `'once' | 'session'`.
- `approvals.ts:createUiChannel` - per-thread waiters for UI answers.
- `stores.ts:runningThreadIds` / `clearThread` - list threads with a `running` chat run, delete a thread's rows.
- `transcript.ts:createTranscriptImporter` - `sync` and `settle` a session's harness transcript into the message store; `toolNameNormalizer`, `normalizedChunk`, `normalizedMessages`.
- `turn.ts:turnHooks` / `systemTextOf` / `COMPACT_FALLBACK_PROMPT` - turn planning hooks and system prompt assembly.

## Invariants

- `index.ts:admitCall` - refuses a call with `session "<id>" does not exist` when `deps.sessions.row` is null.
- `index.ts:FIRST_OUTPUT_TIMEOUT_MS` - a turn with no first output for 30000 ms (or `firstOutputTimeoutMs`) is treated as silent by the chat server.
- `approvals.ts:createApprovalStore.asked` - a pending approval with the same `approvalId` is not added twice.
- `approvals.ts:createApprovalStore.forRun` - `once` and `denied` grants are cleared when a run reads them; `session` grants persist for the thread.
- `transcript.ts:createTranscriptImporter.sync` - messages already stored (by id) are skipped, and import resumes after the stored anchor `nativeId`.
- `turn.ts:turnHooks` - throws `the message is empty` for an empty user message.
- `code-mode.ts:cappedValue` - a result whose serialization exceeds `RESULT_CAP_CHARS` is replaced by a truncation payload keeping the first 4000 characters.

## Side Effects

- `stores.ts:clearThread` - one SQLite transaction deletes the thread's rows from the `@conciv/db` tables `runs`, `chatRuns`, `chatThreads`, `runMessages`, `sessionHistory`, and its `chatMetadata` keys prefixed `<threadId>:`.
- `index.ts:ChatPlane.compact` - inserts a row with `kind: 'compact'` into the `@conciv/db` `markers` table.
- `index.ts:createChatPlane` - the chat server writes run journals under `concivStateDir(stateRoot)/runs`.
- `approvals.ts:createUiChannel` - sets a `setTimeout` per wait that resolves with a fallback value.
- `turn.ts:turnHooks` - passes `deps.harnessEnv?.(sessionId) ?? process.env` to the harness process.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/chat` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
