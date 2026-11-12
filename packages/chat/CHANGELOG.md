# @conciv/chat

## 0.0.23

### Patch Changes

- [#819](https://github.com/conciv-dev/conciv/pull/819) [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb) Thanks [@omridevk](https://github.com/omridevk)! - Drop the last local patches on the TanStack AI packages. conciv now keeps tool-call metadata, failed results and a stable message id in its own middleware, carries its own call ids on code-mode child calls, validates code-mode tool input and output itself, reads the Claude Code context window from `modelUsage`, and lets the local sandbox forget finished runs. The session's effort now reaches the harness as `HarnessChatDeps.effort`: the Claude harness runs the CLI with `CLAUDE_CODE_EFFORT_LEVEL`, so Claude 5 models get the picked effort too, and codex reads it for `model_reasoning_effort`.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/protocol/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#849](https://github.com/conciv-dev/conciv/pull/849) [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9) Thanks [@omridevk](https://github.com/omridevk)! - An agent CLI that takes more than 10 seconds to print its first line (a cold start, a loaded machine) now finishes its turn instead of failing with "cannot attach to run ... delivered no bytes within 10000ms". The chat server no longer writes a run journal: the agent's output is read straight from its process, so the 30 second first-output limit ("the agent produced no output within 30s") is the only one. When that limit fails a turn, or the server is killed mid-run, the agent no longer keeps running in the background.

  `createChatServer` takes `sandbox: {dir}` (no `journalDir`), and `createChatPlane` no longer takes `stateRoot`.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.

- [#808](https://github.com/conciv-dev/conciv/pull/808) [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63) Thanks [@omridevk](https://github.com/omridevk)! - A push socket that opens or reconnects while a run is going now hears about that run, so the launcher turns busy for a run started from outside the widget before its push socket was admitted.

- [#850](https://github.com/conciv-dev/conciv/pull/850) [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5) Thanks [@omridevk](https://github.com/omridevk)! - A page queue follow-up turn now counts as delivered only when its run finishes. A follow-up run that ends in RUN_ERROR, such as a harness launch failure, is retried with a short backoff, three attempts in all. A follow-up declined because a run is already driving is not retried, and neither is a follow-up run the user stops. When every attempt fails, or the user stops the run, the engine starts no further follow-up for those results on its own: they are handed over by the session's next conciv tool reply, or carried by the next follow-up turn another finished queue starts, whichever comes first. Exhausted retries are logged once with the queue ids and the last error.

- [#803](https://github.com/conciv-dev/conciv/pull/803) [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10) Thanks [@omridevk](https://github.com/omridevk)! - A session's lastActive and title now follow its conciv chat: every saved chat message (chat turns, hub tool calls, imported transcript messages) moves the session's updated time forward to that message's own time (an imported transcript keeps the time its messages were written, not when the session was opened), a failure to record it is logged and never loses the saved messages, and the first user message titles a session that has no title yet, so they stay right after the harness transcript is cleaned up. A one-time migration repairs existing rows from their stored messages.
- Updated dependencies [[`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`bb68486`](https://github.com/conciv-dev/conciv/commit/bb6848694249e7c684209231bfcb6e9566e20ba6), [`a3c7c5c`](https://github.com/conciv-dev/conciv/commit/a3c7c5c648574cc8bc882906b11fee7fc426e494), [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53)]:
  - @conciv/harness@0.0.23
  - @conciv/protocol@0.0.23
  - @conciv/ai@0.0.23
  - @conciv/extension@0.0.23
  - @conciv/contract@0.0.23
  - @conciv/db@0.0.23
  - @conciv/tools@0.0.23

## 0.0.22

### Patch Changes

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#725](https://github.com/conciv-dev/conciv/pull/725) [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04) Thanks [@omridevk](https://github.com/omridevk)! - Stopping the engine closes the listener first, then ends every live chat run as aborted, and only then closes the database, so a run or request during shutdown no longer hits a closed database.

- [#737](https://github.com/conciv-dev/conciv/pull/737) [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640) Thanks [@omridevk](https://github.com/omridevk)! - conciv now requires Node.js 26 or newer.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a), [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`82fcd6a`](https://github.com/conciv-dev/conciv/commit/82fcd6a504661ad43f22d3b6a1d4b447e10e3805), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`61a66bf`](https://github.com/conciv-dev/conciv/commit/61a66bfb44ebb179ddda4139443587bdda863bb3), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14), [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501), [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c), [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f)]:
  - @conciv/ai@0.0.22
  - @conciv/protocol@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/db@0.0.22
  - @conciv/harness@0.0.22
  - @conciv/extension@0.0.22
  - @conciv/tools@0.0.22

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

- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8)]:
  - @conciv/ai@0.0.21
  - @conciv/db@0.0.21
  - @conciv/harness@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/extension@0.0.21
  - @conciv/tools@0.0.21
