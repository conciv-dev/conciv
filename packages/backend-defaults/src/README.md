# chat/src

## Overview

The chat plane: `createChatPlane` builds on `@conciv/ai`'s chat server to run turns, hydrate and clear threads, import harness transcripts, and replay the permission service's pending asks as cards. Core serves it over oRPC.

## Interface

- `index.ts:createChatPlane` - async factory returning a `ChatPlane` with `hydrate`, `history`, `stop`, `compact`, `clear`, `endRuns`, `endAllRuns`, `live`, `driving`, `settled`, `recordRunError`, `record`, `running`, `answerUi`, `askUi`, `codeRunner`, `catchUp`; `codeRunner(sessionId, publish, origin, capabilities?)` runs the given capability set instead of the session's own when one is passed, and every tool it runs gets `origin` (`'hub'` for a hub-origin call, `'chat'` otherwise) on its `Tool.Context`; `stop(sessionId, runIds?)` answers `{ok: true, stopped}`, `stopped` being the chat server's answer; `endRuns(sessionId)` ends every live run of the session, one still preparing included, and resolves once they have settled (the chat server's `endRuns`, which `clear` runs before it deletes the thread); `settled(sessionId)` resolves once the session has no live run, passing through to the chat server's `settled`; `recordRunError(sessionId, runId, message)` writes `{message}` as the error of that session's run record and leaves its status as it is (a completed run whose `experimental.idle` hook failed hydrates as `lastRun` `{phase: 'completed', error}`), and throws for a run the session does not have; `record(sessionId, chunks)` appends the assistant messages those chunks build to the session's thread (an outside call's mirror run, so it outlives a reload).
- `index.ts:ChatPlane.send` / `ChatPlane.join` - the event iterators behind `rpc.chat.send` (start a run once, then tail it) and `rpc.chat.join` (tail a run from an event id).
- `index.ts:CodeTool` / `CodeRunner` (carries `capabilities`, the name and description of every sandboxed capability) / `ChatPlane` - exported types; also re-exports `SessionPort` from `turn.ts`.
- `code-mode.ts:assistCapabilities` / `chatToolSet` - build `CodeCapability` lists and the code-mode and direct tool sets.
- `code-mode.ts:toolDomainCapabilities` - appends a `@conciv/plugin-host` tool snapshot's code-mode tools to a capability list, named by their snapshot key; a tool whose name the list already has is left out and passed to `collided`. Each runs through the snapshot's code-mode `execute` on the given Effect runner, with the request's session, the session's selected agent (`ToolDomain.agent`), tool call id and signal; it returns the tool's output, else its text content joined, else null, plus the tool's `data:` file parts as TanStack content parts (an image as an image part, any other file as the stub text "Attached document or image follows."). A code-mode call hands the files to the run's `CodeFilesCapability`; a direct call returns its value as a text part followed by the files.
- `approvals.ts:createUiChannel` - per-thread waiters for UI answers.
- `stores.ts:runningThreadIds` / `clearThread` - list threads with a `running` chat run, delete a thread's rows.
- `transcript.ts:createTranscriptImporter` - `sync` and `settle` a session's harness transcript into the message store; `toolNameNormalizer`, `normalizedChunk`, `normalizedMessages`.
- `turn.ts:turnHooks` / `buildSystemText` / `COMPACT_FALLBACK_PROMPT` - turn planning hooks and system prompt assembly. The plan's `prompt(message, signal)` hands the run's abort signal to `TurnDeps.prompt(event, signal)`.

## Invariants

- `index.ts:catchUp` - the session's waiting asks as `approval-requested` events, then its active run as a `conciv.session-run` announcement; a new event subscriber receives these first, so an ask or a run started before it subscribed (a widget still opening its `chat.events` stream, or one resubscribing) still reaches it
- `index.ts:FIRST_START_TIMEOUT_MS` / `FIRST_OUTPUT_TIMEOUT_MS` - the chat server's two limits on a turn: an agent that has not started 30000 ms (or `firstStartTimeoutMs`) after the turn began fails with `the agent did not start`, and an agent that started but has given no output 30000 ms (or `firstOutputTimeoutMs`) after it started fails as silent.
- `transcript.ts:createTranscriptImporter.sync` - messages already stored (by id) are skipped, and import resumes after the stored anchor `nativeId`; it reads only when the row's `harnessKind` is the session's harness, and stamps each imported assistant message with `metadata.conciv.harnessId`.
- `turn.ts:turnHooks` - every hook resolves the adapter with `deps.harnessFor(sessionId)`; a native id is resumed only when the row's `harnessKind` is that adapter, otherwise the full history is replayed.
- `index.ts:hydrate` - takes an optional `{limit, before}` window and returns that page plus `page`; `messageHarness` maps each assistant message id of the page to the harness that produced it: the `chat_runs.harness_id` of its run, else its import stamp. `pendingApprovals` and `lastRun` are never paged. The first page of a live session imports the harness transcript first (`transcripts.sync`); a deleted session's (non-null `deletedAt`) skips that import, so opening it writes nothing into its thread.
- `turn.ts:turnHooks` - throws `the message is empty` for an empty user message.
- `turn.ts:firstUserTitle` - the session title is what the user sees of the first user message: its metadata `displayText` when it is not blank (what the user typed, without the note sentences the model reads), else, for a message of notes alone, the `label` of its first note in metadata `comments` (such as `Screen recording`), never the note sentences; a message with no `displayText` in its metadata titles with its text. Trimmed and cut at the title length.
- `turn.ts:turnHooks.admit` - refuses a turn on a deleted session (`deps.sessions.row` has a non-null `deletedAt`) with an Error whose message is `session "<id>" does not exist` (`missingSession`) and whose `code` is `SESSION_DELETED_CODE` (`deletedSessionError`; the library copies it onto the `RUN_ERROR` frame), before anything of the turn is stored or published; a row that does not exist is admitted, so the first send to a new id creates the session.
- `turn.ts:turnHooks.end` - passes the run's `RunLifecycle` from the chat server's end hook on to `deps.sessions.onRunEnd(sessionId, run)`, so the caller knows whether the run completed, failed or was aborted.
- `turn.ts:turnHooks` - hands the harness the session row's `effort` as `HarnessChatDeps.effort`, or none when it is null (the CLI's default); `chat()` gets no `reasoning`, so the harness is the one place the effort reaches the CLI.
- `code-mode.ts:chatToolSet` - a non-lazy tool result goes through `cappedValue` from `@conciv/contract`.

## Side Effects

- `stores.ts:clearThread` - one SQLite transaction deletes the thread's rows from the chat run and chat message tables, and its `chatMetadata` keys prefixed `<threadId>:`.
- `index.ts:ChatPlane.compact` - inserts a row with `kind: 'compact'` into the `markers` table (`db/schema.ts`). For a deleted session it rejects with `deletedSessionError` (`session "<id>" does not exist`, `code` `SESSION_DELETED_CODE`) before it stops anything or writes the marker.
- `approvals.ts:createUiChannel` - sets a `setTimeout` per wait that resolves with a fallback value.
- `turn.ts:turnHooks` - passes `deps.harnessEnv(sessionId)` to the harness process; the caller supplies it (core reads it from its ConfigProvider), chat reads no env itself.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/chat` from the repo root (turbo builds the package and its dependencies first); tests: `pnpm exec turbo run test --filter=@conciv/chat`
