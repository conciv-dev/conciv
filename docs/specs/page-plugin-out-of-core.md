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

| Surface                                                                | Where                                                                                                       | Exists?                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `Contract.define` / `ctx.provide` / `ctx.use`                          | `packages/plugin/src/experimental/core.ts`                                                                  | yes                                                |
| `Page` contract (`symbolicate`, `toast`, `capture`, `pick`)            | `packages/plugin/src/experimental/page.ts:33`                                                               | yes                                                |
| `ReactTree` contract, `PageOperation` registry                         | same file, 70 and 40                                                                                        | yes                                                |
| `GrabApi` contract                                                     | `packages/plugin/src/experimental/grab.ts:56`                                                               | yes                                                |
| `ToolRegistry` (render per tool name)                                  | `packages/plugin/src/experimental/registries.ts:583`                                                        | yes                                                |
| `Slot` (`page.overlay`)                                                | `registries.ts:538`, 381                                                                                    | yes                                                |
| `ctx.rpc.register` + engine `plugin.call` (`rpcId`, `method`, `input`) | `packages/contract/src/contract.ts:573`                                                                     | yes                                                |
| session hook `experimental.idle`                                       | `packages/plugin/src/effect/session.ts:76`, fired at `core/src/app.ts:529`                                  | yes                                                |
| `ctx.session.synthetic`                                                | typed `undefined` at `packages/plugin/src/effect/session.ts:104`, `plugin-host/src/core/plugin/host.ts:209` | in opencode's SDK shape, NOT implemented in conciv |
| `session.deleted` event on the bus                                     | published by `core/src/sessions/session-actions.ts`                                                         | yes                                                |
| tool hook `execute.after` (mutable `result`)                           | `packages/plugin/src/effect/tool.ts:28`                                                                     | yes                                                |

Implementing `session.synthetic` is the one large piece. It is not new API (the SDK already declares the member,
as opencode), but conciv has no engine behind it today.

The rulings removed every NEW row this table had (an attachment-card registry and a session group registry: ruling
4; terminal options and view metadata on the tool definition: ruling 3). Also used, both existing: `Composer.attach`
with `ComposerNote` (`packages/plugin/src/experimental/host-apis.ts:36`, 149) and the `NoteCard` registry
(`registries.ts:355`, 528). NEW that remains: nothing in the SDK. One conditional item: if `installReactBridge`
cannot move to the page plugin's activation (2.9), an early setup entry would be new API and goes to the maintainer
then; it is not proposed now. New plugin code (not SDK API): the page tool that waits for a queue by id (ruling 1)
and a page tool that reads a grab by id (2.3).

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

