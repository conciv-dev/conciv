# @conciv/client

## 0.0.25

### Patch Changes

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.

- [#1210](https://github.com/conciv-dev/conciv/pull/1210) [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243) Thanks [@omridevk](https://github.com/omridevk)! - Every error conciv makes now comes from an evlog error catalog, with a stable code, a plain message and, where
  someone can act on it, a why and a fix. The core catalogs live in one new package, @conciv/errors, so packages
  compare codes without importing each other; each plugin keeps its own catalog, and the app provides @conciv/errors
  to plugins. Plugin.define accepts any Error, so a plugin fails its entry with its own catalog error; a plugin that
  fails to load reports its code, message and fix. Error screens, the run error row, toasts and plugin load errors show
  the fix when the error carries one, and the conciv-try CLI prints a failure as its code and message, then its why and
  fix only when they are set.

  Codes that reach agents and the widget change with it: an outside run without a tab answers `ai.NO_TAB` (was
  `NO_TAB`), a send to a deleted session fails with `session.DELETED` (was `session_deleted`), a code-mode tool error
  reaches the agent as `<code>: message` with its full catalog code, and the widget shows the engine's fix for an rpc
  error. The protocol's `ValueTooLargeError` is gone: an oversized instruction entry fails with
  `instructions.VALUE_TOO_LARGE`.

- [#1214](https://github.com/conciv-dev/conciv/pull/1214) [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a) Thanks [@omridevk](https://github.com/omridevk)! - Works on Node 22 and later (22.16 or newer, the first 22.x with the `node:sqlite` APIs the engine uses). Node code builds for node22, and `Promise.try` and `URL.parse`, which Node 22 lacks or added late, are not used.

- [#1219](https://github.com/conciv-dev/conciv/pull/1219) [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23) Thanks [@omridevk](https://github.com/omridevk)! - A plugin can declare an integration and read its secret without the secret ever reaching the browser. Inside its `effect` (or `setup` on the promise entry) a plugin registers integrations and their sign-in methods (`oauth`, `command`, `key`, `external`, `env`) with `ctx.integration.transform`, and reads the active connection's value with `ctx.integration.connection.active` and `ctx.integration.connection.resolve`; an expiring oauth token refreshes once however many callers ask, and `ctx.credential.activate` picks which stored credential an integration uses. Credentials are stored per user in the home database (`home.db`), so every project the user opens sees them and none lands in a project folder. Every secret (a key, an oauth access and refresh token) is an Effect `Redacted` in the engine and the plugin API, so logs, tool output, events and rpc answers show `<redacted>`; only the credential table holds the plain value. The engine's rpc gains `credential.*` (list, create, update, activate, remove) and `integration.*` (list, get, connect a key or an external credential, the oauth and command sign-in attempts).

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.
- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`8b8bc6f`](https://github.com/conciv-dev/conciv/commit/8b8bc6fd56da74578a3e8316e1c922d5cbf8cc6e), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/errors@0.0.25
  - @conciv/protocol@0.0.25
  - @conciv/types@0.0.25

## 0.0.24

### Patch Changes

- [#1198](https://github.com/conciv-dev/conciv/pull/1198) [`9c7cf6e`](https://github.com/conciv-dev/conciv/commit/9c7cf6ed99e51b5945d98d953df2d3d098d08172) Thanks [@omridevk](https://github.com/omridevk)! - The engine, the widget and the CLI now speak oRPC 2 (2.0.0-beta.53). The oRPC 2 wire format differs from oRPC 1, so all three must run the same release: an older widget bundle cached in a host page, or an older globally installed CLI, cannot talk to a newer engine until it is upgraded.

  The rpc procedures `registry.call` and `plugin.call` are now `registry.invoke` and `plugin.invoke`: an oRPC 2 client treats a property named `call` as `Function.prototype.call`, so a procedure of that name cannot be reached. The `conciv plugin call` command and a plugin's `ctx.client.rpc.call` keep their names.

  Every rpc error now answers with the HTTP status of its meaning (400 for a bad call, 404 for something missing, 409 for a conflict, 503 for something unavailable) and its data may carry `why` and `fix` (both optional; a slow-consumer refusal and a masked internal error carry neither). When a rejection carries `fix`, the CLI prints it as its hint. Every rpc error shares one data schema, `ErrorDetailSchema`, with optional `why` and `fix`; the plugin rpc errors extend it with the plugin's own `{type, message, data}`.

- Updated dependencies []:
  - @conciv/protocol@0.0.24
  - @conciv/types@0.0.24

## 0.0.23

### Patch Changes

- [`46e1e13`](https://github.com/conciv-dev/conciv/commit/46e1e138c743996af716154bc3d7d4b4e7856801) Thanks [@omridevk](https://github.com/omridevk)! - A chat connection takes runReconnect attempts and delays for a dropped run, defaulting to the 5 attempts from 250 ms to 5 s it used before.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - An error thrown while the panel renders shows its own message instead of "conciv couldn't reach the engine", and its Retry no longer resets the engine connection. Only a failure of the engine connection itself counts as an unreachable engine: `@conciv/protocol` marks those failures with `engineUnreachable` and tells them apart with `isEngineUnreachable`, and `isReachabilityError` checks only that mark, so a draft save is no longer retried for an error that is not a connection failure.

- [#1106](https://github.com/conciv-dev/conciv/pull/1106) [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23) Thanks [@omridevk](https://github.com/omridevk)! - A chat turn rides the browser rpc socket. `chat.send({sessionId, messages, runId})` starts the run once and streams it, and `chat.join({runId, lastEventId?})` streams a run from an event id; every event carries its offset in the run's log as its id, so a resubscribe after a drop never repeats one, and a resend of a known run id streams it instead of running it again. The `/chat-ws` socket, the `/chat-sse` stream, their path constants, the transport probe and the widget's `transport` setting are gone. `chatConnection` drops its transport options, and `@conciv/ai/client` exports `rpcStream` in place of `fetchServerSentEvents` and `webSocket`. A chat run that loses its stream retries on the rpc socket up to five times in a row with no event in between (250 ms doubling to 5 s), an event restarts that count, and once it is spent the turn fails with TanStack AI's `StreamReconnectLimitError`, as the old chat socket did; an error the engine answers is not retried.

- [#1191](https://github.com/conciv-dev/conciv/pull/1191) [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e) Thanks [@omridevk](https://github.com/omridevk)! - The plugin client (`Conciv`, `ConcivClient`, plugin rpc, `ServerRef`, `Servers`, `PluginInfo`) moves from `@conciv/backend-plugin-api` to `@conciv/client`, so browser code imports no backend package. `@conciv/backend-plugin-api/rpc` is gone: a plugin's shared `rpc.ts` imports `@conciv/protocol/schema/rpc`.

- [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c) Thanks [@omridevk](https://github.com/omridevk)! - Every holder of an engine connection takes the engine timings, so a widget with engine timings set keeps one socket per api base, and the embed init forwards timings to the app.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#818](https://github.com/conciv-dev/conciv/pull/818) [`90f01d8`](https://github.com/conciv-dev/conciv/commit/90f01d88e6e00e60eff4caf5c430414965fdd219) Thanks [@omridevk](https://github.com/omridevk)! - The widget and every extension now share one TanStack Query copy, bundled inside `@conciv/client` and patched for TanStack/query#11230, so a background refetch no longer steals focus from the model search or the composer in host apps. The terminal's model picker reads the same cached model list as the composer.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - An outside agent's tool call no longer goes missing from a panel that connects while the call runs or just after it, when no turn is running: the engine listens before it answers the panel's event subscription, saves each part of the call to the chat before it sends it out (as one message, the same id live and after a reload), and the panel reloads its history once its event stream is live.

- [#1078](https://github.com/conciv-dev/conciv/pull/1078) [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1) Thanks [@omridevk](https://github.com/omridevk)! - The widget's page queries and session events ride the one `/rpc-ws` socket: `page.queries({focus})` opens with a `ready` that names the browser tab, `page.focus` keeps the tab focused last as the target of page queries, and the separate `/push-ws` socket is gone.

- [`19ad474`](https://github.com/conciv-dev/conciv/commit/19ad474b8cd93a548e881ee2cebcf018bdc25d4f) Thanks [@omridevk](https://github.com/omridevk)! - The page plugin is one package, `@conciv/plugin-page`: `@conciv/page` (the DOM helpers) is merged into it as
  `@conciv/plugin-page/client`, and the window part the built-ins ran is `@conciv/plugin-page/renderer`. `@conciv/page` is no longer published.

- [#861](https://github.com/conciv-dev/conciv/pull/861) [`911a685`](https://github.com/conciv-dev/conciv/commit/911a68571dc434e793541a707a9d81bad670c93e) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's permission card offers "Always allow", which saves the answer for the project; cards for built-in tools keep "Allow for session". A permission card now leaves every open chat once anyone answers it, and a card whose request is already gone leaves when clicked instead of staying on screen. A denied card shows "Denied" in red with a blocked mark, the same tone the chat uses for a failed tool call.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Plugin permission cards now behave reliably at the edges:

  - Stopping a run also ends any permission card a plugin tool raised inside `execute_typescript`. Approving that card afterwards runs nothing and clears the card.
  - Closing the engine clears pending permission cards from storage before the database closes, so no card is left behind for the next start.
  - Answering a card that another window already answered, or a card left over after a stopped run, now just removes the card. The widget no longer shows "That permission request is no longer waiting for an answer."
  - A card that arrives or is answered while the chat is reloading its history no longer disappears or comes back.
  - A session whose saved permission rules cannot be read keeps its built-in tools but is offered no plugin tools. It still opens and lists normally, and the engine log names the session.

- [#834](https://github.com/conciv-dev/conciv/pull/834) [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer polls. `meta.hubAgents` is an event iterator the engine pushes whenever the conciv home db changes on disk, so an agent connected or disconnected from the CLI shows up at once. The engine staleness read refreshes on reconnect and refocus instead of a timer, and reachability comes only from the engine socket (`engineProbeRefetchInterval` and `voteEngineProbeSettled` are gone). The recorder panel follows a `replay` stream until the recording can be replayed and a pushed `events` stream for the live tail, replacing its 1 s polls.

- [#874](https://github.com/conciv-dev/conciv/pull/874) [`f51b933`](https://github.com/conciv-dev/conciv/commit/f51b9336acd9c9d4f45accc5c649d4e1eebc7835) Thanks [@omridevk](https://github.com/omridevk)! - A widget mounted after another one whose engine could not be reached no longer shows "conciv lost connection" against a healthy engine.

- [`6c5ba9c`](https://github.com/conciv-dev/conciv/commit/6c5ba9c509f41103c93eeeb8f9db1144c96d5c85) Thanks [@omridevk](https://github.com/omridevk)! - A query that a rebind cancels is no longer logged as a failure: the saved-draft read and the @ list skip TanStack Query's cancel.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.

- [#958](https://github.com/conciv-dev/conciv/pull/958) [`92026f6`](https://github.com/conciv-dev/conciv/commit/92026f613d22741b24b08e55a4376d795f988994) Thanks [@omridevk](https://github.com/omridevk)! - A slow dev server is no longer shown as a lost one. The widget now waits up to 30 seconds for the engine to accept its connection, instead of 2, so "conciv lost connection to the engine." only shows when the connection really fails, and an engine that is slow to connect still gets its live updates.

- [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6) Thanks [@omridevk](https://github.com/omridevk)! - The offline grace is an engine connection timing: `offlineGraceMs` in `EngineConnectionTimings`, default 1000, read by the app's reachability; the kit mount shortens it.

- [#1174](https://github.com/conciv-dev/conciv/pull/1174) [`6819ea1`](https://github.com/conciv-dev/conciv/commit/6819ea19a385c85aca783f6318dde282b8e3c031) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/client`: the panel fetches its history once, after its chat events stream is live, so nothing that happens while it opens is missed, and after the stream drops and comes back the panel fetches its history again and shows what happened meanwhile. A chat events stream that fails or ends reconnects with the same back-off as a run reconnect, as opencode's client does, and fails the panel's connection only when those attempts run out.

  `@conciv/ai`: when a run ends while a tool card in the panel still shows running, the panel fetches its history once and the card shows how the call ended.

  `@conciv/ai`: the server saves the reply it is streaming whenever a part starts or ends (a text, a tool call and its result, a reasoning block), as opencode does, so a panel that opens or refreshes mid-reply finds the reply so far under the same message id, and the panel now refreshes while a reply streams too.

- Updated dependencies [[`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b), [`9d9a594`](https://github.com/conciv-dev/conciv/commit/9d9a59474837ae21a337599aeebd7f9e8486a61b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`eef6c59`](https://github.com/conciv-dev/conciv/commit/eef6c59029f654011fedfdc691021d0cc6502e20), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`69c4117`](https://github.com/conciv-dev/conciv/commit/69c4117dff5620c1f9588902f41204a51f03fffb), [`f653740`](https://github.com/conciv-dev/conciv/commit/f653740c66d2679792e6cea44e091013e3cea813), [`a0f5c5e`](https://github.com/conciv-dev/conciv/commit/a0f5c5e24e29d085ad972de89a6cc2eda894cf00), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`e503d38`](https://github.com/conciv-dev/conciv/commit/e503d381e9567fa739fed2b5ff84daadeeb646b3), [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`144a4c5`](https://github.com/conciv-dev/conciv/commit/144a4c53163a9aa1cea68f700bf055b2fe5029b8), [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`47ac866`](https://github.com/conciv-dev/conciv/commit/47ac866d2795a8e9c24af42d3be7a408b880db99), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`2c69bca`](https://github.com/conciv-dev/conciv/commit/2c69bca8cb40a8c71c13ee780abb9ca31900b328), [`92026f6`](https://github.com/conciv-dev/conciv/commit/92026f613d22741b24b08e55a4376d795f988994), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`b0cd4e4`](https://github.com/conciv-dev/conciv/commit/b0cd4e40d59112f024787685f1b0f0c1c74d9524), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877), [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4)]:
  - @conciv/protocol@0.0.23
  - @conciv/types@0.0.23

## 0.0.22

### Patch Changes

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#731](https://github.com/conciv-dev/conciv/pull/731) [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c) Thanks [@omridevk](https://github.com/omridevk)! - A page query loop that stops early, by returning or breaking out of its iterator, now tells the server the socket no longer serves page queries, so a chat stream that keeps the socket open does not leave page tools waiting for a reply that never comes.

- [#751](https://github.com/conciv-dev/conciv/pull/751) [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c) Thanks [@omridevk](https://github.com/omridevk)! - A stopped run stays stopped. A run stopped while it is still setting up is no longer announced as started, a client no longer joins a run it already saw end (one it just stopped), and a client that joined or replays a stopped run now sees it end as aborted instead of showing it as running with a Stop button that never goes away.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae), [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14), [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501), [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c), [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/ai@0.0.22
  - @conciv/protocol@0.0.22
  - @conciv/contract@0.0.22

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

- [#662](https://github.com/conciv-dev/conciv/pull/662) [`6bf7fd7`](https://github.com/conciv-dev/conciv/commit/6bf7fd764de4d02b9af80ad10760e733b333c478) Thanks [@omridevk](https://github.com/omridevk)! - Fold the client tests into one node test file and drop the client-solid vitest project.
- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a)]:
  - @conciv/ai@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/contract@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Retire the `Activity.Now` narration surface: the pin above the composer is rendered from `NowLine`
  fed by the thread grouping store, so the parallel activity-store copy is gone. `useChatSession` now
  exposes a non-suspending `sessionRunning` signal derived from run lifecycle events, so a pane that
  joins a turn another client started narrates it too.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

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

- [#544](https://github.com/conciv-dev/conciv/pull/544) [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6) Thanks [@omridevk](https://github.com/omridevk)! - Fix [#532](https://github.com/conciv-dev/conciv/issues/532): an idle widget on the fetch transport now notices the engine refusing new connections. `engineProbeRefetchInterval` takes a `heartbeat` condition alongside `reachable`; while reachable and the heartbeat condition holds (fetch transport, panel open) the existing engine-meta query polls every 30s instead of going silent, so a refused connection surfaces the standing offline notice without requiring the user to attempt an action first.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Draw the permission card for an approval that has no chat turn behind it. A gated MCP, registry or
  page call asked over the push socket and nothing rendered, because the pane built approval cards only
  from a transcript tool call. Pending approvals now reach the pane as records, from
  `chat.hydrate` on open and from the push socket while it is attached, and the pane renders the same
  `Permission request` card from them. The card leaves when the ask settles: the gate publishes an
  `approval-settled` chunk when a decision, a timeout, or a session stop resolves the ask.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - "Refresh the conversation" is now a real operation instead of a silent stream abort. `chatConnection.refresh()` returns a promise that settles only once the reopened subscription has delivered its first chunk, so callers can await a reconnect rather than fire and forget. A pane-level refresh coordinator (`makeRefreshCoordinator`) awaits that reconnect alongside explicit refetches of the session-scoped queries — the session list that feeds usage and cost, the session markers, and the tool captures — and exposes an `isRefreshing` accessor derived from a single phase signal.

  Both entry points go through the coordinator. The panel's session menu row is now a `Popover.CloseTrigger`, so the menu dismisses on click, and the menu trigger swaps its ellipsis for a spinning refresh glyph (reduced-motion honored through the existing `anim-tool-spin` shortcut) with its accessible name changing to "Refreshing the conversation". The pop-out and quick-terminal toolbar buttons spin and disable the same way. The transcript stays on screen throughout — the refresh never re-arms the loading skeleton — and start, success, and failure are announced in the live region.

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

- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/protocol@0.0.20
  - @conciv/contract@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323)]:
  - @conciv/contract@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
  - @conciv/contract@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/contract@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- [#94](https://github.com/conciv-dev/conciv/pull/94) [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41) Thanks [@omridevk](https://github.com/omridevk)! - Replace the custom busy-send queue with TanStack AI's native FIFO queue, queued-message controls, and interrupt steering.

- Updated dependencies []:
  - @conciv/contract@0.0.14
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/contract@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
