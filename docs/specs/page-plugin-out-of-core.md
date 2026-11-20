# The page plugin out of core and the widget

Status: plan, not started. Branch read: `test/plugin-testkit-mounts` (HEAD 278eeae2d). No code written.

## The ruling

Maintainer ruling 2026-11-20: no core or widget code may touch the page plugin. As opencode: core only lists its
browser plugin, and the app imports nothing from it.

## What opencode does

- Core lists the plugin and nothing more. `packages/core/src/plugin/internal.ts:102` imports
  `@opencode/plugin-browser` and puts it in the `post` list (line 294). No other core file imports it (`git grep`:
  only `core/package.json`, two core tests and `internal.ts`).
- The engine plugin is written only against the SDK. `plugin-browser/src/index.ts` is `Plugin.define({id:
  'opencode.browser', effect})`; it builds its connection and calls `ctx.tool.transform` (tools in a `browser`
  namespace, `permission: 'browser'`, `codemode: true`) and `ctx.skill.transform`.
- The app imports the built-ins list from one place. `app/src/runtime/plugin/builtins.ts` imports `builtins` from
  `@opencode/gui-plugins/renderer`, which `compose`s every built-in (browser among them) with its window entry. That
  is the only place the app names a built-in.
- The window part contributes through SDK registries only: `ctx.add(Command)`, `MenuItem`, `Style`, `LinkHandler`,
  `BuiltinPanel`, and `ctx.provide(Browser, ...)` (`gui-plugins/src/browser/renderer.tsx`).
- Other code reaches the browser through a contract the SDK declares: `Browser` in `plugin/src/gui/browser.ts`
  (`attached`, `canOpen`, `open`, `openFile`), defined with `Contract.define` and read with `ctx.use(Browser)` by
  other plugins (file, sources). The provider is the plugin; the type lives in the SDK.
- Background work that finishes later reaches the session as a synthetic message: subagent completion calls
  `sessions.synthetic({sessionID, text, description, metadata: {source: 'subagent', ...}})`
  (`core/src/session/subagent-completion.ts:73`), which is admitted as input and wakes the session. The SDK exposes
  it to plugins as `ctx.session.synthetic` (`plugin/src/effect/session.ts`, `SessionDomain`). The timeline renders
  synthetic messages generically as notices, by `metadata.source` (`session-ui/src/timeline-next/rules.ts:213`).
- One small special case remains in opencode: session-ui keeps a translated label for the `browser` tool namespace
  (`session-ui/src/tools/tool-renderer.tsx:306`, `timeline-next/tools/error-card.tsx:27`,
  `context-group.tsx:671`). It is a string, not an import.

## Conciv SDK surfaces this plan uses

| Surface                                                                                        | Where                                                                                                       | Exists?                                            |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `Contract.define` / `ctx.provide` / `ctx.use`                                                  | `packages/plugin/src/experimental/core.ts`                                                                  | yes                                                |
| `Page` contract (`symbolicate`, `toast`, `capture`, `pick`)                                    | `packages/plugin/src/experimental/page.ts:33`                                                               | yes                                                |
| `ReactTree` contract, `PageOperation` registry                                                 | same file, 70 and 40                                                                                        | yes                                                |
| `GrabApi` contract                                                                             | `packages/plugin/src/experimental/grab.ts:56`                                                               | yes                                                |
| `ToolRegistry` (render per tool name)                                                          | `packages/plugin/src/experimental/registries.ts:583`                                                        | yes                                                |
| `Slot` (`page.overlay`)                                                                        | `registries.ts:538`, 381                                                                                    | yes                                                |
| attachment card contribution (a registry for `AttachmentCardSlot` by mime)                     | none                                                                                                        | NEW                                                |
| session group entry contribution (the "page session" fold)                                     | none                                                                                                        | NEW                                                |
| `ctx.rpc.register` + engine `plugin.call` (`rpcId`, `method`, `input`)                         | `packages/contract/src/contract.ts:573`                                                                     | yes                                                |
| session hook `experimental.idle`                                                               | `packages/plugin/src/effect/session.ts:76`, fired at `core/src/app.ts:529`                                  | yes                                                |
| `ctx.session.synthetic`                                                                        | typed `undefined` at `packages/plugin/src/effect/session.ts:104`, `plugin-host/src/core/plugin/host.ts:209` | in opencode's SDK shape, NOT implemented in conciv |
| `session.deleted` event on the bus                                                             | published by `core/src/sessions/session-actions.ts`                                                         | yes                                                |
| tool hook `execute.after` (mutable `result`)                                                   | `packages/plugin/src/effect/tool.ts:28`                                                                     | yes                                                |
| tool definition options for the terminal (`terminal`, `positional`, `category`, hidden fields) | none                                                                                                        | NEW                                                |
| tool view metadata (`icon`, `label`) on the tool definition                                    | none                                                                                                        | NEW (or read from `ToolRegistry`, see 3.3)         |

Implementing `session.synthetic` is the one large piece. It is not new API (the SDK already declares the member,
as opencode), but conciv has no engine behind it today.

## 1. Core (`packages/core`)

### 1.1 `app.ts:76` and `app.ts:571-587`: the listing

- For the user: the page plugin runs in every engine.
- Opencode: `internal.ts:102` + `post` list. Same thing.
- Destination: STAYS, as the listing. The wrapper that injects `pageReplyTimeoutMs` and `queuedActionTimeoutMs` into
  `options` should become plain plugin options from config (opencode passes options the same way for every plugin),
  so core names no page option. Needs a check that `makePluginRuntime` can take per-plugin options for a `post`
  entry; if it cannot, keeping the wrapper is the smallest change and still only a listing.

