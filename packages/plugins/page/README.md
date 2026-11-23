# @conciv/plugin-page

## Overview

conciv's built-in page plugin, both halves in one package (as opencode's `plugin-browser` and `gui-plugins/browser`):
the engine part (`.`: the plugin `conciv.page`, its connection, tools, skill and queue), the RPC contract (`./rpc`),
the browser part the widget runs eagerly (`./client`: what the widget calls directly), the window
setup loaded lazily by the built-ins (`./renderer`).

The engine part, the plugin `conciv.page` (`.`), registers the RPC `experimental.page` (`./rpc`) and answers it: each
tab's attachment and the commands it runs, page operations, live changes, captures, action queues and `symbolicate`.
Core passes it to the plugin host as a post built-in and asks it over that RPC.

The widget's entry (`./client`), inlined into the widget by `@conciv/embed`: the React bridge install, the element
picker, the grab preview fit, a toast, the attachment and session cards and the page tool names. They hold no
connection to the engine themselves.

A built-in: it draws with the UI kits directly, like opencode's gui plugins, and is one of the two plugin packages
`conciv-publish check-plugin-ui-kit` lets import `@conciv/ui-kit*`. The app composes its `./renderer` in
`apps/conciv/src/runtime/plugin/builtins.ts`.

## Interface

- default export (`index.ts`): the engine plugin `conciv.page`
- `symbolicateFrames` (`symbolicate.ts`, internal): an Effect that maps frames (`RawFrame`) to original source
  (`SourceLoc`, both from `@conciv/contract`) with @jridgewell/trace-mapping; the `symbolicate`
  method answers with `symbolicateFrames`
- `Definition` (`rpc.ts`, `./rpc`): the RPC `experimental.page`
- `CliTools` (`rpc.ts`, `./rpc`): per operation, the permission it asks (`asks`) and its `view` (icon and running/done label), read by the page tools and the pane's `builtinToolMeta`
- `attach` refuses a session that does not exist with the error type `missing` (`connection.ts`), every other refusal with `unavailable`
- option `pageReplyTimeoutMs` (`connection.ts`, milliseconds, default 5 000): how long a tab has to answer an action that declares no timeout of its own, and to accept a queue
- option `queuedActionTimeoutMs` (`connection.ts`, milliseconds, default 7 000): how long each queued action has to confirm once the tab reaches it
- option `permissionSyncTimeoutMs` (`connection.ts`, milliseconds, default 10 000): how long granting or revoking a tab's page permissions on its session may take before the attach is refused (the tab retries on its back-off)
- `client.ts` (`./client`): the DOM helpers, `reactBridge` as a namespace, `pageSessionEntry`, `PAGE_ACT_TOOL_NAMES`, `PAGE_TOOL_PREFIX`, `pageToolMeta`
- `renderer.tsx` (`./renderer`): the window setup (default export) the built-ins load lazily
- `grab.ts:getReactGrabAdapter` - creates the adapter once and returns `{activate(onGrab), comment(onGrab), deactivate(), isActive()}` (`ReactGrabAdapter`).
- `grab.ts:GrabSink` - `(grab: Promise<Grab>) => void`: called as soon as an element is picked, before react-grab deactivates, so a pick never resolves before its capture ends.
- `grab.ts:picking` / `setPicking` - Solid signal for pick mode; `setCancelPick` / `cancelPick`.
- `grab-preview.ts:capturePreview` - returns an `ImagePreview` (`kind: 'image'`, a WebP data URL drawn by snapdom, as `page_screenshot` draws) for an element, or a `DomPreview` (`kind: 'dom'`, html, width, height) when drawing fails.
- `grab.ts:elementSnippet` / `groundGrabText` - an element's opening tag and text, with its source location from `sourceFromAttr`.
- `grab-preview.ts:correctFallbackMetrics` / `isStyledElement` - adjust cloned text runs whose web fonts fall back.

## Browser part

The browser part of `experimental.page`: one attachment per tab to its engine half (`@conciv/plugin-page`), the
operations it runs on the page, and the members other plugins read (`Page`, `ReactTree`).

