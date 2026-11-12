# @conciv/core

## 0.0.23

### Patch Changes

- [#839](https://github.com/conciv-dev/conciv/pull/839) [`fe94df4`](https://github.com/conciv-dev/conciv/commit/fe94df49d1089d57a4e08f19b731cc24f4a4f031) Thanks [@omridevk](https://github.com/omridevk)! - New `conciv auth link <page-url>` prints a one-time login link for the conciv dev server of the current project, for example `http://localhost:3001/#conciv_otp=123456`. Opening it logs that browser in without reading a code from the terminal, so a headless run (Playwright, `claude -p`) can log in on its own. The code comes from the new `auth.issueCode` procedure, which only the engine token may call.

  Outside agents that name the tab they act on (the `conciv` CLI with `--tab`, a `conciv mcp serve` call with a `tab`, and the Claude plugin bridge) no longer get a per-call Approve card for tools that ask: their own permission mode decides. A `conciv` CLI call with no `--tab` that finds its engine through the home db acts on the user's latest tab, so it keeps the Approve card. The agent inside the tab keeps its Approve cards, and the one-time Allow under `hubAccess: 'session'` or `'project'` is unchanged.

- [#821](https://github.com/conciv-dev/conciv/pull/821) [`85d4a85`](https://github.com/conciv-dev/conciv/commit/85d4a854b9bcdc7c46a0e40a8a7d3bd4b8a6840f) Thanks [@omridevk](https://github.com/omridevk)! - `conciv auth revoke` now locks a browser out of a running engine on its very next request: the engine checks the trusted browsers file on each request instead of a copy refreshed by file system events, and closes a revoked browser's open sockets within a quarter second.

- [#816](https://github.com/conciv-dev/conciv/pull/816) [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101) Thanks [@omridevk](https://github.com/omridevk)! - The widget bundles are now small classic-script loaders over shared, code-split ES chunks in `dist/widget/`, so mermaid, katex, shiki grammars, xterm and the chat highlight worker load only when used, and the IIFE source maps are gone (the embed `dist` drops from 152 MB to about 30 MB). Serve `dist/widget/` next to `conciv-widget.global.js`; the native page serves it automatically.

- [#838](https://github.com/conciv-dev/conciv/pull/838) [`8c60ea5`](https://github.com/conciv-dev/conciv/commit/8c60ea5a4fea93e5308068bee43bdd432cb933fd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now creates the rows for a configured session id and harness session id before start resolves, and a failure there rejects start with a message naming the id instead of only logging it.

- [#828](https://github.com/conciv-dev/conciv/pull/828) [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f) Thanks [@omridevk](https://github.com/omridevk)! - Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
  passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
  or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
  function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
  server extension object moved to each package's `/server` subpath. The TanStack inspector follows the same shape:
  replace the `conciv/extensions/tanstack.tsx` re-export with `extensions: [tanstack()]`. `register()` on Next.js now
  validates `CONCIV_OPTIONS` and fails with a clear error when it is not a valid conciv config.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/protocol/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#820](https://github.com/conciv-dev/conciv/pull/820) [`a519d5f`](https://github.com/conciv-dev/conciv/commit/a519d5fad8cc0f548c4dcd2a67c671d613dd1184) Thanks [@omridevk](https://github.com/omridevk)! - Hub and page bus errors surface with their cause: an unreadable home folder is named instead of reported as no dev server running, a failed push stream closes its socket so the widget reconnects, and registry call errors keep their cause.

- [#849](https://github.com/conciv-dev/conciv/pull/849) [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9) Thanks [@omridevk](https://github.com/omridevk)! - An agent CLI that takes more than 10 seconds to print its first line (a cold start, a loaded machine) now finishes its turn instead of failing with "cannot attach to run ... delivered no bytes within 10000ms". The chat server no longer writes a run journal: the agent's output is read straight from its process, so the 30 second first-output limit ("the agent produced no output within 30s") is the only one. When that limit fails a turn, or the server is killed mid-run, the agent no longer keeps running in the background.

  `createChatServer` takes `sandbox: {dir}` (no `journalDir`), and `createChatPlane` no longer takes `stateRoot`.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.

- [#826](https://github.com/conciv-dev/conciv/pull/826) [`ef9e8db`](https://github.com/conciv-dev/conciv/commit/ef9e8db736acd149745de30d6063d0e304793f93) Thanks [@omridevk](https://github.com/omridevk)! - A page call stops the moment its caller gives up: a cancelled outside-agent call, a stopped chat run, an aborted `registry.call`, or an `execute_typescript` program that ends with the call still running. The engine drops the waiting page query at once instead of waiting out its timeout, and never resends it after an abort.

- [#834](https://github.com/conciv-dev/conciv/pull/834) [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer polls. `meta.hubAgents` is an event iterator the engine pushes whenever the conciv home db changes on disk, so an agent connected or disconnected from the CLI shows up at once. The engine staleness read refreshes on reconnect and refocus instead of a timer, and reachability comes only from the engine socket (`engineProbeRefetchInterval` and `voteEngineProbeSettled` are gone). The recorder panel follows a `replay` stream until the recording can be replayed and a pushed `events` stream for the live tail, replacing its 1 s polls.

- [#808](https://github.com/conciv-dev/conciv/pull/808) [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63) Thanks [@omridevk](https://github.com/omridevk)! - A push socket that opens or reconnects while a run is going now hears about that run, so the launcher turns busy for a run started from outside the widget before its push socket was admitted.

- [#850](https://github.com/conciv-dev/conciv/pull/850) [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5) Thanks [@omridevk](https://github.com/omridevk)! - A page queue follow-up turn now counts as delivered only when its run finishes. A follow-up run that ends in RUN_ERROR, such as a harness launch failure, is retried with a short backoff, three attempts in all. A follow-up declined because a run is already driving is not retried, and neither is a follow-up run the user stops. When every attempt fails, or the user stops the run, the engine starts no further follow-up for those results on its own: they are handed over by the session's next conciv tool reply, or carried by the next follow-up turn another finished queue starts, whichever comes first. Exhausted retries are logged once with the queue ids and the last error.

- [#832](https://github.com/conciv-dev/conciv/pull/832) [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24) Thanks [@omridevk](https://github.com/omridevk)! - An extension now learns when conciv refuses an outside agent's call to one of its tools. Its `.server()` factory can return an oRPC `middleware` next to `context`, for example `onError((error, {path, context}, input) => ...)`, and conciv runs it around every tool the extension owns. When the user denies an outside agent access to the tab, or does not approve an `approval: 'ask'` tool, the refusal is thrown inside the tool's own procedure, so that middleware sees it with the tool name, the input and the session id.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.

- [#803](https://github.com/conciv-dev/conciv/pull/803) [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10) Thanks [@omridevk](https://github.com/omridevk)! - A session's lastActive and title now follow its conciv chat: every saved chat message (chat turns, hub tool calls, imported transcript messages) moves the session's updated time forward to that message's own time (an imported transcript keeps the time its messages were written, not when the session was opened), a failure to record it is logged and never loses the saved messages, and the first user message titles a session that has no title yet, so they stay right after the harness transcript is cleaned up. A one-time migration repairs existing rows from their stored messages.

- [#822](https://github.com/conciv-dev/conciv/pull/822) [`48d437c`](https://github.com/conciv-dev/conciv/commit/48d437c6e7f5b85b93d29d6765cd0385f441c332) Thanks [@omridevk](https://github.com/omridevk)! - Each settings file is now a Devframe shared state, read once when opened and written back on a debounce, exactly like Devframe. The engine no longer watches the global settings folder: a change made by another engine or by hand shows up after a restart.

- [#806](https://github.com/conciv-dev/conciv/pull/806) [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839) Thanks [@omridevk](https://github.com/omridevk)! - Build every package with TypeScript 7. Declarations now come from plain `tsc` per source file instead of a bundled d.ts, so published `.d.ts` files mirror the source layout; the exported names and their value/type kinds are unchanged.
- Updated dependencies [[`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101), [`8d57382`](https://github.com/conciv-dev/conciv/commit/8d57382a4365e2031bc484478b5b8950bd45cca9), [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`65fd8fe`](https://github.com/conciv-dev/conciv/commit/65fd8fe0b0f4d7431a82ccd51da0b6f3d5662eae), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9), [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`ba22a7d`](https://github.com/conciv-dev/conciv/commit/ba22a7dd30703632d5af0ac6ca854cc257cda70f), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63), [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5), [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3)]:
  - @conciv/harness@0.0.23
  - @conciv/protocol@0.0.23
  - @conciv/ui-kit-chat@0.0.23
  - @conciv/chat@0.0.23
  - @conciv/extension@0.0.23
  - @conciv/extension-page@0.0.23
  - @conciv/contract@0.0.23
  - @conciv/db@0.0.23
  - @conciv/harness-init@0.0.23
  - @conciv/serve@0.0.23
  - @conciv/tools@0.0.23
  - @conciv/solid-diffs@0.0.23

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
