# @conciv/plugin-page

## Overview

conciv's built-in page plugin, both halves in one package:
the engine part (`.`: the plugin `conciv.page`, its connection, tools, skill and queue), the RPC contract (`./rpc`),
the browser part the widget runs eagerly (`./client`: what the widget calls directly), the window
setup loaded lazily by the built-ins (`./renderer`), and the built-ins lists the hosts compose: the widget's (`./builtins`)
and the engine's (`./engine-builtins`).

`./test-utils` is for other packages' tests: the page built-in as a test app renders it, so a plugin's tests run with the page half loaded.

The engine part, the plugin `conciv.page` (`.`), registers the RPC `experimental.page` (`./rpc`) and answers it: the
commands it sends a tab, page operations, live changes, captures, action queues and `symbolicate`.
The engine reaches the plugin only through the plugin API: `@conciv/backend` passes the plugin's engine built-ins list (`./engine-builtins`) and `@conciv/backend-defaults` imports no plugin, so without it the engine answers no tabs and no page tools. A queue starts a core job (`ctx.job.start`, type `page-queue`, recovery `{kind: 'page-queue', sessionID, queueId}`, metadata `toolCallId` and `origin`) whose output is the queue's notice: a chat-started queue's notice is posted into its session as a `session.synthetic` once the job ends (description `Queued page actions <status>`), which wakes the chat agent; a hub-started queue's job is read by the hub.

The widget's entry (`./client`), inlined into the widget by `@conciv/app` through `./builtins`: the React bridge install, the element
picker, the grab preview fit, a toast, the session cards and the page tool names. They hold no
connection to the engine themselves.

A built-in: it draws with the UI kits directly and is one of the two plugin packages
`conciv-publish check-plugin-ui-kit` lets import `@conciv/ui-kit*`. `@conciv/app` composes its `./builtins` list in
`packages/app/src/builtins.ts`.

## Options

- `pageReplyTimeoutMs` (milliseconds, default 5 000): how long a tab has to answer an action that declares no timeout
  of its own, and to accept a queue (`connection.ts`).
- `queuedActionTimeoutMs` (milliseconds, default 7 000): how long each queued action has to confirm once the tab
  reaches it.
- `permissionSyncTimeoutMs` (milliseconds, default 10 000): how long granting or revoking a session's page permissions
  may take before the sync is given up with a warning.

## Browser part

The browser part of `experimental.page`: the command channel of the browser tab the shell opened, to its engine half (`@conciv/plugin-page`), the
operations it runs on the page, and the members other plugins read (`Page`, `ReactTree`).

The `highlight` page effect (`src/highlight.tsx`) draws in the plugin's `ctx.overlay` layer, under the widget: the
overlay brings the widget sheet (reset, tokens, host rules) and the color scheme, and the plugin adds this package's own
utilities (`src/.generated/css.ts`, written by `build:css`) as the overlay's `styles`, since the widget sheet does not scan this package. The
capture layer opts back into pointer events, and `elementAt` skips the widget root and every `[data-conciv-overlay]`
host. The layer sits under the widget, so the box is not drawn over the open panel. Holding Alt while focus is outside
an input, textarea or contenteditable shows the inspector too, until Alt is released or Esc is pressed.

Open tabs are core (`tabs.*` in `@conciv/protocol`): the shell opens a browser tab for its mounted session
(`frontend-defaults/src/runtime/browser-tab/open-browser-tab.ts`) and the engine lists it whether or not this plugin
is installed. The page plugin holds no tab data. Its engine half reads `ctx.browserTabs.list`, and its widget half
answers the commands addressed to `session.browserTab.id` (`answerCommands` in `attachment.ts`) while the routed
session's server is compatible and connected.

The `route` operation's `pathname`, `search` and `href` go through `redactedUrl` (`redacted-url.ts`), and the plugin contributes it as `BrowserTabUrl`, so the shell redacts the browser tab's `url` with it before the engine stores it. It drops user info, and puts `[redacted]` in place of secret
query and hash values and secret route params. The same answer reaches the model, outside agents through the hub,
the terminal and the thread's tool card.

The terminal runs the page tools as `conciv tools page <verb>`: the engine's `registry.invoke` runs the plugin's
tool for the session `--tab` or `CONCIV_SESSION_ID` names; `eval` from there asks as the cli README's 'Who is asked'
says. Inside a chat turn the `eval` tool asks the user first.

