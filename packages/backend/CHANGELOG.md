# @conciv/core

## 0.0.25

### Patch Changes

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.

- [#1214](https://github.com/conciv-dev/conciv/pull/1214) [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a) Thanks [@omridevk](https://github.com/omridevk)! - Works on Node 22 and later (22.16 or newer, the first 22.x with the `node:sqlite` APIs the engine uses). Node code builds for node22, and `Promise.try` and `URL.parse`, which Node 22 lacks or added late, are not used.

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.
- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`220afb4`](https://github.com/conciv-dev/conciv/commit/220afb43997004a89a17f76b38dbafb65dc2e6d6), [`2db86b6`](https://github.com/conciv-dev/conciv/commit/2db86b663cc317c31f5b37de4131b56defdd5d33), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`ffd5efc`](https://github.com/conciv-dev/conciv/commit/ffd5efc53cc435f7f05def06080b71b573edbc43), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`8b8bc6f`](https://github.com/conciv-dev/conciv/commit/8b8bc6fd56da74578a3e8316e1c922d5cbf8cc6e), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/backend-defaults@0.0.25
  - @conciv/plugin-page@0.0.25
  - @conciv/simulation@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/backend-defaults@0.0.24
  - @conciv/plugin-page@0.0.24
  - @conciv/simulation@0.0.24

## 0.0.23

### Patch Changes

- [#959](https://github.com/conciv-dev/conciv/pull/959) [`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079) Thanks [@omridevk](https://github.com/omridevk)! - A deleted session whose Claude Code or Codex transcript is still on disk no longer comes back the next time the session list loads. Opening it again, or going to it by its native id, answers "session not found", like any other deleted session, and the transcript file is left as it was. A native session that conciv has never seen still opens as before. Going to any deleted session by its conciv id answers "session not found" too, instead of handing the deleted session back.

- [#951](https://github.com/conciv-dev/conciv/pull/951) [`315e107`](https://github.com/conciv-dev/conciv/commit/315e107f5f4227220039a43523f0c0b72e240724) Thanks [@omridevk](https://github.com/omridevk)! - A plugin that creates a session with the id of a deleted session is now refused with the same "session not found" error it gets when it reads that session, and the deleted session stays deleted, so it can still be restored later. A plugin that creates a session with an id that was never used still gets a new session under that id.

- [#936](https://github.com/conciv-dev/conciv/pull/936) [`cd5a223`](https://github.com/conciv-dev/conciv/commit/cd5a223235a4fb68a83b7866f241eec7cc143d8f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin or page that hears session.deleted and reads the session back now finds it already gone, as after the delete. A delete whose drafts cannot be dropped still publishes session.deleted, and a delete whose drafts, session.deleted event or any cleanup step fails still clears the session's messages, captures and page changes, then reports every failure.

- [#1168](https://github.com/conciv-dev/conciv/pull/1168) [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8) Thanks [@omridevk](https://github.com/omridevk)! - A finished queued page list reaches its session through `session.synthetic`, as opencode's background jobs report: the result arrives as a "Queued page actions <status>" notice that wakes an idle session, or waits for a live run to end. The engine's own page-queue follow-up turn, its `'page-queue'` turn kind and the `conciv.page-queue` chat event are gone, and the agent's in-chat code replies no longer repeat finished queue results (hub replies still carry them).

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A harness can now say whether its CLI is logged in, through a `login` check its capabilities declare. Claude reads it from the Agent SDK's account info, the way opencode does, and Codex from `codex login status`. A turn sent to a CLI that is not logged in is refused before the CLI starts, with a chat error that says how to log in, and the model lists carry the same login state.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A turn whose tools conciv runs keeps calling the model until it answers, with no step limit, as opencode, instead of stopping silently after 5 model calls.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code that is not on the PATH is no longer probed. The login check answers "Claude Code is not installed. Install it, then run `claude auth login`." without starting anything, the model and slash-command lists fail with the same message, and a send is refused with it before anything is spawned. Each check looks at the PATH again, so a `claude` installed later is found and probed on the next check. The PATH lookup is the one core already uses to detect the other agent CLIs, now shared from `@conciv/harness`.

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - Plugins hear a new `session.created` event when a session comes to exist: on its first send, from `sessions.create` or a plugin's `ctx.session.create`, when a terminal or listed transcript first gets its conciv session, and for an outside agent's first call. It carries the session id and, when it has one, the title. A session that already existed, or a deleted one, publishes nothing.

- [#1073](https://github.com/conciv-dev/conciv/pull/1073) [`66d8783`](https://github.com/conciv-dev/conciv/commit/66d8783229541cd71e1991732b60bdbee4040143) Thanks [@omridevk](https://github.com/omridevk)! - A brand-new terminal no longer says "conciv: resumed session"; the line appears only when the CLI picks up an earlier conversation.

- [#1000](https://github.com/conciv-dev/conciv/pull/1000) [`eeb8cb8`](https://github.com/conciv-dev/conciv/commit/eeb8cb8e2713a8f6143593adbf03ac0cc7eab9a8) Thanks [@omridevk](https://github.com/omridevk)! - A page tab with the conciv panel attaches again by itself after the engine restarts or its connection drops, so an agent can keep driving a page nobody is touching. A tab that attaches while the engine's plugins are still starting now waits for them instead of giving up until the page is reloaded.

  A page action that already ran is no longer reported as failed when saving its record afterwards fails, so the agent does not repeat it.

  A queued page action the engine gives up on stops on the page instead of still typing while the next one starts, and a page wait stops when it is cancelled.

  A queued page action that never reached the page is reported as lost, not counted as played.

  A page tab whose attach was refused because its page permissions could not be granted in time tries again by itself on a back-off instead of waiting for a reload; the engine option permissionSyncTimeoutMs sets how long that grant may take. A tab on a session that does not exist, deleted or new before its first send, does not retry; it attaches once the session is created.

  A page eval the config denies is refused from the widget's own tab too, not only from outside callers.

  A page read of the DOM or of an attribute shows a password field's value attribute masked, as a value read already did.

  When the page plugin is turned off it removes its agent cursor listeners from the host page and leaves a console wrapper installed after its own in place, and a tab waiting to attach again no longer adds listeners on every wait.

- [#1145](https://github.com/conciv-dev/conciv/pull/1145) [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344) Thanks [@omridevk](https://github.com/omridevk)! - A plugin can add a notice to a session with `session.synthetic({sessionID, text, ...})`, as opencode's: the notice waits in the session's inbox, wakes an idle session into a turn (unless `resume: false`), goes in with the next run when a run is live or stopped, and the same `id` twice stores one notice. The model gets the notice text as a user message, a resumed CLI session included; the chat shows the notice as its own row labelled with its description, and hides one whose description is missing or only spaces, unless the notice failed (metadata `state: 'error'`, or a shell notice that completed with a non-zero exit or a timeout), which shows under its text. A notice is never a session's title: a session takes its first typed message as its title.

- [#1072](https://github.com/conciv-dev/conciv/pull/1072) [`90e849a`](https://github.com/conciv-dev/conciv/commit/90e849ae6b799ed97a0e46e6f2a0be472ecae42a) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's `context` and `compaction` session hooks, as opencode's, run before every model request of a turn and edit the system prompts, messages, model options and tools the harness receives.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A plugin subscribed to `session.execution.started` now hears each run start; the engine published only how a run ended.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - A terminal resize the engine refuses (a size outside 2 to 500) is dropped instead of being typed into the CLI as text.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine publishes `session.renamed` on every rename, as opencode, and `ConcivEvent` carries it; a plugin or an event stream reader now hears a session's new title.

- [#986](https://github.com/conciv-dev/conciv/pull/986) [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf) Thanks [@omridevk](https://github.com/omridevk)! - An engine restart no longer forgets a deleted session that never ran, so its id stays deleted. It also keeps a new session that holds a typed draft, with the draft.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A run that ends right after a tool step now closes with a finished event, so the pane leaves "Responding…", and a model call's own end is no longer read as the end of the run.

- [#980](https://github.com/conciv-dev/conciv/pull/980) [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643) Thanks [@omridevk](https://github.com/omridevk)! - A message sent to a deleted session is refused before anything of it is kept: the send ends with the error `session "<id>" does not exist`, with no run, no stored message and nothing published on the session's stream. A page queue follow-up or a compaction of a deleted session is refused with that same error and starts no run; a refused compaction writes no compaction marker. A call from outside a run that is admitted per session (an MCP client's `code.execute` while hub access is not `open`) is refused for a deleted session as for one that does not exist. Opening a deleted session no longer moves its last-active time. A message sent to an id no session ever had still starts that session.

  If you implement `TurnHooks` yourself, add `admit: async (turn) => {}`. It runs before anything of the turn is stored, and a rejection refuses the turn with that error. If you build a `SessionPort` yourself, its `row` now returns `deletedAt` too: `null` for a live session, the time it was deleted otherwise.

  A turn or compaction refused because its session is deleted carries the code `SESSION_DELETED_CODE` (`'session_deleted'`, exported from `@conciv/types/chat-event-types` beside `CONTEXT_OVERFLOW_CODE`): on the `RUN_ERROR` frame and on the client's `Error.code`, so a client can tell a deleted session from any other failure.

  The RPC `sessions.compact` now declares the contract's `NOT_FOUND` error and answers it for a session that does not exist or is deleted, where it answered an internal server error before.

  With hub access `open`, an outside call (an MCP client's `code.execute` or a hub `registry.call`) on a deleted session is refused with `session "<id>" does not exist` too: it no longer runs, and nothing of it is recorded in the deleted session's chat.

  Opening a deleted session no longer imports its harness transcript into its thread: the history of a deleted session stays as the delete left it.

  In the widget, a deleted session shows a panel in place of the chat and composer: 'This session was deleted.' and one 'New session' button, also when the delete arrives while the pane is open. A delete that lands while the widget's event stream is not connected is picked up when the stream connects. A message refused because its session was deleted reads 'This session was deleted, so your message was not sent.' in the thread and in a notice, with no Retry, and the pane then turns into that panel. When the deleted session had saved text the panel adds 'Your text moves to the new session.', and 'New session' moves that text (not its attachments) into the new session. In the quick terminal the new session takes the deleted pane's place. Compacting a session that is deleted or does not exist says 'This session no longer exists.'. When a new session cannot be started, from any new-session action, a notice says 'Could not start a new session. Check that the engine is running, then try again.'

- [#907](https://github.com/conciv-dev/conciv/pull/907) [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b) Thanks [@omridevk](https://github.com/omridevk)! - A new session that has not run anything yet no longer says DONE in the status bar or LAST TASK in the header. The bar shows no status until the first message runs, and the header reads just CONCIV. After the first turn they read as before, and a session that ran reads DONE as soon as it opens, before its conversation loads.

  Every session row (`sessions.get`, `sessions.list`, `sessions.search`) now carries `lastRunAt`: when its newest run started, or `null` before the first run. `sessions.create` now answers `{sessionId, session}`, the new session's row, so a new session draws at once.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A message sent while the session's turn is still preparing its prompt (a plugin's `prompt` hook still running) now ends only that older turn and is answered. Before, the older turn, once its preparation finished, ended the newer one as well, so neither turn answered. A turn now ends only the turns that started before it, and a turn that a newer one already ended ends none.

- [#918](https://github.com/conciv-dev/conciv/pull/918) [`4d4a76d`](https://github.com/conciv-dev/conciv/commit/4d4a76d22102ccb2e4d57643386fa89f91e90025) Thanks [@omridevk](https://github.com/omridevk)! - A Stop pressed while a plugin's prompt hook prepares the message now interrupts the engine's hook run (an Effect hook is interrupted; a promise-style hook's function is abandoned and its result ignored) instead of leaving the run waiting. For implementers: `TurnPlan.prompt` (`@conciv/ai`) and the chat plane's `TurnDeps.prompt` (`@conciv/backend-defaults`) take the run's `AbortSignal` as a second argument; a stop aborts it, and the engine still ends the turn at once if an implementation ignores it.

- [#908](https://github.com/conciv-dev/conciv/pull/908) [`f80ae0e`](https://github.com/conciv-dev/conciv/commit/f80ae0ef0ee682829aaf1711d8eb82dfd0b112ac) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool that must ask before it runs now always asks, also when its plugin reloads during a chat turn. A call that arrives while plugins reload waits for the reload to finish and runs the tool as it is now, and a tool its plugin no longer offers is refused instead of running from the old copy.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A tool's time rides its result's metadata onto its one tool-call part, so a finished tool no longer replaces the whole message list and a long tool run stays smooth. The `conciv.tool-time` event is gone.

- [#1138](https://github.com/conciv-dev/conciv/pull/1138) [`eb49d7d`](https://github.com/conciv-dev/conciv/commit/eb49d7d8cbdc756157a270f4b564db346bf4dc39) Thanks [@omridevk](https://github.com/omridevk)! - With `OTEL_EXPORTER_OTLP_ENDPOINT` set, a trace now shows a whole chat turn (the model steps, each tool call, code mode with each tool call made inside the program, the tool bridge and the permission ask), every RPC call by its procedure path, native session reads, and each step of an engine start and stop. All of it goes to the one exporter the engine already had. Spans carry ids and names only, never message text, tool input or output.

- [#998](https://github.com/conciv-dev/conciv/pull/998) [`20b7c05`](https://github.com/conciv-dev/conciv/commit/20b7c05ecc0a1d1d4778fdf3ace6494f0433a5e4) Thanks [@omridevk](https://github.com/omridevk)! - A turn the agent started that fails before any reply keeps your message in the conversation and shows its error with Retry, instead of a passing "Couldn't load this conversation" and the text back in the composer.

  "Couldn't load this conversation" shows only when the conversation's history failed to load: a first message the engine refuses shows its error row with the text back in the composer and a notice that says why, like a later refused message.

- [#878](https://github.com/conciv-dev/conciv/pull/878) [`265f2e2`](https://github.com/conciv-dev/conciv/commit/265f2e2341a36d81ac291d0bab2cd6a4f3785e14) Thanks [@omridevk](https://github.com/omridevk)! - An agent that is slow to start is no longer failed for silence before it has started. It gets its own start limit, failing with "the agent did not start within 30s", and the silence limit ("the agent produced no output within 30s") counts from its first sign of life.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine log names a failed code-mode program (`ReferenceError: ...`) instead of printing `[object Object]`, and an error line without an error no longer ends in `: undefined`.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - An empty PATH entry counts as the working folder when checking whether a CLI is installed, as the spawn itself does, so a `claude` reached that way is no longer reported as not installed.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A terminal whose program already ended no longer crashes the dev server when the Terminal tab resizes it in the moment before its exit arrives.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tab stays open through an engine restart. Before, the widget reconnected while the engine was still starting its plugins, read an empty plugin list and sent the user back to Chat; the engine now answers its plugin list once its plugins are active.

- [#982](https://github.com/conciv-dev/conciv/pull/982) [`ea2713e`](https://github.com/conciv-dev/conciv/commit/ea2713e17729e3af8ba96313f0413c7043484870) Thanks [@omridevk](https://github.com/omridevk)! - A `harness` option or `CONCIV_HARNESS` value that no registered harness has now stops the engine from starting, with `conciv: unknown harness "<id>". Known harnesses: claude, codex, gemini-cli, opencode, pi.`, before any port is bound. Before, the engine started on claude without a word, so a typo in the harness name went unnoticed. `conciv-try --harness` names the same registered harnesses instead of a fixed list. With no harness given, claude is still the default.

- [#839](https://github.com/conciv-dev/conciv/pull/839) [`fe94df4`](https://github.com/conciv-dev/conciv/commit/fe94df49d1089d57a4e08f19b731cc24f4a4f031) Thanks [@omridevk](https://github.com/omridevk)! - New `conciv auth link <page-url>` prints a one-time login link for the conciv dev server of the current project, for example `http://localhost:3001/#conciv_otp=123456`. Opening it logs that browser in without reading a code from the terminal, so a headless run (Playwright, `claude -p`) can log in on its own. The code comes from the new `auth.issueCode` procedure, which only the engine token may call.

  Outside agents that name the tab they act on (the `conciv` CLI with `--tab`, a `conciv mcp serve` call with a `tab`, and the Claude plugin bridge) no longer get a per-call Approve card for tools that ask: their own permission mode decides. A `conciv` CLI call with no `--tab` that finds its engine through the home db acts on the user's latest tab, so it keeps the Approve card. The agent inside the tab keeps its Approve cards, and the one-time Allow under `hubAccess: 'session'` or `'project'` is unchanged.

- [#821](https://github.com/conciv-dev/conciv/pull/821) [`85d4a85`](https://github.com/conciv-dev/conciv/commit/85d4a854b9bcdc7c46a0e40a8a7d3bd4b8a6840f) Thanks [@omridevk](https://github.com/omridevk)! - `conciv auth revoke` now locks a browser out of a running engine on its very next request: the engine checks the trusted browsers file on each request instead of a copy refreshed by file system events, and closes a revoked browser's open sockets within a quarter second.

- [#1191](https://github.com/conciv-dev/conciv/pull/1191) [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e) Thanks [@omridevk](https://github.com/omridevk)! - Packages follow one layered map: the engine is `@conciv/backend` (was `@conciv/core`), the widget bundle is `@conciv/app` (was `@conciv/embed`), the plugin SDK is split into `@conciv/backend-plugin-api` and `@conciv/frontend-plugin-api` (was `@conciv/plugin`), the engine contract and schemas are `@conciv/protocol` (was `@conciv/contract`), the wire types are `@conciv/types` (was `@conciv/protocol`), the plugin host is `@conciv/backend-app-api` (was `@conciv/plugin-host`), and `@conciv/harness-init` is `@conciv/harness/init/*`. Tests run with plain `vitest run`.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A built-in plugin takes its options from its config entry, as any plugin does: `plugins: [['conciv.page', {pageReplyTimeoutMs: 1000}]]` reaches the page plugin's `ctx.options` in the engine, and the plugin list carries those options to the plugin's window part, as a package plugin's bundle does. The window part of the page plugin now has the id `conciv.page`, the same as its engine part. The engine's own `pageReplyTimeoutMs` and `queuedActionTimeoutMs` start options, the test engine's timeouts of the same names, the app's `timings.page` and the kit's `mount({timings})` are gone.

- [#1106](https://github.com/conciv-dev/conciv/pull/1106) [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23) Thanks [@omridevk](https://github.com/omridevk)! - A chat turn rides the browser rpc socket. `chat.send({sessionId, messages, runId})` starts the run once and streams it, and `chat.join({runId, lastEventId?})` streams a run from an event id; every event carries its offset in the run's log as its id, so a resubscribe after a drop never repeats one, and a resend of a known run id streams it instead of running it again. The `/chat-ws` socket, the `/chat-sse` stream, their path constants, the transport probe and the widget's `transport` setting are gone. `chatConnection` drops its transport options, and `@conciv/ai/client` exports `rpcStream` in place of `fetchServerSentEvents` and `webSocket`. A chat run that loses its stream retries on the rpc socket up to five times in a row with no event in between (250 ms doubling to 5 s), an event restarts that count, and once it is spent the turn fails with TanStack AI's `StreamReconnectLimitError`, as the old chat socket did; an error the engine answers is not retried.

- [#909](https://github.com/conciv-dev/conciv/pull/909) [`57eab25`](https://github.com/conciv-dev/conciv/commit/57eab253e10bd520714bbae304a25bf1b908b135) Thanks [@omridevk](https://github.com/omridevk)! - No behaviour change: `chat.stop` answers `{ok: true}`, what its contract declares and what the wire already carried.

- [#814](https://github.com/conciv-dev/conciv/pull/814) [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796) Thanks [@omridevk](https://github.com/omridevk)! - The chat client turns off TanStack AI's devtools bridge, so the page no longer copies every chat message on each change.

- [#1022](https://github.com/conciv-dev/conciv/pull/1022) [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9) Thanks [@omridevk](https://github.com/omridevk)! - Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

  A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.

  A bash call shows one box: its command is the header row, with copy and the expand control on that same line, and the output below. A long block shows exactly eleven lines (seventeen for logs and files) and its expand control names the true number of hidden lines; the trace row no longer clamps a code block a second time. Search matches, code-run output and a finished code fence in a chat message use the same header. Every icon in a kit button is a block box, so it centres with its label at any line height.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The agent learns its code-mode tools from one catalog, grouped by namespace within a budget, with only the changes sent after the first turn; the MCP `execute_typescript` description carries the same catalog text.

  With no isolate driver, code mode is off as in opencode: every tool reaches the agent as its own direct tool and as its own MCP tool, and the catalog is in neither the system prompt nor the instruction state. `@conciv/ai/server` exports `loadIsolateDriver` and the `CodeDriver` type; `createChatServer` and `createChatPlane` take the `driver`.

- [#1071](https://github.com/conciv-dev/conciv/pull/1071) [`51708bc`](https://github.com/conciv-dev/conciv/commit/51708bc06ee28f6ff7529ee6a381aa2225e3675c) Thanks [@omridevk](https://github.com/omridevk)! - A tool called from code mode, and its result, stay out of what the model reads next, also when the browser sends back a reply it never saw finish. The chat still shows its card.

- [#1071](https://github.com/conciv-dev/conciv/pull/1071) [`51708bc`](https://github.com/conciv-dev/conciv/commit/51708bc06ee28f6ff7529ee6a381aa2225e3675c) Thanks [@omridevk](https://github.com/omridevk)! - A tool called from code mode shows its own output files on its card, so a recording pulled through code mode counts its keyframes.

- [#886](https://github.com/conciv-dev/conciv/pull/886) [`d2ea93e`](https://github.com/conciv-dev/conciv/commit/d2ea93eb917965571fe7a4f92fd52b060955ccad) Thanks [@omridevk](https://github.com/omridevk)! - Code mode runs in the QuickJS sandbox on every platform. conciv no longer installs the native `isolated-vm` addon, so there is one install script fewer to decide and nothing to compile.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Code-mode tools can be found with a `search` function inside the sandbox, and `@conciv/ai/server` exports `describeSchemas`, which turns a tool's input and output schemas into their TypeScript type text and the input's parameter names.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - In code mode a tool's text parts reach the model beside its value, so the untrusted page data note arrives. Identical lines from many calls in one program arrive once.

- [`78072c4`](https://github.com/conciv-dev/conciv/commit/78072c4bd6187045a2eca50d5511f18f680e5672) Thanks [@omridevk](https://github.com/omridevk)! - A code mode tool called with no argument now receives an empty object instead of failing with "undefined" is not valid JSON.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - conciv ships two built-in skills, one that points the agent at conciv's documentation and one for reporting an issue.

- [#992](https://github.com/conciv-dev/conciv/pull/992) [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd) Thanks [@omridevk](https://github.com/omridevk)! - conciv writes .conciv/.gitignore so its machine state stays out of git; settings/ and harnesses.json stay shareable.

- [#981](https://github.com/conciv-dev/conciv/pull/981) [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5) Thanks [@omridevk](https://github.com/omridevk)! - `CONCIV_UI_SELECTOR` and `EFFECTS_SURFACE_ATTR` move to `@conciv/types/page-types` (new exports there). `@conciv/extension` re-exports both from protocol, so old extensions keep their import; `@conciv/page` imports them from protocol.

  The RPC transport moves to the new `@conciv/serve/rpc` subpath: `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware` and `rpcWebsocketRoute`. `@conciv/serve` now depends on `@conciv/protocol`, `@orpc/server`, `semver` and `zod`. `@conciv/extension/rpc-mount` no longer exports `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `rpcConnectionContext` or `rpcHandlerOptions`; it keeps `makeCompositeRpcRouter`, `CompositeRpcRouter` and `MountedExtensionRouter`. `@conciv/backend`, `@conciv/backend-defaults` and `@conciv/extension` take the transport and its `UpgradeWebSocket` type from `@conciv/serve/rpc`, and the engine staleness probe now tracks both `@conciv/serve` entries.

- [`11afc71`](https://github.com/conciv-dev/conciv/commit/11afc714a6250a51ba77019a4404f82ed07ef496) Thanks [@omridevk](https://github.com/omridevk)! - Remove dead code left over from the old extension system in core, protocol, contract, chat and client, and fix the stale READMEs. The `harnessBin` setting and its `claudePath` / `CONCIV_CLAUDE_PATH` aliases are removed, because they never took effect. The import of pre-plugin chat databases is removed, and a migration drops the legacy runs, run_messages and image_history tables.

- [#872](https://github.com/conciv-dev/conciv/pull/872) [`492b789`](https://github.com/conciv-dev/conciv/commit/492b78949d199f86daddbb53e17c4d544d3d6dd7) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/backend` no longer lists `@hono/node-server` as a dependency, since it reaches the Node server only through `@conciv/serve`.

- [`6083f45`](https://github.com/conciv-dev/conciv/commit/6083f45c604473e6a43f48bb90895882061d9c7e) Thanks [@omridevk](https://github.com/omridevk)! - Core reads its env values (CONCIV_STATE_ROOT, CONCIV_HARNESS, the session ids, CONCIV_HOME, PATH, HOME and the whole env for harness children and pty shells) as Effect Config through the engine's ConfigProvider. `start` and `makeApp` take an optional `configProvider` (default `ConfigProvider.fromEnv({preserveEmptyStrings: true})`), which also reaches the plugin host runtime; `resolveConfig` takes it as an optional third argument.

- [#1030](https://github.com/conciv-dev/conciv/pull/1030) [`11f4d64`](https://github.com/conciv-dev/conciv/commit/11f4d64d87bc9324f0e55cd69f542246a19ceafc) Thanks [@omridevk](https://github.com/omridevk)! - Core expands grabbed elements itself. `@conciv/extension-page` is no longer published.

- [#921](https://github.com/conciv-dev/conciv/pull/921) [`a16ba7d`](https://github.com/conciv-dev/conciv/commit/a16ba7d2155d177c44658a902a8a3859e62dcef5) Thanks [@omridevk](https://github.com/omridevk)! - Deleting a session stops its run first: a live run, a turn still waiting in a plugin's prompt hook and a running `experimental.idle` hook end before anything of the session is removed, so plugins hear `session.deleted` last. Its page queue follow-up work is cancelled too: a follow-up in flight answers before the session is cleared and is not retried, and a queue result that lands after the delete starts no turn.

- [#862](https://github.com/conciv-dev/conciv/pull/862) [`fb55d51`](https://github.com/conciv-dev/conciv/commit/fb55d51aeb04040b4ba6e6bab7a8a04ae77af73c) Thanks [@omridevk](https://github.com/omridevk)! - The design extension no longer carries its own test suite.

- [#986](https://github.com/conciv-dev/conciv/pull/986) [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf) Thanks [@omridevk](https://github.com/omridevk)! - `drafts.set` takes the client's `updatedAt`, and the engine stores it as sent.

- [#819](https://github.com/conciv-dev/conciv/pull/819) [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb) Thanks [@omridevk](https://github.com/omridevk)! - Drop the last local patches on the TanStack AI packages. conciv now keeps tool-call metadata, failed results and a stable message id in its own middleware, carries its own call ids on code-mode child calls, validates code-mode tool input and output itself, reads the Claude Code context window from `modelUsage`, and lets the local sandbox forget finished runs. The session's effort now reaches the harness as `HarnessChatDeps.effort`: the Claude harness runs the CLI with `CLAUDE_CODE_EFFORT_LEVEL`, so Claude 5 models get the picked effort too, and codex reads it for `model_reasoning_effort`.

- [#883](https://github.com/conciv-dev/conciv/pull/883) [`be0b843`](https://github.com/conciv-dev/conciv/commit/be0b84342d4a34cc41f59669bc881dedac20c0fd) Thanks [@omridevk](https://github.com/omridevk)! - A Stop pressed right after sending, while the turn is still being prepared, now stops it: the turn ends Stopped instead of going on to answer. A Stop that arrives before the engine has received the message at all can still be missed.

- [#1150](https://github.com/conciv-dev/conciv/pull/1150) [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f) Thanks [@omridevk](https://github.com/omridevk)! - The engine no longer serves `editor.openFromFrames`, and the SDK client no longer has an `editor` group: nothing called it, and opening a grabbed element's source goes through the page plugin.

- [#816](https://github.com/conciv-dev/conciv/pull/816) [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101) Thanks [@omridevk](https://github.com/omridevk)! - The widget bundles are now small classic-script loaders over shared, code-split ES chunks in `dist/widget/`, so mermaid, katex, shiki grammars, xterm and the chat highlight worker load only when used, and the IIFE source maps are gone (the embed `dist` drops from 152 MB to about 30 MB). Serve `dist/widget/` next to `conciv-widget.global.js`; the native page serves it automatically.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes a clock: `start` and `makeApp` accept a `clock` layer provided under the whole plugin host, and the event heartbeat, the page source-map fetch and queued page plays run on it. The test kits gain `clock: 'test'` with `engine.clock.advance(call)` and `engine.clock.drain()`, opencode's stepped test clock.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The engine reads and writes its saved model lists, port record, dev endpoint file and staleness digests without blocking, and finds agent CLIs, the repository and the terminal helper without blocking.

- [#1135](https://github.com/conciv-dev/conciv/pull/1135) [`8913a30`](https://github.com/conciv-dev/conciv/commit/8913a30cd463113c644268180d7ecc4edbdf416b) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes a `log` option (`{emit}`, as opencode's SDK): `start` and `makeApp` hand every Effect log of the engine and its plugins to `emit`, beside the log file in the conciv home and the OTLP exporter. The minimum level stays `CONCIV_LOG_LEVEL`. The engine logs a start line once its plugins are supervised.

  The engine no longer writes to the console: every line it used to print (errors, the browser login code, the "port in use" notice) is an Effect log with its values as annotations, and the `print` option is gone. The Vite plugin, the other unplugin hosts and `@conciv/try` show the login code banner, and warnings and errors as their message plus the error; other entries, such as the plugin host's file watcher lines and the start line, stay in the log file.

- [#1119](https://github.com/conciv-dev/conciv/pull/1119) [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db) Thanks [@omridevk](https://github.com/omridevk)! - The engine, the chat plane and the widget no longer load extensions; plugins replace them. Every plugin tool is a CLI command, and plugins hear how a run ended through `session.execution.succeeded` and the new `session.execution.failed` event.

- [#838](https://github.com/conciv-dev/conciv/pull/838) [`8c60ea5`](https://github.com/conciv-dev/conciv/commit/8c60ea5a4fea93e5308068bee43bdd432cb933fd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now creates the rows for a configured session id and harness session id before start resolves, and a failure there rejects start with a message naming the id instead of only logging it.

- [#1137](https://github.com/conciv-dev/conciv/pull/1137) [`2c3306b`](https://github.com/conciv-dev/conciv/commit/2c3306b72cc0e3fa4513505572676611eb885654) Thanks [@omridevk](https://github.com/omridevk)! - The engine exports its Effect spans and logs over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (with `OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_RESOURCE_ATTRIBUTES`), as opencode does. With the variable unset nothing is exported. Every engine Effect log line now goes to `<conciv home>/log/conciv-local.log` (trimmed to 25 MB past 50 MB) instead of the terminal; `CONCIV_PRINT_LOGS=1` prints them to stderr as well and `CONCIV_LOG_LEVEL` sets the lowest level kept.

- [#895](https://github.com/conciv-dev/conciv/pull/895) [`75ce766`](https://github.com/conciv-dev/conciv/commit/75ce766fc61e019d3a043b0ccd4a45f5c0672085) Thanks [@omridevk](https://github.com/omridevk)! - conciv starts again in a project whose dev server died while the agent was answering. Before, every later start failed with `ReferenceError: Cannot access 'plane' before initialization` until the project's conciv state was removed; now the cut turn shows as stopped and the engine starts.

- [#933](https://github.com/conciv-dev/conciv/pull/933) [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d) Thanks [@omridevk](https://github.com/omridevk)! - Closing the dev server ends a harness's model listing that is still running and waits for it, up to a grace of 5 seconds. For OpenCode the listing (`opencode models --verbose`) runs in its own process group, which gets SIGTERM when the engine stops: a CLI that exits on SIGTERM is gone before the close resolves; a CLI that ignores SIGTERM gets SIGKILL when the grace runs out, so the close (which waits the same grace) can resolve just before it is gone, and the engine prints that the OpenCode listing did not end. Codex lists its models without a child process. Claude's model probe is ended by the Agent SDK on the SDK's own timers (its stdin is closed, SIGTERM follows about 2 s later and SIGKILL about 5 s after that), so that probe can outlive the close by up to those delays. A listing that does not settle within the grace (for example a `models` function that ignores the signal) no longer holds the close: the engine prints which harness's listing did not end and closes without it.

  For harness authors: a `models` function now receives `{signal}`, an `AbortSignal` the engine aborts when it stops. Pass it to whatever lists the models (a child process, a `fetch`, an SDK's abort controller) and settle once that child has exited. A `models` function that takes no parameter still type-checks, since a function with fewer parameters is assignable; if it never settles, it costs the close the full grace. `resolveHarnessModels(adapter, {signal})` now takes the signal and hands it on.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Stopping the engine during a running turn no longer logs that the page queue results could not wait for the next reply.

- [#1149](https://github.com/conciv-dev/conciv/pull/1149) [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723) Thanks [@omridevk](https://github.com/omridevk)! - The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

  A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `makeApp` takes `app: {version}`, the version the engine reports in its `x-conciv-version` header, on every route and on a refused (401) request. Without it the engine reports the core package version, as before. The test kits pass `app` through, so a test can start an engine that reports an older version and see the widget's "the conciv engine is older" notice.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine reads its reported version (`app.version`) and its stale-code report (`staleness`) on every request: both are functions, and one that answers `undefined` falls back to the core package version and the engine's own stale check.

- [#945](https://github.com/conciv-dev/conciv/pull/945) [`5d160e7`](https://github.com/conciv-dev/conciv/commit/5d160e7841fe6961e0d03938e43ee00cf2e6ca37) Thanks [@omridevk](https://github.com/omridevk)! - The engine's event stream heartbeat interval is now settable: `makeApp` takes an optional `eventHeartbeatIntervalMs` (default 15 000 ms, as before) for how often `event.subscribe` sends its `server.heartbeat` frame.

- [#917](https://github.com/conciv-dev/conciv/pull/917) [`ebcc567`](https://github.com/conciv-dev/conciv/commit/ebcc5679266560e4e9fc65c46bd1c6e797c617ac) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's event readers notice an event stream that went silent. The engine now sends a `server.heartbeat` frame on `event.subscribe` every 15 seconds, also under a `types` filter, as opencode's server sends its keepalive. The client counts it as activity and never hands it to a reader; when a stream sends nothing for 45 seconds, the client gives it up with "Event stream stalled", waits one second and subscribes again, so every reader sees `server.connected` again, its cue to resync. A raw `event.subscribe` reader sees the heartbeat frames.

- [#1126](https://github.com/conciv-dev/conciv/pull/1126) [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/extension` is deleted and no longer published: plugins replace extensions. `@conciv/cli`, `@conciv/tools` and the widget no longer depend on it. `@conciv/types/page-types` drops `EFFECTS_SURFACE_ATTR`, and `CONCIV_UI_SELECTOR` no longer matches `[data-conciv-effects]`: nothing renders that surface any more, and plugin overlays carry `PLUGIN_OVERLAY_ATTR`.

- [#828](https://github.com/conciv-dev/conciv/pull/828) [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f) Thanks [@omridevk](https://github.com/omridevk)! - Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
  passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
  or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
  function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
  server extension object moved to each package's `/server` subpath. `register()` on Next.js now validates `CONCIV_OPTIONS` and fails with a clear error when it is not a valid conciv config.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - When the engine fails partway through starting, it closes the database and the plugin host it had already opened instead of leaving them open.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The limit for an agent that never starts is an option: `makeApp` takes `firstStartTimeoutMs`, handed to the chat server beside `firstChunkTimeoutMs`. Without it the limit stays 30 seconds and the turn still fails with "the agent did not start within 30s". The test kits take it in `timeouts`, so a test can see that failure in half a second.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Finding the installed agent CLIs, checking the Claude plugin install and the Claude MCP bridge's endpoint lookup no longer block.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Harness transcripts, session folders, model caches and the Claude plugin folder are read without blocking, and the context token count streams the transcript instead of reading it whole.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The conciv home folder and its database files are checked and made private without blocking, once, before the home database opens.

- [#888](https://github.com/conciv-dev/conciv/pull/888) [`3b42bde`](https://github.com/conciv-dev/conciv/commit/3b42bdefc27d56d6bc7368a6b39d00d16e24090f) Thanks [@omridevk](https://github.com/omridevk)! - An agent connected or disconnected from a terminal now always shows in the widget without a refresh.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/types/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#820](https://github.com/conciv-dev/conciv/pull/820) [`a519d5f`](https://github.com/conciv-dev/conciv/commit/a519d5fad8cc0f548c4dcd2a67c671d613dd1184) Thanks [@omridevk](https://github.com/omridevk)! - Hub and page bus errors surface with their cause: an unreadable home folder is named instead of reported as no dev server running, a failed push stream closes its socket so the widget reconnects, and registry call errors keep their cause.

- [#996](https://github.com/conciv-dev/conciv/pull/996) [`f13572b`](https://github.com/conciv-dev/conciv/commit/f13572bd98d0f51e04cae05daf846e3b9b332924) Thanks [@omridevk](https://github.com/omridevk)! - The conciv MCP hub (`conciv mcp serve`) serves a third tool, `list_tabs`: it lists the open conciv tabs of every running dev server on the machine, with the same rows as before (project, branch, root, href, pageTitle, sessionTitle, lastActive, running, state, harness, browserTabs) and every dev server that did not answer under `unreachable`. An outside agent calls it first, then passes a tab's id as `tab` on `execute_typescript` and `discover_tools`. `conciv tools tabs` prints the same listing and no longer goes through a tab, so it never asks for an Allow.

  Removed: the engine's `tabs` tool, so `external_tabs({})` no longer exists in code mode (in the tab or in an outside run); use the hub's `list_tabs`, or `conciv tools tabs` in a terminal. An outside run's `NO_TAB` error and the hub's `TAB_NOT_OPEN` reply now name `list_tabs`. The `@conciv/tools/builtins` export is removed, with `BUILTIN_TABS_TOOL`, `TabsToolContext`, `BuiltinCategory` and `builtinToolNames()`; it held nothing else once `server_reload` was removed.

- [#1185](https://github.com/conciv-dev/conciv/pull/1185) [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b) Thanks [@omridevk](https://github.com/omridevk)! - Ids conciv makes have one format from one maker, opencode's: sessions are `ses_` plus a descending id (runs `run_`, markers `mrk_`, calls `call_`, hub tasks `tsk_`, engines `eng_`, ptys `pty_`, settings generations `gen_`, and every assistant message conciv streams `msg_`, whatever id the CLI gave it); an existing local database holds `conciv_` session ids that no longer validate, so reset it.

- [`2aaf2e0`](https://github.com/conciv-dev/conciv/commit/2aaf2e0fc45adec0a73f74050b6b4d7ebcf7a580) Thanks [@omridevk](https://github.com/omridevk)! - The engine's file watcher is turned off by `CONCIV_DISABLE_FILEWATCHER`, read as Effect Config under the engine's ConfigProvider and false by default; a value that is not a boolean fails engine boot. Engines the plugin testkit boots set it to true, so stopping them no longer waits on the system file events service; a kit that needs file watching passes `fileWatcher: true`.

- [#863](https://github.com/conciv-dev/conciv/pull/863) [`b894936`](https://github.com/conciv-dev/conciv/commit/b894936ae6e8793790c667c694b270e51bd9ef21) Thanks [@omridevk](https://github.com/omridevk)! - Stopping a run now waits until a CLI process that ignored the stop request has actually been killed, instead of returning while it is still alive.

- [#1125](https://github.com/conciv-dev/conciv/pull/1125) [`476a979`](https://github.com/conciv-dev/conciv/commit/476a97995914acb37691ac47f47a3f5cdee648d0) Thanks [@omridevk](https://github.com/omridevk)! - Core builds again: the plugin command line signature reads its input fields from a plain record.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A direct tool called over `/api/mcp` keeps its images: they come back as MCP image blocks instead of being written into the text reply.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The chat thread updates at most once every 16 ms while a reply streams, instead of once per streamed chunk. A burst of chunks (a tool step, fast text) now costs one render, as in opencode's client. The session's own logic still reads the live list, and a tab that comes back into view shows the newest messages at once.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The widget remembers its last screen per browser tab, as opencode does, and the engine no longer keeps the navigation.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - When the engine's process exits without stopping its runs (a shutdown deadline, a second Ctrl+C, a dev server that exits at once), every agent CLI it started is killed, so none outlives the engine.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#849](https://github.com/conciv-dev/conciv/pull/849) [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9) Thanks [@omridevk](https://github.com/omridevk)! - An agent CLI that takes more than 10 seconds to print its first line (a cold start, a loaded machine) now finishes its turn instead of failing with "cannot attach to run ... delivered no bytes within 10000ms". The chat server no longer writes a run journal: the agent's output is read straight from its process, so the 30 second first-output limit ("the agent produced no output within 30s") is the only one. When that limit fails a turn, or the server is killed mid-run, the agent no longer keeps running in the background.

  `createChatServer` takes `sandbox: {dir}` (no `journalDir`), and `createChatPlane` no longer takes `stateRoot`.

- [#947](https://github.com/conciv-dev/conciv/pull/947) [`89834e4`](https://github.com/conciv-dev/conciv/commit/89834e40b9208aa87bcabe9f36dbf1cea50477ac) Thanks [@omridevk](https://github.com/omridevk)! - The plugin host's and core's internal service names no longer carry the name of the project they were ported from. No behaviour change. The environment variable that overrides the file watcher's native binding path is renamed to `CONCIV_PARCEL_WATCHER_PATH`.

- [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a) Thanks [@omridevk](https://github.com/omridevk)! - The last pieces of the old extension system are gone. The plugin host no longer keeps a list of mounted extension names (it was always empty), so a plugin can register any rpc id. The tool list no longer carries an `extension` field nothing set, and a crashed plugin is logged as a plugin. The ui-kit-system token contract for third-party UI is now the plugin author contract (`docs/plugin-tokens.md`), and the READMEs describe plugins instead of extensions.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A session whose harness fails to list its models no longer fails the whole model menu or the terminal. The session models answer still carries the harness, with `modelsFailed` set, so the menu keeps the other harnesses and shows a retry row for the one that failed, and the terminal tab still shows for a harness with a terminal.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/ai/server` exports `readFinishReason`, the one reader for a run's finish reason.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - An outside agent's tool call no longer goes missing from a panel that connects while the call runs or just after it, when no turn is running: the engine listens before it answers the panel's event subscription, saves each part of the call to the chat before it sends it out (as one message, the same id live and after a reload), and the panel reloads its history once its event stream is live.

- [#1160](https://github.com/conciv-dev/conciv/pull/1160) [`d8be638`](https://github.com/conciv-dev/conciv/commit/d8be638a131ed54979c4a57f2120db9fe33c3e7f) Thanks [@omridevk](https://github.com/omridevk)! - A tool called from outside the chat (the hub or the CLI) that wakes a turn is no longer sent to the model as an unanswered call.

- [`b1b9f95`](https://github.com/conciv-dev/conciv/commit/b1b9f9554390b2efc22cef7978656c581a0141a7) Thanks [@omridevk](https://github.com/omridevk)! - An outside agent's consent is a permission card that waits with no timeout: Allow once runs that call, Allow always saves a project rule so later calls in every tab run with no card, Deny refuses that call only, and a caller that leaves drops its card. The 50 s hold, the sticky "outside agents refused" banner and the per-session `hubAccess: 'session'` option are gone; `hubAccess` is `'open'` or `'project'`.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.

- [#1078](https://github.com/conciv-dev/conciv/pull/1078) [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1) Thanks [@omridevk](https://github.com/omridevk)! - The widget's page queries and session events ride the one `/rpc-ws` socket: `page.queries({focus})` opens with a `ready` that names the browser tab, `page.focus` keeps the tab focused last as the target of page queries, and the separate `/push-ws` socket is gone.

- [#826](https://github.com/conciv-dev/conciv/pull/826) [`ef9e8db`](https://github.com/conciv-dev/conciv/commit/ef9e8db736acd149745de30d6063d0e304793f93) Thanks [@omridevk](https://github.com/omridevk)! - A page call stops the moment its caller gives up: a cancelled outside-agent call, a stopped chat run, an aborted `registry.call`, or an `execute_typescript` program that ends with the call still running. The engine drops the waiting page query at once instead of waiting out its timeout, and never resends it after an abort.

- [#1166](https://github.com/conciv-dev/conciv/pull/1166) [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971) Thanks [@omridevk](https://github.com/omridevk)! - The live-edit journal is a page tool: `page.changes` (with `clear: true` to empty it after returning it) lists the page edits made in the session, for the agent, for code mode and as `conciv tools page changes [--clear]`. The engine's `page.changes` and `page.clearChanges` routes, the CLI's hand-written `page changes` command and the protocol's `PageChangeEntry` are gone; the entry type lives in the page plugin, which records each edit under a `PageConnection.change` span.

- [`6a41c2e`](https://github.com/conciv-dev/conciv/commit/6a41c2ee15b6ff333222ad581764e9e9d75a2258) Thanks [@omridevk](https://github.com/omridevk)! - A CLI `page_eval` naming a session that does not exist is refused with `session "<id>" does not exist` instead of an internal handler error.

- [#946](https://github.com/conciv-dev/conciv/pull/946) [`9d7ef70`](https://github.com/conciv-dev/conciv/commit/9d7ef700e1f0519e3f5cc5352086c013ed9b8760) Thanks [@omridevk](https://github.com/omridevk)! - Plugins can now use the page through two contracts from `@conciv/frontend-plugin-api/page`: `Page` (find the source line behind stack frames, show a toast on the page, and the settings a page capture needs) and `ReactTree` (read the React tree behind an element). conciv's built-in page plugin provides both in the widget. The new package `@conciv/plugin-page` is the page plugin's engine half: the engine runs it, and it answers its `symbolicate` method (`@conciv/plugin-page/rpc`), which maps stack frames to source lines. The engine now asks it over that method whenever it needs a frame's source, also to open a source in the editor; with the page plugin removed by config, opening a source opens the frame as the page gave it. `GrabFrame` now comes from `@conciv/frontend-plugin-api/grab`; `@conciv/grab` re-exports it.

  The plugin host now takes the engine's own plugins as built-ins: `InstancePlugins.bound(plugins, {pre, post})` runs them in the same places as its internal plugins, and the Settings plugin list hides them, so a user can no longer reload or switch off the page plugin's engine half.

- [`19ad474`](https://github.com/conciv-dev/conciv/commit/19ad474b8cd93a548e881ee2cebcf018bdc25d4f) Thanks [@omridevk](https://github.com/omridevk)! - The page plugin is one package, `@conciv/plugin-page`: `@conciv/page` (the DOM helpers) is merged into it as
  `@conciv/plugin-page/client`, and the window part the built-ins ran is `@conciv/plugin-page/renderer`. `@conciv/page` is no longer published.

- [#927](https://github.com/conciv-dev/conciv/pull/927) [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390) Thanks [@omridevk](https://github.com/omridevk)! - A finished page action queue no longer gets lost when a `page.queue.wait` caller goes away just as it finishes. A wait over `/rpc` or the rpc websocket now counts the result as delivered only once its reply has gone out (over `/rpc` the response finished writing; over the websocket the socket was still open when the call settled and the send was not skipped); otherwise the result stays owed and leads the next reply. The finished card shows in the chat once per queue, when it finishes, unless the result was already delivered or held for the next reply by then, and never again when a result goes back to owed.

  Shape changes: `RpcContext` (`@conciv/types/rpc-types`) gains an optional `replied: Promise<boolean>`, and `rpcFetchMiddleware` and `rpcWebsocketRoute` (`@conciv/extension/rpc-mount`) now fill it for every call.

- [#953](https://github.com/conciv-dev/conciv/pull/953) [`02d4e43`](https://github.com/conciv-dev/conciv/commit/02d4e43b8e54caedaba32aa6b9a102ef138d113b) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes two internal timing options beside its first-chunk timeout and its heartbeat interval: `pageReplyTimeoutMs`, how long a browser tab has to answer a page query (and to accept a page action queue), 5 seconds by default, and `queuedActionTimeoutMs`, how long each queued page action has to confirm once the tab reaches it, 7 seconds by default. Neither is a config-file key nor a `start()` option; the defaults are unchanged.

- [#1067](https://github.com/conciv-dev/conciv/pull/1067) [`4921829`](https://github.com/conciv-dev/conciv/commit/4921829346d609e82f306f3bbd2436d4d5831045) Thanks [@omridevk](https://github.com/omridevk)! - A plugin runs its own operation on the page tab: its browser half adds a `PageOperation` and its engine half calls `page.operate` through `ctx.rpc(Definition)`. The page plugin and its browser half run on Effect; a closed tab ends a call in flight as `tab_gone`, a reading call is resent once to the next tab, and a refused attach stops retrying.

- [#861](https://github.com/conciv-dev/conciv/pull/861) [`911a685`](https://github.com/conciv-dev/conciv/commit/911a68571dc434e793541a707a9d81bad670c93e) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's permission card offers "Always allow", which saves the answer for the project; cards for built-in tools keep "Allow for session". A permission card now leaves every open chat once anyone answers it, and a card whose request is already gone leaves when clicked instead of staying on screen. A denied card shows "Denied" in red with a blocked mark, the same tone the chat uses for a failed tool call.

- [#859](https://github.com/conciv-dev/conciv/pull/859) [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028) Thanks [@omridevk](https://github.com/omridevk)! - The `approval-requested` chat event may carry `permission: {always: boolean}`, which marks the card as a plugin permission request, and `readApprovalAsk` passes it through. A new `approval-settled` chat event (`approvalSettledEvent`, read with `readApprovalSettled`) names an approval whose card should go away on every client.

  A stored pending approval keeps `permission`, whether a turn or a plugin asked for it, so `chat.hydrate`, the replay a new subscriber receives, and a chat session loading saved state show the same card as a live ask. The chat plane gains `permissionAsked` and `permissionSettled`, which store and drop a permission card without writing an approval grant. Updates to a thread's pending approvals run one at a time, so overlapping asks and settles never lose a card or bring a settled one back.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget carries the state machines of the plugin browser host, copied from opencode; nothing runs them yet. The SDK's `@conciv/frontend-plugin-api/host` now exports `BridgePluginExperimental` and `BridgePluginExperimentals`, the list of plugin browser parts to run. `Storage.store` takes the `project` scope, the repo the engine runs in, as declared stores do. A settings key may now be up to 512 characters, so a plugin store named after a long package name fits. `editor.open` and the `open` tool take an optional `column` beside `line`, and the editor opens at that column; a column without a line is ignored.

- [#896](https://github.com/conciv-dev/conciv/pull/896) [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50) Thanks [@omridevk](https://github.com/omridevk)! - `experimental()` no longer inlines a plugin's dynamic `import()`: the build writes a CommonJS entry, one `.cjs` chunk per `import()` and Vite's manifest beside the entry (`plugin-experimental.cjs.manifest.json`).

  The app loads a plugin's entry with the chunks it requires at start (`plugin.experimental` now answers them as `chunks`) and each `import()`ed chunk on demand over the engine socket, through the new `plugin.experimentalChunk` procedure. The engine serves only the files the plugin's manifest lists, and refuses with `PLUGIN_CHUNK_NOT_FOUND` a file the manifest does not list or whose bytes changed since the plugin loaded.

  A lazy chunk may require the plugin's entry, as Vite writes when the lazy part imports a value the entry exports: `plugin.experimental` also answers the entry's file name as `file`, `BridgePluginExperimental` carries it, and `evaluatePluginBundle`'s `PluginBundle` carries the entry's `exports`, which the app gives a chunk that requires `./<file>`. Both fields are additive. The engine leaves the entry out of a chunk's closure instead of refusing the manifest.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `conciv plugin call <rpcId> <method> --data '<json>'` calls a method a plugin registered on your running dev server and prints its output as JSON, from the project folder or from anywhere on the machine. You name the plugin's RPC id and the method; the CLI does not list them. The terminal holds the engine token, so it calls as the owner: only callers that announce themselves as outside, such as agents connected through `conciv mcp`, are still refused plugin calls.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Starting the engine no longer changes the file permissions of the project database (`conciv.db` and its `-wal` and `-shm` files).

- [#864](https://github.com/conciv-dev/conciv/pull/864) [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80) Thanks [@omridevk](https://github.com/omridevk)! - The engine-side plugin host can find plugins: the new `plugins` key in the conciv config (a name, or a `[name, options]` pair) and the `conciv/plugin` and `conciv/plugins` folders, read in opencode's order. It watches those plugins for changes on disk. It also carries opencode's database client and event bus, with the bus's durable event log; the host owns its event tables and their migrations. `resolveConfig` keeps the `plugins` list. Nothing loads a plugin yet.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's first `servers.list()` lists every engine registered on the machine, instead of an empty list.

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - New package `@conciv/plugin-page`: the engine part of conciv's page plugin, written against the public plugin SDK. It holds the connection to the page, the page tools and skill, and the RPC contract (`@conciv/plugin-page/rpc`) the page's browser part talks to. The page plugin answers which sessions have a tab attached (`sessions.attached`); the tab listing (`tabs.list`, `tabs.get`) reads it.

  The page plugin takes two options: `pageReplyTimeoutMs` (default 5 000) is how long a tab has to answer a page action, and `queuedActionTimeoutMs` (default 7 000) is how long each queued action has to confirm once the tab reaches it. Core passes its own two settings of the same names through.

  In `@conciv/plugin-page/rpc`, a `CliTools` entry's `asks` is the permission that tool asks for: a function from the call's input to `{action, resources}` (the `AskedPermission` type), and absent for a tool that does not ask. The page tool's own check and the terminal's check both read it.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Plugin permission cards now behave reliably at the edges:

  - Stopping a run also ends any permission card a plugin tool raised inside `execute_typescript`. Approving that card afterwards runs nothing and clears the card.
  - Closing the engine clears pending permission cards from storage before the database closes, so no card is left behind for the next start.
  - Answering a card that another window already answered, or a card left over after a stopped run, now just removes the card. The widget no longer shows "That permission request is no longer waiting for an answer."
  - A card that arrives or is answered while the chat is reloading its history no longer disappears or comes back.
  - A session whose saved permission rules cannot be read keeps its built-in tools but is offered no plugin tools. It still opens and lists normally, and the engine log names the session.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Images a plugin tool returns now reach the model. In code mode they are attached after the program's result, in call order and also when the program fails, without entering the sandbox; a direct plugin tool returns its text followed by its images. Files that are not images are announced with "Attached document or image follows.".

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Images in a plugin tool's result are resized to fit the model's limits (2000 by 2000 pixels, 5 MB), re-encoded as JPEG when that is smaller, or dropped with a note when they cannot be read or made to fit.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool now sees the agent selected for its session instead of always the default one.

- [#1091](https://github.com/conciv-dev/conciv/pull/1091) [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462) Thanks [@omridevk](https://github.com/omridevk)! - Typing @ in the composer offers the session's plugin tools again, next to the extension tools. The tool list now comes per session (`meta.tools` takes a `sessionId`), from the same place the turn gets its plugin tools, so a tool that a session's permissions turn off is not offered. Tool calls from plugin tools also get their clean names in the chat history.

- [#915](https://github.com/conciv-dev/conciv/pull/915) [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d) Thanks [@omridevk](https://github.com/omridevk)! - A tool a plugin adds or removes while a chat turn runs now shows up, or goes away, at the next step of that same turn. Before every model step the turn waits for a plugin reload in progress, then offers the tools as they are after it.

  If you build a `TurnPlan` yourself (the value `TurnHooks.plan` returns), the four tool fields `codeMode`, `search`, `asking` and `direct` move behind one async `tools()` function that returns them, for example `tools: async () => ({codeMode, search, asking, direct})`. It is called before every model step. `TurnHooks.plan` itself stays synchronous. The chat plane's `capabilities(sessionId)` now returns a promise.

  `HarnessChatDeps.hasTools` is removed, because the tools can change between steps of one turn. A harness that needs to know whether tools ride a model step reads that step's `options.tools` in its adapter's `chatStream`. Codex now does this: it auto-approves its tanstack MCP server for each step that offers tools.

- [#1100](https://github.com/conciv-dev/conciv/pull/1100) [`549f445`](https://github.com/conciv-dev/conciv/commit/549f445f364067d88cbd1f92f36d4569e2cd0145) Thanks [@omridevk](https://github.com/omridevk)! - A plugin view reads its engine methods through the app's one query cache. Each method of `ctx.client.rpc(Definition)` still answers a plain call and also gives `queryOptions({input})` for `useQuery`, `mutationOptions()` for `useMutation` and `key()` to invalidate. A plugin imports `useQuery`, `useMutation` and `useQueryClient` from `@conciv/client`, which the widget provides to its bundle like Solid, and gets the app's query client with `useQueryClient()`; no plugin imports a `@tanstack/*` Query package. A method's key starts with the engine it reads from, `['plugin', {server}, id, method, input]`, so two engines never share a cached read, and `Conciv.make(raw, {server})` takes that engine's name, such as its address. When a plugin reloads or stops, the app drops every query whose key starts with `['plugin', <plugin id>]`, so a reloaded plugin never runs a chunk its old revision cached.

- [`58b6494`](https://github.com/conciv-dev/conciv/commit/58b6494607e8e5f3e5b368eda3de152f88179ca0) Thanks [@omridevk](https://github.com/omridevk)! - A stopped or deleted session's run now tells plugins it ended: the engine publishes `session.execution.interrupted` with reason `user`, or `shutdown` when the engine stops or sweeps a run cut by a crash, as it already publishes succeeded and failed.

- [#955](https://github.com/conciv-dev/conciv/pull/955) [`9896933`](https://github.com/conciv-dev/conciv/commit/98969330d0c53888a0f496c6f81ce39adfee5d16) Thanks [@omridevk](https://github.com/omridevk)! - Plugins now start while the engine starts, as opencode's instance does. The engine binds its port first and builds everything else after, so a request that arrives early (a CLI reads the port file as soon as it exists) waits until the engine is ready instead of failing, and is then answered normally. If the engine fails to build, those waiting requests fail at once (500), the port is released and the start error is reported. A page call made while plugins are still starting now waits for them instead of answering "unavailable".

  For embedders of `makeApp`: `MadeApp.startPlugins()` is gone. Plugins start inside `makeApp`; `MadeApp.awaitActivation()` only waits for their first activation.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A session the user just started previews in the picker while its first reply is still running, as opencode does.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A session whose agent keeps no transcript now previews from conciv's saved messages in the session picker, instead of showing "Couldn’t load this session."

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - The project config takes `permission` and `permissions`: allow, deny or ask for a tool ahead of time, for every agent, so a headless run or CI needs nobody at the tab. `permission` is a short form (one effect for everything, per tool, or per tool and resource); `permissions` lists full `{action, resource, effect}` rules. A config rule never opens the page tools before the tab connects. A rule in these options now decides a terminal page eval too: `conciv tools page eval` runs with `permission: {page_eval: 'allow'}` and is refused with `page_eval: 'deny'`, with nobody at the tab.

  A page eval card no longer offers "Always allow": an answer approves that one eval and saves no rule, so every later eval asks again unless a config rule decides it.

  A terminal eval naming its tab (`--tab`) is asked the same way: only a config rule lets it run with nobody to approve, and a config deny refuses it.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - When no plugin has a session `prompt` hook, a send skips the hook step entirely: the message, attachments included, is not copied or compared first.

- [#834](https://github.com/conciv-dev/conciv/pull/834) [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer polls. `meta.hubAgents` is an event iterator the engine pushes whenever the conciv home db changes on disk, so an agent connected or disconnected from the CLI shows up at once. The engine staleness read refreshes on reconnect and refocus instead of a timer, and reachability comes only from the engine socket (`engineProbeRefetchInterval` and `voteEngineProbeSettled` are gone). The recorder panel follows a `replay` stream until the recording can be replayed and a pushed `events` stream for the live tail, replacing its 1 s polls.

- [#808](https://github.com/conciv-dev/conciv/pull/808) [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63) Thanks [@omridevk](https://github.com/omridevk)! - A push socket that opens or reconnects while a run is going now hears about that run, so the launcher turns busy for a run started from outside the widget before its push socket was admitted.

- [#960](https://github.com/conciv-dev/conciv/pull/960) [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3) Thanks [@omridevk](https://github.com/omridevk)! - Answering a question card while the page is logged out or its login was revoked shows the same notice Send shows, and while the engine cannot be reached it says "conciv lost connection to the engine. Your answer was not sent." In each case the card takes your answer again instead of staying on "Sending your answer…". An answer the engine itself refuses still says "That question is no longer waiting for an answer." and the card stays as it was.

  For card authors: `addResult` on a tool card (and on the tool view context) now returns a promise, which rejects when the page could not send the answer.

- [#850](https://github.com/conciv-dev/conciv/pull/850) [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5) Thanks [@omridevk](https://github.com/omridevk)! - A page queue follow-up turn now counts as delivered only when its run finishes. A follow-up run that ends in RUN_ERROR, such as a harness launch failure, is retried with a short backoff, three attempts in all. A follow-up declined because a run is already driving is not retried, and neither is a follow-up run the user stops. When every attempt fails, or the user stops the run, the engine starts no further follow-up for those results on its own: they are handed over by the session's next conciv tool reply, or carried by the next follow-up turn another finished queue starts, whichever comes first. Exhausted retries are logged once with the queue ids and the last error.

- [#830](https://github.com/conciv-dev/conciv/pull/830) [`bb68486`](https://github.com/conciv-dev/conciv/commit/bb6848694249e7c684209231bfcb6e9566e20ba6) Thanks [@omridevk](https://github.com/omridevk)! - Code-mode runs on the QuickJS worker now keep three separate clocks. A boot deadline of 30 seconds covers a run from the moment it is queued until its worker starts it; a run whose worker never starts in that time ends with a `WORKER_NOT_STARTED` error instead of waiting forever. The run's own timeout then runs inside the worker as before, so a run that times out reports its timeout with the logs it printed, even when its worker was slow to start. The server's hard stop, the timeout plus one second of grace, now starts when the worker begins the run rather than when the run is queued, so a slow worker start no longer kills a run before its own timeout fires.

- [#807](https://github.com/conciv-dev/conciv/pull/807) [`a3c7c5c`](https://github.com/conciv-dev/conciv/commit/a3c7c5c648574cc8bc882906b11fee7fc426e494) Thanks [@omridevk](https://github.com/omridevk)! - The QuickJS Code Mode fallback runs on a tinypool worker pool, and tool calls cross to the server thread over oRPC's MessagePort adapter instead of a hand-written message protocol.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A message sent right after Stop no longer vanishes. The history refresh that follows a stop (or a failed run, or joining a run) used to replace the thread with history fetched before the send, dropping the new message and its streamed reply. It now keeps every message added while the fetch was in flight, as opencode's client does.

- [#832](https://github.com/conciv-dev/conciv/pull/832) [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24) Thanks [@omridevk](https://github.com/omridevk)! - An extension now learns when conciv refuses an outside agent's call to one of its tools. Its `.server()` factory can return an oRPC `middleware` next to `context`, for example `onError((error, {path, context}, input) => ...)`, and conciv runs it around every tool the extension owns. When the user denies an outside agent access to the tab, or does not approve an `approval: 'ask'` tool, the refusal is thrown inside the tool's own procedure, so that middleware sees it with the tool name, the input and the session id.

- [#916](https://github.com/conciv-dev/conciv/pull/916) [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f) Thanks [@omridevk](https://github.com/omridevk)! - A send the engine refuses leaves no turn in the conversation: the text goes back to the composer only, so sending it again makes one turn, not two.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Stopping the engine or a run now waits for the agent CLI's cleanup, so its run files no longer stay in the project.

- [#1148](https://github.com/conciv-dev/conciv/pull/1148) [`8ca6099`](https://github.com/conciv-dev/conciv/commit/8ca6099e77a1605ac1767419a977f2d75afdf0e9) Thanks [@omridevk](https://github.com/omridevk)! - The security guards have tests again: outside agents refused the tab-only routes, the loopback Host check, another session answering an ask, transcripts outside the CLI folder, the claude permission flags, the capture sanitizer and scrub, the try workspace seed paths and size cap, and the DevTools engine-token login. No behaviour changes.

- [#952](https://github.com/conciv-dev/conciv/pull/952) [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3) Thanks [@omridevk](https://github.com/omridevk)! - `conciv plugin call server config` prints the attached dev server's resolved root, base, mode, aliases and plugins, and `conciv plugin call server urls` prints where it listens. `conciv plugin call server resolve --data '{"spec":"./app","importer":"/src/main.ts"}'` prints where an import resolves, `conciv plugin call server graph --data '{"file":"/src/app.ts"}'` prints a module's importers and imports, and `conciv plugin call server transform --data '{"url":"/src/app.ts"}'` prints the code the dev server serves for that url. There is no terminal restart command: restarting asks, so it is the agent's `server_restart` tool only, and it asks first; restart your own dev server in your terminal. `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'` opens a file in your editor, at a line and column when given. With no dev server attached each dev server method fails with `no dev server is attached to conciv` (`BUNDLER_UNAVAILABLE`), and when the dev server itself fails a resolve, graph or transform, the method fails with `BUNDLER_FAILED` and the dev server's own message in its data.

- [#993](https://github.com/conciv-dev/conciv/pull/993) [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f) Thanks [@omridevk](https://github.com/omridevk)! - The agent's `server_reload` tool is removed, and with it the `conciv tools server reload <file>` command (the whole `conciv tools server` group is gone; the dev-server methods answer through `conciv plugin call server <method>`). Instead, save the file: the dev server's own watcher pushes the hot update, and the page plugin's hot update wait (`page_hmr`, `conciv tools page hmr`) reports when it landed.

  Removed published exports: `@conciv/protocol` loses `contract.server` (the `server.reload` procedure and its `NO_BUNDLER` error), so `RpcClient` and the `@conciv/backend-plugin-api` client no longer have a `server` group; `@conciv/tools/builtins` loses `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `ServerToolContext`, `SERVER_TOOL_PREFIX` and `serverOperationOfTool`, and `builtinToolNames()` now answers only `tabs`. The agent guide no longer teaches `conciv tools server ...`. `BundlerBridge` (`@conciv/types/bundler-types`) loses `reload(file)`, and the Vite bridge from `@conciv/extension/vite` no longer implements it; a bridge keeps `restart`, and the hot update itself is the dev server's.

- [#952](https://github.com/conciv-dev/conciv/pull/952) [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3) Thanks [@omridevk](https://github.com/omridevk)! - The dev-server commands `conciv tools server config`, `urls`, `resolve`, `graph` and `transform`, and `conciv tools open`, are gone: use `conciv plugin call server <method>` with the input as `--data '<json>'`, for example `conciv plugin call server graph --data '{"file":"src/app.ts"}'` or `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'`. `conciv tools server reload <file>` stays. `conciv tools server restart` is gone and nothing replaces it: the agent's `server_restart` tool asks first, and a person restarts their own dev server in their terminal. The engine's RPC procedures `server.config`, `server.urls`, `server.resolve`, `server.graph`, `server.transform`, `server.restart` and `editor.open` are removed; the same methods, except `restart`, answer through `plugin.call` with rpc id `server`. The agent's `server_*` tools and `open` now come from the engine's server plugin, and the agent guide teaches `conciv plugin call server graph` and `transform`.

  When a session's stored permissions cannot be read, an outside agent is no longer offered the server tools or `open`: they are plugin tools now and plugin tools are withheld in that state, as the skill tool already was.

- [#1150](https://github.com/conciv-dev/conciv/pull/1150) [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f) Thanks [@omridevk](https://github.com/omridevk)! - Deleting a session no longer asks the page plugin to cancel that session's queues first: the plugin already drops them when it hears `session.deleted`, and the engine's `queue.finished` listener already ignores a result of a deleted session. The page plugin's `queue.cancelSession` RPC method is gone.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Deleting a session does the plugin host's part first, so if that part fails the session is still there and the delete can be tried again.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Deleting a session also removes its plugin host events, so they no longer pile up in the project database.

- [#803](https://github.com/conciv-dev/conciv/pull/803) [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10) Thanks [@omridevk](https://github.com/omridevk)! - A session's lastActive and title now follow its conciv chat: every saved chat message (chat turns, hub tool calls, imported transcript messages) moves the session's updated time forward to that message's own time (an imported transcript keeps the time its messages were written, not when the session was opened), a failure to record it is logged and never loses the saved messages, and the first user message titles a session that has no title yet, so they stay right after the harness transcript is cleaned up. A one-time migration repairs existing rows from their stored messages.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Plugins can register opencode's session `prompt` hook: `ctx.session.hook('prompt', (event) => ...)`. It runs once per new user message, after the plugins are active and before the message is stored or the agent sees it. Hooks run in the order they were registered, one after the other, on the same event; when they changed the event, what they leave in `event.prompt` (its text and its files, as `data:` URIs) is the message that is stored, shown and sent to the agent; when no hook is registered or no hook changed it, the user's message is stored and sent exactly as before, part for part. A retry of a message that is already stored does not run the hook again, and stopping the turn while a hook is still running stores nothing. A hook that throws stops the hooks after it and fails the send: nothing is stored for that message, the error shows in the pane, and the text and attachments go back into the composer.

- [#1143](https://github.com/conciv-dev/conciv/pull/1143) [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34) Thanks [@omridevk](https://github.com/omridevk)! - Opening the sessions panel with a long history no longer holds up the engine: the session search now looks up the real location of each project folder once per pass, instead of twice for every past session it checks. Folders reached through a symlink still count as the same folder.

- [#822](https://github.com/conciv-dev/conciv/pull/822) [`48d437c`](https://github.com/conciv-dev/conciv/commit/48d437c6e7f5b85b93d29d6765cd0385f441c332) Thanks [@omridevk](https://github.com/omridevk)! - Each settings file is now a Devframe shared state, read once when opened and written back on a debounce, exactly like Devframe. The engine no longer watches the global settings folder: a change made by another engine or by hand shows up after a restart.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Skills placed in the project's `conciv/skills/` folder, or in the `skills/` folder of conciv's home, are now offered to the agent. A skill is a folder holding a `SKILL.md` (with `name` and `description` frontmatter), or a single `.md` file at the top of the folder. Adding, editing or removing one takes effect in the running engine without a restart. Skills in `.claude/skills` and `.agents/skills` are left to the agent CLI, which already loads them.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `start` takes several harnesses, the engine timeouts, a staleness check and the app version, and passes each to the engine unchanged.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A turn stopped before its first word is saved as an empty reply marked stopped, so the Stopped divider stays after the next message and after a reload. An assistant turn with nothing to show renders no reply article.

- [#891](https://github.com/conciv-dev/conciv/pull/891) [`1d72095`](https://github.com/conciv-dev/conciv/commit/1d7209503bd860554ab27ba92b75a28516f19f33) Thanks [@omridevk](https://github.com/omridevk)! - Stop now works from the moment you send. A Stop pressed before the engine has started on your message used to be lost: the reply streamed in, "Responding…" stayed, and the Stop button came back as if you never pressed it (over a plain HTTP connection the message could vanish from the conversation instead). Now the button shows "Stopping…" at once, the stop is held until the engine starts the run, and the run then ends with the Stopped line, which a reload still shows.

  If the message never reaches the engine after you pressed Stop (the connection drops first), it is taken back: it leaves the conversation and its text is back in the composer, with no error and no Retry, so nothing can be sent twice. A message that fails to send when you did not press Stop still shows its error as before.

- [#901](https://github.com/conciv-dev/conciv/pull/901) [`10a7482`](https://github.com/conciv-dev/conciv/commit/10a748242aba6bda1fc19e8e1fb3dc8eded3e5ab) Thanks [@omridevk](https://github.com/omridevk)! - A Stop pressed while a plugin is still preparing the prompt takes the message back to the composer instead of hanging on Stopping.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A turn stopped while a tool call is still open saves a failed result "Tool execution interrupted" for that call and sends it to anyone following the run, so the card stops running and its question can no longer be answered.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The @tanstack/ai family moves to ai 1.7.0, ai-client 1.2.0, ai-solid 1.1.0, ai-event-client 1.1.0 and ai-persistence 1.1.0, so the metadata a tool result carries lands on its tool-call part.

- [#840](https://github.com/conciv-dev/conciv/pull/840) [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3) Thanks [@omridevk](https://github.com/omridevk)! - The Vite plugin stamps JSX with TanStack devtools' own source injector (`addSourceToJsx` from `@tanstack/devtools-bundler-core`) instead of a conciv copy, and every reader (element grab, page tools, highlight, design extension) reads `data-tsd-source`. The conciv-named source attribute is gone. A host that also runs `@tanstack/devtools-vite` gets one attribute per element, since the injector skips elements that already carry one.

- [#963](https://github.com/conciv-dev/conciv/pull/963) [`8ba27a4`](https://github.com/conciv-dev/conciv/commit/8ba27a4b3f4331445a3a879475d0472385714c89) Thanks [@omridevk](https://github.com/omridevk)! - A terminal call no longer waits for an unrelated agent turn to end before it answers.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The terminal's first screen fits the panel: the CLI starts at the panel's size instead of a fixed 120 columns.

- [#987](https://github.com/conciv-dev/conciv/pull/987) [`c650fd7`](https://github.com/conciv-dev/conciv/commit/c650fd72a1b6435a9592d17f73556a4668b42cb0) Thanks [@omridevk](https://github.com/omridevk)! - The agent no longer has the `conciv_extensions` tool or the `conciv-extensions` skill. `concivExtensionsToolDef` is gone from `@conciv/tools/defs`, the `ExtensionsCard` is gone from `@conciv/tools/cards`, and code mode no longer binds `external_conciv_extensions`. Plugins are taught by the built-in conciv skill.

- [#1112](https://github.com/conciv-dev/conciv/pull/1112) [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c) Thanks [@omridevk](https://github.com/omridevk)! - Typing `@` and part of a path in the composer lists the project's files and folders, each row showing its bare path with a File or Folder icon, after the skills, agents and sessions, as opencode's composer does; a picked one inserts `@<path>`, and every search asks the engine afresh, so a query typed again is never answered from an old listing. The engine answers through the new `fs.find` call: the plugin host searches with fff when the project is under version control and with a ripgrep index otherwise, downloading a pinned, SHA-256 checked ripgrep into the engine's cache folder when none is on the PATH.

- [#1112](https://github.com/conciv-dev/conciv/pull/1112) [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c) Thanks [@omridevk](https://github.com/omridevk)! - Typing `@` in the composer lists the engine's skills, then its agents that are neither primary nor hidden, then the session's tools from `meta.tools`, in one list named `Context` for screen readers. The engine answers skills and agents through the new `skill.list` and `agent.list` calls. Each row draws a lucide icon named for its kind (`Skill`, `Agent`) through the new optional `icon` field on a trigger item. The list keeps inside its pane: `AnchoredListbox.Root` takes an optional `boundary` element for its placement, and `RichTextField` passes its `menuBoundary` through, so a list opened near a pane's edge no longer covers the pane beside it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The chat system prompt now lives in core, in a module that imports nothing, so reading conciv's config no longer loads the whole Claude harness. `@conciv/harness/claude` no longer exports the unused `CHAT_SYSTEM_PROMPT`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The code mode time limit is an option of `codeModeTools`, defaulting to the 150 s limit, so a caller can give a program a shorter limit.

- [`6a41c2e`](https://github.com/conciv-dev/conciv/commit/6a41c2ee15b6ff333222ad581764e9e9d75a2258) Thanks [@omridevk](https://github.com/omridevk)! - The turn-level tool ask that only the removed extension path fed is gone: a tool no longer carries `approval: 'ask'` into a turn or the MCP listing. Plugin tools ask through `ctx.permission.assert`, and a CLI `page_eval` still asks through `registry.call`.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - At start the engine lists the default harness's models once, instead of starting a second listing process for it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The value `start()` returns, and `makeApp`'s result, carry the engine's oRPC router under a private, non-enumerable key, so core's own tests call procedures the oRPC way. The public `Engine` and `MadeApp` types gain only an opaque `EngineRouterBrand`; nothing a consumer can import or read.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine imports `@effect/platform-node` by subpath instead of the barrel, so starting it loads about 770 fewer modules (a redis client among them) and imports about 300 ms sooner.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The engine starts listing each harness's models when it starts, so the model menu's first open shows every CLI at once instead of waiting seconds for the slowest listing.

- [`74ef725`](https://github.com/conciv-dev/conciv/commit/74ef7258434e2f7b5bf8ac8e4f4c2d1e064cfc7c) Thanks [@omridevk](https://github.com/omridevk)! - The engine's Effect code logs through Effect and names its spans with the session id on them; a busy file system (too many open files) while making the plugin host's folders is retried instead of leaving the plugin host dead until restart.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The search index lists every project's session titles once when it starts, and the first search across all projects waits for that listing, so a session of another project is found on the first try instead of after a later keystroke.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - Opening the model menu or switching a model or harness re-checks the Claude login in the background, whether the held answer says logged in or not, so a `claude auth logout` shows in the menu and refuses the next send without an engine restart. A send that runs still reads the held answer and starts nothing.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The models listing and the harness menu now follow their request's cancel signal, so a cancelled request stops its lookups. The shared Claude probe is no longer tied to the first caller's signal, so a cancelled request never ends a probe other callers wait on; it ends at its own 30 s bound. `codex login status` gets the same 30 s bound.

- [#1094](https://github.com/conciv-dev/conciv/pull/1094) [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070) Thanks [@omridevk](https://github.com/omridevk)! - The old engine-to-page bus is gone. Page tools run only through the page plugin. The `page.queries`, `page.reply` and `captures.list` procedures, the `.client()` tool binding, the page plane in the widget, and the `tool_captures`, `css_bundles` and `page_changes` tables are removed. A migration drops the tables.

- [#1174](https://github.com/conciv-dev/conciv/pull/1174) [`6819ea1`](https://github.com/conciv-dev/conciv/commit/6819ea19a385c85aca783f6318dde282b8e3c031) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/client`: the panel fetches its history once, after its chat events stream is live, so nothing that happens while it opens is missed, and after the stream drops and comes back the panel fetches its history again and shows what happened meanwhile. A chat events stream that fails or ends reconnects with the same back-off as a run reconnect, as opencode's client does, and fails the panel's connection only when those attempts run out.

  `@conciv/ai`: when a run ends while a tool card in the panel still shows running, the panel fetches its history once and the card shows how the call ended.

  `@conciv/ai`: the server saves the reply it is streaming whenever a part starts or ends (a text, a tool call and its result, a reasoning block), as opencode does, so a panel that opens or refreshes mid-reply finds the reply so far under the same message id, and the panel now refreshes while a reply streams too.

- [#978](https://github.com/conciv-dev/conciv/pull/978) [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877) Thanks [@omridevk](https://github.com/omridevk)! - The session terminal moves into core. The contract gains `experimental.persistentPty.create`, which opens the session's terminal or returns the one already open, `remove`, which closes it, and `connectToken`, which mints a ticket for the socket at `/api/experimental/persistent-pty/:ptyId/connect`.

  Outside agents are refused. A ticket is bound to the pty it was minted for and to the Origin that minted it, so it cannot open another pty or be used from another page.

  Plugins reach these procedures through `ctx.client.experimental`.

- [#1089](https://github.com/conciv-dev/conciv/pull/1089) [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b) Thanks [@omridevk](https://github.com/omridevk)! - The session terminal rides the rpc socket. `experimental.persistentPty.output({ptyId, cursor?})` streams the terminal: it replays from the cursor in 64 KiB pieces, sends `{type: 'meta', cursor}` with the absolute cursor, then live output, and every output item carries its cursor so a resubscribe never repeats output. `write`, `resize` and `inject` drive it. `connectToken` and the `/api/experimental/persistent-pty/:ptyId/connect` socket are gone: `create` admits the caller's origin and the other terminal calls refuse any origin it never admitted. A stream whose reader stops reading gets `SLOW_CONSUMER` once the rpc socket holds 8 MiB it has not sent, instead of the engine buffering for it. `createTerminalModel` takes the `transport` its session runs over.

- [`2a4d780`](https://github.com/conciv-dev/conciv/commit/2a4d7803e39c1c053247251c6de15be56bc7f481) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes a stopGraceMs option for how long a stopping CLI and a model listing get before it goes on, still 5 seconds by default.

- [#990](https://github.com/conciv-dev/conciv/pull/990) [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be) Thanks [@omridevk](https://github.com/omridevk)! - The Terminal panel is built in. A session whose harness has a terminal command lists a Terminal tab in the status bar; opening it starts the harness CLI in a terminal that survives a reload, and while it is shown the status bar carries a model picker (the pick is remembered) and a New terminal button. `session.panel.end` is ported: a plugin slot drawn at the end of the status bar's view tabs. `HarnessMeta.persistentPty` is new: `meta.models` and `meta.harnesses` say whether the harness has a terminal. The model picker's list keeps its own width and stays on screen when its trigger sits near the edge of the window. The model picker's button and list use the chat sans face and type scale, matching the status bar tabs beside them. The terminal uses the widget's mono font.

- [#1029](https://github.com/conciv-dev/conciv/pull/1029) [`6bca3ec`](https://github.com/conciv-dev/conciv/commit/6bca3ecc90ec1e16be822cf759f39e9a7e7d9fce) Thanks [@omridevk](https://github.com/omridevk)! - The terminal starts at the top of its pane: the resumed-session line is the first row instead of sitting under a blank one, and the terminal keeps the same inset around its text as opencode's.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool's look is only its own tool render: the registry catalog carries no `icon` or `label`, the generic tool card and the live status line show the tool name, and the generic card shows no mutating badge and no asks-approval hint, as opencode does, and `TOOL_ICON_KEYS`, `toolIconRender`, `cardTitle`, `pageToolMeta`, the page catalog special case and `@conciv/plugin-tanstack/client` are gone. The page and TanStack cards keep their words and icons inside their own renders. The app no longer depends on `@conciv/plugin-tanstack`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The trusted browsers file and the `.conciv` folder are read and written without blocking the engine.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A chat turn finds the message it is sending by reading that one message, not the whole conversation, so a long conversation no longer slows each send.

- [#806](https://github.com/conciv-dev/conciv/pull/806) [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839) Thanks [@omridevk](https://github.com/omridevk)! - Build every package with TypeScript 7. Declarations now come from plain `tsc` per source file instead of a bundled d.ts, so published `.d.ts` files mirror the source layout; the exported names and their value/type kinds are unchanged.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes uiCallWaitMs and uiAnswerWaitMs for how long a UI question waits to be shown and to be answered, defaulting to the 5 s and 2 min it used before.

- [#1194](https://github.com/conciv-dev/conciv/pull/1194) [`21ca439`](https://github.com/conciv-dev/conciv/commit/21ca439ec798f2a2598a767c3b878129bc83f5e6) Thanks [@omridevk](https://github.com/omridevk)! - The engine reads `CONCIV_SIMULATE` from its own config and decides whether it simulates, so a Vite dev server started with it now simulates as webpack, Rspack and Next.js do. `start` from `@conciv/backend` no longer takes a `simulation` option.

- [#813](https://github.com/conciv-dev/conciv/pull/813) [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53) Thanks [@omridevk](https://github.com/omridevk)! - The QuickJS Code Mode fallback keeps one warm worker per chat server on a piscina pool (replacing tinypool) instead of booting a worker per execution, so a short `execute_typescript` run takes milliseconds instead of a few hundred. Every execution still gets a fresh QuickJS runtime; a timed out, stopped, crashed or over-limit run retires only its own worker, other running or idle workers stay, and ending all runs shuts the pool down without a worker error during shutdown reaching the server thread and without waiting forever on a worker that will not leave. If the shutdown itself fails, `endAllRuns` reports it in the same `AggregateError` as any failed cancel writes.

- [#1143](https://github.com/conciv-dev/conciv/pull/1143) [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34) Thanks [@omridevk](https://github.com/omridevk)! - Opening the sessions panel no longer walks every past session on the machine at once. That walk waits for the first search across all projects, as it did before, and the search index now checks each CLI's sessions one after another, giving other engine calls a turn between them.
- Updated dependencies [[`c7c018e`](https://github.com/conciv-dev/conciv/commit/c7c018ed735835d9dff5f84f4c8c44f8b597a321), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`98d502f`](https://github.com/conciv-dev/conciv/commit/98d502fcab9c9be38fc5d5215f2e1d78bef772f8), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`11eb9c6`](https://github.com/conciv-dev/conciv/commit/11eb9c6c9959f11e154eb16b070a305a1775d03d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`90e849a`](https://github.com/conciv-dev/conciv/commit/90e849ae6b799ed97a0e46e6f2a0be472ecae42a), [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`4f1f0a8`](https://github.com/conciv-dev/conciv/commit/4f1f0a8f823779f2af319168d4b75fb52acdf4ae), [`4d4a76d`](https://github.com/conciv-dev/conciv/commit/4d4a76d22102ccb2e4d57643386fa89f91e90025), [`f80ae0e`](https://github.com/conciv-dev/conciv/commit/f80ae0ef0ee682829aaf1711d8eb82dfd0b112ac), [`eb49d7d`](https://github.com/conciv-dev/conciv/commit/eb49d7d8cbdc756157a270f4b564db346bf4dc39), [`265f2e2`](https://github.com/conciv-dev/conciv/commit/265f2e2341a36d81ac291d0bab2cd6a4f3785e14), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`fd1a07e`](https://github.com/conciv-dev/conciv/commit/fd1a07e6dbdab3620509fa55c1e1bbae38638ac9), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`a16ba7d`](https://github.com/conciv-dev/conciv/commit/a16ba7d2155d177c44658a902a8a3859e62dcef5), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`2bea2e7`](https://github.com/conciv-dev/conciv/commit/2bea2e7a944b2a49db34ca5d6fe56634fbaa609c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`8ba04d3`](https://github.com/conciv-dev/conciv/commit/8ba04d3c02c5c34680508f2ff6fdbf8227049e4f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1629ad3`](https://github.com/conciv-dev/conciv/commit/1629ad3c23eec138d979d6d0d7a82645d8ea4f02), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`7573ba2`](https://github.com/conciv-dev/conciv/commit/7573ba2c2ec13bfa50dd81a8964a6fbef8c13dc2), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`7e9b86b`](https://github.com/conciv-dev/conciv/commit/7e9b86b080f8d4b9c25319d80522ac61ec73ec84), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`b0cd51b`](https://github.com/conciv-dev/conciv/commit/b0cd51b4a5dce8881829c9974b5131ce60bd828a), [`9d7ef70`](https://github.com/conciv-dev/conciv/commit/9d7ef700e1f0519e3f5cc5352086c013ed9b8760), [`3e5ac4b`](https://github.com/conciv-dev/conciv/commit/3e5ac4bdd5631e785f0ade5761cb0273ba98142f), [`19ad474`](https://github.com/conciv-dev/conciv/commit/19ad474b8cd93a548e881ee2cebcf018bdc25d4f), [`6794c37`](https://github.com/conciv-dev/conciv/commit/6794c3729dd895e2eba89b52484628962ff9d738), [`f649a67`](https://github.com/conciv-dev/conciv/commit/f649a67c71b5366aaf48b30838c75f20fa8ad8a8), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4921829`](https://github.com/conciv-dev/conciv/commit/4921829346d609e82f306f3bbd2436d4d5831045), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`ba22a7d`](https://github.com/conciv-dev/conciv/commit/ba22a7dd30703632d5af0ac6ca854cc257cda70f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`666febd`](https://github.com/conciv-dev/conciv/commit/666febd314b451c8b27f240ee59ad38b6eac2690), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`4a6de53`](https://github.com/conciv-dev/conciv/commit/4a6de539af0f65bde769fe45963db28570327e99), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`7e4d195`](https://github.com/conciv-dev/conciv/commit/7e4d195d46ab43964a08db8143705a54e1e76c31), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`342ba29`](https://github.com/conciv-dev/conciv/commit/342ba293e39fbefa0d4428f809697370e36153cb), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`bdcc01b`](https://github.com/conciv-dev/conciv/commit/bdcc01b10d6b0ca494c59017ded2eed3f929c42c), [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63), [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`4cf7f7c`](https://github.com/conciv-dev/conciv/commit/4cf7f7c76e33585eda1ba06fbcf04cb87d2146da), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3), [`27f21fb`](https://github.com/conciv-dev/conciv/commit/27f21fbd77493f033e239804ab020446af409341), [`a14cb77`](https://github.com/conciv-dev/conciv/commit/a14cb7704a32edc31189fb344a9bd933949e664e), [`6a41c2e`](https://github.com/conciv-dev/conciv/commit/6a41c2ee15b6ff333222ad581764e9e9d75a2258), [`68446e1`](https://github.com/conciv-dev/conciv/commit/68446e16cdac8298048fb37bd25fd4d4e0f6143a), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`2a4d780`](https://github.com/conciv-dev/conciv/commit/2a4d7803e39c1c053247251c6de15be56bc7f481), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`21ca439`](https://github.com/conciv-dev/conciv/commit/21ca439ec798f2a2598a767c3b878129bc83f5e6), [`d280c99`](https://github.com/conciv-dev/conciv/commit/d280c999df7d2588e023e5a8ef2e637d6b471af1)]:
  - @conciv/backend-defaults@0.0.23
  - @conciv/plugin-page@0.0.23
  - @conciv/simulation@0.0.23

## 0.0.22

### Patch Changes

- [#731](https://github.com/conciv-dev/conciv/pull/731) [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c) Thanks [@omridevk](https://github.com/omridevk)! - Page tools called by a session the page is not showing now fail right away with "the page is showing another session; switch back to this session to use page tools" instead of waiting for the page to time out. Only the page plane's push socket receives page queries; a socket kept open for a background session's chat events no longer does.

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#739](https://github.com/conciv-dev/conciv/pull/739) [`b6456c7`](https://github.com/conciv-dev/conciv/commit/b6456c7145b81cb0b6f73f15da4215db74f605ea) Thanks [@omridevk](https://github.com/omridevk)! - The MCP endpoint now runs on `createMCPServer` from `@tanstack/ai-mcp`. The capability list, sandbox rules and stale-engine warning moved from the MCP server instructions into the `execute_typescript` tool description.

  The MCP server reports the `@conciv/core` package version in its initialize response instead of `0.0.0`.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#725](https://github.com/conciv-dev/conciv/pull/725) [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04) Thanks [@omridevk](https://github.com/omridevk)! - Stopping the engine closes the listener first, then ends every live chat run as aborted, and only then closes the database, so a run or request during shutdown no longer hits a closed database.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Harness history can list sessions across every project: `HarnessHistory.list` takes a scope (`{cwd}` or `{everywhere: true}`) and every `HarnessSessionMeta` carries the cwd the harness recorded for it.

- [#781](https://github.com/conciv-dev/conciv/pull/781) [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde) Thanks [@omridevk](https://github.com/omridevk)! - Every harness with transcript history now carries a resume command, so "Copy resume command" on a search hit from another project works for Codex, OpenCode and Pi sessions, not only Claude.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - Switch the harness of a chat session between turns: `sessions.switchHarness` moves a session to another installed harness, the next turn replays the whole chat to it, and every reply records which harness produced it. Models, slash commands and harness details are now per session, and the session list covers every installed harness.

- [#735](https://github.com/conciv-dev/conciv/pull/735) [`c4824ef`](https://github.com/conciv-dev/conciv/commit/c4824efb18105452885954ce766e2bea93a266e9) Thanks [@omridevk](https://github.com/omridevk)! - Token-path requests (`/t/<token>/...`) no longer answer an empty 500 on Node 26: the engine gate rebuilds the forwarded request from its fields instead of passing the Node server's request object as the init.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - One model menu for every installed harness: the composer prompt's model menu lists each harness's models, named with their harness ("Opus 5.5 (Claude)", "GPT-6.1-Sol (Codex)"), and picking another harness's model switches the chat to that harness on that model (with the same history confirm). The separate harness rows in the composer overflow are gone. `meta.harnesses` now returns every harness's model list in one answer, and `sessions.switchHarness` takes an optional `model`.

  OpenCode's model list now comes live from `opencode models --verbose` and its rows read like model names ("Claude Sonnet 4.5") instead of raw ids; `@conciv/ai/server` no longer exports `opencodeModels`.

  The model menu is searchable: typing in its search field filters every model of every harness by model name, id or harness name (older versions and long lists included), arrows and Enter pick, Escape clears the search and then closes. The effort row leads with Default, checked while the model runs on its own default effort and picked to go back to it. With an empty search each harness shows its main models and says how many more a search reaches. OpenCode lists one row per model (its region routes such as `us.`/`eu.`/`global.` collapse to one) (every model in its catalog, including providers without credentials); a harness with nothing usable says so, and an empty live model list now replaces the saved one instead of being treated as a failure.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#795](https://github.com/conciv-dev/conciv/pull/795) [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6) Thanks [@omridevk](https://github.com/omridevk)! - Arrowing through the session picker no longer piles up previews. A preview waits for the highlight to settle even while one is already open, and an abandoned preview stops reading its transcript instead of folding the whole file before the one you landed on.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Session search can cover every project. The picker's search area gains an "All projects" switch; a hit from another project shows that project's folder, and selecting it copies the command that resumes it there instead of opening it here. The search term and the switch live in the URL, so closing the picker or reloading keeps them. `sessions.search` takes `everywhere`, and each hit carries `cwd` and `resume`.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - A session search hit now shows a short excerpt from the line that matched, with the matched words highlighted in the excerpt and the title, so you can tell why a session was found before opening it.

- [#779](https://github.com/conciv-dev/conciv/pull/779) [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986) Thanks [@omridevk](https://github.com/omridevk)! - Extensions and the app get persisted settings with Devframe's settings contract: `scope(namespace).settings.global` and `.project` on the server API, `getHostApi().useScope(namespace).settings` in the client, both backed by one JSON file per scope and namespace and kept in sync over the new `settings` procedures.

- [#731](https://github.com/conciv-dev/conciv/pull/731) [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c) Thanks [@omridevk](https://github.com/omridevk)! - When the engine cannot bind its port, start now fails with the bind error (such as EADDRINUSE) and logs a failing extension cleanup, nested errors included, instead of reporting the cleanup failure in its place.

- [#796](https://github.com/conciv-dev/conciv/pull/796) [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09) Thanks [@omridevk](https://github.com/omridevk)! - Session previews read a native transcript from its end: `HarnessHistory.tail(cwd, id, {limit, before, signal})` returns one page and an opaque cursor for the page above, so a preview of a 124 MB Claude transcript reads a few hundred KB instead of the whole file. Claude and Codex message ids without a native id are now the byte offset of their opening line (`o<offset>`), so full reads and tails agree; a Codex session imported under the old positional ids re-imports once.

  `HarnessHistory.summary` and `HarnessSessionSummary` are removed (nothing called them), and Codex's `withinProject` reads only the first 64 KiB of a rollout for its `session_meta` cwd instead of the whole file.

- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`9ea8792`](https://github.com/conciv-dev/conciv/commit/9ea8792e73c9f569e0c7e48b802fe32e597aa877), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`82fcd6a`](https://github.com/conciv-dev/conciv/commit/82fcd6a504661ad43f22d3b6a1d4b447e10e3805), [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`9003236`](https://github.com/conciv-dev/conciv/commit/90032366211b3ab568a5c92335adce4be6e097a7), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`61a66bf`](https://github.com/conciv-dev/conciv/commit/61a66bfb44ebb179ddda4139443587bdda863bb3), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f)]:
  - @conciv/protocol@0.0.22
  - @conciv/ui-kit-chat@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/chat@0.0.22
  - @conciv/db@0.0.22
  - @conciv/harness@0.0.22
  - @conciv/extension@0.0.22
  - @conciv/extension-page@0.0.22
  - @conciv/harness-init@0.0.22
  - @conciv/serve@0.0.22
  - @conciv/tools@0.0.22
  - @conciv/solid-diffs@0.0.22

## 0.0.21

### Patch Changes

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - New `@conciv/ai` package: the chat primitives conciv is built from, on top of TanStack AI. Three
  entries, with the message, part and event types living in `@conciv/protocol`:

  - `@conciv/ai/server`: `createChatServer`, which runs every turn through `chat()` with the library's
    persistence (`withPersistence`, streaming snapshots), locks, the local-process sandbox and its
    command policy, code mode with `discover_tools`, WebSocket and SSE delivery with resume, stop and
    hydrate; plus the CLI text adapters (`claudeCode`, `codex`, `opencode`, `acp`, `makeTextAdapter`).
    The patched `@tanstack/ai-sandbox` and `@tanstack/ai-code-mode` ship inside its dist.
  - `@conciv/ai/client`: `createChat` and `createChatSession`, the Solid chat session on the library's
    `useChat` (connection, hydration, stop, approvals). The widget's chat runs on it.
  - `@conciv/ai/testkit`: the story connection and chunk builders for stories and tests.

  `bippy` stays held at its current version.

  New `@conciv/chat` package: the conciv chat plane on top of `@conciv/ai/server` (`createChatPlane`):
  the Drizzle chat stores over `@conciv/db`'s tables, transcript import, compaction with a divider that
  keeps the history, boot recovery, approvals as the library's deny-and-retry flow with once and
  session grants, `conciv_ui` questions, and the code-mode capabilities with the result cap. Tools that
  need approval stay ordinary tool calls outside code mode. Core wires the plane and keeps sessions,
  slash commands and the session bus; `@conciv/core`, `@conciv/db`, `@conciv/harness` and
  `@conciv/protocol` no longer depend on `@tanstack/ai*`.

  The widget posts "Approved: <title>" after an approval and refreshes hydration on stop and on a run
  error. Approval tools called over RPC from outside the widget (the `conciv` CLI, curl) are refused
  with the same ask, and a retry after approving runs.

  The agent prompts and the `react-introspection` skill name `discover_tools`; `external_catalog` is
  gone. `@conciv/harness-testkit` builds on the `@conciv/ai` event types and chunk builders and reaches
  tools through `/api/mcp` with `discover_tools`. `discover_tools` carries each tool's
  output shape and declared error codes.

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - Move the @tanstack/ai family to 1.0 and the harness SDKs to their latest releases.

- [#621](https://github.com/conciv-dev/conciv/pull/621) [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95) Thanks [@omridevk](https://github.com/omridevk)! - New page capability `page_hmr` (`conciv tools page hmr`): after editing a file, wait until Vite's hot update has been applied in the browser before reading the page. `server reload` now waits on it as well and reports `applied` and `waitedMs`.

  `conciv init` adds a `CLAUDE.md` containing `@AGENTS.md` when the claude harness is chosen and no `CLAUDE.md` exists yet, can now wire vite configs written as a function (`defineConfig(() => ({...}))`, async functions, function bodies with a single return), and prints every command as `.conciv/bin/conciv ...` so it runs as written without `conciv` on PATH.

  The core dev server writes `.conciv/mcp-endpoint.json` when it boots, so the claude stdio MCP bridge works in headless runs.

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - Stop cancels only the runs the client saw: `chat.stop` takes `runIds`, so a stop that lands after the next turn was claimed (Escape or the stop button with queued messages) no longer cancels that next turn. The flush now waits for the stop to be acknowledged before it sends.

  A stop also cancels a run whose viewer already disconnected: the run keeps watching for a recorded cancel until it ends, instead of waiting out the 15s settle timeout.

- [#673](https://github.com/conciv-dev/conciv/pull/673) [`c06f93f`](https://github.com/conciv-dev/conciv/commit/c06f93f3978414d74829f203c898d258ccde1a1f) Thanks [@omridevk](https://github.com/omridevk)! - Cut the core test suite to the cases that guard distinct server behaviour and share one engine boot per describe where cases do not touch each other's state.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a), [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103), [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/chat@0.0.21
  - @conciv/db@0.0.21
  - @conciv/harness@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-chat@0.0.21
  - @conciv/extension-page@0.0.21
  - @conciv/harness-init@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/extension@0.0.21
  - @conciv/tools@0.0.21
  - @conciv/serve@0.0.21
  - @conciv/solid-diffs@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Drizzle `MessageStore` and `MetadataStore` on the ai-persistence schema (`chat_threads`, `chat_metadata`), gated by upstream's `runPersistenceConformance`. `openDb` backfills every legacy `run_messages`/`image_history` row into one thread through `uiMessageToModelMessages`, moves anchor ids into metadata as `{nativeId}`, and records where the still-pending turn starts. The import is idempotent and leaves the legacy tables in place.

  `chat_threads` is now the widget's single record of a session. The read-time merge of the CLI transcript with database-owned history is gone: a snapshot loads the thread and converts it back to UIMessages, and the CLI transcript reaches the widget only through an import that appends the turns the thread does not already hold. Nothing writes `run_messages` or `image_history` any more.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Run records move to a Drizzle `RunStore` on the `@tanstack/ai-persistence` schema. One durable record now describes a run for both conciv and the library, replacing the parallel `runs` table bookkeeping. A user stop records the cancel through `requestRunCancel` and aborts with `RUN_CANCEL_REASON`, so it is distinguishable from a dropped client, and boot cleanup is a sweep over `listReclaimable` instead of a blanket abort.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Run chat turns through the library's own `withSandbox` middleware instead of conciv's `withConcivSandbox` copy. The sandbox now tears down when a turn is stopped, so a stopped thread leaves no instance record to resume from. Adopting it needs a vendored patch of `@tanstack/ai-sandbox@0.5.3` (`patches/@tanstack__ai-sandbox@0.5.3.patch`): the middleware declared the workspace-projection capability unconditionally while only providing it for definitions that carry a workspace, which failed every run, and it handed harness projectors a real host path where the sandbox filesystem expects a virtual one.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The assistant message id core persists into the run log now matches the id the wire chunks
  carry. When a harness adapter forwards a text chunk with no `messageId`, core mints one id per
  message and stamps it into every chunk of that message before it is folded into the run log and
  before it is forwarded to the client, instead of letting core's internal `StreamProcessor` and the
  client's independent one each mint their own random id from the same id-less chunk.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Calm surfaces: a streaming activity now gets one surface that is born once, streams into itself, and settles in place. Completed surfaces stay open and inspectable until the next prompt is sent, page-session grouping is minted once per part and only reclassified once the run settles, and the server keeps the user message id the client minted so a prompt row is never remounted mid-thread.

- [#617](https://github.com/conciv-dev/conciv/pull/617) [`005ce1c`](https://github.com/conciv-dev/conciv/commit/005ce1c0cb34b5b0ce662d9497272144e8a6d10c) Thanks [@omridevk](https://github.com/omridevk)! - Release tooling: Changesets CLI v3 with the matching changesets/action v2 inputs.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A refresh in the middle of a code-mode approval now re-renders the approval card. The synthetic `conciv:tool_call` chunks that stand for a capability called inside `execute_typescript` used to reach the durable run log the long way round — isolate, chat stream, stream fold, run controller — while the gate wrote its approval-requested chunk to that same log directly and synchronously. The gate always won the race, so the log held an approval for a tool call it had not announced yet, and the server-side replay that rebuilds a resubscribing client's snapshot dropped it: the part came back as `input-complete` with no approval to answer. Both now enter the log through the same door. The run hands code-mode tools an emitter that folds each `conciv:tool_*` event into chunks and appends them at emit time, which is before the gate is consulted, so true order is preserved by construction rather than by timing; the stream fold no longer expands those events, so nothing is written twice. The approval still carries the inner tool call's id, so it lands on the nested part instead of the outer `execute_typescript` one.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Delete parallel structures in the chat plane: the `toChatTool` and `makeConcivSandbox`-adjacent wrappers, the hand-rolled per-session promise chain (now `InMemoryLockStore` from `@tanstack/ai`), the duplicated code-mode event mapping on the MCP path, the abort-safe sandbox process wrappers, and the JSON-schema dereferencer (tool schemas must now serialize to one inline schema, enforced at registration).

  **Breaking for extension authors: tool names are now plain snake_case identifiers.** conciv adopts TanStack AI's tool-naming convention instead of its own dotted one. `registerTool` validates every name against `^[a-z][a-z0-9_]*$` and rejects anything else with a message naming the tool and the rule, because the code-mode isolate binds each tool as a JavaScript function (`external_<name>`). Every first-party tool was renamed accordingly: `page.<verb>` to `page_<verb>`, `server.<op>` to `server_<op>`, `canvas.*`/`comment.*`/`ios.*` to `canvas_*`/`comment_*`/`ios_*`, `pin.setState` to `pin_set_state`, `anchor.resolve` to `anchor_resolve`, `element.reference` to `element_reference`, and the `tanstack.*` family to `tanstack_*` with camelCase verbs lowered to snake (`tanstack.dataEntries` becomes `tanstack_data_entries`). Rename your own dotted tools; the CLI command shape (`conciv tools page fill`) is unchanged. Code-mode bindings are now `external_<name>` straight from `toolsToBindings`, so `sanitizeIdentifier`/`uniqueIdentifier` are gone from `@conciv/extension`, and the tool-name normalizer only strips CLI and bridge prefixes (`mcp__*__`, `tanstack_`) — it no longer folds punctuation. Tool names stored in old transcripts are left exactly as written and will render as unknown tools.

  **The TanStack extension now registers one tool per verb.** The `tanstack_page_*` namespace is gone: each page verb is registered once, under its agent-facing name, as the client tool that implements it — `tanstack_page_router_state` is now simply `tanstack_router_state`, and the server-side re-wraps that used to shadow those verbs (`routerStateServer`, `routeTreeServer`, `loaderDataServer`, `queryCacheServer`, `navigateServer`, `routerInvalidateServer`, `backServer`, `queryInvalidateServer`, `queryRefetchServer`) are deleted along with `src/shared/verb-defs.ts` and `src/client/verbs.ts`. Removed tool names: `tanstack_page_detect`, `tanstack_page_router_state`, `tanstack_page_route_tree`, `tanstack_page_data_entries`, `tanstack_page_data_get`, `tanstack_page_data_invalidate`, `tanstack_page_data_refetch`, `tanstack_page_errors_snapshot`, `tanstack_page_query_cache`, `tanstack_page_query_invalidate`, `tanstack_page_query_refetch`, `tanstack_page_navigate`, `tanstack_page_router_invalidate`, `tanstack_page_back`, and `tanstack_invalidate` (renamed to `tanstack_router_invalidate`). New names for verbs that had no curated tool: `tanstack_detect`, `tanstack_data_entries`, `tanstack_data_invalidate`, `tanstack_errors_snapshot`. Results lose the `{result: …}` envelope — `tanstack_router_state` answers `{location, matches}` directly. The page plane only transports plain records, so the three verbs whose natural answer is not one name their payload: `tanstack_data_entries` answers `{entries}`, `tanstack_errors_snapshot` answers `{errors}`, and `tanstack_loader_data` answers `{routeId, data}` (the routeId tells you which match answered when you omit it).

  **The run record is the only source of run liveness.** `packages/core/src/chat/live-runs.ts` is deleted. The four seams that used to ask a process-local map whether a session was busy now ask the `RunStore`: the extension server's `sessions.chatBusy`, the session scope's `run.live()`, the sessions RPC listing, and `subscribeSession`. All four are async as a result — `chatBusy` and `run.live()` return promises, and `listSessionMetas` takes a `running` set resolved once per list call from the new `runningThreadIds` query instead of a per-row predicate. What stays in memory is only what a database cannot hold: each in-flight run's `AbortController` and its driver promise, keyed by run id in `run-drivers.ts` and dropped when the run settles, plus the per-session lock in `session-locks.ts`.

  **One tool invalidates a route's loader data, not two.** `FrameworkClientCore['data']` loses its `refetch(key)` member: refetching a route was byte-identical to invalidating it — both call the router's `invalidate` — so the surface now carries only `invalidate(key)`, exposed to the agent as `tanstack_data_invalidate`. `QueryCacheSurface.refetch` and `tanstack_query_refetch` are untouched, because refetching a query really is not invalidating a route.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Delete dead chat-plane code found in a source audit of the calm-chat-plane branch:
  `snapshotToTokenUsage` (only consumer was its own test), the self-referential
  `ChatMessageSchema`/`ChatRequestSchema` (no import site anywhere), and the `replies`
  table plus `writeReply`/`replyFor` (truncated on every boot, no non-test consumer).
  A drizzle migration drops the `replies` table.

  Delete our bespoke `APPROVAL_REQUESTED_EVENT`/`ApprovalRequest`/`aguiApprovalRequestedFor`
  helpers in `@conciv/protocol`; the single emitter in `@conciv/core`'s permission gate now
  builds `@tanstack/ai`'s `ApprovalRequestedEvent` directly and stamps it with tanstack
  run/thread metadata via `withTanstackMetadata`, keeping the event name string sourced from
  `@tanstack/ai-sandbox`'s `APPROVAL_REQUESTED_EVENT` constant.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Steer the agent off `page.eval` and onto the typed page verbs. `page.eval` now declares `approval: 'ask'`, so running arbitrary script in the live page costs a user decision on every surface (chat, `/api/mcp`, `registry.call`) instead of being free. `page.snapshot` is described by what it answers — every control with its current value, checked state and ref — so form work finds it. A new `page.reload` verb reloads the live page and resolves the moment the reload is initiated, since the navigation destroys the context it ran in. The page extension now contributes a standing prompt naming the dedicated read/act/edit-live verbs and calling eval the last resort. The capability catalog's search now matches on each declaration's hand-curated keywords and its full description (hints included), not just name, summary and category.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Close two read-only-classifier holes in the Bash approval gate: `git branch` now auto-allows only in list-shaped forms (creating, deleting, renaming, copying or repointing a branch asks), and any git segment carrying `--output` asks because it writes a file.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Stop over-prompting on read-only shell work: a command auto-allows when every segment of a plain `&&`/`;`/`|` pipeline is a read-only command, and an approval can now be remembered for the exact command string for the rest of the session.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Sweep the Bash approval gate's read-only command set for flags that write or execute despite a read-only head: `rg --pre` / `--hostname-bin` and `grep --filter` / `--pager` / `--view` / `--save-config` / `--config` all run a command or write a file, and `date` forms that set the system clock now ask. The per-head vetoes are consolidated behind one `escapesReadOnlyIntent` rule table.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - `chat.hydrate` is the only place a client asks for a thread: a run no longer appends the whole transcript to its own stream, so a turn carries only what it produces. The compact turn drives itself through the same turn path every other run uses, and `RunController` leaves the chat path with it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Tool results read as data again. An exec run now shows its console logs and its typed result separately: objects and arrays open as a JSON tree, strings stay strings, and scalars sit on one compact line instead of being flattened into an escaped one-line blob. Meta-driven cards with an object output schema take the same structural path. Page script steps label themselves with the first line of the script they ran, and a long value no longer squeezes the step target out of a narrow session card.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Draw the permission card for an approval that has no chat turn behind it. A gated MCP, registry or
  page call asked over the push socket and nothing rendered, because the pane built approval cards only
  from a transcript tool call. Pending approvals now reach the pane as records, from
  `chat.hydrate` on open and from the push socket while it is attached, and the pane renders the same
  `Permission request` card from them. The card leaves when the ask settles: the gate publishes an
  `approval-settled` chunk when a decision, a timeout, or a session stop resolves the ask.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - One thin per-tab push socket now carries server-push traffic: page queries and out-of-band session events ride `/push-ws`, and every request/response call stays on oRPC over fetch.

- [#508](https://github.com/conciv-dev/conciv/pull/508) [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff) Thanks [@omridevk](https://github.com/omridevk)! - makeApp accepts an injectable engine-staleness probe, shared by /health, the rpc meta.engine procedure and the mcp server instructions

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Scope each server's run journals to its own state root (`<stateRoot>/.conciv/runs`) instead of the host-global `/tmp/tanstack-runs`. Two conciv servers on one machine no longer share journal files keyed by run id, so a fresh run can never replay output an earlier server left behind under the same run id.

- [#573](https://github.com/conciv-dev/conciv/pull/573) [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e) Thanks [@omridevk](https://github.com/omridevk)! - Session identity is now established at the transport boundary and read ambiently, instead of being hand-threaded as a parameter.

  `@conciv/core` gains a `SessionScope` facade: `CoreRuntime.forSession(id)` returns the only door to a session's tools, page bus, stream, asks, captures, history and run control, and every effectful member of that scope establishes a Node `AsyncLocalStorage` context. Core's interior reads that context through the newly exported `session()` rather than taking a session parameter: the page-tool forwarder, the change journal, the capture sink, and the rpc approval gate no longer accept a session id, and `PermissionGate.decide` loses the session argument it was already ignoring. The raw page-bus, tool-registry, ask-registry and stream primitives are no longer exported outside the facade.

  Behavior changes:
  - RPC procedures that act on behalf of a session now REJECT a call that carries no `x-conciv-session` header with `UNAUTHORIZED`, instead of silently minting a throwaway session row. Callers resolve a session with `sessions.resolve` and send it on every call.
  - `chat.permissionDecision` settles the ask that OWNS the approval id rather than one belonging to the calling header's session, and reports `UNKNOWN_REQUEST` when the decision matches no pending ask.
  - Reopen-latest (`sessions.resolve({})`) only considers chat sessions in the caller's working directory, so an agent- or CLI-minted row in another directory is never handed to the widget. The explicit "Split pane" action mints a fresh session instead of reopening the latest one.
  - Unused rows are swept for external mints too, not only chat ones.
  - Catalog reachability is answered per scope: a page tool is reachable for the session whose widget is connected, while the engine-level catalog keeps the engine-wide answer.
  - Native session rows are claimed conflict-safe, so a concurrent `sessions.list` cannot double-insert one harness session.
  - `HarnessSessionId` is branded AND constrained to `[A-Za-z0-9_-]{1,128}`. That is hygiene, not the guarantee: every harness transcript path now goes through one shared containment check (`transcriptPathWithin`) that resolves the path (following symlinks) and refuses anything landing outside the harness project root. A `HarnessHistory` that declares `transcriptPath` must also declare `transcriptRoot` — the pair is enforced at the type level, so an adapter that cannot vouch for a root yields no path at all instead of being silently trusted.
  - `@conciv/extension`: a server tool's page access now forwards the target page tool's real `mutating` flag (mutations were never journalled through this path before), and the vestigial `__execute` handler surface is removed in favor of `__serverRun`, whose request/page/tools arguments are now required.
  - Whiteboard's server router derives the room from the request's session instead of trusting caller input, and scopes element upserts the way bulk deletes were already scoped. The terminal `/tty` route's pre-upgrade session rejection is covered by a test. The recorder's event rings require an explicit client id instead of falling back to whichever client wrote last.
  - `editor.open` and every other `server.*` RPC procedure now require the `x-conciv-session` header like every other session-scoped call; the widget shell surfaces a toast instead of silently swallowing the failure when it is missing.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A reload during a live turn no longer replays it. A subscriber joining a session now receives a
  catch-up snapshot consolidated from the run's own durable log and resumes at that exact log offset,
  so text already in the snapshot is never streamed a second time. The CLI-transcript merge also
  anchors on a contiguous prompt boundary instead of the last matching prompt, so repeating an earlier
  prompt no longer duplicates every turn between the two.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Run lifecycle: stop now acknowledges immediately and the session badge and timer read the run record.

  The server publishes a run-lifecycle event on the session stream when a run starts, when a stop is
  requested, and when the run driver settles it, and replays the last one to every new subscriber. Stop
  marks the run cancel-requested and acknowledges before waiting for settlement, and the transcript read
  that computes context occupancy moved off the settlement path into a later usage update.

  The widget shows a disabled "Stopping…" control from the click until the run settles, with a timeout
  fallback. FAILED now derives only from a run that ended with a terminal error, carrying that error as
  the chip's title; a denied or nonzero-exit tool call stays in the per-turn rollup and no longer flags
  the session. The elapsed timer keys on the persisted run id, so it survives a reload or a snapshot
  that re-keys every message.

- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`00f3200`](https://github.com/conciv-dev/conciv/commit/00f32009789ed532dc6cd6f62b6b360c6e37d0c5), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ee779f0`](https://github.com/conciv-dev/conciv/commit/ee779f0456f0c4aedb5c00d8c2d69229de7598a1), [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313), [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/ui-kit-chat@0.0.20
  - @conciv/db@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/harness@0.0.20
  - @conciv/tools@0.0.20
  - @conciv/extension@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/extension-page@0.0.20
  - @conciv/solid-diffs@0.0.20
  - @conciv/serve@0.0.20

## 0.0.19

### Patch Changes

- [#357](https://github.com/conciv-dev/conciv/pull/357) [`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b) Thanks [@omridevk](https://github.com/omridevk)! - The configured engine port is a preference on the Vite dev server: when it is already taken the
  engine falls back to a free port, logs the address it actually bound, and the page is stamped with
  that address, so two dev servers can run at once instead of the second dying on EADDRINUSE. The
  Next.js integration and the generic webpack/rspack plugin still bind their port exactly, because
  both hand the client a fixed address before the engine ever boots.

- [#343](https://github.com/conciv-dev/conciv/pull/343) [`78977f0`](https://github.com/conciv-dev/conciv/commit/78977f03328d09224602b6162b9178c48b4e04a9) Thanks [@omridevk](https://github.com/omridevk)! - Detect and announce a stale engine. The engine builds its staleness probe as its own modules are first imported, fingerprinting the contents of every published entry of the server packages it loaded, and re-hashes them on demand — so a rebuild that lands on disk under a running dev server stops being invisible — and a re-link or cache extraction that only moves mtimes with identical bytes does not raise a false alarm. `/health` gains an `engine` field (`stale`, `changed`, `tracked`, `bootedAt`, `fingerprint`), a new `meta.engine` RPC carries the same reading to the widget, and the MCP server folds a warning into its `instructions` when the loaded code is behind the disk. The widget raises a standing danger notice naming what actually moved: the server code on disk is newer than the running engine, restart the dev server. The notice is keyed by fingerprint, so it clears itself when the engine is restarted, stays down once dismissed for that same stamp, and speaks up again after a further rebuild.

- [#319](https://github.com/conciv-dev/conciv/pull/319) [`af72648`](https://github.com/conciv-dev/conciv/commit/af72648838bd828477102f87f78d457d17ebec41) Thanks [@omridevk](https://github.com/omridevk)! - Serve one composite oRPC router (core procedures plus `ext.<slug>` extension routers) over both a fetch mount at `/rpc` and a new additive WebSocket mount at `/rpc-ws`. Per-call request headers are now derived from the oRPC standard request by a single shared root interceptor, so session-scoped calls behave identically on both transports. `@conciv/serve` gains an explicit `maxPayload`, a graceful socket close that only terminates after a deadline, and a `fetch` type that accepts the server env argument. Existing `/rpc` and `/rpc/ext/<slug>` URLs are unchanged.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/contract@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/serve@0.0.19
  - @conciv/extension-page@0.0.19
  - @conciv/tools@0.0.19
  - @conciv/db@0.0.19
  - @conciv/harness@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19

## 0.0.18

### Patch Changes

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Clean-room rewrite of the chat stack: the client rides `@tanstack/ai` subscribe/send/stop with server-stamped runIds, core rebuilds around six small chat modules with a MESSAGES_SNAPSHOT-led wire, and the composer moves into ui-kit-chat with draft persistence and refresh. The old bridge/epoch/adopt machinery is deleted and banned from the codebase by lint.

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Track in-flight chat runs and drain them when the app is disposed, so a shutdown no longer races a
  turn's teardown (leftover harness temp files, writes against a closed database). `makeApp` now
  returns a single `dispose()` that drains runs, runs extension disposers, and closes the sqlite
  handle, replacing the separate `disposers`/`closeDb` pair callers could forget. The MCP route also
  closes its per-request server and transport instead of leaking one per POST.
- Updated dependencies [[`b687236`](https://github.com/conciv-dev/conciv/commit/b687236db6e3793f1ecb909ebafa7bf1ed02ff8f), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`90ed432`](https://github.com/conciv-dev/conciv/commit/90ed432ccf967c05f1858c8c13d15ee57c33fb6c), [`42a0ad0`](https://github.com/conciv-dev/conciv/commit/42a0ad0273cbf8b1b48d197c363f4f77da75dc69), [`32b49c3`](https://github.com/conciv-dev/conciv/commit/32b49c36a2c62210391449a1b2f01095d8ece57f), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/tools@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/db@0.0.18
  - @conciv/extension-page@0.0.18
  - @conciv/harness@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/serve@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/db@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/harness@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/serve@0.0.17
  - @conciv/tools@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Tool cards render on every harness, and code-mode calls surface as real nested tool cards. Three fixes plus the phase-2 extension-owned cards: (1) tool names are normalized to their registered names before parts reach the widget — claude's `probe_ping`, opencode's `tanstack_probe_ping`, and transcript `mcp__<server>__` forms all map losslessly back to the registered dotted name, so a card written once matches everywhere. (2) codex bridged tools finally execute under `workspace-write`: codex was cancelling MCP tool calls awaiting an unanswerable approval prompt, fixed narrowly with `mcp_servers.tanstack.default_tools_approval_mode = "approve"` scoped to conciv's own bridge (conciv's approval gate still guards `approval: 'ask'` tools). (3) every extension tool invoked through code-mode `execute_typescript` now emits a real per-tool part carrying `metadata.parentToolCallId`, and the chat activity view nests those parts under the script run in a collapsible tool group — denies and throws render as errors, never green. New extension-owned cards: CanvasOpCard (op-aware `canvas.*` with thumbnails, count chips, red destructive ops), CommentOpCard (`comment.*` + `pin.setState`), RecordingToolCard (`recording_start/stop/pull` with action-log summary), and inline rows for `element.reference` / `anchor.resolve`.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/tools@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/db@0.0.16
  - @conciv/harness@0.0.16
  - @conciv/serve@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/db@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/harness@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/serve@0.0.15
  - @conciv/tools@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3)]:
  - @conciv/extension@0.0.14
  - @conciv/tools@0.0.14
  - @conciv/contract@0.0.14
  - @conciv/db@0.0.14
  - @conciv/harness@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/serve@0.0.14

## 0.0.13

### Patch Changes

- [#80](https://github.com/conciv-dev/conciv/pull/80) [`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c) Thanks [@omridevk](https://github.com/omridevk)! - Fix the context meter reading cumulative turn usage as context occupancy (issue [#78](https://github.com/conciv-dev/conciv/issues/78), e.g. 386% / 773K of 200K). `@tanstack/ai`'s `RUN_FINISHED` usage is a billing aggregate, not the live context size; each adapter feeds it differently (Claude sums every tool-loop request). Context occupancy is now a distinct `UsageSnapshot.contextTokens` field populated per-harness through a new optional `HarnessHistory.contextTokens(raw)` seam. The Claude harness derives it from the last non-sidechain assistant message's usage in the transcript (`input + cache_read + cache_creation`). The meter's ring/percent/bar render only when a harness reports real occupancy; otherwise the tracker shows honest turn billing totals with no percent-of-window framing.

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/harness@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/db@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/tools@0.0.13
  - @conciv/serve@0.0.13

## 0.0.12

### Patch Changes

- [#66](https://github.com/conciv-dev/conciv/pull/66) [`450fc46`](https://github.com/conciv-dev/conciv/commit/450fc463b7bce804ac1c75e3c6a398d1b9f9491e) Thanks [@omridevk](https://github.com/omridevk)! - Adapter streams that emit a RUN_ERROR chunk (stub harnesses, acp adapters) now settle the run with a visible error instead of finishing silently with an empty message. Runs whose harness produces no output at all (missing binary, unauthenticated CLI stuck on an interactive prompt) are now bounded by a first-chunk deadline: after 30s of silence the child is killed and the run settles with a visible "produced no output" error instead of spinning forever.

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/db@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/harness@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/serve@0.0.12
  - @conciv/tools@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/db@0.0.11
  - @conciv/extension@0.0.11
  - @conciv/harness@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/serve@0.0.11
  - @conciv/tools@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/db@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/harness@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/serve@0.0.10
  - @conciv/tools@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/db@0.0.9
  - @conciv/extension@0.0.9
  - @conciv/harness@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/serve@0.0.9
  - @conciv/tools@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- [#38](https://github.com/conciv-dev/conciv/pull/38) [`fce6e80`](https://github.com/conciv-dev/conciv/commit/fce6e80e818460ca950b08ac75bccd94a1a72931) Thanks [@omridevk](https://github.com/omridevk)! - Harness turns now run on the TanStack AI stack: every harness is a `chatConfig` returning a published `@tanstack/ai-*` text adapter (claude on `claudeCodeText`, codex on `codexText`, opencode on `opencodeText`, gemini-cli on `acpCompatible`), executed through `chat()` with a local-process sandbox and the conciv permission gate as middleware. The bespoke spawn/decode pipeline, the PreToolUse hook route, and the per-harness arg builders are gone.

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/db@0.0.8
  - @conciv/serve@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/tools@0.0.8
  - @conciv/harness@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- [#30](https://github.com/conciv-dev/conciv/pull/30) [`bbdfc69`](https://github.com/conciv-dev/conciv/commit/bbdfc6940e7c4a45d4a20fb04e12d8e407154bfb) Thanks [@omridevk](https://github.com/omridevk)! - Add homepage metadata (conciv.dev) and repository fields across manifests, and
  publish the terminal packages (@conciv/ui-kit-terminal, @conciv/extension-terminal).
- Updated dependencies []:
  - @conciv/harness@0.0.7
  - @conciv/protocol@0.0.7
  - @conciv/tools@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.6
  - @conciv/protocol@0.0.6
  - @conciv/tools@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/harness@0.0.5
  - @conciv/protocol@0.0.5
  - @conciv/tools@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.4
  - @conciv/protocol@0.0.4
  - @conciv/tools@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/tools@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/tools@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/tools@0.0.1