### 1.2 `page/page-plugin.ts` (`makePagePlugin`) and `page/page-queue.ts`: the follow-up driver and hub bookkeeping

plugins-a's map of this (chat-feed-moves.md, part 2, section 2) is the input; I rechecked it on this branch and the
line numbers hold except `publishFinished`, which is at `app.ts:728` (not 729). Their importer list is complete:
`app.ts:72-73` (uses 481, 542, 550, 591, 717, 722, 728-737, 739, 764-767, 791-798, 805), `api/rpc/mount.ts:22`
(deps 93-94), `runtime/plugin-sessions.ts:23`, `sessions/session-actions.ts:12` (80). Their proposed target
(`packages/plugins/page/src/engine/follow-up.ts` + `engine/page-calls.ts`, imported by core) is ruled out by this
ruling: core would still import the page plugin. What it does, piece by piece, and where each goes:

| Piece                                                                                                                                                           | For the user                                                                                | Opencode                                                                                                                               | Destination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `followFinished` + `publishFinished` + `pageQueueChunks` (`app.ts:728-743`): on `queue.finished`, draw a `page_queue_async` tool card in the chat and record it | the result of a queue that played in the background shows in the chat                       | background results arrive as a synthetic message, drawn as a notice                                                                    | INTO THE PLUGIN: on its own `queue.finished`, the plugin calls `ctx.session.synthetic({sessionId, text: queueNotice(result), metadata: {source: 'page-queue', queueId, toolCallId}})`. The card is the page plugin's renderer for that synthetic notice (see 3.4). `pageQueueEvent` (`protocol/chat-event-types.ts:158`) has no reader in src and goes.                                                                                                                                        |
| `startQueueFollowUp` + `followUpOwedQueues` (`app.ts:720-726`, `page-queue.ts:38`): start a turn carrying the notices when the session is idle, retried 3 times | the agent hears that its queued actions finished and goes on                                | `synthetic` admits the input and wakes the session; no plugin drives a turn                                                            | INTO THE ENGINE as the `synthetic` implementation (generic, every plugin): admit the text, start a turn if the session is idle, otherwise deliver it with the next turn. The retry and the tombstone check move with it. DELETED from core as page code.                                                                                                                                                                                                                                       |
| `owesFollowUp` before `experimental.idle` (`app.ts:521`, 549-553)                                                                                               | no idle hook runs while a follow-up turn is owed                                            | `experimental.idle` "does not run ... input admitted by the hook runs in the same execution"                                           | GENERIC: idle skips when the session has synthetic input waiting. No page call.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `holdForNextReply` on an aborted run (`app.ts:541-545`)                                                                                                         | a stopped run keeps the queue result for the next reply                                     | synthetic input survives an interrupt and waits for the next wake (`resume: false`)                                                    | GENERIC: part of `synthetic` (waiting input stays waiting after a stop). DELETED from core as page code.                                                                                                                                                                                                                                                                                                                                                                                       |
| `delivery.owed` / `settle` (`owed`, `nextReply`, `delivered`)                                                                                                   | each result is told to the agent exactly once                                               | the synthetic message is the record (its `id` makes a second admit a no-op); a background shell's result is read by id from `Job.wait` | DELETED (ruling 4.1 D): the chat gets the result once through `synthetic` (the queue id as the message `id`); an outside agent reads it through the page tool that waits by id (below). No owed/next-reply/delivered state is kept anywhere, so `queue.owed`, `queue.settle`, `queue.claim`, `queue.undelivered` and `queue.startedBy` leave the plugin's rpc too.                                                                                                                             |
| `hubCall` / `hubReplied` / `fromHub` / `undelivered` / `startedBy` (`app.ts:764-767`, `api/mcp.ts:204-207`, 291-310)                                            | a queue an outside agent started is answered in that agent's next reply, not as a chat turn | background shell: the call answers at once with a job id; the agent reads the result by id when it wants it                            | DELETED (ruling 4.1 D). Nothing tracks which calls were the hub's: `queue_async` answers the queue id and one line saying which page tool returns the result; that tool waits while the queue runs. Every queue also ends in one `synthetic` to its session, whoever started it.                                                                                                                                                                                                               |
| `queueWait` (`app.ts:798`, `router.ts:611-618`, contract `page.queue.wait`)                                                                                     | the hub waits for a queue result                                                            | `Job.wait` behind the shell tool                                                                                                       | INTO THE PLUGIN as a page TOOL (plugin code, not SDK API; it does not exist today: the plugin has the `queue` and `queue_async` operations and the rpc method `queue.wait` only). The queue runs in an Effect model in the plugin (`queue.ts` becomes a fiber per queue, the result in a `Deferred`); the tool awaits it with the caller's wait budget and answers progress when the budget runs out. The contract's `page.queue.wait` and the CLI's poll (`cli/src/hub.ts` queue polling) go. |
| `cancelSession` (`session-actions.ts:80`, `plugin-sessions.ts:30`)                                                                                              | deleting a session cancels its queued actions                                               | `jobs.cancelSession` is core's own job service, not a plugin                                                                           | INTO THE PLUGIN: it already drops the session's queues when it hears `session.deleted` (`connection.ts:598`). Core's awaited call only exists so a result landing between tombstone and `session.deleted` starts no turn; with `synthetic` refusing a deleted session (as the follow-up does today with `isDeletedRow`), that race is closed generically. DELETED from core.                                                                                                                   |
| `symbolicate` / `symbolicateOrNone` (`app.ts:717`, `core-runtime.ts:21`, `scope-types.ts:40`, `router.ts:620`, `app.ts:805` `openFromFrames`)                   | a grabbed element and a stack frame open at their source line                               | none in core                                                                                                                           | Widget side: the `Page` contract already has `symbolicate` (`experimental/page.ts:28`); the grab staging reads it there (see 2.6). Editor side: `editor.openFromFrames` becomes `editor.open(SourceLoc)` and the caller symbolicates first through `plugin.call('experimental.page', 'symbolicate')`. RULING NEEDED on renaming that contract method (it is a contract change, not new API). The `scope.symbolicate` member on the session scope goes.                                         |
| `tabs` / `attachedSessions` (`app.ts:791-792`, `router.ts:200`)                                                                                                 | see 1.4 and 1.5                                                                             |                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `changes` / `clearChanges` (`router.ts:621-626`, contract `page.changes`, `page.clearChanges`)                                                                  | the hub reads and clears the page changes the user made                                     | none                                                                                                                                   | INTO THE PLUGIN'S RPC through `plugin.call` (`changes`, `clearChanges` are already its methods). The contract's `page.*` group goes whole. The `hubTraced` trace around them needs a generic home on `plugin.call` (check whether `plugin.call` from the hub is traced today).                                                                                                                                                                                                                 |

