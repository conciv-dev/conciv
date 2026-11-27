# @conciv/protocol

## 0.0.23

### Patch Changes

- [#1168](https://github.com/conciv-dev/conciv/pull/1168) [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8) Thanks [@omridevk](https://github.com/omridevk)! - A finished queued page list reaches its session through `session.synthetic`, as opencode's background jobs report: the result arrives as a "Queued page actions <status>" notice that wakes an idle session, or waits for a live run to end. The engine's own page-queue follow-up turn, its `'page-queue'` turn kind and the `conciv.page-queue` chat event are gone, and the agent's in-chat code replies no longer repeat finished queue results (hub replies still carry them).

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A harness can now say whether its CLI is logged in, through a `login` check its capabilities declare. Claude reads it from the Agent SDK's account info, the way opencode does, and Codex from `codex login status`. A turn sent to a CLI that is not logged in is refused before the CLI starts, with a chat error that says how to log in, and the model lists carry the same login state.

- [#1145](https://github.com/conciv-dev/conciv/pull/1145) [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344) Thanks [@omridevk](https://github.com/omridevk)! - A plugin can add a notice to a session with `session.synthetic({sessionID, text, ...})`, as opencode's: the notice waits in the session's inbox, wakes an idle session into a turn (unless `resume: false`), goes in with the next run when a run is live or stopped, and the same `id` twice stores one notice. The model gets the notice text as a user message, a resumed CLI session included; the chat shows the notice as its own row labelled with its description, and hides one whose description is missing or only spaces, unless the notice failed (metadata `state: 'error'`, or a shell notice that completed with a non-zero exit or a timeout), which shows under its text. A notice is never a session's title: a session takes its first typed message as its title.

- [#980](https://github.com/conciv-dev/conciv/pull/980) [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643) Thanks [@omridevk](https://github.com/omridevk)! - A message sent to a deleted session is refused before anything of it is kept: the send ends with the error `session "<id>" does not exist`, with no run, no stored message and nothing published on the session's stream. A page queue follow-up or a compaction of a deleted session is refused with that same error and starts no run; a refused compaction writes no compaction marker. A call from outside a run that is admitted per session (an MCP client's `code.execute` while hub access is not `open`) is refused for a deleted session as for one that does not exist. Opening a deleted session no longer moves its last-active time. A message sent to an id no session ever had still starts that session.

  If you implement `TurnHooks` yourself, add `admit: async (turn) => {}`. It runs before anything of the turn is stored, and a rejection refuses the turn with that error. If you build a `SessionPort` yourself, its `row` now returns `deletedAt` too: `null` for a live session, the time it was deleted otherwise.

  A turn or compaction refused because its session is deleted carries the code `SESSION_DELETED_CODE` (`'session_deleted'`, exported from `@conciv/types/chat-event-types` beside `CONTEXT_OVERFLOW_CODE`): on the `RUN_ERROR` frame and on the client's `Error.code`, so a client can tell a deleted session from any other failure.

  The RPC `sessions.compact` now declares the contract's `NOT_FOUND` error and answers it for a session that does not exist or is deleted, where it answered an internal server error before.

  With hub access `open`, an outside call (an MCP client's `code.execute` or a hub `registry.call`) on a deleted session is refused with `session "<id>" does not exist` too: it no longer runs, and nothing of it is recorded in the deleted session's chat.

  Opening a deleted session no longer imports its harness transcript into its thread: the history of a deleted session stays as the delete left it.

  In the widget, a deleted session shows a panel in place of the chat and composer: 'This session was deleted.' and one 'New session' button, also when the delete arrives while the pane is open. A delete that lands while the widget's event stream is not connected is picked up when the stream connects. A message refused because its session was deleted reads 'This session was deleted, so your message was not sent.' in the thread and in a notice, with no Retry, and the pane then turns into that panel. When the deleted session had saved text the panel adds 'Your text moves to the new session.', and 'New session' moves that text (not its attachments) into the new session. In the quick terminal the new session takes the deleted pane's place. Compacting a session that is deleted or does not exist says 'This session no longer exists.'. When a new session cannot be started, from any new-session action, a notice says 'Could not start a new session. Check that the engine is running, then try again.'

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A tool's time rides its result's metadata onto its one tool-call part, so a finished tool no longer replaces the whole message list and a long tool run stays smooth. The `conciv.tool-time` event is gone.

- [#1106](https://github.com/conciv-dev/conciv/pull/1106) [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23) Thanks [@omridevk](https://github.com/omridevk)! - A chat turn rides the browser rpc socket. `chat.send({sessionId, messages, runId})` starts the run once and streams it, and `chat.join({runId, lastEventId?})` streams a run from an event id; every event carries its offset in the run's log as its id, so a resubscribe after a drop never repeats one, and a resend of a known run id streams it instead of running it again. The `/chat-ws` socket, the `/chat-sse` stream, their path constants, the transport probe and the widget's `transport` setting are gone. `chatConnection` drops its transport options, and `@conciv/ai/client` exports `rpcStream` in place of `fetchServerSentEvents` and `webSocket`. A chat run that loses its stream retries on the rpc socket up to five times in a row with no event in between (250 ms doubling to 5 s), an event restarts that count, and once it is spent the turn fails with TanStack AI's `StreamReconnectLimitError`, as the old chat socket did; an error the engine answers is not retried.

- [#837](https://github.com/conciv-dev/conciv/pull/837) [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9) Thanks [@omridevk](https://github.com/omridevk)! - The Claude harness reads a session's model, token usage and cost from its transcript (`history.transcriptUsage({cwd, nativeId})`), looked up by the harness session id in the project folder first, then in every project folder.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - A composer draft can hold structured items beside its text, attachments and quote: each item is a key and a JSON value. The chat kit's composer keeps them by key (`addItem` keeps the existing item when its key is already there, `updateItem` and `removeItem` change or drop one), and they come back after a failed send and after a reload. The engine's draft row stores them in a new nullable `items` column (an additive migration); a draft saved before this reads back with no items. The item's one shape is `DraftItemSchema` (type `DraftItem`) in `@conciv/types/chat-types`, which the draft row, the engine table and the kit's composer all read.

- [#992](https://github.com/conciv-dev/conciv/pull/992) [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd) Thanks [@omridevk](https://github.com/omridevk)! - conciv writes .conciv/.gitignore so its machine state stays out of git; settings/ and harnesses.json stay shareable.

- [#981](https://github.com/conciv-dev/conciv/pull/981) [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5) Thanks [@omridevk](https://github.com/omridevk)! - `CONCIV_UI_SELECTOR` and `EFFECTS_SURFACE_ATTR` move to `@conciv/types/page-types` (new exports there). `@conciv/extension` re-exports both from protocol, so old extensions keep their import; `@conciv/page` imports them from protocol.

  The RPC transport moves to the new `@conciv/serve/rpc` subpath: `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware` and `rpcWebsocketRoute`. `@conciv/serve` now depends on `@conciv/protocol`, `@orpc/server`, `semver` and `zod`. `@conciv/extension/rpc-mount` no longer exports `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `rpcConnectionContext` or `rpcHandlerOptions`; it keeps `makeCompositeRpcRouter`, `CompositeRpcRouter` and `MountedExtensionRouter`. `@conciv/backend`, `@conciv/backend-defaults` and `@conciv/extension` take the transport and its `UpgradeWebSocket` type from `@conciv/serve/rpc`, and the engine staleness probe now tracks both `@conciv/serve` entries.

- [#1124](https://github.com/conciv-dev/conciv/pull/1124) [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82) Thanks [@omridevk](https://github.com/omridevk)! - The conciv config has no `extensions` field: nothing loads extension packages any more, and plugins, from `plugins` or `conciv/plugins`, replace them. `@conciv/extension-compiler` and the private `@conciv/extension-testkit` are deleted; `@conciv/extension-compiler` is no longer published. Plugin tests use `@conciv/plugin-testkit`.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - Names of removed packages leave the product: `@conciv/types` drops the unused `ExtensionRegistry` and `ExtensionPackage` types, `conciv plugin call` gives a real rpc id and method as its examples, and package descriptions name the engine and the widget instead of the old core, embed and `@conciv/ai`.

- [#819](https://github.com/conciv-dev/conciv/pull/819) [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb) Thanks [@omridevk](https://github.com/omridevk)! - Drop the last local patches on the TanStack AI packages. conciv now keeps tool-call metadata, failed results and a stable message id in its own middleware, carries its own call ids on code-mode child calls, validates code-mode tool input and output itself, reads the Claude Code context window from `modelUsage`, and lets the local sandbox forget finished runs. The session's effort now reaches the harness as `HarnessChatDeps.effort`: the Claude harness runs the CLI with `CLAUDE_CODE_EFFORT_LEVEL`, so Claude 5 models get the picked effort too, and codex reads it for `model_reasoning_effort`.

- [#1150](https://github.com/conciv-dev/conciv/pull/1150) [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f) Thanks [@omridevk](https://github.com/omridevk)! - The engine no longer serves `editor.openFromFrames`, and the SDK client no longer has an `editor` group: nothing called it, and opening a grabbed element's source goes through the page plugin.

- [#1119](https://github.com/conciv-dev/conciv/pull/1119) [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db) Thanks [@omridevk](https://github.com/omridevk)! - The engine, the chat plane and the widget no longer load extensions; plugins replace them. Every plugin tool is a CLI command, and plugins hear how a run ended through `session.execution.succeeded` and the new `session.execution.failed` event.

- [#933](https://github.com/conciv-dev/conciv/pull/933) [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d) Thanks [@omridevk](https://github.com/omridevk)! - Closing the dev server ends a harness's model listing that is still running and waits for it, up to a grace of 5 seconds. For OpenCode the listing (`opencode models --verbose`) runs in its own process group, which gets SIGTERM when the engine stops: a CLI that exits on SIGTERM is gone before the close resolves; a CLI that ignores SIGTERM gets SIGKILL when the grace runs out, so the close (which waits the same grace) can resolve just before it is gone, and the engine prints that the OpenCode listing did not end. Codex lists its models without a child process. Claude's model probe is ended by the Agent SDK on the SDK's own timers (its stdin is closed, SIGTERM follows about 2 s later and SIGKILL about 5 s after that), so that probe can outlive the close by up to those delays. A listing that does not settle within the grace (for example a `models` function that ignores the signal) no longer holds the close: the engine prints which harness's listing did not end and closes without it.

  For harness authors: a `models` function now receives `{signal}`, an `AbortSignal` the engine aborts when it stops. Pass it to whatever lists the models (a child process, a `fetch`, an SDK's abort controller) and settle once that child has exited. A `models` function that takes no parameter still type-checks, since a function with fewer parameters is assignable; if it never settles, it costs the close the full grace. `resolveHarnessModels(adapter, {signal})` now takes the signal and hands it on.

- [#1149](https://github.com/conciv-dev/conciv/pull/1149) [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723) Thanks [@omridevk](https://github.com/omridevk)! - The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

  A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.

- [#1126](https://github.com/conciv-dev/conciv/pull/1126) [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/extension` is deleted and no longer published: plugins replace extensions. `@conciv/cli`, `@conciv/tools` and the widget no longer depend on it. `@conciv/types/page-types` drops `EFFECTS_SURFACE_ATTR`, and `CONCIV_UI_SELECTOR` no longer matches `[data-conciv-effects]`: nothing renders that surface any more, and plugin overlays carry `PLUGIN_OVERLAY_ATTR`.

- [#828](https://github.com/conciv-dev/conciv/pull/828) [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f) Thanks [@omridevk](https://github.com/omridevk)! - Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
  passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
  or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
  function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
  server extension object moved to each package's `/server` subpath. `register()` on Next.js now validates `CONCIV_OPTIONS` and fails with a clear error when it is not a valid conciv config.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Finding the installed agent CLIs, checking the Claude plugin install and the Claude MCP bridge's endpoint lookup no longer block.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `HarnessHistory.observe` is removed, with the transcript handle types it returned (`TranscriptHandle`, `TranscriptChunk`, `TranscriptRevision`, `TranscriptFailure`, `TranscriptFailureReason`, `TRANSCRIPT_FAILURES`) and the shared `makeJsonlHandle` reader the adapters built it on. No product code read it; a session's history is read through `messages` and `tail`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Harness transcripts, session folders, model caches and the Claude plugin folder are read without blocking, and the context token count streams the transcript instead of reading it whole.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/types/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#1185](https://github.com/conciv-dev/conciv/pull/1185) [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b) Thanks [@omridevk](https://github.com/omridevk)! - Ids conciv makes have one format from one maker, opencode's: sessions are `ses_` plus a descending id (runs `run_`, markers `mrk_`, calls `call_`, hub tasks `tsk_`, engines `eng_`, ptys `pty_`, settings generations `gen_`, and every assistant message conciv streams `msg_`, whatever id the CLI gave it); an existing local database holds `conciv_` session ids that no longer validate, so reset it.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a) Thanks [@omridevk](https://github.com/omridevk)! - The last pieces of the old extension system are gone. The plugin host no longer keeps a list of mounted extension names (it was always empty), so a plugin can register any rpc id. The tool list no longer carries an `extension` field nothing set, and a crashed plugin is logged as a plugin. The ui-kit-system token contract for third-party UI is now the plugin author contract (`docs/plugin-tokens.md`), and the READMEs describe plugins instead of extensions.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A session whose harness fails to list its models no longer fails the whole model menu or the terminal. The session models answer still carries the harness, with `modelsFailed` set, so the menu keeps the other harnesses and shows a retry row for the one that failed, and the terminal tab still shows for a harness with a terminal.

- [#1197](https://github.com/conciv-dev/conciv/pull/1197) [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656) Thanks [@omridevk](https://github.com/omridevk)! - Engine logs are off by default and go through one logger. The engine's two Effect logger stacks (file, stderr and OTLP; the host's `log.emit` sink) are one layer whose level lives in a service the engine creates, so it can change while the engine runs. `CONCIV_LOG_LEVEL` takes `off` (the default), `error`, `warn`, `info`, `debug` or `trace`; `CONCIV_PRINT_LOGS` is gone: at any level other than `off` the lines go to the host's sink, or to stderr when the host gave none. The login code a browser asks for is not a log and always reaches the host. Every hand-made log callback in the engine is gone: promise code logs with `Effect.log*` on the engine runtime.

  Logs are turned on by `conciv({logLevel})`, `CONCIV_LOG_LEVEL` (which wins over the config) and, for the CLI's own diagnostics on stderr, `--verbose` (debug) or `--log-level <level>`, which win over both. One function, `readLogLevel` in `@conciv/types/config-types`, computes the level everywhere.

  An agent can switch logs while the engine runs: `logs.level` (a live stream of `{engine, widget}`) and `logs.setLevel` on the rpc contract, `conciv logs level [<level>] [--scope engine|widget|all]` in the CLI, and the `set_log_level` tool inside, which asks the user before raising the widget above `warn`.

  The widget logs through evlog: off by default, its level follows `logs.level`, and its events reach the engine in batches over the engine socket (`logs.write`), so they land in the engine's one sink. Plugins get `ctx.log`. The engine stores every log in its database (`log_events`, kept `logRetention`, 7 days by default) and agents read it: `logs.query`, `logs.tail` and `logs.cleanup` on the contract, `conciv logs` and `conciv logs cleanup` in the CLI, and the `logs_query` tool (`external_logs_query` in code mode). The log file in the conciv home is gone.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.

- [#1078](https://github.com/conciv-dev/conciv/pull/1078) [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1) Thanks [@omridevk](https://github.com/omridevk)! - The widget's page queries and session events ride the one `/rpc-ws` socket: `page.queries({focus})` opens with a `ready` that names the browser tab, `page.focus` keeps the tab focused last as the target of page queries, and the separate `/push-ws` socket is gone.

- [#1166](https://github.com/conciv-dev/conciv/pull/1166) [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971) Thanks [@omridevk](https://github.com/omridevk)! - The live-edit journal is a page tool: `page.changes` (with `clear: true` to empty it after returning it) lists the page edits made in the session, for the agent, for code mode and as `conciv tools page changes [--clear]`. The engine's `page.changes` and `page.clearChanges` routes, the CLI's hand-written `page changes` command and the protocol's `PageChangeEntry` are gone; the entry type lives in the page plugin, which records each edit under a `PageConnection.change` span.

- [#1026](https://github.com/conciv-dev/conciv/pull/1026) [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607) Thanks [@omridevk](https://github.com/omridevk)! - The page plugin reads its results through the shared page schemas instead of private copies, and @conciv/types exports PageRaisedErrorSchema.

- [#927](https://github.com/conciv-dev/conciv/pull/927) [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390) Thanks [@omridevk](https://github.com/omridevk)! - A finished page action queue no longer gets lost when a `page.queue.wait` caller goes away just as it finishes. A wait over `/rpc` or the rpc websocket now counts the result as delivered only once its reply has gone out (over `/rpc` the response finished writing; over the websocket the socket was still open when the call settled and the send was not skipped); otherwise the result stays owed and leads the next reply. The finished card shows in the chat once per queue, when it finishes, unless the result was already delivered or held for the next reply by then, and never again when a result goes back to owed.

  Shape changes: `RpcContext` (`@conciv/types/rpc-types`) gains an optional `replied: Promise<boolean>`, and `rpcFetchMiddleware` and `rpcWebsocketRoute` (`@conciv/extension/rpc-mount`) now fill it for every call.

- [#859](https://github.com/conciv-dev/conciv/pull/859) [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028) Thanks [@omridevk](https://github.com/omridevk)! - The `approval-requested` chat event may carry `permission: {always: boolean}`, which marks the card as a plugin permission request, and `readApprovalAsk` passes it through. A new `approval-settled` chat event (`approvalSettledEvent`, read with `readApprovalSettled`) names an approval whose card should go away on every client.

  A stored pending approval keeps `permission`, whether a turn or a plugin asked for it, so `chat.hydrate`, the replay a new subscriber receives, and a chat session loading saved state show the same card as a live ask. The chat plane gains `permissionAsked` and `permissionSettled`, which store and drop a permission card without writing an approval grant. Updates to a thread's pending approvals run one at a time, so overlapping asks and settles never lose a card or bring a settled one back.

- [#864](https://github.com/conciv-dev/conciv/pull/864) [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80) Thanks [@omridevk](https://github.com/omridevk)! - The engine-side plugin host can find plugins: the new `plugins` key in the conciv config (a name, or a `[name, options]` pair) and the `conciv/plugin` and `conciv/plugins` folders, read in opencode's order. It watches those plugins for changes on disk. It also carries opencode's database client and event bus, with the bus's durable event log; the host owns its event tables and their migrations. `resolveConfig` keeps the `plugins` list. Nothing loads a plugin yet.

- [#915](https://github.com/conciv-dev/conciv/pull/915) [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d) Thanks [@omridevk](https://github.com/omridevk)! - A tool a plugin adds or removes while a chat turn runs now shows up, or goes away, at the next step of that same turn. Before every model step the turn waits for a plugin reload in progress, then offers the tools as they are after it.

  If you build a `TurnPlan` yourself (the value `TurnHooks.plan` returns), the four tool fields `codeMode`, `search`, `asking` and `direct` move behind one async `tools()` function that returns them, for example `tools: async () => ({codeMode, search, asking, direct})`. It is called before every model step. `TurnHooks.plan` itself stays synchronous. The chat plane's `capabilities(sessionId)` now returns a promise.

  `HarnessChatDeps.hasTools` is removed, because the tools can change between steps of one turn. A harness that needs to know whether tools ride a model step reads that step's `options.tools` in its adapter's `chatStream`. Codex now does this: it auto-approves its tanstack MCP server for each step that offers tools.

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - The project config takes `permission` and `permissions`: allow, deny or ask for a tool ahead of time, for every agent, so a headless run or CI needs nobody at the tab. `permission` is a short form (one effect for everything, per tool, or per tool and resource); `permissions` lists full `{action, resource, effect}` rules. A config rule never opens the page tools before the tab connects. A rule in these options now decides a terminal page eval too: `conciv tools page eval` runs with `permission: {page_eval: 'allow'}` and is refused with `page_eval: 'deny'`, with nobody at the tab.

  A page eval card no longer offers "Always allow": an answer approves that one eval and saves no rule, so every later eval asks again unless a config rule decides it.

  A terminal eval naming its tab (`--tab`) is asked the same way: only a config rule lets it run with nobody to approve, and a config deny refuses it.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - A sent message's notes are read in one way everywhere. `@conciv/types/chat-message-types` exports `NoteCommentSchema` (type `NoteComment`) and `PromptPresentationSchema` (type `PromptPresentation`): the user-message metadata `{displayText, comments, attachments}`, where `comments` must be a list (as opencode reads it), a comment or attachment that does not decode is dropped, and a missing `attachments` list reads as empty. The thread's "You: N notes" label now counts only the notes it can show, and the session title reads the first note that decodes.

- [#960](https://github.com/conciv-dev/conciv/pull/960) [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3) Thanks [@omridevk](https://github.com/omridevk)! - Answering a question card while the page is logged out or its login was revoked shows the same notice Send shows, and while the engine cannot be reached it says "conciv lost connection to the engine. Your answer was not sent." In each case the card takes your answer again instead of staying on "Sending your answer…". An answer the engine itself refuses still says "That question is no longer waiting for an answer." and the card stays as it was.

  For card authors: `addResult` on a tool card (and on the tool view context) now returns a promise, which rejects when the page could not send the answer.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.

- [#993](https://github.com/conciv-dev/conciv/pull/993) [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f) Thanks [@omridevk](https://github.com/omridevk)! - The agent's `server_reload` tool is removed, and with it the `conciv tools server reload <file>` command (the whole `conciv tools server` group is gone; the dev-server methods answer through `conciv plugin call server <method>`). Instead, save the file: the dev server's own watcher pushes the hot update, and the page plugin's hot update wait (`page_hmr`, `conciv tools page hmr`) reports when it landed.

  Removed published exports: `@conciv/protocol` loses `contract.server` (the `server.reload` procedure and its `NO_BUNDLER` error), so `RpcClient` and the `@conciv/backend-plugin-api` client no longer have a `server` group; `@conciv/tools/builtins` loses `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `ServerToolContext`, `SERVER_TOOL_PREFIX` and `serverOperationOfTool`, and `builtinToolNames()` now answers only `tabs`. The agent guide no longer teaches `conciv tools server ...`. `BundlerBridge` (`@conciv/types/bundler-types`) loses `reload(file)`, and the Vite bridge from `@conciv/extension/vite` no longer implements it; a bridge keeps `restart`, and the hot update itself is the dev server's.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The @tanstack/ai family moves to ai 1.7.0, ai-client 1.2.0, ai-solid 1.1.0, ai-event-client 1.1.0 and ai-persistence 1.1.0, so the metadata a tool result carries lands on its tool-call part.

- [#1112](https://github.com/conciv-dev/conciv/pull/1112) [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c) Thanks [@omridevk](https://github.com/omridevk)! - Typing `@` in the composer lists the engine's skills, then its agents that are neither primary nor hidden, then the session's tools from `meta.tools`, in one list named `Context` for screen readers. The engine answers skills and agents through the new `skill.list` and `agent.list` calls. Each row draws a lucide icon named for its kind (`Skill`, `Agent`) through the new optional `icon` field on a trigger item. The list keeps inside its pane: `AnchoredListbox.Root` takes an optional `boundary` element for its placement, and `RichTextField` passes its `menuBoundary` through, so a list opened near a pane's edge no longer covers the pane beside it.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - Opening the model menu or switching a model or harness re-checks the Claude login in the background, whether the held answer says logged in or not, so a `claude auth logout` shows in the menu and refuses the next send without an engine restart. A send that runs still reads the held answer and starts nothing.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv-named-tab` header is gone: its only reader went with the refuse-and-retry path, so the CLI no longer sends it, the engine no longer parses it, and `@conciv/types` drops `CONCIV_NAMED_TAB_HEADER`.

- [#1094](https://github.com/conciv-dev/conciv/pull/1094) [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070) Thanks [@omridevk](https://github.com/omridevk)! - The old engine-to-page bus is gone. Page tools run only through the page plugin. The `page.queries`, `page.reply` and `captures.list` procedures, the `.client()` tool binding, the page plane in the widget, and the `tool_captures`, `css_bundles` and `page_changes` tables are removed. A migration drops the tables.

- [#1172](https://github.com/conciv-dev/conciv/pull/1172) [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378) Thanks [@omridevk](https://github.com/omridevk)! - The page plugin refreshes its own element captures: its engine half announces each saved capture and its tool cards reload them, so the app no longer reaches into the plugin's query. The element capture and page introspection types and the capture sanitizer move from `@conciv/types` into the page plugin, and `PLUGIN_OVERLAY_ATTR` moves to `@conciv/types/ui-types`.

- [#990](https://github.com/conciv-dev/conciv/pull/990) [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be) Thanks [@omridevk](https://github.com/omridevk)! - The Terminal panel is built in. A session whose harness has a terminal command lists a Terminal tab in the status bar; opening it starts the harness CLI in a terminal that survives a reload, and while it is shown the status bar carries a model picker (the pick is remembered) and a New terminal button. `session.panel.end` is ported: a plugin slot drawn at the end of the status bar's view tabs. `HarnessMeta.persistentPty` is new: `meta.models` and `meta.harnesses` say whether the harness has a terminal. The model picker's list keeps its own width and stays on screen when its trigger sits near the edge of the window. The model picker's button and list use the chat sans face and type scale, matching the status bar tabs beside them. The terminal uses the widget's mono font.

- [#1038](https://github.com/conciv-dev/conciv/pull/1038) [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369) Thanks [@omridevk](https://github.com/omridevk)! - The tool request, tool error, tool name rule, registry call gate and server session and harness types move from @conciv/extension to @conciv/types.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `ToolCardProps` takes an optional `body`. The catalog tool card (`MetaToolCard`) and the default fallback card (`ToolFallback`) draw it in place of their own body, under their normal header: the headline with the positional value, the badge, the input chips, the duration and the status stay the card's own. Without a `body` both cards draw as before; every other card ignores the prop.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool's look is only its own tool render: the registry catalog carries no `icon` or `label`, the generic tool card and the live status line show the tool name, and the generic card shows no mutating badge and no asks-approval hint, as opencode does, and `TOOL_ICON_KEYS`, `toolIconRender`, `cardTitle`, `pageToolMeta`, the page catalog special case and `@conciv/plugin-tanstack/client` are gone. The page and TanStack cards keep their words and icons inside their own renders. The app no longer depends on `@conciv/plugin-tanstack`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The trusted browsers file and the `.conciv` folder are read and written without blocking the engine.

- [#847](https://github.com/conciv-dev/conciv/pull/847) [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4) Thanks [@omridevk](https://github.com/omridevk)! - `SessionRecord` now carries the session row's `transcriptCwd`, `attachedPid` and `attachedAt`, so the type matches what the
  sessions table stores.

## 0.0.22

### Patch Changes

- [#741](https://github.com/conciv-dev/conciv/pull/741) [`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679) Thanks [@omridevk](https://github.com/omridevk)! - The server retries a model call when the provider asks to wait before any output. A context overflow now says the conversation is too long for the model and offers to compact it, and a denied or cancelled tool reads as denied or cancelled instead of failed.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - A streamed chunk wakes only the turn and part it changed: turns and each turn's parts are keyed lists, result lookups wake only the row whose result arrives, pane-level readers (dividers, stopped line, harness label, narration, permission asks, older-messages, load failure) stop scanning every message, and tool durations live in one pane-level record that folds only the live turn per chunk, so a row reads its call's duration (`ToolViewCtx.durationFor(toolCallId)`) and wakes only when that entry changes.

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - The "Context compacted" line stays under the reply it follows once the compaction output arrives, live and after reopening: the server marks compaction output in the message metadata and the chat starts a new turn there.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Harness history can list sessions across every project: `HarnessHistory.list` takes a scope (`{cwd}` or `{everywhere: true}`) and every `HarnessSessionMeta` carries the cwd the harness recorded for it.

- [#781](https://github.com/conciv-dev/conciv/pull/781) [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde) Thanks [@omridevk](https://github.com/omridevk)! - Every harness with transcript history now carries a resume command, so "Copy resume command" on a search hit from another project works for Codex, OpenCode and Pi sessions, not only Claude.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#795](https://github.com/conciv-dev/conciv/pull/795) [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6) Thanks [@omridevk](https://github.com/omridevk)! - Arrowing through the session picker no longer piles up previews. A preview waits for the highlight to settle even while one is already open, and an abandoned preview stops reading its transcript instead of folding the whole file before the one you landed on.

- [#796](https://github.com/conciv-dev/conciv/pull/796) [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09) Thanks [@omridevk](https://github.com/omridevk)! - Session previews read a native transcript from its end: `HarnessHistory.tail(cwd, id, {limit, before, signal})` returns one page and an opaque cursor for the page above, so a preview of a 124 MB Claude transcript reads a few hundred KB instead of the whole file. Claude and Codex message ids without a native id are now the byte offset of their opening line (`o<offset>`), so full reads and tails agree; a Codex session imported under the old positional ids re-imports once.

  `HarnessHistory.summary` and `HarnessSessionSummary` are removed (nothing called them), and Codex's `withinProject` reads only the first 64 KiB of a rollout for its `session_meta` cwd instead of the whole file.

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

## 0.0.20

### Patch Changes

- [#566](https://github.com/conciv-dev/conciv/pull/566) [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3) Thanks [@omridevk](https://github.com/omridevk)! - The claude harness now disables the native `AskUserQuestion` tool. It resolves through a host-rendered dialog the CLI only offers over the Agent SDK control channel, which our adapter (a plain `claude -p` spawn) does not have, so the CLI failed closed and answered itself with "The user did not answer the questions" in about 400ms: the widget never showed anything and the agent carried on with an answer nobody gave. Asking now goes through the `conciv_ui` tool's existing `choices` kind, which gains `multiSelect` (the user picks several options, and the answer comes back as a list) and `allowOther` (a free-text row for an answer that is not on the list).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Every tool card entry now declares `hasEmbeddedBody`, and a trace row asks the card instead of guessing
  from raw arguments and result text.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
  its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
  protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
  `uninstall()` outside the deleted `claude/attach.ts` and its own test.

  Consolidated the duplicate `chatBusy`/`busyOf` check (identical bodies in `@conciv/ui-kit-chat` and
  `@conciv/client`) into a single `chatBusy` export from `@conciv/protocol/chat-busy`, which both
  packages already depend on.

  `@conciv/client`'s `stopping` state is now derived from the server-published run lifecycle phase
  (`runSource().lifecycle.phase === 'stopping'`) instead of a local 10s-timeout approximation; deleted
  the now-redundant `createStopState`/`isStopping` local timer and its `@solid-primitives/timer`
  dependency.

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

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Draw the permission card for an approval that has no chat turn behind it. A gated MCP, registry or
  page call asked over the push socket and nothing rendered, because the pane built approval cards only
  from a transcript tool call. Pending approvals now reach the pane as records, from
  `chat.hydrate` on open and from the push socket while it is attached, and the pane renders the same
  `Permission request` card from them. The card leaves when the ask settles: the gate publishes an
  `approval-settled` chunk when a decision, a timeout, or a session stop resolves the ask.

- [#521](https://github.com/conciv-dev/conciv/pull/521) [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a) Thanks [@omridevk](https://github.com/omridevk)! - `mount(el)` now resolves only once the widget can actually honor `open()` — previously the returned promise settled as soon as the app's boot sequence finished computing, which raced ahead of the root route's `onMount` (where the open-panel listener registers). Any embedder that opens the panel immediately after `mount()` resolves — including a landing page's "Try it live" button that dispatches an early click before the widget bundle finishes loading — no longer has that open silently dropped.

  `mountConciv(extensions)` now returns the underlying `mount()` promise instead of `void`, so a caller can `await` it (or observe a rejection) instead of the widget's readiness being unobservable outside `createConciv`. Existing fire-and-forget call sites keep working unchanged; they just ignore the returned promise.

  New `@conciv/protocol/event-bus` export: `createEventBus`/`createEventBusClient`, a faithful port of the TanStack Devtools in-page event-bus protocol. It eliminates the whole "sender fires before receiver is listening" class of races, not just the one above. Every emit is wrapped as an envelope (`{type: '<pluginId>:<suffix>', payload, pluginId}`) and dispatched on one fixed bus event (`conciv-dispatch-event`); the running bus re-dispatches it as both a specific `<pluginId>:<suffix>` event and a global `conciv-global` event, and answers the fixed `conciv-connect` handshake with `conciv-connect-success`. Clients queue emits until connected, retry on a bounded loop, and flush in order on ack.

  Panel commands moved onto that protocol under the `panel` plugin id, so the wire events are now `panel:open`, `panel:close` and `panel:toggle` instead of `conciv:open-panel`, `conciv:close-panel` and `conciv:toggle-panel`, and they are spoken through a bus client rather than a bare `window.dispatchEvent`. `createConciv().open()`/`close()`/`toggle()`, the landing page's "Try it live" button, and the iOS bridge's panel open/close all emit through a client; the widget's root route subscribes with `client.on()` and starts the bus once its listeners are registered. Status events (`conciv:connection-changed`, `conciv:panel-toggled`) are unchanged raw window events.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).

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

## 0.0.19

## 0.0.18

### Patch Changes

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Sessions store a per-session transcript cwd plus attached process id/time, and harness session ids are now unique.

## 0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Add the shared `FrameworkAdapter` contract (`@conciv/protocol/framework-types`): a capability-typed
  interface for framework inspection adapters (Next.js, TanStack Start, and future Vue/Solid/Astro),
  mirroring the `HarnessAdapter` pattern so capability flags (`queryCache`, `serverFunctions`,
  `rscPayload`, `isr`, `middleware`) force their gated surfaces to be present at compile time. Ships the
  client (routes, navigation, data, errors) and server (manifest, events, logs) core surfaces plus the
  serializable data shapes agents read (`RouteMatch`, `RouteNode`, `CacheEntry`, `HydrationSnapshot`,
  `AppError`, `FrameworkEvent`, `ServerFnInfo`, …) and the `defineFrameworkAdapter` factory. The client
  core surface is fully asyncified (every `routes`/`navigation`/`data`/`errors` method returns a
  `Promise`) so an adapter can satisfy it by round-tripping through browser page verbs, and the server
  core adds `server.errors.snapshot()` alongside the manifest/events/logs surfaces. Types only; no
  adapter implementations yet.

## 0.0.15

## 0.0.14

## 0.0.13

### Patch Changes

- [#80](https://github.com/conciv-dev/conciv/pull/80) [`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c) Thanks [@omridevk](https://github.com/omridevk)! - Fix the context meter reading cumulative turn usage as context occupancy (issue [#78](https://github.com/conciv-dev/conciv/issues/78), e.g. 386% / 773K of 200K). `@tanstack/ai`'s `RUN_FINISHED` usage is a billing aggregate, not the live context size; each adapter feeds it differently (Claude sums every tool-loop request). Context occupancy is now a distinct `UsageSnapshot.contextTokens` field populated per-harness through a new optional `HarnessHistory.contextTokens(raw)` seam. The Claude harness derives it from the last non-sidechain assistant message's usage in the transcript (`input + cache_read + cache_creation`). The meter's ring/percent/bar render only when a harness reports real occupancy; otherwise the tracker shows honest turn billing totals with no percent-of-window framing.

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

## 0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1
