# @conciv/client

## 0.0.23

### Patch Changes

- [#818](https://github.com/conciv-dev/conciv/pull/818) [`90f01d8`](https://github.com/conciv-dev/conciv/commit/90f01d88e6e00e60eff4caf5c430414965fdd219) Thanks [@omridevk](https://github.com/omridevk)! - The widget and every extension now share one TanStack Query copy, bundled inside `@conciv/client` and patched for TanStack/query#11230, so a background refetch no longer steals focus from the model search or the composer in host apps. The terminal's model picker reads the same cached model list as the composer.

- [#834](https://github.com/conciv-dev/conciv/pull/834) [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer polls. `meta.hubAgents` is an event iterator the engine pushes whenever the conciv home db changes on disk, so an agent connected or disconnected from the CLI shows up at once. The engine staleness read refreshes on reconnect and refocus instead of a timer, and reachability comes only from the engine socket (`engineProbeRefetchInterval` and `voteEngineProbeSettled` are gone). The recorder panel follows a `replay` stream until the recording can be replayed and a pushed `events` stream for the live tail, replacing its 1 s polls.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.
- Updated dependencies [[`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`bb68486`](https://github.com/conciv-dev/conciv/commit/bb6848694249e7c684209231bfcb6e9566e20ba6), [`a3c7c5c`](https://github.com/conciv-dev/conciv/commit/a3c7c5c648574cc8bc882906b11fee7fc426e494), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53)]:
  - @conciv/protocol@0.0.23
  - @conciv/ai@0.0.23
  - @conciv/contract@0.0.23

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
