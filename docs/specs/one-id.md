# One id: every id conciv makes comes from one place (maintainer ruling 2026-11-23)

Lane: plugins-p. Fresh worktree from origin/main: `../aidx-wt-one-id`, branch `feat/one-id`.
Run fresh-worktree setup yourself (pnpm install + uno-preset build). Commit this file as `docs/specs/one-id.md`
in the first commit.

## Ruling

As opencode (`packages/opencode/src/id/id.ts` and `packages/opencode/src/session/schema.ts` in the opencode repo):
one id maker, one prefix table, every id a branded schema with a prefix check and a `create`/`ascending` static.
No `crypto.randomUUID()` for an id, no hand-made formats (`conciv_<uuid>`, `q_<uuid>`, `${Date.now()}-...`,
`.slice(0, 8)`), no second helper.

## The one maker

`packages/plugin/src/schema/identifier.ts` already has opencode's `ascending()`/`descending()`. It becomes the only
maker, with opencode's prefix table (`prefixes`, and `ascending(prefix, given?)` that throws when `given` lacks the
prefix). Existing users: `event.ts` (evt_), `permission.ts` (per_), `session-message.ts` (msg_), `workspace-id.ts`
(wrk_). Every other id gets a schema the same way, in the package that owns the entity (SDK schemas for what plugins
see; core/chat/plugin packages for their own), all calling this maker. Pick opencode's prefix where opencode has the
entity (ses, msg, prt, evt, per, que, tool, pty, wrk, job); name new prefixes in the same 3-letter style and list
them in the table.

## Sites on origin/main (verify, and grep again for any I missed: randomUUID, Math.random, Date.now ids, getRandomValues)

Make ids (move to the maker):

- Sessions: `packages/core/src/sessions/session-rows.ts:56` `conciv_<uuid>`: becomes `ses_` + descending (check what
  opencode's SessionV2.ID uses and match it).
- Messages: only the messages conciv's own code makes (`packages/ai/src/server/model-request.ts:113`, the chat
  server's stopped and synthetic messages) take `SessionMessage.Id.create()`. Assistant messages a CLI streams keep the
  id TanStack AI or the CLI gives them (maintainer ruling 2026-11-23 on #1185: ids made by others keep their format);
  nothing restamps them.
- Runs and markers: `packages/chat/src/index.ts:170,203,231,237`, `packages/core/src/sessions/session-actions.ts:44`,
  `packages/harness/src/codex/index.ts:51` (Codex's per-run id prefix stays as it is), `packages/harness-testkit/src/harness-engine.ts:217`.
- Calls and tasks: `packages/ai/src/server/code-mode.ts:219`, `packages/chat/src/code-mode.ts:85` (fallback only;
  a provider's tool call id stays as given), `packages/core/src/api/call-trace.ts:35`, `packages/cli/src/hub.ts:277`.
- Engine, pty, settings: `packages/core/src/app.ts:520`, `start.ts:275`, `pty/pty-sessions.ts:298` (`pty_<uuid>`),
  `pty/persistent-ptys.ts:47`, `settings/settings-storage.ts:48`.
- Plugin host error refs: `packages/plugin-host/src/core/plugin.ts:110`, `core/plugin/supervisor.ts:55` (`err_<8>`),
  `util/observability/shared.ts:4`.
- App: `apps/conciv/src/composer/comment-note.ts:31`, `pane/draft-storage.ts:683`,
  `runtime/plugin/uuid.ts` (delete; `dialog-stack.tsx:281` uses the maker),
  `packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.ts:46` (delete its fallback helper).
- Plugins: page (`attachment.ts:144`, `connection.ts:322,633`, `operations.ts:321`, `queue.ts:146`,
  `renderer.tsx:32-33`), recorder (`capture-control.ts:82`, `panel-view.tsx:31,54`, `plugin-experimental.tsx:163`,
  `recordings.ts:101`), tanstack (`error-ring.ts:42`), ios (`client.tsx:118` `native-<uuid>`), whiteboard
  (`canvas-tools.ts`, `comment-writes.ts`, `comments-model.ts`, `index.ts`, `island-model.ts`, `pending.ts`,
  `tools.ts`, `whiteboard-db.ts`), plugin-testkit (`mount.ts:51`).
  Not ids, stay as they are (say so in the PR):
- Secrets: `core/src/app.ts:550` and `start.ts:274` agent tokens, `plugin-host/src/util/effect-flock.ts:167`.
- Temp and staging file names: `core/src/lib/dev-endpoint.ts:28`, `protocol/src/engine-trust.ts:57`,
  `plugin-host/src/util/npm.ts:279`, `harness/src/claude/chat.ts:71`, `recorder/src/video.ts:18`,
  `page/src/files.ts:39`, `plugin-testkit/src/engine-coverage.ts:37`.
- Library formats: `storage-history/src/index.ts:54` (TanStack Router history key).
- Ids made by others keep their format, typed as their own branded schema: CLI session ids (HarnessSessionId),
  assistant message ids from TanStack AI or the CLI,
  provider tool call ids.
- `packages/extensions/design`: extensions are dead, do not touch.

## Rules for the change

- Every id is a branded schema with its prefix check; no bare `string` id crosses a package boundary.
- One maker. After the change, `git grep randomUUID` outside the "not ids" list above returns nothing; a lint rule
  or repo check that keeps it so is welcome if one line in the existing oxlint plugin does it (ask before more).
- v0: no migration and no old-format readers. Say in the PR whether an existing local database needs a reset.
- Tests: no new test files; fold id checks into existing journeys only where behaviour changed (session ordering,
  message ids on tool calls).

## Gates

Inbox the head after the FIRST working commit, before local gates. Then: check-test-budget, check-changesets
--require-coverage --base origin/main, typecheck/lint/fallow of touched packages, each touched test file by name
(browser files under the gate lock).

## Rules

Commit locally, do NOT push, do NOT open a PR. Never bypass hooks. Never rebase a pushed branch. Never git stash.
No mocks. No new API beyond the id schemas named here; ask before any other. No README edits except lines naming
what is deleted or moved. Headless browsers only. Kill processes by PID only, never by name pattern, never port 3000.
Subagents run Opus; tell them "You are a subagent. Don't run memo."
