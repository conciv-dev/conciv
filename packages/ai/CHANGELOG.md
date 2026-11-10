# @conciv/ai

## 0.0.22

### Patch Changes

- [#741](https://github.com/conciv-dev/conciv/pull/741) [`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679) Thanks [@omridevk](https://github.com/omridevk)! - The server retries a model call when the provider asks to wait before any output. A context overflow now says the conversation is too long for the model and offers to compact it, and a denied or cancelled tool reads as denied or cancelled instead of failed.

- [#734](https://github.com/conciv-dev/conciv/pull/734) [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/ai/testkit` re-exports `fakeText` from `@tanstack/ai/testing`; tests script a fake model with it instead of hand-written chunk streams.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - A streamed chunk wakes only the turn and part it changed: turns and each turn's parts are keyed lists, result lookups wake only the row whose result arrives, pane-level readers (dividers, stopped line, harness label, narration, permission asks, older-messages, load failure) stop scanning every message, and tool durations live in one pane-level record that folds only the live turn per chunk, so a row reads its call's duration (`ToolViewCtx.durationFor(toolCallId)`) and wakes only when that entry changes.

- [#740](https://github.com/conciv-dev/conciv/pull/740) [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68) Thanks [@omridevk](https://github.com/omridevk)! - A chat whose history fails to load now says "Couldn’t load this conversation" with a Retry button instead of a loading skeleton that never ends; the empty-chat welcome stays hidden, Retry shows as busy while it reloads, and a Retry that fails again is announced. The loading state comes from TanStack AI's `isHydrating`.

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#766](https://github.com/conciv-dev/conciv/pull/766) [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae) Thanks [@omridevk](https://github.com/omridevk)! - The chat server refuses an incoming chat message without an id, on the HTTP and WebSocket chat endpoints and on a server-driven turn, instead of storing it twice.

- [#688](https://github.com/conciv-dev/conciv/pull/688) [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a) Thanks [@omridevk](https://github.com/omridevk)! - Code Mode keeps `@tanstack/ai-isolate-node` (native `isolated-vm`) as an optional dependency and uses it first when it loads. When it is missing, for example because pnpm did not approve the `isolated-vm` build, the QuickJS fallback now runs in a worker thread, so a busy program such as `while (true) {}` can no longer freeze the server. Stopping a turn also stops the program it is running.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - The "Context compacted" line stays under the reply it follows once the compaction output arrives, live and after reopening: the server marks compaction output in the message metadata and the chat starts a new turn there.

- [#731](https://github.com/conciv-dev/conciv/pull/731) [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c) Thanks [@omridevk](https://github.com/omridevk)! - Ending a thread's runs, including at engine shutdown, now stops a run that is waiting on a tool call or a code mode program instead of waiting for the tool to return. A new message that ends the running turn still lets that turn finish cleanly for its viewer.

- [#725](https://github.com/conciv-dev/conciv/pull/725) [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04) Thanks [@omridevk](https://github.com/omridevk)! - Stopping the engine closes the listener first, then ends every live chat run as aborted, and only then closes the database, so a run or request during shutdown no longer hits a closed database.

- [#748](https://github.com/conciv-dev/conciv/pull/748) [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7) Thanks [@omridevk](https://github.com/omridevk)! - A chat whose history load failed no longer joins a run pushed to it. It used to fetch the transcript into the failed chat but keep the load error, so the pane showed the server error with a Retry that sent the prompt again and stopped the run in flight. The failed load and its Retry now stay until Retry reopens the chat, which joins that run.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - One model menu for every installed harness: the composer prompt's model menu lists each harness's models, named with their harness ("Opus 5.5 (Claude)", "GPT-6.1-Sol (Codex)"), and picking another harness's model switches the chat to that harness on that model (with the same history confirm). The separate harness rows in the composer overflow are gone. `meta.harnesses` now returns every harness's model list in one answer, and `sessions.switchHarness` takes an optional `model`.

  OpenCode's model list now comes live from `opencode models --verbose` and its rows read like model names ("Claude Sonnet 4.5") instead of raw ids; `@conciv/ai/server` no longer exports `opencodeModels`.

  The model menu is searchable: typing in its search field filters every model of every harness by model name, id or harness name (older versions and long lists included), arrows and Enter pick, Escape clears the search and then closes. The effort row leads with Default, checked while the model runs on its own default effort and picked to go back to it. With an empty search each harness shows its main models and says how many more a search reaches. OpenCode lists one row per model (its region routes such as `us.`/`eu.`/`global.` collapse to one) (every model in its catalog, including providers without credentials); a harness with nothing usable says so, and an empty live model list now replaces the saved one instead of being treated as a failure.

- [#755](https://github.com/conciv-dev/conciv/pull/755) [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a) Thanks [@omridevk](https://github.com/omridevk)! - The message queue now sits directly above the composer instead of under the pane header, and each queued row shows its Steer and Remove buttons at all times, with a visible keyboard focus ring. Stop no longer sends the queued messages as a new turn: it stops the run and puts them back in the composer, in order, unsent. `ChatSession.interruptAndFlush` is removed. While a stop is in flight the composer blocks every send (Enter, the Send button), so the returned draft cannot be re-queued and lost.

- [#729](https://github.com/conciv-dev/conciv/pull/729) [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14) Thanks [@omridevk](https://github.com/omridevk)! - A harness CLI that takes more than 10 seconds to print its first line (a cold start, a slow machine) now reports its real result instead of failing with "cannot attach to run". The journal's first-byte wait follows the chat server's first-output budget, so a CLI that stays silent past that budget fails with "the agent produced no output within" instead.

- [#762](https://github.com/conciv-dev/conciv/pull/762) [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501) Thanks [@omridevk](https://github.com/omridevk)! - Stop always ends a run, even when the harness adapter misses an abort that already happened; the run still ends aborted with its partial answer kept as stopped.

- [#751](https://github.com/conciv-dev/conciv/pull/751) [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c) Thanks [@omridevk](https://github.com/omridevk)! - A stopped run stays stopped. A run stopped while it is still setting up is no longer announced as started, a client no longer joins a run it already saw end (one it just stopped), and a client that joined or replays a stopped run now sees it end as aborted instead of showing it as running with a Stop button that never goes away.

- [#736](https://github.com/conciv-dev/conciv/pull/736) [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family to @tanstack/ai 1.2.0 (ai-client 1.1.0, ai-sandbox 1.2.0, ai-code-mode 1.1.0, isolates 1.1.0, CLI adapters 1.0.1, ai-solid 1.0.1). Session cost now also reads `usage.cost`, a stopped code mode program gets the run signal, and the context badge no longer counts cached tokens twice.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`82fcd6a`](https://github.com/conciv-dev/conciv/commit/82fcd6a504661ad43f22d3b6a1d4b447e10e3805), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`61a66bf`](https://github.com/conciv-dev/conciv/commit/61a66bfb44ebb179ddda4139443587bdda863bb3), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/db@0.0.22

## 0.0.21

### Patch Changes

- [#670](https://github.com/conciv-dev/conciv/pull/670) [`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd) Thanks [@omridevk](https://github.com/omridevk)! - A run ended by a newer run before it reaches the model no longer starts its CLI.

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

- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c)]:
  - @conciv/protocol@0.0.21
