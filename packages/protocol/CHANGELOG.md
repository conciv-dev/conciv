# @conciv/protocol

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