The `highlight` page effect (`src/highlight.tsx`) draws in the plugin's `ctx.overlay` layer, under the widget: the
overlay brings the widget sheet (reset, tokens, host rules) and the color scheme, and the plugin adds this package's own
utilities (`virtual:uno.css?inline`) as the overlay's `styles`, since the widget sheet does not scan this package. The
capture layer opts back into pointer events, and `elementAt` skips the widget root and every `[data-conciv-overlay]`
host. The layer sits under the widget, so the box is not drawn over the open panel. Holding Alt while focus is outside
an input, textarea or contenteditable shows the inspector too, until Alt is released or Esc is pressed.

The routed session attaches while its server is compatible and its event stream is connected (`ServerRef.connected`):
a dropped stream or an engine restart ends the attachment and the reconnect starts a new one, with nobody touching the
tab. In opencode the desktop's own stream ends with the connection, the attachment ends `closed` and the pane registers
again on a backoff (`gui-plugins/src/browser/pane-machine.ts:254-279` `closeReason`, `machine.ts:736-737`, `:772-796`);
here the stream reopens under its reader, so its reconnect is the cue. An `unsupported` or `unavailable` end stops
attaching until the server reconnects or the panel routes another session, as the source's unsupported server is
watched until `server.connected` (`model.ts:382-409`, `machine.ts:386-395`), not until a reload. An attachment the
engine ends while the stream stays up waits for the user to focus, click or type in the tab (`woken`), as the source's
suspended pane waits for those edges (`machine.ts:739-748`, `model.ts:513-528`). An attach the engine refuses because the session
does not exist (deleted, or a new session before its first send; the refusal type `missing`) waits on the event stream
for `session.created` and nothing else, with no timer. An attach that fails for a passing reason (the refusal type
`transient`: the session could not be read, or its page permissions could not be granted in time) tries again
without end on `TRANSIENT_RETRY` in `attachment.ts`, 1 s doubling to at most 30 s, as the source's registration-closed
back-off does. Any other refusal before it attached (the session belongs to
another location, or the page plugin is shutting down; the type `unavailable`) stops attaching until the server
reconnects or the panel routes another session.

The tab reports its state again on focus, blur, a visibility change, a title change and a route change
(`reportChanges` in `attachment.ts`). Route changes come from the Navigation API's `currententrychange`; in a browser
without it (Firefox before 147, Safari before 26.2) `reportRouteChanges` subscribes to nothing, the tab still attaches,
and a route change reaches the agent with the next report or attach.

Every address the page hands out goes through `redactedUrl` (`redacted-url.ts`): the tab list's `url` and the
`route` operation's `pathname`, `search` and `href`. It drops user info, and puts `[redacted]` in place of secret
query and hash values and secret route params. The same answer reaches the model, outside agents through the hub,
the terminal and the thread's tool card.

The terminal runs the page tools as `conciv tools page <verb>`, as main: core's `registry.call` runs the plugin's
tool for the session `--tab` or `CONCIV_SESSION_ID` names; `eval` from there asks as the cli README's 'Who is asked'
says. Inside a chat turn the `eval` tool asks the user first.

When the page plugin hears `session.deleted` it drops that session's queue records (`queue.ts` `cancelSession`), as
the source's `jobs.cancelSession` does on delete: a result that lands later is never announced or owed, and
`queue.wait` on it answers `no queue <id> on this tab`.
`conciv plugin call experimental.page queue.wait` from a terminal is a peek: a caller who leaves (Ctrl-C) as the queue
finishes may not see that result in their terminal; it stays in the queue's journal and card and can be read again with
`conciv plugin call experimental.page queue.wait --data '{"sessionId":"<sessionId>","queueId":"<queueId>","waitMs":0}'`,
which answers the kept result again (`src/queue.ts` `wait` returns the result whatever its delivery; the
newest 200 delivered queues are kept). The delivered-once guarantee belongs to the session notice and `queue.outside`: a queue the session
started reaches it once as a `Session.synthetic` message (`Queued page actions <status>`, `src/connection.ts`), and a
queue an outside agent started (`ctx.agent` is `Agent.outsideId`) is handed over once by `queue.outside({sessionId,
toolCallIds})`, which answers `queued`, the still-playing queues those tool calls started, and `finished`, every finished
queue an outside agent started in that session not handed over yet whatever call started it, each with its `notice`. A
finished `queue.wait` answer carries the same `notice`.
Deleting a session stops what its tabs are still playing: each request in flight gets the same `cancel` control a
dropped request gets (`src/machine.ts` `cancelPending`), and the queue's next actions are never sent (the
attachment is closed, so they settle `disconnected before dispatch`). The source only fails the request on delete
(opencode `plugin-browser/src/machine.ts` `failPending`), without a cancel. A closed tab gets no cancel: nothing is
left to receive it.