| Piece                                                                                                                                                           | For the user                                                                                  | Opencode                                                                                                                                                                                                | Destination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `followFinished` + `publishFinished` + `pageQueueChunks` (`app.ts:728-743`): on `queue.finished`, draw a `page_queue_async` tool card in the chat and record it | the result of a queue that played in the background shows in the chat                         | background results arrive as a synthetic message, drawn as a notice                                                                                                                                     | INTO THE PLUGIN: on its own `queue.finished`, the plugin calls `ctx.session.synthetic({sessionId, text: queueNotice(result), metadata: {source: 'page-queue', queueId, toolCallId}})`. The card is the page plugin's renderer for that synthetic notice (see 3.4). `pageQueueEvent` (`protocol/chat-event-types.ts:158`) has no reader in src and goes.                                                                                                                                                                                                                                                                                                                                                                              |
| `startQueueFollowUp` + `followUpOwedQueues` (`app.ts:720-726`, `page-queue.ts:38`): start a turn carrying the notices when the session is idle, retried 3 times | the agent hears that its queued actions finished and goes on                                  | `synthetic` admits the input and wakes the session; no plugin drives a turn                                                                                                                             | INTO THE ENGINE as the `synthetic` implementation (generic, every plugin): admit the text, start a turn if the session is idle, otherwise deliver it with the next turn. The retry and the tombstone check move with it. DELETED from core as page code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `owesFollowUp` before `experimental.idle` (`app.ts:521`, 549-553)                                                                                               | no idle hook runs while a follow-up turn is owed                                              | `experimental.idle` "does not run ... input admitted by the hook runs in the same execution"                                                                                                            | GENERIC: idle skips when the session has synthetic input waiting. No page call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `holdForNextReply` on an aborted run (`app.ts:541-545`)                                                                                                         | a stopped run keeps the queue result for the next reply                                       | synthetic input survives an interrupt and waits for the next wake (`resume: false`)                                                                                                                     | GENERIC: part of `synthetic` (waiting input stays waiting after a stop). DELETED from core as page code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `delivery.owed` / `settle` (`owed`, `nextReply`, `delivered`)                                                                                                   | each result is told to the agent exactly once                                                 | the synthetic message is the record (its `id` makes a second admit a no-op); a background shell's result is read by id from `Job.wait`                                                                  | DELETED (ruling 4.1 D): the chat gets the result once through `synthetic` (the queue id as the message `id`); an outside agent reads it through the page tool that waits by id (below). No owed/next-reply/delivered state is kept anywhere, so `queue.owed`, `queue.settle`, `queue.claim`, `queue.undelivered` and `queue.startedBy` leave the plugin's rpc too.                                                                                                                                                                                                                                                                                                                                                                   |
| `hubCall` / `hubReplied` / `fromHub` / `undelivered` / `startedBy` (`app.ts:764-767`, `api/mcp.ts:204-207`, 291-310)                                            | a queue an outside agent started is answered in that agent's next reply, not as a chat turn   | background shell: the call answers at once with a job id; the agent reads the result by id when it wants it                                                                                             | DELETED (ruling 4.1 D). Nothing tracks which calls were the hub's: `queue_async` answers the queue id and one line saying which page tool returns the result; that tool waits while the queue runs. Every queue also ends in one `synthetic` to its session, whoever started it.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `queueWait` (`app.ts:798`, `router.ts:611-618`, contract `page.queue.wait`)                                                                                     | the hub waits for a queue result                                                              | `Job.wait` behind the shell tool                                                                                                                                                                        | INTO THE PLUGIN as a page TOOL (plugin code, not SDK API; it does not exist today: the plugin has the `queue` and `queue_async` operations and the rpc method `queue.wait` only). The queue runs in an Effect model in the plugin (`queue.ts` becomes a fiber per queue, the result in a `Deferred`); the tool awaits it with the caller's wait budget and answers progress when the budget runs out. The contract's `page.queue.wait` and the CLI's poll (`cli/src/hub.ts` queue polling) go.                                                                                                                                                                                                                                       |
| `cancelSession` (`session-actions.ts:80`, `plugin-sessions.ts:30`)                                                                                              | deleting a session cancels its queued actions                                                 | `jobs.cancelSession` is core's own job service, not a plugin                                                                                                                                            | INTO THE PLUGIN: it already drops the session's queues when it hears `session.deleted` (`connection.ts:598`). Core's awaited call only exists so a result landing between tombstone and `session.deleted` starts no turn; with `synthetic` refusing a deleted session (as the follow-up does today with `isDeletedRow`), that race is closed generically. DELETED from core.                                                                                                                                                                                                                                                                                                                                                         |
| `symbolicate` / `symbolicateOrNone` (`app.ts:717`, `core-runtime.ts:21`, `scope-types.ts:40`, `router.ts:620`, `app.ts:805` `openFromFrames`)                   | a grabbed element opens at its source line; a page tool names the source behind a stack frame | none in core; opencode's contract has no endpoint for opening a source location (its only "open" is the desktop `OpenInApp` GUI contract, `plugin/src/gui/file.ts:92`, a button that opens a workspace) | The grab staging reads `symbolicate` from the `Page` contract (`experimental/page.ts:28`), see 2.6; `rpc.page.symbolicate` and `scope.symbolicate` go. `editor.openFromFrames` (ruling 5 keeps it in core): `git grep` finds NO caller in any src, test or e2e (only `contract.ts:549`, `router.ts:629`, `mount.ts:81`, `app.ts:805`), and opencode has no name to move it to. It cannot keep calling the page plugin's `symbolicate`. My pick: DELETE it as dead, with `editor/open-source.ts` (`openSourceFromFrames`), `OpenSourceSchema` and `OpenSourceResultSchema`. If it must stay, the only page-free shape is the same name taking a `SourceLoc` the caller resolved; that is a contract input change, for the maintainer. |
| `tabs` / `attachedSessions` (`app.ts:791-792`, `router.ts:200`)                                                                                                 | see 1.4 and 1.5                                                                               |                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `changes` / `clearChanges` (`router.ts:621-626`, contract `page.changes`, `page.clearChanges`)                                                                  | the hub reads and clears the page changes the user made                                       | none                                                                                                                                                                                                    | INTO THE PLUGIN'S RPC through `plugin.call` (`changes`, `clearChanges` are already its methods). The contract's `page.*` group goes whole. The `hubTraced` trace around them needs a generic home on `plugin.call` (check whether `plugin.call` from the hub is traced today).                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

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
  core. The set of names stays in the contract (`registryCallErrors`); plugins use those names only, so no new API.