A queue hands its work to the core job service: `runQueue` (`src/connection.ts`) starts a job (`ctx.job.start`, id
`pq_<queueId>`, recovery `{kind: 'page-queue', sessionID, queueId}`) whose run waits for the queue to finish. A
blocking queue waits on `ctx.job.block` for up to `PAGE_QUEUE_SYNC_MS` and answers the result if the job finished;
otherwise the job is backgrounded (`ctx.job.background`), the call answers the queue's progress, and for a queue the
hub did not start the result is posted into the session as a `session.synthetic` once `ctx.job.wait` sees the job end
(nothing is posted for a cancelled job), then `ctx.job.completeBackground` marks it delivered.
`conciv plugin call experimental.page queue.wait` is a peek: it waits up to `waitMs` for the result and otherwise
answers the progress (`{status: 'playing', done, of}`). A caller who leaves (Ctrl-C) as the queue finishes may not see
that result in their terminal; it stays in the queue's journal and card and can be read again with
`conciv plugin call experimental.page queue.wait --data '{"sessionId":"<sessionId>","queueId":"<queueId>","waitMs":0}'`,
which answers the kept result again (`src/queue.ts` `wait`; the newest 200 finished queues are kept,
`KEPT_QUEUES` in `src/queue-machine.ts`).
Deleting a session cancels its jobs (the core `Job.cancelSession`), and when the page plugin hears `session.deleted`
it drops that session's queue records (`src/queue.ts` `cancelSession`), so `queue.wait` on one answers
`no queue <id> on this tab`. It also stops what the session's tabs are still playing: each request in flight gets the
same `cancel` control a dropped request gets (`src/connection.ts` `deleted`), and the queue's next actions are never
sent (the session's tabs are gone, so they settle `disconnected before dispatch`). A closed tab gets no cancel:
nothing is left to receive it.

The engine activates the plugins it is given in the host's post position (`InstancePlugins.bound([], {post:
input.plugins})`, `packages/backend-defaults/src/engine/runtime/plugin-runtime.ts`), so the page half, which
`@conciv/backend` passes from this package's `./engine-builtins` list, runs after every project plugin: the half
pushes its page rules and the `page_eval` ask onto every agent. A tool call that arrives while its plugin restarts
after a reload meets the restart window: work started after the reload waits for activation (`Plugin.awaitActivation`
in `@conciv/backend-app-api`), a call already in flight does not.

Page tools are offered while a tab is open. They carry `permission: 'page'`; the engine half denies `page` on
every agent and grants it to the session while one of its tabs is open (it follows `tab.opened` and `tab.closed`), so with no tab neither the chat nor an
outside agent is offered a page tool, and they are gone again once the last tab goes.

A page failure is the plugin's own error, a `[page.<code>]` message:

- no tab to reach: `[page.disconnected]`; a tab that does not answer in time: `[page.timeout]`.
- a missing target: `[page.invalid-args] <the page's message>`. Input that fails the schema is the tool runtime's own
  failure in a chat turn or code mode (`Invalid arguments for tool "page_<name>":`, one `- <field>: <message>` line
  per failing field, the arguments provided, then `Update the arguments and call the tool again.`), and a user error
  with exit 1 before any call through `conciv tools page <verb>`.
- the action's own error as the page raised it: `[page.handler-error] <message>`.
- a dropped request's page is told to stop (a `cancel` control for that request id) and the request is gone
  (`command` for it answers unavailable `Page request is no longer available.`); a late result for it is accepted and
  ignored.
- `page_eval` asks inside the tool, so it is not in the hub session's MCP listing: an outside agent reaches it in code
  mode.
- with no tab open an outside run is offered no page tools, so a call answers
  `external_page_<name> is not defined` and `discover_tools` does not list it.

## Cards

Each card draws a `BasicTool` row (through `PageTool` in `shared.tsx`) titled with the page operation's own label;
`cards.tsx` binds the cards to the page tool names and the renderer (`renderer.tsx`) registers one render per name. Every
card reads its element captures through the plugin's own captures query (`captures.tsx`), keyed exactly as the app
invalidates it. An errored call never reaches a card: `PageFailedTool` is each name's `errorComponent`.
`SessionCard` (`session-card.tsx`) is the group entry for `PAGE_SESSION_GROUP_KEY` groups and turns a run of page tool
calls into steps.

## Invariants

- A grab picked from the composer becomes a composer note with origin `page` and `href: page-grab:<id>`
  (`grab-note.ts`, the plugin's `GrabPicker`): the plugin resolves the source, shrinks an image preview to 750 000
  bytes, saves the grab on the engine (`grabs.save`, one JSON file per grab under `.conciv/page/grabs/`, `grabs.ts`)
  and attaches the note. Its `NoteCard` draws the grab from the engine by id, in the composer and in the sent message.
- The model reads the note's sentence (the grab's text with its source) and, for an image preview, the picture: the
  `session.prompt` hook adds it as an image file of the message (`grabs.ts:addPictures`).
- `symbolicate` reads only files whose realpath is inside the project root, fetches source maps only from localhost,
  127.0.0.1 or ::1, skips node_modules results, and runs in the calling host fiber, so its fetch timeout is on the
  engine's clock (`symbolicate.ts`). Queued page plays fork on the connection's context, so their reply timeouts are
  on the engine's clock too (`connection.ts`).
- A field with `type=password` or an `autocomplete` containing `cc-`, `one-time-code`, `current-password` or
  `new-password` is read as `MASKED_VALUE` (`snapshot.ts:isSensitiveField`, `capture.ts` for captured attributes).
- Selectors match in the document first, then in the page's open shadow roots, never in the widget's own
  (`snapshot.ts:selectDeep`).
- The React bridge is installed once, before the renderer registers (`react.ts:installReactBridge`); the react-grab adapter is created once and
  reused (`grab.ts:getReactGrabAdapter`).
- The package never imports `@conciv/backend-defaults`: the engine reaches the plugin only through the plugin API.
- A grab snapshot is drawn in an iframe with an empty `sandbox` and the CSP `default-src 'none'; img-src data:;
  style-src 'unsafe-inline' data:; font-src data:`, and only CSS values matching `/^[\w\s%.,()/#-]+$/` are
  interpolated into its srcdoc (`grab-card.tsx`).

## Side Effects

- Writes one file per saved grab under `<project>/.conciv/page/grabs/` (`grabs.ts`); nothing removes them.
- Reads project files and fetches source maps over loopback HTTP (`symbolicate.ts`).
- Instruments React through `bippy` (`react.ts`), sets `window.__REACT_GRAB_DISABLED__ = true` and loads `react-grab`
  with the `conciv` react-grab plugin (`grab.ts`).
- Loads `rrweb-snapshot` and `@zumer/snapdom` on first use; a failed load is retried on the next call and shows an
  error toast once (`capture.ts`, `operations.ts`).
- Appends toast elements to the page (`toast.ts`), and a temporary `<iframe>` and holder element to `document.body`
  to measure fonts for a grab preview (`grab-preview.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-page` from the repo root (turbo builds the package and its dependencies first)