The engine starters (`unplugin` `core/boot.ts` and `core/vite.ts`, `try` `connect.ts`) pass the engine half in core `start`'s
`builtins`, which fill the host's post slot (`InstancePlugins.bound(plugins, {post: builtins})`), so it is known
before the config's entries run (`-conciv.page` turns it off) and activates last, as the source activates its browser plugin last (opencode `core/src/plugin/internal.ts:290-294`,
`supervisor.ts:146-147`): the half pushes its page rules and the `page_eval` ask onto every agent, so it runs after
every project plugin that adds one. Core lists no plugin of its own.
A tool call that arrives while its plugin restarts after a reload meets the restart window, as in opencode: work
started after the reload waits for activation (opencode `core/src/session/prompt.ts:40`; conciv
`core/src/runtime/plugin-runtime.ts` `Plugin.awaitActivation`), a call already in flight does not.

The engine half's `sessions.attached` answers the session ids with at least one tab attached
(`src/machine.ts` `selectAttachedSessions`, beside `selectTabs`); core's `tabs.list` walks it and reads each
session's tabs through the engine half's own non-asking `tabs.list` method (`selectTabs`), and `tabs.get` answers open when that read has a tab. This is a
conciv addition: the source has no cross-session listing because it has no tabs listing. Only callers that may call
`plugin.call` reach it, and the RPC mount refuses `plugin.call` to an outside agent (`core/src/api/rpc/mount.ts`
`PLUGIN_PROCEDURES`), so it is no wider than `tabs.list`.

Page tools are offered while a tab is attached. They carry `permission: 'page'`; the engine half denies `page` on
every agent and grants it to the session while one of its tabs is attached, so with no tab neither the chat nor an
outside agent is offered a page tool, and they are gone again once the last tab goes.

A page failure is the plugin's own error, a `[page.<code>]` message; the old registry's codes and behaviour for page tools map:

| Old registry                                 | Page plugin                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_PAGE_CLIENT`                             | `[page.disconnected]`                                                                                                                                                                                                                                                                                                                    |
| `PAGE_TIMEOUT`                               | `[page.timeout]`                                                                                                                                                                                                                                                                                                                         |
| `INVALID_ARGS`                               | a missing target: `[page.invalid-args] <the page's message>`                                                                                                                                                                                                                                                                             |
| `INVALID_ARGS`, input that fails the schema  | in a chat turn or code mode, the tool runtime's own failure: `Invalid arguments for tool "page_<name>":`, one `- <field>: <message>` line per failing field, the arguments provided, then `Update the arguments and call the tool again.`; through `conciv tools page <verb>`, a user error with exit 1 before any call is made, as main |
| `HANDLER_ERROR`                              | the action's own error as the page raised it, e.g. `[page.handler-error] <message>`                                                                                                                                                                                                                                                      |
| `UNKNOWN_REQUEST`                            | no page error: a dropped request's page is told to stop (a `cancel` control for that request id) and the request is gone (`command` for it answers unavailable `Page request is no longer available.`); a late result for it while the tab is attached is accepted and ignored, as the source does                                       |
| `registry.call` reaching a page tool         | runs the plugin's page tool for the caller's session (`conciv tools page <verb>`); an agent reaches them in code mode or through the MCP hub                                                                                                                                                                                             |
| `page_eval` in the hub session's MCP listing | not listed: `page_eval` asks inside the tool, so an outside agent reaches it in code mode                                                                                                                                                                                                                                                |
| a page that never answers, in `tabs.list`    | listed with the href its tab reported                                                                                                                                                                                                                                                                                                    |
| `NO_TAB` for page tools on an outside run    | no page tools: with no tab attached an outside run is offered none, as opencode's browser plugin (`plugin-browser/src/connection.ts:21-28`, `core/src/tool.ts:260, :385-388`), so a call answers `external_page_<name> is not defined` and `discover_tools` does not list it                                                             |

