# @conciv/contract

## 0.0.23

### Patch Changes

- [#959](https://github.com/conciv-dev/conciv/pull/959) [`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079) Thanks [@omridevk](https://github.com/omridevk)! - A deleted session whose Claude Code or Codex transcript is still on disk no longer comes back the next time the session list loads. Opening it again, or going to it by its native id, answers "session not found", like any other deleted session, and the transcript file is left as it was. A native session that conciv has never seen still opens as before. Going to any deleted session by its conciv id answers "session not found" too, instead of handing the deleted session back.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - An error thrown while the panel renders shows its own message instead of "conciv couldn't reach the engine", and its Retry no longer resets the engine connection. Only a failure of the engine connection itself counts as an unreachable engine: `@conciv/protocol` marks those failures with `engineUnreachable` and tells them apart with `isEngineUnreachable`, and `isReachabilityError` checks only that mark, so a draft save is no longer retried for an error that is not a connection failure.

- [#980](https://github.com/conciv-dev/conciv/pull/980) [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643) Thanks [@omridevk](https://github.com/omridevk)! - A message sent to a deleted session is refused before anything of it is kept: the send ends with the error `session "<id>" does not exist`, with no run, no stored message and nothing published on the session's stream. A page queue follow-up or a compaction of a deleted session is refused with that same error and starts no run; a refused compaction writes no compaction marker. A call from outside a run that is admitted per session (an MCP client's `code.execute` while hub access is not `open`) is refused for a deleted session as for one that does not exist. Opening a deleted session no longer moves its last-active time. A message sent to an id no session ever had still starts that session.

  If you implement `TurnHooks` yourself, add `admit: async (turn) => {}`. It runs before anything of the turn is stored, and a rejection refuses the turn with that error. If you build a `SessionPort` yourself, its `row` now returns `deletedAt` too: `null` for a live session, the time it was deleted otherwise.

  A turn or compaction refused because its session is deleted carries the code `SESSION_DELETED_CODE` (`'session_deleted'`, exported from `@conciv/types/chat-event-types` beside `CONTEXT_OVERFLOW_CODE`): on the `RUN_ERROR` frame and on the client's `Error.code`, so a client can tell a deleted session from any other failure.

  The RPC `sessions.compact` now declares the contract's `NOT_FOUND` error and answers it for a session that does not exist or is deleted, where it answered an internal server error before.

  With hub access `open`, an outside call (an MCP client's `code.execute` or a hub `registry.call`) on a deleted session is refused with `session "<id>" does not exist` too: it no longer runs, and nothing of it is recorded in the deleted session's chat.

  Opening a deleted session no longer imports its harness transcript into its thread: the history of a deleted session stays as the delete left it.

  In the widget, a deleted session shows a panel in place of the chat and composer: 'This session was deleted.' and one 'New session' button, also when the delete arrives while the pane is open. A delete that lands while the widget's event stream is not connected is picked up when the stream connects. A message refused because its session was deleted reads 'This session was deleted, so your message was not sent.' in the thread and in a notice, with no Retry, and the pane then turns into that panel. When the deleted session had saved text the panel adds 'Your text moves to the new session.', and 'New session' moves that text (not its attachments) into the new session. In the quick terminal the new session takes the deleted pane's place. Compacting a session that is deleted or does not exist says 'This session no longer exists.'. When a new session cannot be started, from any new-session action, a notice says 'Could not start a new session. Check that the engine is running, then try again.'

- [#907](https://github.com/conciv-dev/conciv/pull/907) [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b) Thanks [@omridevk](https://github.com/omridevk)! - A new session that has not run anything yet no longer says DONE in the status bar or LAST TASK in the header. The bar shows no status until the first message runs, and the header reads just CONCIV. After the first turn they read as before, and a session that ran reads DONE as soon as it opens, before its conversation loads.

  Every session row (`sessions.get`, `sessions.list`, `sessions.search`) now carries `lastRunAt`: when its newest run started, or `null` before the first run. `sessions.create` now answers `{sessionId, session}`, the new session's row, so a new session draws at once.

- [#941](https://github.com/conciv-dev/conciv/pull/941) [`9d9a594`](https://github.com/conciv-dev/conciv/commit/9d9a59474837ae21a337599aeebd7f9e8486a61b) Thanks [@omridevk](https://github.com/omridevk)! - An event stream that goes silent for 45 s on a socket that stays open (the machine slept, a NAT dropped the connection) now comes back: the widget's socket is reconnected once for that stall, and the stream resubscribes over the new socket and sees `server.connected` again. Before, the new subscribe waited on the dead socket until the browser dropped it. The stall abort reason is now `DOMException('Event stream stalled', 'TimeoutError')`.

  `Conciv.make(raw, {idleTimeout})` takes an optional idle timeout in milliseconds (default 45000), as opencode's `createClientConnection` does.

- [#882](https://github.com/conciv-dev/conciv/pull/882) [`eef6c59`](https://github.com/conciv-dev/conciv/commit/eef6c59029f654011fedfdc691021d0cc6502e20) Thanks [@omridevk](https://github.com/omridevk)! - Reloading while the dev server is still starting no longer leaves conciv cut off until another reload; logging in again after a revoke works on the first try. During a dev-server restart the panel may show the "couldn't reach the engine" screen sooner than before, and it now recovers on its own once the server is back. Logging in while conciv is still checking the connection no longer logs the page out a moment later. If the dev server never answers the login check, or a request for a login code, conciv now stops waiting after a few seconds: the chat still opens, and the login dialog says the request failed instead of staying silent.

  Known limits: if the dev server accepts the connection but never answers the login check, the page shows a working chat but stays "unreachable" until the connection reopens or you press Retry. A magic-link code is not tried again after a page load that ended unreachable; reload the page to use it.

- [#1106](https://github.com/conciv-dev/conciv/pull/1106) [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23) Thanks [@omridevk](https://github.com/omridevk)! - A chat turn rides the browser rpc socket. `chat.send({sessionId, messages, runId})` starts the run once and streams it, and `chat.join({runId, lastEventId?})` streams a run from an event id; every event carries its offset in the run's log as its id, so a resubscribe after a drop never repeats one, and a resend of a known run id streams it instead of running it again. The `/chat-ws` socket, the `/chat-sse` stream, their path constants, the transport probe and the widget's `transport` setting are gone. `chatConnection` drops its transport options, and `@conciv/ai/client` exports `rpcStream` in place of `fetchServerSentEvents` and `webSocket`. A chat run that loses its stream retries on the rpc socket up to five times in a row with no event in between (250 ms doubling to 5 s), an event restarts that count, and once it is spent the turn fails with TanStack AI's `StreamReconnectLimitError`, as the old chat socket did; an error the engine answers is not retried.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - A composer draft can hold structured items beside its text, attachments and quote: each item is a key and a JSON value. The chat kit's composer keeps them by key (`addItem` keeps the existing item when its key is already there, `updateItem` and `removeItem` change or drop one), and they come back after a failed send and after a reload. The engine's draft row stores them in a new nullable `items` column (an additive migration); a draft saved before this reads back with no items. The item's one shape is `DraftItemSchema` (type `DraftItem`) in `@conciv/types/chat-types`, which the draft row, the engine table and the kit's composer all read.

- [#986](https://github.com/conciv-dev/conciv/pull/986) [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf) Thanks [@omridevk](https://github.com/omridevk)! - `drafts.set` takes the client's `updatedAt`, and the engine stores it as sent.

- [#1150](https://github.com/conciv-dev/conciv/pull/1150) [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f) Thanks [@omridevk](https://github.com/omridevk)! - The engine no longer serves `editor.openFromFrames`, and the SDK client no longer has an `editor` group: nothing called it, and opening a grabbed element's source goes through the page plugin.

- [`69c4117`](https://github.com/conciv-dev/conciv/commit/69c4117dff5620c1f9588902f41204a51f03fffb) Thanks [@omridevk](https://github.com/omridevk)! - The browser engine connection runs on Effect: a pure machine owns the reconnect back-off and the trust rules, and a scoped driver runs the socket over `effect/socket`. partysocket is gone from the contract, and so are the unused `engineHeaders` and `engineWebSocket`.

- [`f653740`](https://github.com/conciv-dev/conciv/commit/f653740c66d2679792e6cea44e091013e3cea813) Thanks [@omridevk](https://github.com/omridevk)! - The browser rpc connection takes engine connection timings, merged over defaultEngineConnectionTimings, and connections with different timings never share a socket.

- [`a0f5c5e`](https://github.com/conciv-dev/conciv/commit/a0f5c5e24e29d085ad972de89a6cc2eda894cf00) Thanks [@omridevk](https://github.com/omridevk)! - The launcher no longer flashes a login prompt on first load when the host provides a token.

- [#1149](https://github.com/conciv-dev/conciv/pull/1149) [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723) Thanks [@omridevk](https://github.com/omridevk)! - The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

  A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.

- [#957](https://github.com/conciv-dev/conciv/pull/957) [`e503d38`](https://github.com/conciv-dev/conciv/commit/e503d381e9567fa739fed2b5ff84daadeeb646b3) Thanks [@omridevk](https://github.com/omridevk)! - `EngineTrust.ensureTrusted` is removed because nothing used it.

- [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c) Thanks [@omridevk](https://github.com/omridevk)! - Every holder of an engine connection takes the engine timings, so a widget with engine timings set keeps one socket per api base, and the embed init forwards timings to the app.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/types/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A direct tool called over `/api/mcp` keeps its images: they come back as MCP image blocks instead of being written into the text reply.

- [#1197](https://github.com/conciv-dev/conciv/pull/1197) [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656) Thanks [@omridevk](https://github.com/omridevk)! - Engine logs are off by default and go through one logger. The engine's two Effect logger stacks (file, stderr and OTLP; the host's `log.emit` sink) are one layer whose level lives in a service the engine creates, so it can change while the engine runs. `CONCIV_LOG_LEVEL` takes `off` (the default), `error`, `warn`, `info`, `debug` or `trace`; `CONCIV_PRINT_LOGS` is gone: at any level other than `off` the lines go to the host's sink, or to stderr when the host gave none. The login code a browser asks for is not a log and always reaches the host. Every hand-made log callback in the engine is gone: promise code logs with `Effect.log*` on the engine runtime.

  Logs are turned on by `conciv({logLevel})`, `CONCIV_LOG_LEVEL` (which wins over the config) and, for the CLI's own diagnostics on stderr, `--verbose` (debug) or `--log-level <level>`, which win over both. One function, `readLogLevel` in `@conciv/types/config-types`, computes the level everywhere.

  An agent can switch logs while the engine runs: `logs.level` (a live stream of `{engine, widget}`) and `logs.setLevel` on the rpc contract, `conciv logs level [<level>] [--scope engine|widget|all]` in the CLI, and the `set_log_level` tool inside, which asks the user before raising the widget above `warn`.

  The widget logs through evlog: off by default, its level follows `logs.level`, and its events reach the engine in batches over the engine socket (`logs.write`), so they land in the engine's one sink. Plugins get `ctx.log`. The engine stores every log in its database (`log_events`, kept `logRetention`, 7 days by default) and agents read it: `logs.query`, `logs.tail` and `logs.cleanup` on the contract, `conciv logs` and `conciv logs cleanup` in the CLI, and the `logs_query` tool (`external_logs_query` in code mode). The log file in the conciv home is gone.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#1078](https://github.com/conciv-dev/conciv/pull/1078) [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1) Thanks [@omridevk](https://github.com/omridevk)! - The widget's page queries and session events ride the one `/rpc-ws` socket: `page.queries({focus})` opens with a `ready` that names the browser tab, `page.focus` keeps the tab focused last as the target of page queries, and the separate `/push-ws` socket is gone.

- [#1166](https://github.com/conciv-dev/conciv/pull/1166) [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971) Thanks [@omridevk](https://github.com/omridevk)! - The live-edit journal is a page tool: `page.changes` (with `clear: true` to empty it after returning it) lists the page edits made in the session, for the agent, for code mode and as `conciv tools page changes [--clear]`. The engine's `page.changes` and `page.clearChanges` routes, the CLI's hand-written `page changes` command and the protocol's `PageChangeEntry` are gone; the entry type lives in the page plugin, which records each edit under a `PageConnection.change` span.

- [#859](https://github.com/conciv-dev/conciv/pull/859) [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028) Thanks [@omridevk](https://github.com/omridevk)! - The `approval-requested` chat event may carry `permission: {always: boolean}`, which marks the card as a plugin permission request, and `readApprovalAsk` passes it through. A new `approval-settled` chat event (`approvalSettledEvent`, read with `readApprovalSettled`) names an approval whose card should go away on every client.

  A stored pending approval keeps `permission`, whether a turn or a plugin asked for it, so `chat.hydrate`, the replay a new subscriber receives, and a chat session loading saved state show the same card as a live ask. The chat plane gains `permissionAsked` and `permissionSettled`, which store and drop a permission card without writing an approval grant. Updates to a thread's pending approvals run one at a time, so overlapping asks and settles never lose a card or bring a settled one back.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget carries the state machines of the plugin browser host, copied from opencode; nothing runs them yet. The SDK's `@conciv/frontend-plugin-api/host` now exports `BridgePluginExperimental` and `BridgePluginExperimentals`, the list of plugin browser parts to run. `Storage.store` takes the `project` scope, the repo the engine runs in, as declared stores do. A settings key may now be up to 512 characters, so a plugin store named after a long package name fits. `editor.open` and the `open` tool take an optional `column` beside `line`, and the editor opens at that column; a column without a line is ignored.

- [#896](https://github.com/conciv-dev/conciv/pull/896) [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50) Thanks [@omridevk](https://github.com/omridevk)! - `experimental()` no longer inlines a plugin's dynamic `import()`: the build writes a CommonJS entry, one `.cjs` chunk per `import()` and Vite's manifest beside the entry (`plugin-experimental.cjs.manifest.json`).

  The app loads a plugin's entry with the chunks it requires at start (`plugin.experimental` now answers them as `chunks`) and each `import()`ed chunk on demand over the engine socket, through the new `plugin.experimentalChunk` procedure. The engine serves only the files the plugin's manifest lists, and refuses with `PLUGIN_CHUNK_NOT_FOUND` a file the manifest does not list or whose bytes changed since the plugin loaded.

  A lazy chunk may require the plugin's entry, as Vite writes when the lazy part imports a value the entry exports: `plugin.experimental` also answers the entry's file name as `file`, `BridgePluginExperimental` carries it, and `evaluatePluginBundle`'s `PluginBundle` carries the entry's `exports`, which the app gives a chunk that requires `./<file>`. Both fields are additive. The engine leaves the entry out of a chunk's closure instead of refusing the manifest.

- [#904](https://github.com/conciv-dev/conciv/pull/904) [`144a4c5`](https://github.com/conciv-dev/conciv/commit/144a4c53163a9aa1cea68f700bf055b2fe5029b8) Thanks [@omridevk](https://github.com/omridevk)! - A plugin rpc call that fails because of the caller (unknown plugin or method, invalid input, or an error the method declares) now answers HTTP 400 with code `PLUGIN_RPC`, and a plugin defect (`rpc.internal`, `rpc.invalid_output`) answers 500 with code `PLUGIN_RPC_INTERNAL`, as opencode does; before, every failure answered 500.

- [#964](https://github.com/conciv-dev/conciv/pull/964) [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa) Thanks [@omridevk](https://github.com/omridevk)! - A plugin whose store load meets a lost engine connection waits for the engine and starts once it returns, instead of staying failed. An engine error on that load still fails the plugin.

  A browser rpc call whose caller passes its own `shouldRetry` still stops retrying once its connection is closed.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Images a plugin tool returns now reach the model. In code mode they are attached after the program's result, in call order and also when the program fails, without entering the sandbox; a direct plugin tool returns its text followed by its images. Files that are not images are announced with "Attached document or image follows.".

- [#1091](https://github.com/conciv-dev/conciv/pull/1091) [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462) Thanks [@omridevk](https://github.com/omridevk)! - Typing @ in the composer offers the session's plugin tools again, next to the extension tools. The tool list now comes per session (`meta.tools` takes a `sessionId`), from the same place the turn gets its plugin tools, so a tool that a session's permissions turn off is not offered. Tool calls from plugin tools also get their clean names in the chat history.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A session the user just started previews in the picker while its first reply is still running, as opencode does.

- [#834](https://github.com/conciv-dev/conciv/pull/834) [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer polls. `meta.hubAgents` is an event iterator the engine pushes whenever the conciv home db changes on disk, so an agent connected or disconnected from the CLI shows up at once. The engine staleness read refreshes on reconnect and refocus instead of a timer, and reachability comes only from the engine socket (`engineProbeRefetchInterval` and `voteEngineProbeSettled` are gone). The recorder panel follows a `replay` stream until the recording can be replayed and a pushed `events` stream for the live tail, replacing its 1 s polls.

- [`47ac866`](https://github.com/conciv-dev/conciv/commit/47ac866d2795a8e9c24af42d3be7a408b880db99) Thanks [@omridevk](https://github.com/omridevk)! - A rebind normalizes the engine base once where it enters the app, so `/health` and the other derived urls no longer get a doubled slash, and a trust check the engine answers with 401 locks the connection and asks to authorize instead of reading as unreachable.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A Retry click while the engine socket waits to try again reconnects it at once instead of waiting out the back-off, and the Retry reconnects before it checks the login again.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.

- [#993](https://github.com/conciv-dev/conciv/pull/993) [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f) Thanks [@omridevk](https://github.com/omridevk)! - The agent's `server_reload` tool is removed, and with it the `conciv tools server reload <file>` command (the whole `conciv tools server` group is gone; the dev-server methods answer through `conciv plugin call server <method>`). Instead, save the file: the dev server's own watcher pushes the hot update, and the page plugin's hot update wait (`page_hmr`, `conciv tools page hmr`) reports when it landed.

  Removed published exports: `@conciv/protocol` loses `contract.server` (the `server.reload` procedure and its `NO_BUNDLER` error), so `RpcClient` and the `@conciv/backend-plugin-api` client no longer have a `server` group; `@conciv/tools/builtins` loses `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `ServerToolContext`, `SERVER_TOOL_PREFIX` and `serverOperationOfTool`, and `builtinToolNames()` now answers only `tabs`. The agent guide no longer teaches `conciv tools server ...`. `BundlerBridge` (`@conciv/types/bundler-types`) loses `reload(file)`, and the Vite bridge from `@conciv/extension/vite` no longer implements it; a bridge keeps `restart`, and the hot update itself is the dev server's.

- [#952](https://github.com/conciv-dev/conciv/pull/952) [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3) Thanks [@omridevk](https://github.com/omridevk)! - The dev-server commands `conciv tools server config`, `urls`, `resolve`, `graph` and `transform`, and `conciv tools open`, are gone: use `conciv plugin call server <method>` with the input as `--data '<json>'`, for example `conciv plugin call server graph --data '{"file":"src/app.ts"}'` or `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'`. `conciv tools server reload <file>` stays. `conciv tools server restart` is gone and nothing replaces it: the agent's `server_restart` tool asks first, and a person restarts their own dev server in their terminal. The engine's RPC procedures `server.config`, `server.urls`, `server.resolve`, `server.graph`, `server.transform`, `server.restart` and `editor.open` are removed; the same methods, except `restart`, answer through `plugin.call` with rpc id `server`. The agent's `server_*` tools and `open` now come from the engine's server plugin, and the agent guide teaches `conciv plugin call server graph` and `transform`.

  When a session's stored permissions cannot be read, an outside agent is no longer offered the server tools or `open`: they are plugin tools now and plugin tools are withheld in that state, as the skill tool already was.

- [#1032](https://github.com/conciv-dev/conciv/pull/1032) [`2c69bca`](https://github.com/conciv-dev/conciv/commit/2c69bca8cb40a8c71c13ee780abb9ca31900b328) Thanks [@omridevk](https://github.com/omridevk)! - The settings store, settings client and settings merge move from @conciv/extension to @conciv/protocol.

- [#958](https://github.com/conciv-dev/conciv/pull/958) [`92026f6`](https://github.com/conciv-dev/conciv/commit/92026f613d22741b24b08e55a4376d795f988994) Thanks [@omridevk](https://github.com/omridevk)! - A slow dev server is no longer shown as a lost one. The widget now waits up to 30 seconds for the engine to accept its connection, instead of 2, so "conciv lost connection to the engine." only shows when the connection really fails, and an engine that is slow to connect still gets its live updates.

- [#813](https://github.com/conciv-dev/conciv/pull/813) [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53) Thanks [@omridevk](https://github.com/omridevk)! - The browser transport sends its oRPC frames through its own peer client and drops an abort frame for a socket that is not open, so cancelling a call while the socket closes no longer leaves an unhandled "Cannot send message, WebSocket is not open." rejection. A request that cannot be sent still rejects its call, and a frame from the dev server that cannot be read is logged and fails the calls in flight instead of rejecting unhandled. A blocked or full localStorage keeps the engine token in memory; any other storage error is no longer swallowed. This replaces the pnpm patch on `@orpc/standard-server-peer`, which never reached npm consumers.

- [#1052](https://github.com/conciv-dev/conciv/pull/1052) [`b0cd4e4`](https://github.com/conciv-dev/conciv/commit/b0cd4e40d59112f024787685f1b0f0c1c74d9524) Thanks [@omridevk](https://github.com/omridevk)! - The source-location and framework adapter types have one declaration in the contract, and the plugin SDK no longer imports them from protocol.

- [#1112](https://github.com/conciv-dev/conciv/pull/1112) [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c) Thanks [@omridevk](https://github.com/omridevk)! - Typing `@` and part of a path in the composer lists the project's files and folders, each row showing its bare path with a File or Folder icon, after the skills, agents and sessions, as opencode's composer does; a picked one inserts `@<path>`, and every search asks the engine afresh, so a query typed again is never answered from an old listing. The engine answers through the new `fs.find` call: the plugin host searches with fff when the project is under version control and with a ripgrep index otherwise, downloading a pinned, SHA-256 checked ripgrep into the engine's cache folder when none is on the PATH.

- [#1112](https://github.com/conciv-dev/conciv/pull/1112) [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c) Thanks [@omridevk](https://github.com/omridevk)! - Typing `@` in the composer lists the engine's skills, then its agents that are neither primary nor hidden, then the session's tools from `meta.tools`, in one list named `Context` for screen readers. The engine answers skills and agents through the new `skill.list` and `agent.list` calls. Each row draws a lucide icon named for its kind (`Skill`, `Agent`) through the new optional `icon` field on a trigger item. The list keeps inside its pane: `AnchoredListbox.Root` takes an optional `boundary` element for its placement, and `RichTextField` passes its `menuBoundary` through, so a list opened near a pane's edge no longer covers the pane beside it.

- [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6) Thanks [@omridevk](https://github.com/omridevk)! - The offline grace is an engine connection timing: `offlineGraceMs` in `EngineConnectionTimings`, default 1000, read by the app's reachability; the kit mount shortens it.

- [#1094](https://github.com/conciv-dev/conciv/pull/1094) [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070) Thanks [@omridevk](https://github.com/omridevk)! - The old engine-to-page bus is gone. Page tools run only through the page plugin. The `page.queries`, `page.reply` and `captures.list` procedures, the `.client()` tool binding, the page plane in the widget, and the `tool_captures`, `css_bundles` and `page_changes` tables are removed. A migration drops the tables.

- [#978](https://github.com/conciv-dev/conciv/pull/978) [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877) Thanks [@omridevk](https://github.com/omridevk)! - The session terminal moves into core. The contract gains `experimental.persistentPty.create`, which opens the session's terminal or returns the one already open, `remove`, which closes it, and `connectToken`, which mints a ticket for the socket at `/api/experimental/persistent-pty/:ptyId/connect`.

  Outside agents are refused. A ticket is bound to the pty it was minted for and to the Origin that minted it, so it cannot open another pty or be used from another page.

  Plugins reach these procedures through `ctx.client.experimental`.

- [#1089](https://github.com/conciv-dev/conciv/pull/1089) [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b) Thanks [@omridevk](https://github.com/omridevk)! - The session terminal rides the rpc socket. `experimental.persistentPty.output({ptyId, cursor?})` streams the terminal: it replays from the cursor in 64 KiB pieces, sends `{type: 'meta', cursor}` with the absolute cursor, then live output, and every output item carries its cursor so a resubscribe never repeats output. `write`, `resize` and `inject` drive it. `connectToken` and the `/api/experimental/persistent-pty/:ptyId/connect` socket are gone: `create` admits the caller's origin and the other terminal calls refuse any origin it never admitted. A stream whose reader stops reading gets `SLOW_CONSUMER` once the rpc socket holds 8 MiB it has not sent, instead of the engine buffering for it. `createTerminalModel` takes the `transport` its session runs over.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool's look is only its own tool render: the registry catalog carries no `icon` or `label`, the generic tool card and the live status line show the tool name, and the generic card shows no mutating badge and no asks-approval hint, as opencode does, and `TOOL_ICON_KEYS`, `toolIconRender`, `cardTitle`, `pageToolMeta`, the page catalog special case and `@conciv/plugin-tanstack/client` are gone. The page and TanStack cards keep their words and icons inside their own renders. The app no longer depends on `@conciv/plugin-tanstack`.
- Updated dependencies [[`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4)]:
  - @conciv/types@0.0.23

## 0.0.22

### Patch Changes

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#791](https://github.com/conciv-dev/conciv/pull/791) [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c) Thanks [@omridevk](https://github.com/omridevk)! - A navigation made right before a reload or tab close is no longer lost. The widget flushes its pending navigation write when the page turns hidden and sends it as a keepalive request, so a reload restores the screen the user just saw: picking a session and reloading at once no longer brings the session menu back open.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Session search can cover every project. The picker's search area gains an "All projects" switch; a hit from another project shows that project's folder, and selecting it copies the command that resumes it there instead of opening it here. The search term and the switch live in the URL, so closing the picker or reloading keeps them. `sessions.search` takes `everywhere`, and each hit carries `cwd` and `resume`.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - A session search hit now shows a short excerpt from the line that matched, with the matched words highlighted in the excerpt and the title, so you can tell why a session was found before opening it.

- [#779](https://github.com/conciv-dev/conciv/pull/779) [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986) Thanks [@omridevk](https://github.com/omridevk)! - Extensions and the app get persisted settings with Devframe's settings contract: `scope(namespace).settings.global` and `.project` on the server API, `getHostApi().useScope(namespace).settings` in the client, both backed by one JSON file per scope and namespace and kept in sync over the new `settings` procedures.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22

## 0.0.21

### Patch Changes

- [#667](https://github.com/conciv-dev/conciv/pull/667) [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a) Thanks [@omridevk](https://github.com/omridevk)! - Every queued recorder stop now finishes its session, events whose upload failed during a stop stay queued ahead of the next session's, failed recorder controls are logged, and node RPC links keep the caller's abort signal so an aborted stream really closes.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c)]:
  - @conciv/protocol@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#485](https://github.com/conciv-dev/conciv/pull/485) [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3) Thanks [@omridevk](https://github.com/omridevk)! - Global engine-reachability handling: reachability seam + single rebindable rpc client factory in contract, router error boundary with /panel/latest sentinel, one standing offline notice per window context, composer send disabled while unreachable.

- [#556](https://github.com/conciv-dev/conciv/pull/556) [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e) Thanks [@omridevk](https://github.com/omridevk)! - Fix a JS event listener leak in the browser RPC websocket's reconnect path: partysocket's `ReconnectingWebSocket` registers a dangling `error` listener on each discarded socket during its internal auto-reconnect loop and never removes it, so a persistently unreachable engine accumulated listeners without bound. The websocket now makes a single bounded connection attempt per cycle and reconnection is driven externally with capped exponential backoff, cutting the per-outage reconnect rate (and the leak with it) by more than an order of magnitude while preserving automatic recovery once the engine comes back.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).

- [#523](https://github.com/conciv-dev/conciv/pull/523) [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0) Thanks [@omridevk](https://github.com/omridevk)! - Export `ChatSendInput` so the rpc wire watcher asserts against the real `chat.send` schema instead of a looser copy.
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20

## 0.0.19

### Patch Changes

- [#349](https://github.com/conciv-dev/conciv/pull/349) [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323) Thanks [@omridevk](https://github.com/omridevk)! - Browser rpc rides one websocket per (tab, apiBase).

  `makeBrowserRpcClient`, `makeDeferredRpcClient`, `makeRebindableRpcClient` and the browser form of
  `makeExtRpcClient` now resolve a shared connection from a versioned `globalThis` registry instead of
  building a fetch link each. The connection picks its transport once, at boot, by dialling `/rpc-ws`
  with a bounded open timeout and sticking to fetch/SSE when that fails; `widget.transport` pins either
  transport explicitly. `makeRpcClient` stays on fetch for the CLI, testkit and node integration tests.

  This removes the six-connection starvation that broke the widget from the third tab onwards.

- [#349](https://github.com/conciv-dev/conciv/pull/349) [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323) Thanks [@omridevk](https://github.com/omridevk)! - Closing a browser rpc connection no longer raises an unhandled error.

  A disposed connection now answers writes itself instead of letting them reach a dead socket: peer
  control frames (cancellations and client event-iterator payloads) are dropped, so oRPC's abort path
  runs to completion and closes the call it was cancelling, while a request frame still fails fast so a
  caller holding a stale link learns the connection is gone instead of hanging. Dispose delivers a
  close event only when partysocket's own `close()` emits none — it already dispatches one
  synchronously unless the socket never dialled or is already closing — so the peer observes exactly
  one terminal event.

  Unmounting the widget now releases the tab's connection: the socket is closed and the registry entry
  dropped, instead of leaving partysocket and its reconnect timers alive for the rest of the tab's
  life. A later mount re-creates the connection through the same registry, running the full transport
  probe again.

  `handle.rebind` now drops the old connection before tearing its consumers down, and rebinding to the
  base the widget is already on re-runs the probe rather than being a no-op, so a tab that fell back to
  fetch/SSE while the engine was unreachable can ride the websocket again once it recovers.

  A live connection reports partysocket's real state: open while open, connecting while it will
  reconnect, closed once it will not, so oRPC fails a send fast instead of waiting on a socket that is
  never coming back.

- Updated dependencies []:
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- Updated dependencies []:
  - @conciv/protocol@0.0.8
