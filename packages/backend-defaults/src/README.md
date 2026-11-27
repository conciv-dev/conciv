# backend-defaults/src

## Overview

The package entries are `backend.ts` (`createBackend`, the engine, from `engine/`), `ai.ts` (the chat server in `ai/`)
and `tools.ts` (the sandbox tools in `tools/`). `backend-defaults.ts` is the chat plane: `createChatPlane` builds on the
chat server to run turns, hydrate and clear threads, import harness transcripts, and replay the permission service's
pending asks as cards. The engine serves it over oRPC. `turn.ts`, `transcript.ts`, `code-mode.ts`, `approvals.ts` and
`stores.ts` are its parts; `core/` holds the engine services (code mode, config, database, filesystem,
image, job, plugin, ripgrep, session, skill, tool) and the browser tabs (`core/tab/`).

## Invariants

- `backend-defaults.ts:catchUp` - the session's waiting asks as `approval-requested` events, then its active run as a `conciv.session-run` announcement; a new event subscriber receives these first, so an ask or a run started before it subscribed (a widget still opening its `chat.events` stream, or one resubscribing) still reaches it
- `backend-defaults.ts:FIRST_START_TIMEOUT_MS` / `FIRST_OUTPUT_TIMEOUT_MS` - the chat server's two limits on a turn: an agent that has not started 30000 ms (or `firstStartTimeoutMs`) after the turn began fails with `the agent did not start`, and an agent that started but has given no output 30000 ms (or `firstOutputTimeoutMs`) after it started fails as silent.
- `transcript.ts:createTranscriptImporter.sync` - messages already stored (by id) are skipped, and import resumes after the stored anchor `nativeId`; it reads only when the row's `harnessKind` is the session's harness, and stamps each imported assistant message with `metadata.conciv.harnessId`.
- `turn.ts:turnHooks` - every hook resolves the adapter with `deps.harnessFor(sessionId)`; a native id is resumed only when the row's `harnessKind` is that adapter, otherwise the full history is replayed.
- `backend-defaults.ts:hydrate` - takes an optional `{limit, before}` window and returns that page plus `page`; `messageHarness` maps each assistant message id of the page to the harness that produced it: the `chat_runs.harness_id` of its run, else its import stamp. `pendingApprovals` and `lastRun` are never paged. The first page of a live session imports the harness transcript first (`transcripts.sync`); a deleted session's (non-null `deletedAt`) skips that import, so opening it writes nothing into its thread.
- `turn.ts:turnHooks` - throws `the message is empty` for an empty user message.
- `turn.ts:firstUserTitle` - the session title is what the user sees of the first user message: its metadata `displayText` when it is not blank (what the user typed, without the note sentences the model reads), else, for a message of notes alone, the `label` of its first note in metadata `comments` (such as `Screen recording`), never the note sentences; a message with no `displayText` in its metadata titles with its text. Trimmed and cut at the title length.
- `turn.ts:turnHooks.admit` - refuses a turn on a deleted session (`deps.sessions.row` has a non-null `deletedAt`) with `session.DELETED` (`deletedSessionError`; message `session "<id>" does not exist`; its `code`, `SESSION_DELETED_CODE`, is what the library copies onto the `RUN_ERROR` frame), before anything of the turn is stored or published; a row that does not exist is admitted, so the first send to a new id creates the session.
- `turn.ts:turnHooks.end` - passes the run's `RunLifecycle` from the chat server's end hook on to `deps.sessions.onRunEnd(sessionId, run)`, so the caller knows whether the run completed, failed or was aborted.
- `turn.ts:turnHooks` - hands the harness the session row's `effort` as `HarnessChatDeps.effort`, or none when it is null (the CLI's default); `chat()` gets no `reasoning`, so the harness is the one place the effort reaches the CLI.
- `code-mode.ts:chatToolSet` - a non-lazy tool result goes through `cappedValue` from `@conciv/protocol`.

## Side Effects

- `stores.ts:clearThread` - one SQLite transaction deletes the thread's rows from the chat run and chat message tables, and its `chatMetadata` keys prefixed `<threadId>:`.
- `backend-defaults.ts:ChatPlane.compact` - inserts a row with `kind: 'compact'` into the `markers` table (`db/schema.ts`). For a deleted session it rejects with `deletedSessionError` (`session.DELETED`, `session "<id>" does not exist`) before it stops anything or writes the marker.
- `approvals.ts:createUiChannel` - sets a `setTimeout` per wait that resolves with a fallback value.
- `turn.ts:turnHooks` - passes `deps.harnessEnv(sessionId)` to the harness process; the caller supplies it (the engine reads it from its ConfigProvider), the chat plane reads no env itself.