So `packages/core/src/page/` is DELETED whole, and the contract loses its `page` group.

### 1.3 `runtime/plugin-signatures.ts:8` (`CliTools`, `Operations`, `PAGE_NAMESPACE`, `CLI_HIDDEN_FIELDS`, `isPageTool`)

- For the user: `registry.catalog` lists the page tools to the terminal and the hub with their positional argument,
  category, icon, label, "asks" flag, client binding and without `tabId`; tools marked not for the terminal are left
  out.
- Opencode: none (no terminal catalog). The tool definition carries all a tool says about itself
  (`options.namespace`, `permission`, `codemode`).
- Destination: ruled 2026-11-19, no SDK field: everything is derived for every plugin (section 4, item 3). The page
  branch and the page's catalog table are deleted.

### 1.4 `api/rpc/router.ts:38`, 195-207, 221 (`isPageTool` + `requireAttachedPage`)

- For the user: a page tool called while no tab of that session is attached fails at once with "no widget connected
  to session" or "the page is showing another session".
- Opencode: the browser tool itself fails when no pane is attached.
- Destination: INTO THE PLUGIN: its tool already fails with the `no-widget` page failure code when no tab is
  attached; move the two messages into that failure and delete the core pre-check.

### 1.5 `api/rpc/router.ts:4`, 152-191 (`PAGE_ERROR_NAME`, `PluginPageFailure`, from `@conciv/protocol/page-types`)

- For the user: a page failure answers the hub and terminal with a named error (`NO_PAGE_CLIENT`, ...).
- Opencode: none.
- Destination: GENERIC: a tool failure carries `metadata.code` drawn from the registry's own error names, and the
  router maps any plugin's code by name. Then `PAGE_ERROR_CODES`, `isPageFailure` and the code-to-name table leave
  core. The set of names stays in the contract (`registryCallErrors`). Not new API if the codes are the existing
  registry error names; RULING NEEDED only if a plugin may add names.

### 1.6 `api/tabs.ts:6` (`State` type) and `router.ts:596-597` (`tabs.list`, `tabs.get`)

- For the user: `conciv tabs` and the hub list the sessions with an open page, each with its browser tabs (focused
  first) and the project name and branch; the widget reads the same list (`host-apis.tsx:346`, 466, 584,
  `mounted-session.ts:90`) for the project name and branch.
- Opencode: `Browser.attached(session)` on the contract; no engine-wide tab listing.
- Destination: split. The project part (name, root, branch) is not page code: it STAYS in core under a name that
  does not say tabs (RULING NEEDED: a contract rename, `meta.project` or similar). The per-session page part moves
  INTO THE PLUGIN'S RPC: `sessions.attached` and `tabs.list` already exist; the CLI composes the listing through
  `plugin.call` plus `sessions.get`. `tabs.get` (`open`, `instructions`) splits the same way.

### 1.7 `api/mcp.ts:38`, 204-207, 228-232, 291-310 (finished and started queues in code-mode replies)

- For the user: an outside agent's `code.execute`, `discover` or direct call reply carries every queue result it was
  owed and the queues it started.
- Opencode: none. A background shell's call answers its job id, and the result is read by id; codemode results are
  the tool's own output.
