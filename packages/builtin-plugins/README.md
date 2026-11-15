# @conciv/builtin-plugins

Private. The browser parts of conciv's built-in plugins, given to the widget from `./renderer` (as
`@opencode/gui-plugins/renderer` gives opencode's). The embed bundles it into the published widget.

## page

The browser part of `experimental.page`: one attachment per tab to its engine half (`@conciv/plugin-page`), the
operations it runs on the page, and the members other plugins read (`Page`, `ReactTree`).

The terminal runs any page action through the engine half's one `run` method: `conciv plugin call experimental.page
run --data '{"sessionId":"conciv_...","action":{"type":"text","selector":"h1"}}'`. It takes the same actions the
page tools validate and answers what the tool answers, files saved as the tool saves them. Each call gets a fresh id
in the role a tool call id plays, so its captures and any queue it starts are its own; a queue started this way
belongs to no chat turn. `run` asks nobody, `eval` included: the terminal is the owner. Inside a chat turn the
`eval` tool still asks the user first.
`run` waits on the executor through a deferred (`plugin-page/src/connection.ts:80`) that is always resolved before
`run` can be called: `setup` makes the connection and then registers the tools in the same call
(`plugin-page/src/index.ts:8-9`), and `register` serves the executor (`plugin-page/src/tools.ts:90`) before its first
await.

A queue the terminal starts keeps that it was started there (`plugin-page/src/queue.ts` `startedBy`): `queue.owed`
never offers or claims it, `queue.undelivered` returns it only when its id is asked for by name, so its finish starts
no follow-up turn in the chat; `queue.wait` still delivers its result.
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
`core/src/runtime/plugin-runtime.ts:165`), a call already in flight does not.

The engine half's `sessions.attached` answers the session ids with at least one tab attached
(`plugin-page/src/machine.ts` `selectAttachedSessions`, beside `selectTabs`); core's `tabs.list` walks it and reads each
session's tabs through `run {type: 'tabs.list'}`, and `tabs.get` answers open when that read has a tab. This is a
conciv addition: the source has no cross-session listing because it has no tabs listing. Only callers that may call
`plugin.call` reach it, and the RPC mount refuses `plugin.call` to an outside agent (`core/src/api/rpc/mount.ts`
`PLUGIN_PROCEDURES`), so it is no wider than `tabs.list`.

Page tools are offered while a tab is attached. They carry `permission: 'page'`; the engine half denies `page` on
every agent and grants it to the session while one of its tabs is attached, so with no tab neither the chat nor an
outside agent is offered a page tool, and they are gone again once the last tab goes.

A page failure is the plugin's own error, a `[page.<code>]` message; the old registry's codes and behaviour for page tools map:

| Old registry                                 | Page plugin                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_PAGE_CLIENT`                             | `[page.disconnected]`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PAGE_TIMEOUT`                               | `[page.timeout]`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `INVALID_ARGS`                               | a missing target: `[page.invalid-args] <the page's message>`                                                                                                                                                                                                                                                                                                                                                                                                         |
| `INVALID_ARGS`, input that fails the schema  | in a chat turn or code mode, the tool runtime's own failure: `Invalid arguments for tool "page_<name>":`, one `- <field>: <message>` line per failing field, the arguments provided, then `Update the arguments and call the tool again.`; through `conciv plugin call experimental.page run`, exit 1 and `{ok: false, error: {kind: 'user', code: 'PLUGIN_RPC', type: 'rpc.invalid_input', message}}`, the message one line per failing field, then `Invalid input` |
| `HANDLER_ERROR`                              | the action's own error as the page raised it, e.g. `[page.handler-error] <message>`                                                                                                                                                                                                                                                                                                                                                                                  |
| `UNKNOWN_REQUEST`                            | no page error: a dropped request's page is told to stop (a `cancel` control for that request id) and the request is gone (`command` for it answers unavailable `Page request is no longer available.`); a late result for it while the tab is attached is accepted and ignored, as the source does                                                                                                                                                                   |
| `registry.call` reaching a page tool         | gone: page tools are the plugin's; the terminal calls `conciv plugin call experimental.page run`, an agent reaches them in code mode or through the MCP hub                                                                                                                                                                                                                                                                                                          |
| `page_eval` in the hub session's MCP listing | not listed: `page_eval` asks inside the tool, so an outside agent reaches it in code mode                                                                                                                                                                                                                                                                                                                                                                            |
| a page that never answers, in `tabs.list`    | listed with the href its tab reported                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `NO_TAB` for page tools on an outside run    | no page tools: with no tab attached an outside run is offered none, as opencode's browser plugin (`plugin-browser/src/connection.ts:21-28`, `core/src/tool.ts:260, :385-388`), so a call answers `external_page_<name> is not defined` and `discover_tools` does not list it                                                                                                                                                                                         |

### Owed

- **The halt inside a queued editor fill has no test.** `fillEditor` (`src/page/page-act.ts:104-120`) types by events,
  waits one `pageTurn`, then calls `halt()` before it falls back to typing by commands. A test cannot hold the page
  between those two steps: there is one `pageTurn` and no editor wait to gate. A probe run (2026-11-15, probes
  removed) showed the order a session switch takes when it lands during the fill: `halt check` at 13350.4 ms,
  `typing` at 13350.6 ms, and the attachment saw the new routed session only at 13391.3 ms, 41 ms after the typing.
  So the halt check passes and the fill types into the session it was queued for, which is not a wrong-session write.
  The app case "a queued fill released after a session switch does not type" covers the user-visible claim instead:
  it holds the fill's `command` call by its input until the switch shows on screen, then releases it.
