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

A queue the terminal starts keeps that it was started there (`plugin-page/src/queue.ts` `startedBy`): `queue.owed`
never offers or claims it, `queue.undelivered` returns it only when its id is asked for by name, so its finish starts
no follow-up turn in the chat; `queue.wait` still delivers its result.

### Owed

- **The halt inside a queued editor fill has no test.** `fillEditor` (`src/page/page-act.ts:104-120`) types by events,
  waits one `pageTurn`, then calls `halt()` before it falls back to typing by commands. A test cannot hold the page
  between those two steps: there is one `pageTurn` and no editor wait to gate. A probe run (2026-11-15, probes
  removed) showed the order a session switch takes when it lands during the fill: `halt check` at 13350.4 ms,
  `typing` at 13350.6 ms, and the attachment saw the new routed session only at 13391.3 ms, 41 ms after the typing.
  So the halt check passes and the fill types into the session it was queued for, which is not a wrong-session write.
  The app case "a queued fill released after a session switch does not type" covers the user-visible claim instead:
  it holds the fill's `command` call by its input until the switch shows on screen, then releases it.
