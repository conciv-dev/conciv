# Page action queue: hand the page a list, keep working, get the results pushed back

Status: draft 1 (2026-11-11), for Omri's review. Owner: web-c0. Index entry in `docs/specs/conciv-mcp-hub.md`.

## Goal

An agent (the in-page agent or an outside agent through the hub) hands the page a whole list of actions in one
call: fill these six fields, tick this box, press Enter. The call answers at once with a queue id. The page then
plays the list the way the preview-branches toolbar does: the pointer glides to the first field, ripples, the
field fills, then on to the next. The agent does not wait for any of it. When the last action has played, every
outcome comes back to the agent in one result, failures included.

The user never configures how the result comes back. Each harness gets the best delivery it supports, with
fallbacks, and every path carries the same result.

## Why

- Hub spec revision 7 part 6 (Omri's yes, 2026-11-10) made every action apply and reply at once, with the pointer as
  decoration. Agents got fast, but a block of actions in one `execute_typescript` now retargets the pointer every
  page turn: `aimCursor` (`packages/extensions/page/src/client/agent-cursor.tsx:174`) replaces the agent's aim
  (`aims.set`), so the pointer heads for the last field while every field changes at once. Each replaced aim also
  leaves an `arrived` promise that never settles, with its ripple callback.
- The preview-branches toolbar (`mono/packages/preview-branches/preview-branches-toolbar/src/simulator/simulator.ts`)
  awaits each step (`MOVE_MS` 300, `AFTER_RIPPLE_MS` 100, `AFTER_CLICK_MS` 200, `AFTER_INPUT_MS` 100), so the user
  sees each action land in turn. Omri wants that look back, without making the agent wait for it.

## Decisions (Omri, 2026-11-11)

- One call queues a list of page actions and answers at once with a queue id.
- The page plays the list in order, toolbar style: move, ripple, the action lands, next.
- A failed action is skipped; the queue plays to the end.
- When the queue ends, one result goes back with every action's outcome, failures listed.
- Delivery picks the best path the harness supports, automatically, with fallbacks. No setting, no flag.

## Open for Omri

1. **Single actions outside a queue.** Part 6 stays as is (instant, pointer as decoration), or single act calls
   play toolbar style too (about 0.7 s each, the agent waits)? Recommendation: keep part 6 for single calls; while a
   queue is playing on a tab, a single act call on that tab waits behind it (see "Ordering").
2. **In-page agent whose turn ended before its queue finished.** Recommendation: the engine starts a follow-up turn
   for that session carrying the queue result, the way `plane.compact` starts a server-driven turn today
   (`packages/chat/src/index.ts:216-222`, `server.drive`). The alternative, attaching it to the next user turn, loses
   it on resumed harnesses (see "In-page agent").
3. **Queue size cap.** Recommendation: 50 actions per queue, refused above that with the cap in the message.

## The call

A new registry tool in the page extension, so it appears in the sandbox as `external_page_queue` for every caller,
in-page and outside alike (the hub adds no MCP tools of its own: revision 5).

- Defined in `packages/extensions/page/src/shared/defs.ts` next to the act defs, through `pageTool()`, category
  `act`, `mutating: true`.
- Input: `{actions: Action[]}`, where `Action` is a discriminated union on `tool` over the act defs, each reusing that
  def's own `inputSchema`: `page_click`, `page_hover`, `page_fill`, `page_select`, `page_check`, `page_uncheck`,
  `page_press`, `page_scroll`. `page_submit`, reads, edit-live and reload are not allowed in a queue. Inline JSON
  Schema only (registry rule, `packages/extension/src/tool-registry.ts:554`).
- Output: `{queueId: string, actions: number}`, returned as soon as the tab has accepted the list.
- A second tool, `external_page_queue_wait({queueId, waitMs?})`: returns the final result if the queue has finished,
  otherwise waits up to `waitMs` (default 30 s, max 120 s) and returns `{queueId, status: 'playing', done: n,
  of: m}` if it still has not. This is the fallback any harness can call.

### The result

```
{
  queueId, status: 'finished' | 'stopped' | 'lost',
  outcomes: [{index, tool, ok: true, result} | {index, tool, ok: false, error}],
  failed: number, played: number
}
```

- `finished`: every action played (some may have failed).
- `stopped`: the user two-click-stopped the mask; actions not reached are `ok: false, error: 'stopped by the user
  before this action'`.
- `lost`: the browser tab closed, navigated or switched session mid-queue; actions not confirmed are `ok: false`
  with the page-bus wording ("the page reloaded or closed during <tool>; it may already have run").
- Every result passes the same masking (`isSensitiveField`) the single tools use.

## Where the queue lives

- **The tab plays it.** One page query carries the whole list (`page_queue` client tool, `bodies.ts`). The tab
  accepts it, replies `{queueId}` at once, and plays the list from a per-tab queue in the page plane
  (`packages/page/src/index.ts`; today `servePageQueries` runs every query concurrently with `void driver.execute`,
  `:32`).
- **The engine keeps the record.** A per-session queue store in core (next to the page bus): id, the list, status,
  outcomes as they arrive, and which delivery paths are still owed the result. The tab reports each action's
  outcome as it lands (a page reply per action, keyed by `queueId` and index), so a lost tab still leaves every
  confirmed outcome on record.
- **One agent cursor per session** (agentId is the session id, `core-runtime.ts:78`), so one queue plays at a time per
  session; a second `page_queue` on a busy session is appended to the same play order and gets its own id.

## Playing an action

- Each action runs its existing body (`fill`, `simulateClick`, `select`, `setChecked`, `press`, scroll) unchanged,
  but awaits the pointer the way the toolbar does: move (`MOVE_MS` 300), ripple (`AFTER_RIPPLE_MS` 100), the action,
  then `AFTER_CLICK_MS` 200 or `AFTER_INPUT_MS` 100. These constants come back into `simulator.ts` for the queue
  path only; single calls keep part 6 unless Omri decides otherwise (open item 1).
- The action lands when the pointer arrives, not before: the field fills after the ripple, as in the toolbar.
- `arrived` must always settle. Today it can hang: `aims.set` replaces an aim without resolving it, `dropCursor`
  deletes one, `glide` returns early when the point is not visible, and `requestAnimationFrame` does not run in a
  hidden tab. Fix in `agent-cursor.tsx`: a replaced or dropped aim resolves; an invisible point, a hidden tab
  (`document.visibilityState`) or reduced motion resolves at once; nothing is left pending. This also removes the
  leak described in "Why".
- Each action is wrapped on its own: a throw or a refusal string becomes `ok: false` with that message, and the
  queue moves on. No action can stop the queue except the user's two-click stop or losing the tab.
- The mask and glow stay up while a queue plays and `touchTask` runs per action, so the 60 s idle timeout never
  ends a playing queue. `endRun` (in-page run ended) does not hide the mask while that session still has a queue
  playing.

## Ordering

- While a queue plays on a tab, every act call for that session (single or queued) waits its turn behind it. Reads
  (snapshot, value, locate, screenshot) run at once, as today.
- A single act call that waits behind a queue gets the page-bus timeout extended by the queue's remaining budget,
  so it does not time out while waiting its turn (`page-bus.ts:201-202`, `input.timeout + 1000` rule).

## Delivery: best path per harness, automatic

The same result object goes down every path that applies. A path that has delivered it is marked done in the queue
store; a result is never delivered twice down the same path.

1. **MCP tasks (Claude Code CLI, Agent SDK).** When the outside client negotiated MCP protocol revision 2026-07-28
   with the tasks extension, an `execute_typescript` call whose script returns a queue handle (the value of
   `external_page_queue`) is answered by the hub as a task (`resultType: 'task'`, `taskId`, `status: 'working'`,
   `pollIntervalMs`). Claude Code polls `tasks/get`; the hub answers from `external_page_queue_wait`. On `completed`
   the model receives the queue result as that tool's result and, if idle, picks it up unprompted. The hub decides
   per connection from the negotiated capabilities; nothing to configure.
   - Risk to check first: the hub serves MCP through `@tanstack/ai-mcp/server` (`packages/cli/src/hub.ts:5`). If it
     cannot negotiate 2026-07-28 or answer `tools/call` with a task, the hub needs the raw
     `@modelcontextprotocol/sdk` (already in the catalog, `^1.32.2`) for that part. The implementer confirms which
     before building, and reports it.
   - Not available: Claude Code desktop app and VS Code panel, subagents, `-p` runs. They fall through to 2.
2. **Next reply (every MCP client).** Any later hub reply for that session carries the finished queues it has not
   delivered yet, as one leading text part: `queue <id> finished: 8 played, 2 failed` plus the result JSON. Added
   where the engine builds replies (`packages/core/src/api/mcp.ts`, `successReply`/`errorReply`), so it reaches
   in-page and outside callers through the same code mode reply. Covers Codex, opencode, Gemini CLI, desktop, VS Code.
3. **Wait tool (every caller).** `external_page_queue_wait` for an agent that wants the answer now. Its guidance
   (`meta.hint`) tells the agent results also arrive on their own, so polling is a choice, not a duty.
4. **In-page agent.** A finished queue is published to the session's chat as a `conciv.page-queue` event
   (`defineChatEvent`, `packages/protocol/src/chat-event-types.ts`) and recorded (`scope.run.record`), so the widget
   shows it as a card under the call that queued it. If the agent's turn is still running, path 2 hands it the result
   on its next tool call. If the turn has ended, open item 2 decides (recommendation: a server-driven follow-up turn).
   Attaching it to the next user turn alone does not work for resumed harnesses: `providerMessages` sends only from
   the last user message on (`packages/chat/src/turn.ts:134-141`).

Channels (Claude Code research preview, `--dangerously-load-development-channels`) are not used: preview only, opt-in
per launch, and they break on protocol revision 2026-07-28, which path 1 needs.

## Not in this change

- Reads inside a queue (snapshot or value between actions). An agent that needs to look between actions uses
  single calls.
- Undoing a queue.
- Serving queues for a session the widget is not showing (same limit as single page calls).

## Tests (existing files only, a new `describe` in each; no mocks; no timing asserts or sleeps)

- `packages/extensions/page/test/page.browser.test.tsx`, describe "page action queue":
  - a queue of fill, check and press plays in order: each field changes only after the previous one changed (observe
    the page's own input events in order, not timings);
  - a queue with a missing target and a read-only field in the middle plays to the end; the result lists both
    failures with their messages and every other action `ok`;
  - the result masks a `cc-number` field;
  - two clicks on the mask mid-queue: status `stopped`, actions not reached say so, nothing after the stop changed;
  - in a hidden tab and under reduced motion the queue still finishes (the `arrived` fix);
  - a single act call sent while a queue plays lands after the queue's last action.
- `packages/core/test/core-api.it.test.ts`, describe "page action queue delivery":
  - `external_page_queue` answers with a queue id before the tab has played anything;
  - the next reply for that session carries the finished result once, and the reply after does not;
  - `external_page_queue_wait` returns the result; with a short `waitMs` on a playing queue it returns `playing` with
    progress;
  - the tab closes mid-queue: status `lost`, confirmed outcomes kept, the rest `ok: false`;
  - the in-page path publishes one `conciv.page-queue` event and records it.
- `packages/cli` hub test file, describe "queue as an MCP task": a client that negotiates 2026-07-28 with tasks gets a
  task for a queue-returning `execute_typescript`, `tasks/get` reports `working` then `completed` with the result; a
  client on the older revision gets the plain reply and the result on its next call.

## Acceptance (Fable runs these live before calling it done)

- In the tanstack-start example, Claude Code CLI through the hub: queue six fills and a submit-free press on the form
  page. The call returns at once; the pointer visits each field in order; Claude gets the result unprompted when it
  ends.
- The same from a client without tasks (desktop or Codex): the result arrives on the next call and through the wait
  tool.
- The in-page agent queues the same list from the widget chat and gets the result in the conversation.
- A queue with two bad targets reports exactly those two and plays the rest.

## Changeset

`@conciv/extension-page`, `@conciv/core`, `@conciv/cli`, `@conciv/protocol`: patch. "Agents can queue a list of page
actions in one call; the page plays them in order with the pointer and the results come back when the list is done."