### 1.6 `api/tabs.ts:6` (`State` type) and `router.ts:596-597` (`tabs.list`, `tabs.get`)

- For the user: `conciv tabs` and the hub list the sessions with an open page, each with its browser tabs (focused
  first) and the project name and branch; the widget reads the same list (`host-apis.tsx:346`, 466, 584,
  `mounted-session.ts:90`) for the project name and branch.
- Opencode: `Browser.attached(session)` on the contract; no engine-wide tab listing. Project facts come from three
  endpoints of its contract (`packages/protocol/src/groups`): `location.get` (`location.ts:36`, answers
  `Location.Info`: `directory` and `project: {id, directory, canonical}`, `schema/src/location.ts`), `vcs.get`
  (`vcs.ts:53`, answers `Vcs.Info`: `branch: {current, default}`, `schema/src/vcs.ts`) and `project.list`
  (`project.ts:17`, each `Project` has an optional `name`, `schema/src/project.ts:44`).
- Destination (ruling 5): the per-session tab part moves INTO THE PLUGIN'S RPC (`sessions.attached` and `tabs.list`
  already exist), reached through `plugin.call`; `tabs.get` (`open`) the same. The project part stays in core under
  opencode's names: root is `location.get`'s `project.directory`, branch is `vcs.get`'s `branch.current`, name is the
  project's `name`. Conciv already uses opencode's location envelope (`contract.ts:264-276`, `locationResponse`).
  Differences to show the maintainer: conciv's name is read from `package.json` (`tabs.ts` `projectName`), opencode's
  `Project.name` is a stored, optional user name; conciv has no project list, so `project.list` would answer one
  project. `tabs.get`'s `instructions` (the system prompt text) is not tab or project data; opencode reads instruction
  entries per session (`session.instructions`), which conciv's SDK has (`effect/session.ts`, `instructions.entry`).

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

- For the user today: a run of page tool calls folds into one "page session" card, with act calls inside it.
- Opencode: no plugin group; tool calls sit in the generic activity group (`session-ui/src/timeline-next/rules.ts:41`).
- Destination (ruling 4): DELETED. Page calls draw through `ToolRegistry` only (the page plugin already registers a
  render for every page tool, `plugins/page/src/renderer.tsx:96-107`) and sit in the generic activity group like
  every plugin's tools. Deleted: `PAGE_SESSION` (`chat-pane.tsx:249-260`), `ui-kit-chat/src/store/page-session.ts`
  (`PageSessionConfig`, `PageSessionGrouperConfig`, the grouper), its export (`ui-kit-chat/src/index.tsx:43`), and in
  the page plugin `pageSessionEntry`, `PageSessionCard` (`session-card.tsx`), `PAGE_ACT_TOOL_NAMES`,
  `PAGE_TOOL_PREFIX` and their stories. What the user loses: the one folded card per run of page calls.

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

- For the user: a grab in the composer and a staged grab draw as the grab card; the agent gets the grab.
- Today: a grab is a composer FILE attachment, `new File([JSON], 'Grabbed element', {type: GRAB_MIME})`
  (`packages/grab/src/grab-attachment.ts:94-95`, `GRAB_MIME` 4), whose JSON holds `text`, `snippet`, `source`,
  `rect` and a `preview` that may be an image data URL (`grab-attachment.ts:24-39`); the widget finds grabs by that
  mime (`apps/conciv/src/pane/grab-staging.ts:59-61`) and draws them with `pageAttachmentCards`
  (`{mime: GRAB_MIME, render: GrabCard}`, `plugins/page/src/cards.tsx:87`). The model gets the JSON file.
