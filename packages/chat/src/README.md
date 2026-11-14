# chat/src

## Overview

The chat plane: `createChatPlane` builds on `@conciv/ai`'s chat server to run turns, hydrate and clear threads, import harness transcripts, gate tool calls behind approvals, and expose the chat HTTP and WebSocket routes.

## Interface

- `index.ts:createChatPlane` - async factory returning a `ChatPlane` with `routes`, `hydrate`, `history`, `stop`, `compact`, `clear`, `endAllRuns`, `live`, `settled`, `record`, `running`, `decide`, `answerUi`, `askUi`, `codeRunner`, `admitCall`, `catchUp`, `allowOutside`; `deps.hubGeneration()` is the conciv home's hub generation (bumped by every disconnect), handed to the approval store; `codeRunner(sessionId, publish, capabilities?)` runs the given capability set instead of the session's own when one is passed, and its `asking` tools run without asking (the caller decides whether `admitCall` comes first); `stop(sessionId, runIds?)` answers `{ok: true, stopped}`, `stopped` being the chat server's answer; `settled(sessionId)` resolves once the session has no live run, passing through to the chat server's `settled`; `record(sessionId, chunks)` appends the assistant messages those chunks build to the session's thread (an outside call's mirror run, so it outlives a reload).
- `index.ts:ChatPlane.routes` - a Hono app with `GET CHAT_WS_PATH` (WebSocket upgrade), `POST CHAT_SSE_PATH` (start events) and `GET CHAT_SSE_PATH` (resume; 400 `no resume offset` when there is none).
- `index.ts:CodeTool` / `CodeRunner` (carries `capabilities`, the name and description of every sandboxed capability) / `ChatPlane` - exported types; also re-exports `AttachmentExpanders` and `SessionPort` from `turn.ts`.
- `code-mode.ts:registryCapabilities` / `assistCapabilities` / `chatToolSet` - build `CodeCapability` lists and the code-mode and asking tool sets.
- `code-mode.ts:toolDomainCapabilities` - appends a `@conciv/plugin-host` tool snapshot's code-mode tools to a capability list, named by their snapshot key; a tool whose name the list already has is left out and passed to `collided`. Each runs through the snapshot's code-mode `execute` on the given Effect runner, with the request's session, agent, tool call id and signal; it returns the tool's output, else its text content joined, else null, plus the tool's `data:` file parts as TanStack content parts (an image as an image part, any other file as the stub text "Attached document or image follows."). A code-mode call hands the files to the run's `CodeFilesCapability`; a direct call returns its value as a text part followed by the files.
- `approvals.ts:createApprovalStore` - pending approvals and grants per thread over the `metadata` chat store; `ApprovalScope` is `'once' | 'session'`.
- `approvals.ts:createUiChannel` - per-thread waiters for UI answers.
- `stores.ts:runningThreadIds` / `clearThread` - list threads with a `running` chat run, delete a thread's rows.
- `transcript.ts:createTranscriptImporter` - `sync` and `settle` a session's harness transcript into the message store; `toolNameNormalizer`, `normalizedChunk`, `normalizedMessages`.
- `turn.ts:turnHooks` / `buildSystemText` / `COMPACT_FALLBACK_PROMPT` - turn planning hooks and system prompt assembly.

## Invariants

- `index.ts:catchUp` - the session's waiting asks as `approval-requested` events, then its active run as a `conciv.session-run` announcement; a new event subscriber receives these first, so an ask or a run started before it subscribed (a widget still opening its push socket, or one reconnecting) still reaches it
- `index.ts:admitCall` - returns null when the call may run, else `{reason, message}`: `missing` (`session "<id>" does not exist`, when `deps.sessions.row` is null), `denied`, or `asked` (the ask was just published). Given `until`, an ask holds the call until the user decides it (allowed: null, denied: `denied`) or `until` aborts (`asked`, the ask stays pending); every call waiting on the same approval resolves from one decision.
- `index.ts:FIRST_OUTPUT_TIMEOUT_MS` - a turn with no first output for 30000 ms (or `firstOutputTimeoutMs`) is treated as silent by the chat server.
- `approvals.ts:createApprovalStore.asked` - a pending approval with the same `approvalId` is not added twice.
- `approvals.ts:createApprovalStore(metadata, hubAccess, hubGeneration)` - an approved outside-session Allow stamps `outsideAllowedGeneration` (the home's hub generation then) on its grants holder (the session, or `project`); `admit` admits an outside Allow only when its generation equals `hubGeneration()`; any other generation, or a null one on either side (the home db could not be read), counts as absent, so the card asks again. No clock is involved. An Allow is stored per tab (or per project), never per client, so any agent's disconnect anywhere in the conciv home voids every tab's outside Allow in every engine, lazily; Denies stay.
- `approvals.ts:createApprovalStore.decided` - resolves when `decide` records a decision for that approval (keyed by the grant holder, so under `hubAccess: 'project'` an outside allow in any session wakes every session) or when the signal aborts.
- `approvals.ts:createApprovalStore.forRun` - `once` and `denied` grants are cleared when a run reads them; `session` grants persist for the thread.
- `transcript.ts:createTranscriptImporter.sync` - messages already stored (by id) are skipped, and import resumes after the stored anchor `nativeId`; it reads only when the row's `harnessKind` is the session's harness, and stamps each imported assistant message with `metadata.conciv.harnessId`.
- `turn.ts:turnHooks` - every hook resolves the adapter with `deps.harnessFor(sessionId)`; a native id is resumed only when the row's `harnessKind` is that adapter, otherwise the full history is replayed.
- `index.ts:hydrate` - takes an optional `{limit, before}` window and returns that page plus `page`; `messageHarness` maps each assistant message id of the page to the harness that produced it: the `chat_runs.harness_id` of its run, else its import stamp. `pendingApprovals` and `lastRun` are never paged.
- `turn.ts:turnHooks` - throws `the message is empty` for an empty user message.
- `turn.ts:turnHooks.end` - passes the run's `RunLifecycle` from the chat server's end hook on to `deps.sessions.onRunEnd(sessionId, run)`, so the caller knows whether the run completed, failed or was aborted.
- `turn.ts:turnHooks` - hands the harness the session row's `effort` as `HarnessChatDeps.effort`, or none when it is null (the CLI's default); `chat()` gets no `reasoning`, so the harness is the one place the effort reaches the CLI.
- `code-mode.ts:chatToolSet` - a non-lazy tool result goes through `cappedValue` from `@conciv/contract`.

## Side Effects

- `stores.ts:clearThread` - one SQLite transaction deletes the thread's rows from the `@conciv/db` tables `runs`, `chatRuns`, `chatMessages`, `runMessages`, `sessionHistory`, and its `chatMetadata` keys prefixed `<threadId>:`.
- `index.ts:ChatPlane.compact` - inserts a row with `kind: 'compact'` into the `@conciv/db` `markers` table.
- `approvals.ts:createUiChannel` - sets a `setTimeout` per wait that resolves with a fallback value.
- `turn.ts:turnHooks` - passes `deps.harnessEnv?.(sessionId) ?? process.env` to the harness process.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/chat` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
