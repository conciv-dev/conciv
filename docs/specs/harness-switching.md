# Harness switching within one chat session

## Goal

A user with more than one harness installed (Claude Code, Codex, Gemini CLI, opencode, pi) can switch the
harness of the current conciv session between turns. The chat continues: the new harness receives the
conversation so far, and the message log shows which harness produced each assistant message.

## Decisions (made by Omri, 2026-11-03)

1. Build it now.
2. On switch, the new harness receives the full chat history (replay). If the chat is not empty, a confirm
   dialog first tells the user the history will be sent, with an approximate token count. An empty chat
   switches without a dialog.
3. Every assistant message shows which harness produced it.
4. Switching back to a harness used earlier in the same session replays the full history again (same
   confirm). It never resumes that harness's old native session, which has not seen the other harness's turns.

## Current shape (what is single-harness today)

- `packages/core/src/app.ts:315` picks ONE adapter at boot (`opts.harness ?? requireHarness(opts.cfg.harness)`,
  from `CONCIV_HARNESS` / `--harness`). Everything downstream receives that adapter.
- `sessions` rows (`packages/db/src/schema.ts`) already carry `harnessKind` and `harnessSessionId` per row,
  but every writer fills `harnessKind` from the boot harness (`app.ts:330`, `api/rpc/sessions.ts:53`).
- Turn planning (`packages/chat/src/turn.ts` `turnHooks.plan`) calls `deps.harness.chatConfig(...)`. When
  `resumeSessionId === null` it already sends the full history (`providerMessages`, line ~212); otherwise only
  from the last user message. Replay therefore exists; switching is "clear the native id, change the harness".
- Other single-harness consumers: `turn.ts` (resume check, context tokens, compact prompt, context window,
  system prompt capability), `packages/chat/src/transcript.ts` (native transcript import),
  `packages/core/src/sessions/commands.ts` (slash commands), `packages/core/src/api/rpc/router.ts:150` and
  `api/rpc/sessions.ts` (models, harness meta, session list, native session import),
  `packages/extensions/terminal/src/server.ts` (TTY / connect plan / release), `ServerHarness` in
  `packages/extension/src/types.ts`.
- Assistant messages already carry `metadata.tanstack.run.id` (`transcript.ts:29`), and `chat_runs`
  (`packages/ai/src/server/chat-tables.ts`) has one row per run.
- Harness detection (`detectHarnesses`, PATH binary or config dir) lives in `packages/cli/src/init/harness-detect.ts`.

## Design

### Available harnesses

- Move `detectHarnesses` (and the `detection` data it reads) into `@conciv/harness` so core and cli share
  one implementation; cli imports it from there. No second copy.
- Core computes the available set once at boot: the boot harness plus every detected registered harness.
  The boot harness stays the default for new sessions.

### Per-session harness

- The session row's `harnessKind` becomes the source of truth for which harness runs that session. Core
  resolves the adapter per session (`getHarness(row.harnessKind)`) wherever it used the single `deps.harness`.
  The boot adapter is used only for things that have no session (default for `sessions.create`, `/health`).
- Replace the single `harness` dependency in `TurnDeps`, `CommandSource`, the RPC deps and `ServerHarness`
  with a per-session lookup. One lookup function, passed down; no cache or map beside the registry.
- `resumableToken` must also return `null` when the row's `harnessKind` is not the adapter being planned (the
  native id belongs to another CLI).

### Switch operation

- New RPC procedure `sessions.switchHarness` in `packages/contract/src/contract.ts`, input
  `{sessionId, harnessId}` zod-validated; `harnessId` must be in the available set, else a typed error.
- Rejected while a run is active for that session (typed error; the UI disables the control during a run).
- Effect, in one transaction: set `harnessKind = harnessId`, `harnessSessionId = null`, `model = null` (the
  previous model id is meaningless for the new harness; the new harness's default applies). Clear the
  transcript import anchor for that session (`TRANSCRIPT_NAMESPACE` key in `transcript.ts`) so the importer
  never reads the old harness's file again.
- Switching to the session's current harness is a no-op.
- The next turn naturally replays: no native id, so `providerMessages` sends the full history. After that
  turn the new native id is stored as today and later turns resume natively.

### Replay content

- Replay sends our stored history as-is through the new adapter's `prepareMessages`. Tool calls and results
  produced by the previous harness are part of that history. If an adapter rejects foreign tool-call parts
  (ids it did not mint, tool names it does not know), the fix belongs in that adapter's `prepareMessages`
  (flatten such parts into text), not in core. Verify every registered adapter with a replayed history that
  contains another harness's tool calls.
- Images from earlier turns: adapters with `imageInput: 'fileRef'` vs `'native'` must both accept the replayed
  image parts; same verification.

### Per-message harness tag

- Add `harness_id` (text, not null) to `chat_runs`, written when the run row is created from the session's
  harness at plan time. Migration backfills existing rows from their session's `harnessKind`.
- The UI resolves an assistant message's harness through `metadata.tanstack.run.id` to the run row. Expose it
  through the existing history/messages RPC output (a field next to the message, from the run join), not a
  new endpoint.
- Imported native-transcript messages (no conciv run) take the session's harness at import time.
- Render: a small harness label on each assistant message, shown only when the session has used more than one
  harness (single-harness chats look exactly as today).

### Session list and native session import

- `sessions.list` lists conciv sessions of every harness for the cwd (drop the boot-harness filter), each
  carrying its `harnessKind` so the selector can label it.
- Native session import (`history.list`) runs for every available harness that has `transcriptHistory`,
  results labelled by harness.

### Widget UI (apps/conciv)

- Harness switcher next to the model selector (`apps/conciv/src/composer/model-selector.tsx`), listing the
  available harnesses; hidden when only one is available. Reuse the existing selector/listbox primitives.
- `models`, `commands`, harness meta (`harness-meta.ts`: name, `canLaunch`, `imageInput`) are per session:
  the queries key on the session and refetch after a switch.
- Confirm dialog when the chat has messages: "Switching to <Name> sends this chat's history (~N tokens)."
  N comes from the session's existing context token count when known, else an estimate from message text
  length; the dialog says "about". Uses the existing dialog component.
- Control disabled while a run is streaming.

### Terminal extension

- TTY command, connect plan and `release` resolve from the session's harness. A session switched away from a
  harness cannot reopen that harness's old TTY session.

## Out of scope

- Switching during a running turn.
- Carrying harness-internal state (todo lists, file caches) across a switch.
- Automatic compaction before switching.

## Acceptance

- Two installed harnesses: start on Claude, chat, switch to Codex (confirm shown with token estimate), ask
  "what did I ask you first?" and Codex answers from the replayed history. Switch back to Claude, confirm
  shown again, Claude also sees Codex's turns.
- Each assistant message shows the harness that produced it once the session has used two harnesses; a
  single-harness session shows no labels.
- Empty session: switch without a dialog.
- Switch control disabled during a run; RPC rejects a switch during a run and to an unavailable harness.
- Models, slash commands, image attachment behaviour and the launch/terminal menu follow the current
  session's harness after a switch, without a reload.
- Session list shows sessions of every harness with labels.
- Tests: node tests for the switch RPC (state reset, anchor cleared, rejections), `resumableToken` refusing
  a foreign native id, replay of foreign tool calls through each adapter's `prepareMessages`, run row harness
  tag and backfill. Browser test in the widget's existing browser test file for switcher, confirm dialog and
  labels. No new test files (`conciv/test-file-budget`), no mocks.
- Changeset covering the published packages touched.