### Owed

- **The halt inside a queued editor fill has no test.** `fillEditor` (`src/act.ts:104-120`) types by events,
  waits one `pageTurn`, then calls `halt()` before it falls back to typing by commands. A test cannot hold the page
  between those two steps: there is one `pageTurn` and no editor wait to gate. A probe run (2026-11-15, probes
  removed) showed the order a session switch takes when it lands during the fill: `halt check` at 13350.4 ms,
  `typing` at 13350.6 ms, and the attachment saw the new routed session only at 13391.3 ms, 41 ms after the typing.
  So the halt check passes and the fill types into the session it was queued for, which is not a wrong-session write.
  The app case "a queued fill released after a session switch does not type" covers the user-visible claim instead:
  it holds the fill's `command` call by its input until the switch shows on screen, then releases it.

## Cards

Each `*Card` is a ToolRegistry render: it takes `ToolProps` and draws a `BasicTool` row (through `PageTool` in `shared.tsx`) with the page operation's own label as its title. `cards.tsx` binds the cards to the page tool names, the page plugin registers one render per name in its setup, and each render reads its element captures through the page plugin's own captures query (`captures.tsx`). `SessionCard` is the group entry for `PAGE_SESSION_GROUP_KEY` groups and reads the same captures. An errored call never reaches a card: the plugin registers `PageFailedTool` (`shared.tsx`) as each name's `errorComponent`, the error card titled with the page operation. `session-card.tsx` turns a run of page tool calls into `PageSessionStep` rows. `story.fixtures.tsx` holds the builders the stories use.

## Invariants

- A grab picked from the composer becomes a composer note with origin `page` and `href: page-grab:<id>`
  (`grab-note.ts`, the plugin's `GrabPicker`): the plugin resolves the source, shrinks an image preview to 750 000
  bytes, saves the grab on the engine (`grabs.save`, one JSON file per grab under `.conciv/page/grabs/`, `grabs.ts`)
  and attaches the note. Its `NoteCard` draws the grab from the engine by id, in the composer and in the sent message.
- The model reads the note's sentence (the grab's text with its source) and, for an image preview, the picture: the
  `session.prompt` hook adds it as an image file of the message (`grabs.ts:addPictures`).

- `readFileInRoot` (`symbolicate.ts`): throws on a realpath outside the project root
- `fetchLoopback` (`symbolicate.ts`): refuses hosts other than localhost, 127.0.0.1, ::1 or [::1]
- `symbolicateFrames` (`symbolicate.ts`): skips node_modules results; a frame that fails to map counts as null; it runs in the calling host fiber, so its source fetch timeout is on the engine's clock
- queued page plays (`connection.ts`) fork on the context the connection was built in, so their reply timeouts are on the engine's clock
- `capture.ts:isSensitiveField` - `type=password` or an `autocomplete` containing `cc-`, `one-time-code`, `current-password` or `new-password` is sensitive; its value reads as `MASKED_VALUE`.
- `snapshot.ts:selectDeep` - matches in the document first, then in the page's open shadow roots, never in the widget's own.
- `react.ts:installTracker` - installs the commit hook only once.
- `grab.ts:getReactGrabAdapter` - the adapter promise is cached; later calls reuse it.
- A tab whose attachment ends (the engine closed it, a plugin reload) attaches again on that end event, with no wake,
  until `end()` is called.