- Destination: DELETED (ruling 4.1 D). `withFinishedQueues`, `deps.finishedQueues`, `deps.startedQueues`,
  `deps.hubCall`, `deps.hubReplied`, the `hubRequest` wrapper and the `queued`/`finished` fields of the code results
  (`contract.ts:220-235`) go. A script that called `queue_async` already holds the queue id in its own output (the
  tool's answer), and reads the result through the page tool that waits by id.

### 1.8 Other core reads of page names

- `protocol/page-types.ts` (`PAGE_QUEUE_ASYNC_TOOL`, `PageQueue*` schemas) and `contract/code-reply.ts:50`
  (`queueNotice`): shared packages, not core, but they exist only for the core page code above. Once 1.2 and 1.7
  land, they MOVE INTO THE PLUGIN (`plugins/page/src/rpc.ts`), and `contract.ts:220-235` (`queued`, `finished` on
  the code results) is deleted (ruling 4.1 D).
- `protocol/tool-call-types.ts:29`: an error message example (`write page_click`). Harmless text; change to a neutral
  name if the ruling counts strings.

## 2. Widget (`apps/conciv`) and embed

### 2.1 `pane/chat-pane.tsx:38`, 249-260 (`pageSessionEntry`, `PAGE_ACT_TOOL_NAMES`, `PAGE_TOOL_PREFIX`)

- For the user: a run of page tool calls folds into one "page session" card, with act calls shown inside it.
- Opencode: tool grouping (`context-group.tsx`) is session-ui's own, by tool namespace; the browser adds no group.
- Destination: GENERIC SDK SURFACE, NEW: a registry the plugin adds a group entry to (key, render, the tool names it
  folds, the prefix it owns), read by `ui-kit-chat`'s `page-session.ts` grouper for every plugin. `PageSessionConfig`
  in `ui-kit-chat/src/store/page-session.ts:19` becomes that generic shape. RULING NEEDED (new API), or the fold is
  dropped and page calls draw as plain tool cards (smaller, but a visible loss).

### 2.2 `pane/chat-pane.tsx:730` (`pageToolMeta(name) ?? tanstackToolMeta(name)`)

- For the user: a tool card shows the page tool's icon, label and summary before the catalog loads, and mutating
  marks.
- Opencode: the render owns its own title and icon (`BasicTool icon=... trigger=...`, as the `ToolRegistry` example
  in `registries.ts:575` shows).
- Destination: INTO THE PLUGIN: the page plugin already registers a `ToolRegistry` render per page tool
  (`plugins/page/src/renderer.tsx:96-107`); the icon and label move into that render. `mergeToolMeta` keeps only
  the catalog's signature. The same line names `@conciv/plugin-tanstack/client` (`tanstackToolMeta`), which is the
  same coupling to another plugin; it should take the same fix in the same change.

### 2.3 `pane/pane-attachments.ts:13`, 39-41 and `routes/panel.$sessionId.$view.tsx:10`, 24 (`pageAttachmentCards`)

- For the user: a grab in the composer and a staged grab draw as the grab card (by mime `GRAB_MIME`).
- Opencode: composer pills come from the `ComposerPill` registry; attachments have no plugin card.
- Destination: GENERIC SDK SURFACE: either the existing `ComposerPill` registry (`registries.ts:478`) if its shape
  can carry an attachment by mime, or a NEW attachment-card registry (`{mime, render}`). Check `ComposerPill`
  first; RULING NEEDED if new.

### 2.4 `pane/pane-grab.ts:2` (`grabApi`) and `composer/actions.tsx:9` path

- For the user: the composer's grab button picks an element on the page.
- Opencode: other code reads a plugin's offer through a contract.
- Destination: GENERIC, EXISTS: the `GrabApi` contract (`experimental/grab.ts:56`) and `GrabPicker` registry. The
  page plugin provides the picker; the pane reads the contract instead of importing `grabApi`. Note: `builtins.ts`
  has the widget provide `GrabApi` from `useHostApis().grab`; check which side owns pick versus staging before the
  change, so the contract is not provided twice.

### 2.5 `composer/actions.tsx:6`, 92 (`showToast`)

- For the user: "Couldn't grab that element" toast on the page.
- Opencode: other code reads the contract.
- Destination: GENERIC, EXISTS: `Page.toast` on the `Page` contract (`experimental/page.ts:29`), or the widget's own
  toast (the failure is the composer's, not the page's). Prefer the widget's own toast: it is the composer's error.

### 2.6 `pane/grab-staging.ts:12` (`fitImagePreview`) and `app/use-grab-staging.ts:10` (`rpc.page.symbolicate`)

- For the user: a staged grab's screenshot is shrunk to the thumbnail budget, and its source line is resolved.
- Opencode: none.
- Destination: INTO THE PLUGIN: the grab the page plugin hands over (through `GrabApi`/`Page.pick`) already comes
  from the plugin; fitting the preview and resolving the source belong in the plugin before it hands the grab
  over. `rpc.page.symbolicate` goes with 1.2.

### 2.7 `data/app-data.ts:15`, 66-68 (`PageDefinition.id`, `captures.list`) and its users `app/live-sessions.ts:103`, `pane/refresh-coordinator.ts:30`

- For the user: after a run ends, the page captures of that session refresh.
- Opencode: a plugin refreshes its own data on the session events it reads.
- Destination: INTO THE PLUGIN: its renderer already watches `run.status()` (`renderer.tsx:86-93`); it invalidates
  its own captures query there. The widget names no rpc id.

### 2.8 `runtime/plugin/builtins.ts:19` (`import('@conciv/plugin-page/renderer')`)

- Opencode: `app/src/runtime/plugin/builtins.ts` imports the built-ins list. Same thing.
- Destination: STAYS, as the listing. Optional, closer to opencode: a built-ins list module next to the plugins
  (as `@opencode/gui-plugins/renderer`) so the app imports one list; not needed by the ruling.

### 2.9 `packages/embed/src/mount-impl.tsx:3`, 145 (`installReactBridge`)

- For the user: React components behind page elements are found (grab source, react tree tools).
- Opencode: none.
- Destination: INTO THE PLUGIN: the page renderer calls it at activation (it already provides `ReactTree`). Risk to
  check before the move: `bippy`'s `instrument` must be in place before React commits the roots it needs; today it
  runs inside `mountImpl`, which is already after the host app loaded, and the plugin entry loads a little later
  (dynamic import). The react tree test must pass with the call moved, or it stays at mount through a generic
  "early setup" entry (NEW, RULING NEEDED).

### 2.10 Listings and bundling that stay

- `packages/embed/vite.config.ts:9-10` (`INLINED_PREFIXES`) and the embed `package.json` dependency: bundling the
  built-in into the published widget, as opencode's app bundles `@opencode/gui-plugins`. STAYS.
- `packages/publish/src/workspace-imports.ts:16` (`KIT_BUILT_INS`), `guards.ts:107`, `.fallowrc.json:465`: package
  lists. STAY.
- `apps/conciv/src/runtime/plugin/module.ts:21` (`@conciv/plugin/experimental/page`) and
  `shell/plugin-surfaces.tsx:213`, 226 (`page.overlay` slot): the SDK module and an SDK slot name, not the plugin.
  STAY.

## 3. Outside core and widget

### 3.1 `packages/cli/src/hub.ts:30`, 96-98, 613 (`PAGE_NAMESPACE`, the page tools note)

- For the user: the hub tells an outside agent that page tools appear only for an open tab.
- Destination: the note comes from the plugin: its skill text or the tool namespace description (as opencode's
  `editor.namespace({name: 'browser', description})`). The hub then reads tools by catalog category, not by prefix.
  If the CLI counts as core under the ruling, this is required; otherwise optional.

### 3.2 `packages/plugins/tanstack/src/tools.ts:9`, 35, 109, 188 (`PageDefinition`, `State`, `TabId`)

- Plugin to plugin: the tanstack engine plugin calls the page plugin's rpc. Not core or widget, so outside the
  ruling. As opencode, the cleaner shape is a contract the SDK declares (like `Browser`), but that would be new API;
  leave it.

### 3.3 Tool view metadata (`CliTools[...].view`, `rpc.ts:680`)

- Used today by the catalog (1.3) and the widget (2.2). With 2.2 the widget draws the icon and label in the
  plugin's own render, so the engine catalog does not need them unless the terminal shows icons. Decide with 1.3.

### 3.4 The queue result card

- Today: a mirrored `page_queue_async` tool call drawn by the page plugin's `ToolRegistry` render.
- After 1.2: a synthetic notice with `metadata.source: 'page-queue'`. It needs a render: either the generic notice
  row (as opencode) or a plugin render keyed by `metadata.source`. A registry for that is NEW; the generic notice is
  the as-opencode answer and needs no new API.

## 4. Rulings needed

1. DECIDED 2026-11-20: D, as opencode's background shell (`core/src/tool/plugin/shell.ts`, `core/src/job.ts`). C was
   checked and refused: an outside agent's calls map to a conciv session row (`app.ts:430` `mcpSessionId`,
   `ensureAgentRow`), so a `synthetic` message there starts a conciv turn and never reaches the outside agent's own
   process. D: the queueing page tool returns at once with the queue id and one line on how to get the result; the
   page plugin's own tool returns a queue's result by id and waits while it runs. The queue runs in Effect inside the
   plugin, in its own `.ts` model (a fiber per queue, the result in a `Deferred`, as opencode's `Job.wait`); on finish
   the plugin calls `ctx.session.synthetic` so conciv's own chat is woken. opencode's SDK gives plugins no job service,
   so none is added. Deleted from core: `withFinishedQueues`, `finishedQueues`, `startedQueues`, `hubCall`,
   `hubReplied`, and the `queued`/`finished` fields of the code results (`contract.ts:220-235`).
2. DECIDED 2026-11-20: implement `ctx.session.synthetic` in the engine, as opencode, first, with its own tests. It is
   the ONLY way anything outside a turn puts a message into a session or starts a turn: every other way that exists
   today (any plugin, core, the widget, the hub) is mapped in section 7 and moved onto `synthetic` or deleted in the
   same work. No second way survives.
3. ALREADY RULED 2026-11-19 (not open): every plugin tool is a conciv CLI command, with NO SDK field. The catalog
   derives everything for every plugin: positional = the single required string field, mutating = the tool asks
   approval, category = the plugin id. So 1.3 is: delete the page branch of `plugin-signatures.ts` and the page's
   `CliTools`, `TERMINAL_LEFT_OUT`, `CLI_HIDDEN_FIELDS`, `PAGE_NAMESPACE` import and `isPageTool`; page tools list
   through the same generic path as every other tool (`tabs.list` and `fill_form` are no longer left out). Icon and
   label are the widget's tool render (2.2). Open only as a check: what the `client` binding still does once the page
   branch goes (`registryBackedTool` in `app.ts` exposes `server` tools only), answered in section 7.
4. OPEN. Page session fold (2.1) and attachment cards (2.3): a plugin registry for each, or drop them. No maintainer
   ruling exists; an orchestrator plan of 2026-11-18 named a plugin registry for the fold, which is not a ruling.
5. Contract changes: delete `page.*`, split `tabs.*` (project part renamed), `editor.openFromFrames` to
   `editor.open(SourceLoc)` (1.2, 1.6).
6. Whether `packages/cli` counts as core under the ruling (3.1).

## 5. Order

1. `session.synthetic` in the engine, with its tests (wakes an idle session, waits through a stop, refuses a
   deleted session, delivered once).
2. Page plugin: follow-up and card through `synthetic`; hub path per ruling 4.1; delete `core/src/page/` and the
   core call sites in `app.ts`, `mount.ts`, `plugin-sessions.ts`, `session-actions.ts`, `api/mcp.ts`.
3. Contract: `page.*` out, `tabs.*` split, editor open; CLI moves to `plugin.call`.
4. Router: attach check and error codes generic (1.4, 1.5); catalog options (1.3).
5. Widget: 2.2 and 2.5 (small, no new API), 2.4, 2.6, 2.7, 2.9; then 2.1 and 2.3 per ruling 4.4.
6. `@conciv/plugin-page` leaves the `dependencies` of `packages/core`, `apps/conciv` (keep only through the
   built-ins listing, see 2.8) and `packages/cli`. A repo check that fails when `packages/core/src` or
   `apps/conciv/src` (outside `runtime/plugin/builtins.ts` and `app.ts`'s listing) imports `@conciv/plugin-page`
   keeps it that way.

## 6. Tests that follow

- From plugins-a, unchanged: core.test.ts `describe('page queue follow-up')` (1547-1984, 12 tests) and the
  core-api.it follow-up rows in `describe('page action queue delivery')` (6240, 6432, 6453, 6484, 6714). Under this
  plan they split: the "a finished background result wakes the session once" half becomes a `synthetic` test in
  core (generic, no page), and the page half (a queue result reaches the session) moves to the page plugin's suite
  on `@conciv/plugin-testkit/node`. plugins-a's note stands: plugin-page has no `@conciv/plugin-testkit`
  devDependency yet.
- The owed and reply rows (core-api.it 6020, 6134, 6171, 6211, 6297, 6324, 6375) are DELETED (ruling 4.1 D): they
  prove the owed/next-reply bookkeeping and the `queued`/`finished` reply fields, which go. Their user-facing promise
  is kept by new page plugin tests on `@conciv/plugin-testkit/node`: `queue_async` answers the queue id at once; the
  waiting tool returns the result by id (while running: progress when its budget ends; after: the result, as often
  as asked); a caller that aborts its wait leaves the queue running and its result readable; every finished queue
  sends one `synthetic` to its session (a second admit with the same id adds nothing); a deleted session gets none.
- New: the repo check in step 6.

## 7. Every other way a message reaches a session today

Read on `test/plugin-testkit-mounts`. Ruling 4.2: `ctx.session.synthetic` is the only way anything outside the
user's own turn puts a message into a session or starts a turn. Below is every way that exists today, with its
destination.

### 7.1 What `synthetic` is, in opencode

`core/src/session/synthetic.ts` (49 lines): checks the session exists, admits one inbox item
`{type: 'synthetic', delivery, payload: {text, description, metadata}}` under the caller's `id` (or a new one), and
wakes the session unless `resume: false` (or the session is being reverted). `delivery` is `steer` (default: joins
the running execution) or `queue` (waits for the next one). Callers: background shell finish
(`tool/plugin/shell.ts:178`, `metadata.source: 'shell'`, `id` = the job's notification id), subagent finish
(`session/subagent-completion.ts:73`, `source: 'subagent'`), image generation (`tool/plugin/image-generate.ts:211`),
moving work to the background (`session.ts:531`), the goal, plan and fork-notice plugins (`plugin/goal.ts:202`,
`plugin/plan.ts:67` with `resume: false`, `plugin/fork-notice.ts:20`), restart recovery
(`session/execution/restart.ts:168`, 407 with `resume: false`). The timeline draws each as a notice, placed by
`metadata.source` (`session-ui/src/timeline-next/rules.ts:213`). Nothing in opencode mirrors a fake tool call into a
session. Conciv's SDK already types the member (`packages/plugin/src/effect/session.ts:104`,
`promise/session.ts:161`, `SessionInboxDelivery = 'steer' | 'queue'` in `client/promise/generated/types.ts:92`);
the host sets it `undefined` (`plugin-host/src/core/plugin/host.ts:209`, `promise/adapter.ts:436`).

### 7.2 Sites that start a turn or put a message into a session

| Site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What the user sees                                                                                                                                                        | Opencode                                                                                                                    | Destination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page queue follow-up turn: `core/src/app.ts:720-726` `followUpOwedQueues`, `core/src/page/page-queue.ts:38-70` `startQueueFollowUp` (3 tries, back-off), `chat/src/index.ts:233-239` `followUp` and 153-164 `driveFollowUp` (`server.drive({kind: 'page-queue', input})`), `chat/src/turn.ts:210` (`askedMessages` appends `{role: 'user', content: input}`)                                                                                                                                                                                                                                                   | a model turn starts with no user action after a background queue ends; the queue notice is sent as a user message                                                         | `synthetic` (shell finish)                                                                                                  | ONTO SYNTHETIC: the page plugin calls `ctx.session.synthetic({sessionId, id: queueId, text: queueNotice(result), metadata: {source: 'page-queue', queueId}})`. `followUp`, `driveFollowUp`, `FollowUpOutcome`, the `'page-queue'` turn kind (`protocol/harness-types.ts:116`, `ai/src/server/delivery.ts:16`) and the `askedMessages` branch are DELETED; the engine's `synthetic` is the one path that admits and wakes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Page queue card: `core/src/app.ts:728-743` `publishFinished` + `followFinished`, `core/src/page/page-queue.ts:79-104` `pageQueueChunks` (custom `conciv.page-queue` event, a fake `page_queue_async` TOOL_CALL_START/ARGS/END/RESULT, wrapped in a fake RUN_STARTED/RUN_FINISHED `mirror-page-queue-<id>` when idle), recorded through `run.record`                                                                                                                                                                                                                                                            | a `page_queue_async` tool card appears in the chat when a queue ends                                                                                                      | the synthetic notice is the card                                                                                            | DELETED: the synthetic notice above is what the user sees (generic notice row, or the plugin's render for `source: 'page-queue'`, 3.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Hold on stop and idle skip: `core/src/app.ts:521`, 541-553 (`holdForNextReply`, `owesFollowUp`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | a stopped run keeps the result for later; no idle hook while a follow-up is owed                                                                                          | inbox items wait through an interrupt; idle does not run while input waits                                                  | DELETED as page code: both are properties of the generic `synthetic` (a waiting item survives a stop and is delivered with the next execution; `experimental.idle` skips while the inbox has a waiting item).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Hub and outside-agent mirrors: `core/src/api/call-trace.ts:26-99` (`callTrace` `start`/`result`/`mirror`, `mirrorRun`, `runStarted`/`runFinished` with run id `mirror-<callId>`, `marked` stamping `metadata.conciv = {origin: 'hub', client, run}`), its users `core/src/api/mcp.ts:150-195` (`CallPublisher`, `publishResult`, `runExecute`, `runDirect`), 254-277 (`openCodeSession`, child cards of code mode), `core/src/api/rpc/router.ts:247-272` (`hubTraced`: `registry.call` 483-488, `page_changes` 622, `page_clear_changes` 625); headers set in `cli/src/request.ts:76-77`, `cli/src/hub.ts:159` | each tool call an outside agent makes shows as a tool card marked as an outside call, inside a fake run when the session is idle, and is saved into the session's history | none: opencode has no hub and mirrors nothing; work done for a session that ends outside a turn reports through `synthetic` | ONTO SYNTHETIC: when an outside call ends, core calls `synthetic` once with `resume: false` (it must not wake the conciv agent), `delivery: 'queue'`, `id` = the call id, `text` = one line naming the client, the tool and its outcome, `metadata: {source: 'outside', client, tool}`. What changes for the user: one notice per outside call when it ends, instead of a live tool card while it runs; the conciv agent reads those lines in its next turn (they are model input, as every synthetic is). The child cards of an outside `code.execute` collapse into that one notice. `callTrace.mirror`, `mirrorRun`, `runStarted`, `runFinished`, `marked`, `CallPublisher`'s `publish`/`settle` mirror and the `record` of mirrored chunks are DELETED. Needs a maintainer check that the visible change (no live card) is wanted; the alternative under ruling 4.2 is DELETED with no trace at all. |
| `page_changes`, `page_clear_changes` hub traces (`router.ts:622`, 625)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | a mirrored card when the hub reads or clears page changes                                                                                                                 | none                                                                                                                        | DELETED with the contract's `page.*` group (1.2); the hub calls `plugin.call`, which ends as one outside notice like any outside call (row above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 7.3 Sites checked that stay (not a message into a session)

| Site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why it stays                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Widget sends: `apps/conciv/src/pane/use-pane-messaging.ts:132-138` (`onSend` to `chat.sendMessage`), starters `pane/chat-pane.tsx:88`, 101-107, 436 (`sendFromButton`), Retry `chat-pane.tsx:607-608` (`chat.reload()`), Refresh `ui-kit-chat/src/primitives/action-bar/action-bar.tsx:106`, Steer `ui-kit-chat/src/primitives/queue-item/queue-item.tsx:56-62`, preset prompts `ui-kit-chat/src/primitives/thread/thread.tsx:352`, `suggestion/suggestion.tsx:41`; RPC `chat.send` `core/src/api/rpc/router.ts:48-52` (`plane.send`) | each is the user's own click; it is the user's turn (opencode: `session.prompt` from the app)                                           |
| Put-back: `apps/conciv/src/app/live-sessions.ts:115` (`returnQueueToDraft`), 220 (`putBackInDraft`), `pane/pane-attachments.ts:93-114`                                                                                                                                                                                                                                                                                                                                                                                                | writes the composer draft only; nothing is sent                                                                                         |
| Plugin composer fills: test-runner "Fix" `packages/plugins/test-runner/src/plugin-experimental.tsx:293`, 332 (`composer.insert(fixPrompt(...))`); recorder `packages/plugins/recorder/src/panel-view.tsx:51` (`composer.attach` note); surfaces `packages/plugin/src/experimental/host-apis.ts:92-160` (`Composer.insert`, `setText`, `attach`), implemented at `apps/conciv/src/runtime/plugin/mounted-session.ts:113-125`; `layout.draft` `host-apis.ts:326` (no callers)                                                           | they fill the composer; the user presses Send, so the message is the user's turn                                                        |
| Compact: `chat/src/turn.ts:209` (`compactPrompt`), `chat/src/index.ts:184-206`                                                                                                                                                                                                                                                                                                                                                                                                                                                        | the user's Compact click; opencode compacts through `session.compact`, not `synthetic`                                                  |
| Hooks inside the user's turn: `prompt` (`chat/src/turn.ts:203` `promptedMessage`), `context` (`packages/plugins/ios/src/tools.ts:246`)                                                                                                                                                                                                                                                                                                                                                                                                | they rewrite the user's own turn, as opencode's hooks                                                                                   |
| `experimental.idle`: `core/src/app.ts:522-536`; whiteboard `packages/plugins/whiteboard/src/index.ts:77` (`autoCommitDraft`)                                                                                                                                                                                                                                                                                                                                                                                                          | the hook runs no message and starts no turn; a hook that wants the agent to go on will call `synthetic`, as opencode's goal plugin does |
| Run and ask state: `sessionRunEvent` (`chat/src/turn.ts:415`), `idleFailedEvent` (`app.ts:506-515`), permission cards (`router.ts:68`, 226 `settlingAsks`, `core/src/runtime/permission-cards.ts:184`)                                                                                                                                                                                                                                                                                                                                | they report a run's state or a pending ask; they are not messages (opencode: `permission.asked`, session status events)                 |
| Code mode child cards inside the user's turn: `chat/src/index.ts:241-252`, `ai/src/server/child-cards.ts:59-114`, `ai/src/server/code-mode.ts:185-200`                                                                                                                                                                                                                                                                                                                                                                                | they draw the calls of the user's own turn; only their hub use goes (7.2)                                                               |
| Plugins with nothing to move: terminal, try-it, tanstack; page `attachment.ts:193` only listens to `session.created`                                                                                                                                                                                                                                                                                                                                                                                                                  | no message, no turn, no mirror                                                                                                          |
| CLI hub reply notices: `cli/src/hub.ts:540-575` (`queueNoticePart`, `settledAnswer`, `goneNotice`)                                                                                                                                                                                                                                                                                                                                                                                                                                    | they go into the outside agent's MCP reply, not a session; they are DELETED under ruling 4.1 D anyway (below)                           |

Opencode also gives plugins `ctx.session.prompt` (`core/src/plugin/command.ts:70`, `goal.ts:423`), a plugin sending
as the user. Conciv's `SessionDomain` has no `prompt` member, and under ruling 4.2 none is added.

### 7.4 Deleted after the move

Core (`packages/core/src`):

- `page/page-plugin.ts` and `page/page-queue.ts` whole: `makePagePlugin`, `PagePlugin`, `QueueFinished`,
  `QueueDelivery`, `OwedQueue`, `owesFollowUp`, `holdForNextReply`, `startQueueFollowUp`, `pageQueueChunks`,
  `FOLLOW_UP_ATTEMPTS`, `FOLLOW_UP_BACKOFF_MS`, and the members `delivery`, `startedBy`, `undelivered`, `fromHub`,
  `hubCall`, `hubReplied`, `queueWait`, `followFinished`, `cancelSession`, `tabs`, `attachedSessions`, `changes`,
  `clearChanges`, `symbolicate`, `symbolicateOrNone`.
- `app.ts`: `followUpOwedQueues`, `publishFinished`, `owedFollowUp`, the `holdForNextReply` branch of `onRunEnd`,
  the `pagePlugin` value and its uses (481, 591, 717, 764-767, 791-798, 805).
- `api/mcp.ts`: `withFinishedQueues`, `McpDeps.hubCall`, `hubReplied`, `finishedQueues`, `startedQueues`, the
  `hubRequest` wrapper, the `finished` helper, the mirror half of `CallPublisher` (`publish`, `settle`).
- `api/call-trace.ts`: `mirror`, `mirrorRun`, `runStarted`, `runFinished`, `marked`, `mirrorRunId`; what is left is
  the end-of-call notice (7.2).
- `api/rpc/router.ts`: the `page` handlers (611-626), `hubTraced`, `requireAttachedPage`, the `isPageTool` check,
  `PAGE_ERROR_NAME`, `PluginPageFailure`.
- `api/rpc/mount.ts`: `queues`, `queueWait` deps (93-94). `runtime/plugin-sessions.ts:30` and
  `sessions/session-actions.ts:22`, 80: the `queues` dep and its `cancelSession` step.
- `runtime/plugin-signatures.ts`: `isPageTool`, `pageOperations` and the `CliTools` branch (replaced by the tool
  options of 1.3).
- `runtime/core-runtime.ts:21`, 28 and `runtime/scope-types.ts:40`: `symbolicate`.
- `runtime/core-runtime.ts:75` and `runtime/scope-types.ts:27`: `run.record` (its only users are the mirrors).

Chat plane and AI server:

- `packages/chat/src/index.ts`: `ChatPlane.followUp` (85), `FollowUpOutcome`, `driveFollowUp`, `followingUp`,
  `resolveFollowUpOutcome`, `ChatPlane.record` (73, 211; users are the mirrors only).
- `packages/chat/src/turn.ts:210`: the `'page-queue'` branch of `askedMessages`.
- `packages/protocol/src/harness-types.ts:116` and `packages/ai/src/server/delivery.ts:16`: the `'page-queue'` turn
  kind and its `input`.
- `packages/ai/src/server/chat-server.ts:818-823`: the `record` of given chunks (check no other caller first).

Contract and protocol:

- `packages/contract/src/contract.ts`: the `page` group (537-547: `queue.wait`, `symbolicate`, `changes`,
  `clearChanges`); `queued` and `finished` on the code results (220-235, `CodeDiscoverResultSchema`'s `finished`);
  `tabs.*` split per 1.6; `editor.openFromFrames` per 1.2.
- `packages/contract/src/code-reply.ts`: `queueNotice` (50) and `queueNoticePart` (74) move into the page plugin;
  any code-reply part that only carried queue notices goes.
- `packages/protocol/src/chat-event-types.ts:158`: `pageQueueEvent` (`conciv.page-queue`).
- `packages/protocol/src/page-types.ts`: `PAGE_QUEUE_ASYNC_TOOL`; `PageQueue*` schemas move into the page plugin;
  `PAGE_ERROR_CODES` and `isPageFailure` leave the router (1.5).
- `packages/protocol/src/chat-message-types.ts:39`: `OutsideCallMetadataSchema` and its readers
  `ui-kit-chat/src/store/grouping.ts:73`, `ui-kit-chat/src/tools/styled/tool-call-card.tsx:138`,
  `ui-kit-chat/src/styled/thread.tsx:195` (`outsideCallsMarkdown`): replaced by the notice's `metadata.source:
  'outside'`.

Page plugin (`packages/plugins/page/src/rpc.ts`): the rpc methods `queue.owed`, `queue.settle`, `queue.claim`,
`queue.undelivered`, `queue.startedBy`, `queue.cancelSession`, and the `queue.finished` event (the plugin acts on a
finished queue itself). `queue.wait` stays only if the new waiting tool is built on it.

CLI (`packages/cli/src/hub.ts`): the queue poll and settle (`settleDelivered` 299, `PolledQueue`, `GoneQueue`),
`queueNoticePart` (540), `settledAnswer`, `goneNotice`, and the `PAGE_TOOL_PREFIX` note per 3.1. The hub origin
headers (`CONCIV_ORIGIN_HEADER`, `CONCIV_CLIENT_HEADER` in `protocol/src/chat-types.ts:13-17`) stay: the outside
notice and the outside permission checks read them.

SDK host: `synthetic: undefined` in `plugin-host/src/core/plugin/host.ts:209` and `plugin/src/promise/adapter.ts:436`
is replaced by the implementation; `packages/plugin/src/README.md:391` loses `session.synthetic` from its not-ours
list.
