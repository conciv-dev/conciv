# @conciv/builtin-plugins

Private. The browser parts of conciv's built-in plugins, given to the widget from `./renderer` (as
`@opencode/gui-plugins/renderer` gives opencode's). The embed bundles it into the published widget.

## page

The browser part of `experimental.page`: one attachment per tab to its engine half (`@conciv/plugin-page`), the
operations it runs on the page, and the members other plugins read (`Page`, `ReactTree`).

The `highlight` page effect (`src/page/highlight.tsx`) draws in the plugin's `ctx.overlay` layer, under the widget: the
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

The terminal runs the page tools as `conciv tools page <verb>`, as main: core's `registry.call` runs the plugin's
tool for the session `--tab` or `CONCIV_SESSION_ID` names; `eval` from there asks as the cli README's 'Who is asked'
says. Inside a chat turn the `eval` tool asks the user first.

The engine's session delete calls `queue.cancelSession {sessionId}` before it tombstones the row, and the page plugin
also runs it when it hears `session.deleted`: it drops that session's queue records (`queue.ts` `cancelSession`), as
the source's `jobs.cancelSession` does on delete: a result that lands later is never announced or owed, and
`queue.wait` on it answers `no queue <id> on this tab`.
`conciv plugin call experimental.page queue.wait` from a terminal is a peek: a caller who leaves (Ctrl-C) as the queue
finishes may not see that result in their terminal; it stays in the queue's journal and card and can be read again with
`conciv plugin call experimental.page queue.wait --data '{"sessionId":"<sessionId>","queueId":"<queueId>","waitMs":0}'`,
which answers the kept result again (`plugin-page/src/queue.ts` `wait` returns the result whatever its delivery; the
newest 200 delivered queues are kept). The delivered-once guarantee belongs to the hub and the dedicated
`page.queue.wait` forwarder.
Deleting a session stops what its tabs are still playing: each request in flight gets the same `cancel` control a
dropped request gets (`plugin-page/src/machine.ts` `cancelPending`), and the queue's next actions are never sent (the
attachment is closed, so they settle `disconnected before dispatch`). The source only fails the request on delete
(opencode `plugin-browser/src/machine.ts` `failPending`), without a cancel. A closed tab gets no cancel: nothing is
left to receive it.

Core activates the engine half last, in the host's post position (`core/src/app.ts` `post: [concivPage]`, through
`InstancePlugins.bound(plugins, post)`), as the source activates its browser plugin last (opencode
`core/src/plugin/internal.ts:290-294`, `supervisor.ts:146-147`): the half pushes its page rules and the `page_eval`
ask onto every agent, so it runs after every project plugin that adds one. The source lists that plugin in its own
internal list; core cannot, because plugin-host would then import plugin-page, which imports the host's SDK.
A tool call that arrives while its plugin restarts after a reload meets the restart window, as in opencode: work
started after the reload waits for activation (opencode `core/src/session/prompt.ts:40`; conciv
`core/src/runtime/plugin-runtime.ts` `Plugin.awaitActivation`), a call already in flight does not.

The engine half's `sessions.attached` answers the session ids with at least one tab attached
(`plugin-page/src/machine.ts` `selectAttachedSessions`, beside `selectTabs`); core's `tabs.list` walks it and reads each
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

- **The halt inside a queued editor fill has no test.** `fillEditor` (`src/page/page-act.ts:104-120`) types by events,
  waits one `pageTurn`, then calls `halt()` before it falls back to typing by commands. A test cannot hold the page
  between those two steps: there is one `pageTurn` and no editor wait to gate. A probe run (2026-11-15, probes
  removed) showed the order a session switch takes when it lands during the fill: `halt check` at 13350.4 ms,
  `typing` at 13350.6 ms, and the attachment saw the new routed session only at 13391.3 ms, 41 ms after the typing.
  So the halt check passes and the fill types into the session it was queued for, which is not a wrong-session write.
  The app case "a queued fill released after a session switch does not type" covers the user-visible claim instead:
  it holds the fill's `command` call by its input until the switch shows on screen, then releases it.

## terminal

The session's CLI in a terminal (built-in id `terminal`, a pinned Terminal tab in the session's pane): listed for a
session whose harness has a terminal, the CLI started only when the tab first opens (the xterm surface loads then
too), replayed after a reload, with a toolbar at the top of the panel that picks the CLI model and starts a new terminal, both locked while
the CLI is busy. Escape with focus in the terminal interrupts a busy CLI; keys pressed on the host page stay there.