- No core import anywhere in the package: core depends on it, so it never depends on core.
- `cardErrorMessage` (`shared.tsx`) returns a message only when `result.state === 'error'`; it prefers a non-empty `result.error`, then non-empty result text
- `elementTarget` (`shared.tsx`) picks the element target from the first non-empty string of `selector`, then `ref`, then `name`
- `outputChips` (`shared.tsx`) returns [] unless the payload is a plain non-array object, and it drops undefined values
- `pageSessionSteps` (`session-card.tsx`) keeps only parts whose name is in `actNames`; step state is 'error' or 'complete' from the result, otherwise 'streaming' if the group is streaming, else 'aborted'
- `stepInput` (`session-card.tsx`) falls back to JSON.parse of `part.arguments` and returns {} on parse failure
- `stepTarget` (`session-card.tsx`) uses this order: eval code first line, the fixed targets for css/eval/effect, capture accessibleName, selector/ref, input.name, then 'page'
- `clipLine` (`session-card.tsx`) truncates targets and values to `CHIP_BUDGET` = 64 chars with an ellipsis
- `pageSessionScripted` (`session-card.tsx`) is false for an empty step list
- `SessionCard` (`session-card.tsx`) renders nothing when there are zero steps; `sessionStatus` is 'running' while streaming, else 'error' if any step or result errored
- `sessionScripts` (`session-card.tsx`) excludes parts named in `PAGE_ACT_TOOL_NAMES` or prefixed with `PAGE_TOOL_PREFIX`, and keeps only inputs that have `typescriptCode`
- `sessionLocation` (`session-card.tsx`) uses the href from the latest successful `${PAGE_TOOL_PREFIX}route` result; it falls back to `location` only while streaming
- `EditLiveCard` (`cards.tsx`) has content for eval/css verbs or when a before-capture exists
- `ConsoleCard` (`cards.tsx`) marks the row status 'error' if any entry has level 'error', 'uncaught' or 'unhandled'
- `safeColor` (`grab-card.tsx`) accepts only CSS values that match `/^[\w\s%.,()/#-]+$/`, else it uses a fallback, before interpolating into srcdoc
- `GrabSnapshotFrame` (`grab-card.tsx`) sets a CSP of `default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:` and an empty `sandbox`
- `resolvePayload` (`grab-card.tsx`) returns null on a base64 decode failure; `GrabCard` shows 'Grabbed element could not be read' when the payload is null or errored

## Side Effects

- `grabs.ts` writes one file per saved grab under `<project>/.conciv/page/grabs/`; nothing removes them.
- `symbolicate.ts`: reads files and fetches source maps over loopback HTTP
- `react.ts:installTracker` - instruments React through `bippy` `instrument({onCommitFiberRoot})`.
- `toast.ts:showToast` - appends overlay elements to the page.
- `capture.ts:makeSnapshotLoader` - imports `rrweb-snapshot` through `cacheImport` (`Effect.cachedWithTTL`: a success is kept, a failure is retried on the next call) and shows an error toast through the host `ctx.toast` once if it fails. `operations.ts` makes one per page operations instance and loads `@zumer/snapdom` the same way.

- `grab.ts:create` - sets `window.__REACT_GRAB_DISABLED__ = true`, dynamically imports `react-grab` and registers the `conciv` react-grab plugin.
- `grab-preview.ts` - appends a temporary `<iframe>` and a holder element to `document.body` to measure fonts.
- `grab-preview.ts:capturePreview` - waits one `requestAnimationFrame`, draws the element with snapdom; on failure clones the element with inlined computed styles into a detached `<div>`, and returns its `outerHTML`.
- `GrabNoteCard` (`grab-card.tsx`) reads the grab of a note (`href: page-grab:<id>`) from the engine with `grabs.get` through `useQuery`, keyed by the grab id
- `GrabSnapshotFrame` (`grab-card.tsx`) reads `getComputedStyle` (`--chat-panel`, `--chat-fill`) on mount and renders a sandboxed srcdoc iframe
- `sessionLocation` (`session-card.tsx`) reads global `location.host`/`location.pathname` while streaming
- Every page render and `PageSessionCard` (`session-card.tsx`) run the page plugin's captures query on the app's QueryClient, keyed exactly as the app invalidates it

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-page` from the repo root (turbo builds the package and its dependencies first)