- Destination (ruling 4): `Composer.attach` + `NoteCard`. Checked by reading: a grab does NOT fit by mime. A note
  is matched by `origin`, not mime (`NoteCard.origins`, `registries.ts:355-356`), and carries text only: `origin`,
  `label`, `title`, `subtitle`, `icon`, `subject`, `comment`, `href`, `live` (`ComposerNote`,
  `host-apis.ts:36-51`); `attach` takes notes only and a file "logs and attaches nothing" (`host-apis.ts:145-149`).
  The model gets the note as text (`apps/conciv/src/composer/comment-note.ts:34-38`, `formatNoteComment`: "The user
  referenced <subject>"). So the grab fits as a note with `origin: 'page'` and the grab's text and source in
  `subject`; the screenshot does not fit. As the recorder does for its recording (the note names an id and the
  agent reads it with `recording_get`, `plugins/recorder/src/skill.ts:20`), the page plugin keeps the grab and the
  agent reads it, image included, with a page tool by id (plugin code, no SDK API). The page plugin attaches the
  note itself (it owns the pick), and its `NoteCard` for origin `page` draws `GrabCard`. Deleted:
  `pageAttachmentCards`, `attachmentCards` and the `STAGED_GRAB_CARDS` path, `grab-staging.ts`'s mime matching,
  `grabToFile`/`parseGrabPayload`/`GRAB_MIME` once nothing else reads them.

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
  (dynamic import). The react tree test (browser mode, the M-REACT step in the app's browser file
  `apps/conciv/src/conciv.browser.test.tsx`) must pass with the call moved. If it cannot, the fallback would
  be new API, taken to the maintainer at that point, not now.

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
- Destination (ruling 6, REQUIRED): the note comes from the plugin, in its skill text or tool namespace description
  (as opencode's `editor.namespace({name: 'browser', description})`). The hub reads tools by catalog category (the
  plugin id, ruling 3), not by prefix. `PAGE_TOOL_PREFIX`, `PAGE_TOOLS_NOTE`, the prefix test at 613, the queue
  polling (ruling 1) and the `@conciv/plugin-page` dependency of `packages/cli/package.json:48` go.

### 3.2 `packages/plugins/tanstack/src/tools.ts:9`, 35, 109, 188 (`PageDefinition`, `State`, `TabId`)

- Plugin to plugin: the tanstack engine plugin calls the page plugin's rpc. Not core or widget, so outside the
  ruling. As opencode, the cleaner shape is a contract the SDK declares (like `Browser`), but that would be new API;
  leave it.

### 3.3 Tool view metadata (`CliTools[...].view`, `rpc.ts:680`)

- Ruling 3: the catalog derives everything and shows no icon or label; the widget draws them in the plugin's own
  `ToolRegistry` render (2.2). `CliTools` goes.

### 3.4 The queue result card

- Today: a mirrored `page_queue_async` tool call drawn by the page plugin's `ToolRegistry` render.
- After 1.2: a synthetic notice with `metadata.source: 'page-queue'`, drawn by the generic notice row, as opencode
  draws synthetic notices (`session-ui/src/timeline-next/rules.ts:213`). No registry.

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
4. DECIDED 2026-11-20, maintainer: "we have a way for a plugin to add a tool card". The page plugin draws its tool
   calls only through the existing `ToolRegistry` (it already registers every page tool, `plugins/page/src/renderer.tsx`).
   The widget's page session fold (`chat-pane.tsx:249` `PAGE_SESSION`, `ui-kit-chat/src/store/page-session.ts`,
   `pageSessionEntry`) is deleted; page calls sit in the generic activity group like every plugin's tools, as opencode
   (`session-ui/src/timeline-next/rules.ts:41`). No new registry. Attachment cards (2.3) use the existing
   `Composer.attach` and `NoteCard` registry (#989); no new registry.
5. DECIDED by the orchestrator 2026-11-20, under the maintainer's "rule without me, stay as opencode": the contract's
   `page.*` group is deleted and the per-session tab part of `tabs.*` moves to the page plugin's own rpc, reached
   through `plugin.call` (opencode's core contract has no browser group; the plugin owns its rpc). The project part
   of `tabs.*` (name, root, branch) and `editor.openFromFrames` stay in core; any new name for them is taken from
   opencode's contract, never invented, and is shown to the maintainer in the detailed plan.
6. DECIDED the same way: `packages/cli` counts. opencode's CLI has no dependency on its browser plugin (only `core`,
   `gui-plugins` and the plugin itself name it), so `cli/src/hub.ts:30` (`PAGE_NAMESPACE`) and the
   `@conciv/plugin-page` dependency of `packages/cli` go (3.1).
7. DECIDED 2026-11-20, maintainer: A. When an outside agent's tool call ends, core calls `synthetic` once for it
   with `resume: false` (it never starts a turn): one notice line naming the client, the tool and its outcome. The
   live mirrored cards and fake runs (`call-trace.ts` `mirror`, `mirrorRun`, `runStarted`, `runFinished`) are deleted
   (7.2, 7.4).

## 5. Order

Six PRs, each merged before the next starts. Tests are written on the kits in
`docs/specs/orchestrator-handoff-2026-11-20.md`: node is `@conciv/plugin-testkit/node` `createEngine`, happy-dom and
browser mode are `@conciv/plugin-testkit/browser` `mount`. Every PR deletes the old tests of what it deletes.

Who mounts the app (ruled 2026-11-20, as opencode; `docs/specs/test-rewrite-after-port.md` at 2ff22de0e, AGENTS.md
Testing): the page plugin, core, the SDK and the ui kits are packages the app is made of, so none of them mounts the
app. Their node tests stay in their package (the page plugin's tools, rpc and queue model; core's `synthetic`). Every
happy-dom or browser-mode test below mounts the whole app, so it lives in the app's tests and joins an app journey
of `docs/specs/test-split/app.md` or `plugins.md` instead of starting a second test of the same thing:

- the notice row (PR 1, 2, 3): one journey in `apps/conciv/src/pane/chat-pane.dom.test.tsx`, a notice that is not
  the user's turn; PR 1 starts it, PR 2 and PR 3 each add a step. No old test covers it, so it has no `M-*` group yet;
  the app area names it when the first PR lands.
- tool cards (PR 5): M-TOOLCARDS, `apps/conciv/src/pane/tool-registry-render.dom.test.tsx`. M-PAGECARD (today
  `packages/plugins/page/src/session-card.dom.test.tsx` in app.md) becomes steps of it: with the fold gone (2.1), a
  page card is a plugin card through `ToolRegistry`.
- grab (PR 5, PR 6): M-GRAB, `apps/conciv/src/composer/actions.dom.test.tsx`.
- the real pick and the React tree (PR 6, 2.9): the app's one browser file `apps/conciv/src/conciv.browser.test.tsx`,
  steps of M-INSPECT (pick and the React source) and M-REACT (the `ReactTree` contract) from `plugins.md`, which today
  name the page plugin's own browser file.

### PR 1. `session.synthetic` in the engine

- The user can: nothing new on screen. A plugin can now add a notice to a session and wake it
  (`ctx.session.synthetic`), as opencode's (7.1).
- Files: `packages/plugin-host/src/core/plugin/host.ts:209`, `packages/plugin/src/promise/adapter.ts:436` (the
  `undefined` members become the implementation), `packages/plugin/src/effect/session.ts:104`,
  `promise/session.ts:161` (types from opencode's `SessionDomain`), `packages/core/src/runtime/plugin-sessions.ts`
  (it passes `delivery: undefined` today, 265: conciv has no session inbox, so the admit-and-wake of opencode's
  `session/synthetic.ts` is new engine code in the chat plane, `packages/chat/src`, beside `send`, which starts runs
  today), the widget's notice row for a synthetic message, `packages/plugin/src/README.md:391`.
- Deleted: nothing yet.
- Tests: node: a notice wakes an idle session and a turn runs; with `resume: false` it waits for the next turn; it
  survives a stop; the same `id` twice adds one notice; a deleted session refuses it; `experimental.idle` does not
  run while a notice waits (node, `packages/chat/src` and the plugin-host session tests). happy-dom, in the app:
  `apps/conciv/src/pane/chat-pane.dom.test.tsx`, a fixture plugin passed to `createEngine({plugins})` sends a notice
  and it shows as its own row in the chat (first step of the notice journey).

### PR 2. The page queue on `synthetic`, and the waiting tool (rulings 1 and 2)

- The user can: queue page actions in the background; the outside agent gets the queue id at once and reads the
  result with the page plugin's waiting tool; the conciv chat gets one notice when the queue ends and the agent goes
  on.
- Files: `packages/plugins/page/src/queue.ts` (an Effect model: a fiber per queue, the result in a `Deferred`),
  `tools.ts`, `rpc.ts`, `operations.ts` (the waiting tool), `skill.ts`; core `app.ts` (481, 521-553, 591, 717-743,
  764-767, 791-798), `api/mcp.ts`, `api/rpc/mount.ts`, `runtime/plugin-sessions.ts`, `sessions/session-actions.ts`;
  `packages/chat/src/index.ts`, `turn.ts`; `packages/ai/src/server/delivery.ts`; `packages/protocol` (`harness-types.ts`,
  `chat-event-types.ts`, `page-types.ts`); `packages/contract` (`contract.ts:220-235`, `code-reply.ts`);
  `packages/cli/src/hub.ts` (queue polling).
- Deleted: `core/src/page/page-queue.ts`, the queue half of `page-plugin.ts`, `followUp`, `driveFollowUp`,
  `FollowUpOutcome`, the `'page-queue'` turn kind, `pageQueueEvent`, `PAGE_QUEUE_ASYNC_TOOL`, the hub call tracking,
  `queued`/`finished` on code results, the page rpc methods `queue.owed`, `queue.settle`, `queue.claim`,
  `queue.undelivered`, `queue.startedBy`, `queue.cancelSession`, `queue.finished`, and the contract's
  `page.queue.wait` (7.4).
- Tests: node (page plugin suite): `queue_async` answers the id at once; the waiting tool answers progress within
  its budget and the result after, as often as asked; an aborted wait leaves the queue running; a finished queue
  sends one notice and the session's agent goes on; a deleted session gets none. happy-dom, in the app:
  `apps/conciv/src/pane/chat-pane.dom.test.tsx`, a step of the notice journey: the notice row after a page queue
  ends (the page plugin is in the app's built-ins, so the app test runs it as the user has it).

### PR 3. Outside calls end as one notice (ruling 7)

- The user can: see one notice per outside agent call, when it ends, instead of live mirrored cards and fake runs.
- Files: `packages/core/src/api/call-trace.ts`, `api/mcp.ts` (150-195, 254-277), `api/rpc/router.ts` (`hubTraced`,
  247-272), `runtime/core-runtime.ts:75`, `runtime/scope-types.ts:27`, `packages/chat/src/index.ts` (`record`),
  `packages/ai/src/server/chat-server.ts:818-823`, `packages/protocol/src/chat-message-types.ts:39`,
  `packages/ui-kit-chat` (`store/grouping.ts:73`, `tools/styled/tool-call-card.tsx:138`, `styled/thread.tsx:195`).
- Deleted: `mirror`, `mirrorRun`, `runStarted`, `runFinished`, `marked`, `mirrorRunId`, `ChatPlane.record`,
  `run.record`, `OutsideCallMetadataSchema` and its three readers.
- Tests: node: an outside `registry.call`, a direct MCP tool call and an outside `code.execute` each add one notice
  naming the client, the tool and the outcome, and start no turn. happy-dom, in the app:
  `apps/conciv/src/pane/chat-pane.dom.test.tsx`, a step of the notice journey: the notice row, and no tool card, for
  an outside call.

### PR 4. Contract, router, catalog and CLI (rulings 3, 5, 6)

- The user can: `conciv tools` lists the page tools like any plugin's (positional, mutating and category derived);
  `conciv tabs` and the hub's tab listing work through the page plugin's rpc and core's project facts.
- Files: `packages/contract/src/contract.ts` (`page` group, `tabs`, `editor`, `binding` at 163),
  `packages/core/src/api/rpc/router.ts` (attach pre-check 195-207, 221; error table 152-191; `page` and `tabs`
  handlers), `api/tabs.ts`, `runtime/plugin-signatures.ts`, `editor/open-source.ts`, `app.ts:805`;
  `packages/plugins/page/src` (the two attach messages into its `no-widget` failure, `CliTools` out);
  `packages/cli/src/hub.ts`, `engine-read.ts`, `packages/cli/package.json`;
  `apps/conciv/src/runtime/plugin/host-apis.tsx:346`, 466, 584 and `mounted-session.ts:90` (project facts).
- Deleted: the contract's `page` group, `tabs.*` (tab part to the plugin, project part under opencode's names, 1.6),
  `editor.openFromFrames` and `openSourceFromFrames` (dead, 1.2; or reshaped if the maintainer keeps it),
  `binding`, `isPageTool`, `requireAttachedPage`, `PAGE_ERROR_NAME`, `PluginPageFailure`, `pageOperations`,
  `CliTools`, `TERMINAL_LEFT_OUT`, `CLI_HIDDEN_FIELDS`, `PAGE_TOOL_PREFIX`, `PAGE_TOOLS_NOTE`.
- Tests: node: the catalog lists a page tool with derived fields and no `binding`; a page tool with no tab attached
  fails with the plugin's message and the named error; the CLI's tab listing composes the plugin's rpc and the
  project facts; the hub needs no page import.

### PR 5. Widget tool cards (ruling 4, 2.1, 2.2, 2.5, 2.7)

- The user can: see each page tool call as its own page card in the activity group; icon and label come from the
  page plugin's render; captures refresh after a run; the grab failure toast still shows.
- Files: `apps/conciv/src/pane/chat-pane.tsx` (38, 249-260, 730), `composer/actions.tsx`, `data/app-data.ts`,
  `app/live-sessions.ts:103`, `pane/refresh-coordinator.ts:30`; `packages/ui-kit-chat/src/store/page-session.ts`,
  `index.tsx:43`; `packages/plugins/page/src/renderer.tsx`, `cards.tsx`, `session-card.tsx`, `rpc.ts`
  (`pageToolMeta`), `client.ts`.
- Deleted: the page session fold (2.1), `pageToolMeta`, the `tanstackToolMeta` read (same fix for the tanstack
  plugin), `sessionCapturesCall`, the `showToast` import.
- Tests: happy-dom, in the app. M-TOOLCARDS, `apps/conciv/src/pane/tool-registry-render.dom.test.tsx`: a turn with
  page tool calls draws one page card per call with its label and icon, in the generic group; a run end refreshes
  the captures the page card shows (the M-PAGECARD rows join here). M-GRAB, `apps/conciv/src/composer/actions.dom.test.tsx`:
  a failed grab shows the toast. The page plugin keeps no happy-dom file for these.

### PR 6. Grab on the note path, React bridge, no page import left (2.3, 2.4, 2.6, 2.9)

- The user can: grab an element; it shows in the composer as the page plugin's grab card; the agent gets the grab's
  text and source, and reads its picture with the page tool by id; React components behind elements are found as
  before.
- Files: `apps/conciv/src/pane/pane-attachments.ts`, `pane-grab.ts`, `grab-staging.ts`, `app/use-grab-staging.ts`,
  `routes/panel.$sessionId.$view.tsx`, `runtime/plugin/builtins.ts` (`GrabApi` provider); `packages/embed/src/mount-impl.tsx`;
  `packages/plugins/page/src` (`renderer.tsx`: `NoteCard` for origin `page`, `Composer.attach`, `installReactBridge`
  at activation; the grab store and its tool; `grab-preview.ts`); `packages/grab/src/grab-attachment.ts`;
  `package.json` of `packages/core`, `apps/conciv` (kept only for the built-ins listing, 2.8), `packages/cli`; a repo
  check script and its CI step.
- Deleted: `pageAttachmentCards`, the grab-by-mime path, `grabToFile`/`parseGrabPayload`/`GRAB_MIME` if unused,
  `fitImagePreview` and `showToast` exports from `@conciv/plugin-page/client` once unused, the embed's
  `installReactBridge` call.
- Tests: happy-dom, in the app, M-GRAB (`apps/conciv/src/composer/actions.dom.test.tsx`): a grab attaches a note
  drawn as the grab card and the sent message carries its text. Browser mode, in the app's one browser file
  (`apps/conciv/src/conciv.browser.test.tsx`): a real pick on a React page attaches the grab with its source line
  (a step of M-INSPECT); the react tree tool finds the component with the bridge installed by the plugin (a step of
  M-REACT). Node, in the page plugin: the grab-by-id tool returns the picture of a stored grab. Repo check (red first, on a branch that still imports): `packages/core/src`,
  `packages/cli/src` and `apps/conciv/src` import nothing from `@conciv/plugin-page`, except the built-ins listing
  in `apps/conciv/src/runtime/plugin/builtins.ts` and core's listing in `app.ts`; `packages/core` and `packages/cli`
  no longer depend on `@conciv/plugin-page`.

End state: core lists the page plugin (`app.ts`) and the widget lists it (`builtins.ts`), and nothing else in core,
the widget or the CLI imports `@conciv/plugin-page`; the repo check keeps it so.

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
- Where they run (ruled 2026-11-20, see section 5): every test above is node, in core or in the page plugin's own
  suite, so none moves. The happy-dom and browser-mode tests of section 5 are app tests: 7 happy-dom steps (the
  notice journey 3, M-TOOLCARDS 2, M-GRAB 2) and 2 browser-mode steps in
  `apps/conciv/src/conciv.browser.test.tsx` (M-INSPECT, M-REACT), both joining rows the plugins area already lists,
  so the browser file gains no new test.

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

| Site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What the user sees                                                                                                                                                        | Opencode                                                                                                                    | Destination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page queue follow-up turn: `core/src/app.ts:720-726` `followUpOwedQueues`, `core/src/page/page-queue.ts:38-70` `startQueueFollowUp` (3 tries, back-off), `chat/src/index.ts:233-239` `followUp` and 153-164 `driveFollowUp` (`server.drive({kind: 'page-queue', input})`), `chat/src/turn.ts:210` (`askedMessages` appends `{role: 'user', content: input}`)                                                                                                                                                                                                                                                   | a model turn starts with no user action after a background queue ends; the queue notice is sent as a user message                                                         | `synthetic` (shell finish)                                                                                                  | ONTO SYNTHETIC: the page plugin calls `ctx.session.synthetic({sessionId, id: queueId, text: queueNotice(result), metadata: {source: 'page-queue', queueId}})`. `followUp`, `driveFollowUp`, `FollowUpOutcome`, the `'page-queue'` turn kind (`protocol/harness-types.ts:116`, `ai/src/server/delivery.ts:16`) and the `askedMessages` branch are DELETED; the engine's `synthetic` is the one path that admits and wakes.                                                                                                                                                                                                                                                                 |
| Page queue card: `core/src/app.ts:728-743` `publishFinished` + `followFinished`, `core/src/page/page-queue.ts:79-104` `pageQueueChunks` (custom `conciv.page-queue` event, a fake `page_queue_async` TOOL_CALL_START/ARGS/END/RESULT, wrapped in a fake RUN_STARTED/RUN_FINISHED `mirror-page-queue-<id>` when idle), recorded through `run.record`                                                                                                                                                                                                                                                            | a `page_queue_async` tool card appears in the chat when a queue ends                                                                                                      | the synthetic notice is the card                                                                                            | DELETED: the synthetic notice above is what the user sees (generic notice row, or the plugin's render for `source: 'page-queue'`, 3.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Hold on stop and idle skip: `core/src/app.ts:521`, 541-553 (`holdForNextReply`, `owesFollowUp`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | a stopped run keeps the result for later; no idle hook while a follow-up is owed                                                                                          | inbox items wait through an interrupt; idle does not run while input waits                                                  | DELETED as page code: both are properties of the generic `synthetic` (a waiting item survives a stop and is delivered with the next execution; `experimental.idle` skips while the inbox has a waiting item).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Hub and outside-agent mirrors: `core/src/api/call-trace.ts:26-99` (`callTrace` `start`/`result`/`mirror`, `mirrorRun`, `runStarted`/`runFinished` with run id `mirror-<callId>`, `marked` stamping `metadata.conciv = {origin: 'hub', client, run}`), its users `core/src/api/mcp.ts:150-195` (`CallPublisher`, `publishResult`, `runExecute`, `runDirect`), 254-277 (`openCodeSession`, child cards of code mode), `core/src/api/rpc/router.ts:247-272` (`hubTraced`: `registry.call` 483-488, `page_changes` 622, `page_clear_changes` 625); headers set in `cli/src/request.ts:76-77`, `cli/src/hub.ts:159` | each tool call an outside agent makes shows as a tool card marked as an outside call, inside a fake run when the session is idle, and is saved into the session's history | none: opencode has no hub and mirrors nothing; work done for a session that ends outside a turn reports through `synthetic` | ONTO SYNTHETIC (ruling 7, A): when an outside call ends, core calls `synthetic` once with `resume: false` (never starts a turn), `id` = the call id, `text` = one line naming the client, the tool and its outcome, `metadata: {source: 'outside', client, tool}`. The user sees one notice per outside call when it ends, drawn by the generic notice row; the conciv agent reads those lines in its next turn. The child calls of an outside `code.execute` are inside that one call and get no notice of their own. Deleted: `callTrace.mirror`, `mirrorRun`, `runStarted`, `runFinished`, `marked`, `mirrorRunId`, `CallPublisher`'s mirror half and the `record` of mirrored chunks. |
| `page_changes`, `page_clear_changes` hub traces (`router.ts:622`, 625)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | a mirrored card when the hub reads or clears page changes                                                                                                                 | none                                                                                                                        | DELETED with the contract's `page.*` group (1.2); the hub calls `plugin.call`, which ends as one outside notice like any outside call (row above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

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

Contract: `binding` on `ToolCommandSignatureSchema` (`contract.ts:163`) and its two writers in
`runtime/plugin-signatures.ts` (52, 69), per 7.5; the stale `registryBackedTool` line in `core/src/README.md:41`.

SDK host: `synthetic: undefined` in `plugin-host/src/core/plugin/host.ts:209` and `plugin/src/promise/adapter.ts:436`
is replaced by the implementation; `packages/plugin/src/README.md:391` loses `session.synthetic` from its not-ours
list.

### 7.5 What the `client` binding still does once the page branch goes

Nothing. `binding: 'client'` is written only by the page branch of `runtime/plugin-signatures.ts:69`; every other
tool gets `'server'` (52). No product code reads the field: `git grep` over `packages/*/src` and `apps/conciv/src`
finds only the schema (`packages/contract/src/contract.ts:163`) and those two writers. `core/src/README.md:41` still
describes `registryBackedTool` in `app.ts` exposing only `server` tools, but that function is no longer in `app.ts`
(nor anywhere in src); the README line is stale. With ruling 4.3 (every plugin tool is a CLI command, derived) every
signature would be `'server'`, a constant, so the field and the enum are DELETED from the contract (listed in 7.4),
not kept as a value nobody reads.
