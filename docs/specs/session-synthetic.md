# session.synthetic in the engine

Status: design, no code. This is PR 1 of `docs/specs/page-plugin-out-of-core.md` (section 4 ruling 2, section 5 PR 1,
section 7.1). Conciv was read on `test/plugin-testkit-mounts`; opencode in `_ref/opencode/packages` (shortened to
`oc/` below).

Rule for every line: as opencode. Where conciv cannot do exactly what opencode does, the point is marked **OPEN**, with
my pick first.

## 1. What opencode does

### 1.1 `synthetic` itself

`oc/core/src/session/synthetic.ts` (49 lines) is not a service. `make(store, inbox, wake)` returns
`Effect.fn('Session.synthetic')(..., Effect.uninterruptible)`. Step by step:

1. The input is `{sessionID, id?, text, description?, metadata?, delivery?, resume?}` (:15-23).
2. The session must exist, or it fails with `NotFoundError({sessionID})` (:25-28).
3. `id` is `input.id`, or a new message id (:29). The inbox item's id is the id of the message it becomes.
4. Admit: `inbox.admit({id, sessionID, item: {type: 'synthetic', delivery: input.delivery ?? 'steer', payload:
   {text, description, metadata}}})` (:30-43). The default delivery is `steer`.
5. `SessionInbox.LifecycleConflict` becomes `SyntheticConflictError({sessionID, inputID: id})`
   (:44-46, `error.ts:67-73`).
6. Wake unless `resume === false` or the session has a staged revert (:47). The session is read again here.
7. It returns the admitted item, `SessionInbox.Synthetic` (:48).

Where it is wired:

- `oc/core/src/session/session.ts:283-285` is `SessionSynthetic.make(store, admission, execution.wake)`.
- The public member is at `oc/core/src/session.ts:248-250` and :545.

### 1.2 The inbox

Schemas, in `oc/schema/src/session-inbox.ts`:

- `Delivery = 'steer' | 'queue'` (:11).
- `SyntheticPayload = {text, description?, metadata?}` (:28-32).
- The item types are `user`, `synthetic`, `compaction` and `move` (:44-56).
- `Info` is the item plus `{id, sessionID, time: {created}}` (:59-91).

The service is `oc/core/src/session/inbox.ts`, `Service` `@opencode/SessionInbox` (:169), with deps Database and Bus.

- `admit` (:191-224) first calls `reconcile` (:177-189):
  - If the id is already a pending row with the same session and type, it returns that row.
  - If the id is already a delivered message, it rebuilds the item from that message (`promotedFromMessage`
    :125-165).
  - So the first admission wins and a retry with another payload gets the first one back. The test is
    `session-prompt.test.ts:1387`.
  - Otherwise it publishes the durable event `session.inbox.enqueued` (`oc/schema/src/session-event.ts:220`).
- Its projector (`projectAdmitted` :299-345) inserts the row.
- `LifecycleConflict` (:75-77) is raised when the id already belongs to another session or type, or to a message that
  is not this session's user or synthetic message.
- `has(db, sid, 'input' | 'steer' | 'queue')` (:500-520) and `nextPromotable` (:470-480) are reads.
- `promote` (:567-589):
  - It publishes `session.inbox.delivered` (:213) for every waiting steer.
  - When there is no steer, it publishes it for exactly one queued item, plus the steers behind it.
  - `projectDelivered` (:352-364) deletes the row, and the same event inserts the message.
- The table holds only waiting items. There is no status column.
- `cancel`, `steer` and `queue` change or drop a waiting item (:252-282).

Storage: the table `session_inbox` (`oc/core/src/session/sql.ts:130-152`) has the columns:

- `id` (primary key)
- `session_id` (cascades on session delete)
- `type`
- `payload` (json)
- `delivery`
- `enqueued_seq`
- `time_created`

It has two indexes: (session, delivery, seq), and a unique (session, seq). Migration
`oc/core/src/database/migration/20260812181746_session_inbox.ts`.

The delivered message (`projector.ts:1008-1035`):

- It is a whole message of type `synthetic`: `{id, text, description, metadata, time}`
  (`oc/schema/src/session-message.ts:95-100`).
- The model sees it as a plain user message holding only the text (`runner/to-llm-message.ts:274-275`). The
  description and metadata are not sent (`session-instructions.test.ts:364`).

### 1.3 Wake and delivery

`wake` is `SessionRunCoordinator.wake` (`run-coordinator.ts:135-144`):

- If the session is idle, it starts a drain.
- If the session is running, it sets `pendingWake`, and the loop drains again when the current run ends (:73-84).

The runner (`runner/llm.ts`) works step by step:

- It calls `nextPromotable` before every model step (:94-117).
- A steer joins the running execution: after a tool step, waiting steers become messages before the next model
  request (:192-199). The step allowance resets (:206).
- A queued item waits until the turn ends. Then one queued item is promoted and a new turn starts (:118-121).
- `experimental.idle` runs only when nothing is waiting (:177-189).
- After the hook, `has(db, sid, 'input')` decides whether the same execution goes on (:188). That is how a hook's own
  `synthetic` with `resume: false` still runs (test `session-runner.test.ts:1241`).

Stop and restart:

- Stop: `interrupt` clears `pendingWake` and leaves the rows (`run-coordinator.ts:146-166`). Waiting items stay until
  the next wake (tests `session-runner.test.ts:4739`, 4766).
- Engine restart: the rows simply persist. There is no inbox sweep (`execution/restart.ts`).
- Session delete: the cascade removes the waiting rows (`sql.ts:134-137`).

### 1.4 SDK and UI

The SDK:

- `SessionDomain` picks `synthetic` (`oc/plugin/src/effect/session.ts:220-241`; promise flavour
  `oc/plugin/src/promise/session.ts:221-240`).
- Its type is in `oc/client/src/effect/api/api.ts:237-249`:
  `{sessionID, id?, text, description?, metadata?, delivery?, resume?}`, returning `SessionInbox.Synthetic`.
- The promise adapter is `adaptApiMethod(SessionEndpoints['session.synthetic'], host.session.synthetic)`
  (`oc/plugin/src/promise/adapter.ts:644`).

The UI, `oc/session-ui/src/timeline-next`:

- A synthetic message is a notice when its `metadata.source` is `subagent`, or it has a non-empty `description`, or a
  notice is required (`projection.ts:964-972`).
- The row label is `description ?? text`, except for the subagent, shell and restart labels (`row.tsx:633-661`).
- Placement is by `metadata.source`, through `noticePlacement` (`rules.ts:211-221`).

## 2. What conciv has today

The SDK types are already declared, in opencode's shape with conciv's `sessionId`:

- `packages/plugin/src/client/promise/generated/types.ts`:
  - `SessionInboxDelivery` (:92)
  - `SessionInboxSynthetic` (:193-200)
  - `SessionSyntheticInput` (:225-233)
- `effect/session.ts:104` and `promise/session.ts:160-163` declare `synthetic: undefined`.
- `promise/adapter.ts:436` sets `synthetic: undefined`.
- `plugin-host/src/core/plugin/host.ts:209` sets `synthetic: undefined`.
- The host `Session.Interface` (`plugin-host/src/core/session.ts:31-54`) has no `synthetic`.
- The durable bus event `session.synthetic` exists (`plugin/src/schema/session-event.ts:110-119`).

Other facts:

- There is no inbox. `core/src/runtime/plugin-sessions.ts:265` is the `compact` member returning a stub with
  `delivery: undefined`.
- User messages are queued in the widget only (TanStack `ChatClient` `whenBusy`). The server has no queue.
- A run starts with `send` (the user's turn) or `drive` (`chat/src/index.ts:153-165` for the page follow-up, :202 for
  compact).
- Any new run ends the live run on the same thread (the `conciv-steer` middleware, `ai/src/server/chat-server.ts:742-745`).
- The harness is an outside CLI (Claude Code, Codex, Gemini). Conciv does not own the step loop, so it cannot put a
  message between two model steps of a running turn.
- Messages are TanStack `ModelMessage` rows in `chat_messages` (`db/src/run-schema.ts:29-42`), each with a
  `messageId`.
  - `saveThread` rewrites the whole thread (`ai/src/server/chat-stores.ts:160-181`).
  - The roles are user, assistant and tool.
  - The only conciv tags are `metadata.conciv.compaction` and `metadata.conciv.origin`
    (`protocol/src/chat-message-types.ts:37-41`).
- Plugin-host already has durable bus events with projectors (`bus.project`, `plugin-host/src/core/session/projector.ts`)
  and a drizzle `Database` service. Tables and migrations live in `packages/db` (drizzle-kit `generate`, then
  `pnpm gen-migrations`; latest `20261119205922_drop_legacy_runs`).
- `experimental.idle` fires in `core/src/app.ts:515-548` (`onRunEnd`), only for a completed run with no owed page
  follow-up.
- The widget routes rows by role (`ui-kit-chat/src/primitives/thread/thread.tsx:100-110`). It has a `SystemMessage`
  slot that the styled thread leaves empty (`styled/thread.tsx:594`), and splits turns by metadata
  (`store/grouping.ts:44-71`).

## 3. What is ported, and where it lands

| opencode                                                                                                                                                                   | conciv                                                                                                                                                                                                                               | Notes                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `oc/schema/src/session-inbox.ts`: `Delivery`, `SyntheticPayload`, the `synthetic` item, `Info`/`Synthetic`                                                                 | `packages/plugin/src/schema/session-inbox.ts` (new)                                                                                                                                                                                  | The generated promise types (`types.ts:92`, 193-200) already match it. **OPEN 1.**                                                       |
| `oc/schema/src/session-event.ts:208-228`: `InboxEnqueued` (`session.inbox.enqueued`), `InboxDelivered` (`session.inbox.delivered`)                                         | `packages/plugin/src/schema/session-event.ts`, beside `Synthetic`                                                                                                                                                                    | Durable events, as opencode.                                                                                                             |
| `oc/core/src/session/inbox.ts`: `SessionInbox` with `admit`, `reconcile`, `has`, `nextPromotable`, `promote`, `list`, and projectors `projectAdmitted`, `projectDelivered` | `packages/plugin-host/src/core/session/inbox.ts` (new), projectors added in `plugin-host/src/core/session/projector.ts`                                                                                                              | `cancel`, `steer` and `queue` are left out (**OPEN 1**).                                                                                 |
| `oc/core/src/session/synthetic.ts`                                                                                                                                         | `packages/plugin-host/src/core/session/synthetic.ts` (new)                                                                                                                                                                           | Same 49 lines. Store = conciv's session read; wake = the chat plane wake (section 4). The revert check is dropped: conciv has no revert. |
| `oc/core/src/session/error.ts:67-73` `SyntheticConflictError`, `NotFoundError`                                                                                             | Conciv's existing `NotFoundError` (`plugin-sessions.ts:152-157`); `SyntheticConflictError` added as a `Schema.TaggedStruct` beside the session errors in plugin-host                                                                 |                                                                                                                                          |
| `session_inbox` table (`oc/core/src/session/sql.ts:130-152`)                                                                                                               | `packages/db/src/schema.ts` `sessionInbox`, same columns, `session_id` referencing conciv's `sessions` table (opencode's points at `session_v2`), one new drizzle migration                                                          | **OPEN 2** (delete).                                                                                                                     |
| Delivered `synthetic` message (`session-message.ts:95-100`)                                                                                                                | A `user` `ModelMessage` in `chat_messages` whose `messageId` is the synthetic id, text content, with `metadata.conciv.synthetic = {description?, metadata?}`                                                                         | **OPEN 3.**                                                                                                                              |
| `to-llm-message.ts:274-275` (the model gets role user, text only)                                                                                                          | Holds as is: the stored message is role user with the text. The conciv tag is metadata, which the harness does not send.                                                                                                             |                                                                                                                                          |
| `SessionDomain.synthetic` type (`oc/client/src/effect/api/api.ts:237-249`)                                                                                                 | `packages/plugin/src/effect/session.ts:104` and `promise/session.ts:160-163`: `(input: SessionSyntheticInput) => Effect<SessionInboxSynthetic, ...>` and the promise twin, with the `undefined` and "Not implemented" remark removed | Field names are as conciv's generated types (`sessionId`).                                                                               |
| `adaptApiMethod(..., host.session.synthetic)` (`adapter.ts:644`)                                                                                                           | `promise/adapter.ts:436`: `adaptMethod(SessionSyntheticSchemas, host.session.synthetic)`, with `SessionSyntheticSchemas` built like `SessionCompactSchemas` (:91)                                                                    |                                                                                                                                          |
| `session.ts:283-285` wiring                                                                                                                                                | `plugin-host/src/core/session.ts` gains `synthetic` in `Interface`; `host.ts:209` passes it; `core/src/runtime/plugin-sessions.ts` implements it with `SessionSynthetic.make(store, inbox, wake)`                                    |                                                                                                                                          |
| The runner's promote points (`llm.ts:94-121`, 177-199)                                                                                                                     | The chat plane, `packages/chat/src` (section 4)                                                                                                                                                                                      | **OPEN 4, 5.**                                                                                                                           |

## 4. Mapping onto the chat plane

Conciv runs a whole turn inside an outside CLI. So "a step" in opencode becomes "a run" here.

**Wake.** The engine's `wake(sessionId)`:

- If the session has no live run (`plane.live`), it promotes and starts a run.
- If a run is live, it does nothing now. The run end checks the inbox (below), which plays the part of opencode's
  `pendingWake`. The rows are durable, so nothing is kept in memory.

**Promote.** At the start of every run, `send` and `drive` alike:

- It takes the waiting items in order, as `promote` does: every waiting steer, or else one queued item plus the
  steers behind it.
- It publishes `session.inbox.delivered` for each item. The projector deletes the row and appends the message to the
  stored thread, ahead of the user's new message. Admission order decides the position.
- **OPEN 5:** how this joins `send`, which carries the client's own message list.

**Start a run for a wake with no user message.** `server.drive({threadId, runId, kind: 'chat'}, [])` on the stored
thread, whose last message is now the promoted synthetic one. This is the same call `driveFollowUp` makes today, with
the existing `chat` kind. No new turn kind is added. The `'page-queue'` kind is deleted in PR 2.

**Run end** (`app.ts` `onRunEnd`):

- After a completed run, if `inbox.has(sessionId, 'input')`, it wakes, and `experimental.idle` does not run.
- Otherwise idle runs. After the hook, it checks `has` again and wakes if the hook admitted something. That is
  opencode's :188, so a hook's own `synthetic` with `resume: false` still runs, as `session-runner.test.ts:1241`
  requires.
- PR 2 then deletes `owedFollowUp` and `holdForNextReply`.

**`steer` versus `queue`.**

- `steer` waits for the live run to end, then all waiting steers go into one new run.
- `queue` items go one per run, oldest first.
- See **OPEN 4.**

**`resume: false`.** The item is admitted with no wake. It goes into the next run, whoever starts it: the user's next
message, or another wake.

**Stop.** A stopped run (`aborted`) leaves the rows and does not wake, as opencode's interrupt does. Waiting items go
in with the next run.

**Engine restart.** The rows are in the db, and nothing sweeps them. The next run of that session delivers them.

**Delete.** `found` already refuses a tombstoned session (`NotFoundError`). Conciv tombstones instead of deleting the
row, so the cascade never fires. `deleteSession` (`core/src/sessions/session-actions.ts:77-108`) therefore deletes the
session's inbox rows, as it deletes its draft (**OPEN 2**).

**Same `id` twice.** `reconcile` finds the waiting row, or finds the delivered message by `messageId`, and returns it.
One notice is stored.

**`Effect.uninterruptible`** is kept.

## 5. What the widget draws

As opencode, the delivered synthetic message is a notice row with the label `description ?? text`
(`oc/session-ui/src/timeline-next/row.tsx:633-661`).

- The thread routes a user message carrying `metadata.conciv.synthetic` to that row, not to `UserTurn`. That is the
  same kind of routing by metadata that `store/grouping.ts:44-71` already does for compaction.
- The row is drawn from the existing divider and notice parts in `apps/conciv/src/pane/indicators.tsx`. No new
  registry.
- Which synthetics show: only those with a non-empty `description` (OPEN 6, decided in section 10).

How an open widget learns of a notice (OPEN 7, ruled 2026-11-21, as opencode):

- opencode's client learns the content from `session.inbox.enqueued` (`oc/schema/src/session-event.ts:220-228`,
  payload `{sessionID, inboxID, item}`). It adds the row as soon as the item is admitted, while it waits
  (`oc/client/src/solid/data.ts:943-952`; `admitLocal` and `materializeInboxMessage`, :482-507).
- On `session.inbox.delivered` (`{sessionID, inboxID}` only, `session-event.ts:208-216`), it drops the pending entry
  and moves that row, with the delivery time (`data.ts:919-933`). It never re-reads history, and it ignores an id it
  never saw.
- Conciv carries both events in their ported shapes, as CUSTOM chunks with zod schemas in protocol, the way
  `conciv.tool-time` is carried (`protocol/src/chat-event-types.ts:23-49`).
- They travel on the session stream `chat.events` (`core/src/runtime/core-runtime.ts:58`; client
  `client/src/chat-connection.ts:337-366`), not on a run's stream.
- So a waiting notice shows in an open widget before it is delivered, as in opencode. The description rule above still
  applies.
- A widget opened later reads the waiting items with `SessionInbox.list`. It comes back for this caller, as opencode's
  `session.inbox.list` (`data.ts:1639`).
- Delivery order: conciv's own user message is not an inbox item. On the send path, the delivered row moves to sit
  before the widget's last user message, not to the end. This is the order opencode reaches by delivering the notices
  before the prompt.

## 6. How it fits services plan B

Plan B is in the inbox at `100500-plugins-t.md` and is not approved.

What PR 1 needs from it:

- `SessionInbox` is a `Context.Service` plus `Layer.effect` over the plugin-host `Database.Service` and `Bus.Service`,
  merged into `pluginHostLayer`. That is the shape plan B uses, and the shape `Database` and `KV` already have, so
  PR 1 does not wait for B.

What PR 1 does not need from it:

- `SessionStore`. The existence check uses today's `found` in `plugin-sessions.ts` (rowById over `Effect.promise`).
- The db as a layer. The `session_inbox` table is created by the `packages/db` migration that `openDb` runs today;
  plugin-host's `Database` instance reads the same file.
- When B lands, `found` becomes `SessionStore.get`, and nothing else in PR 1 changes.

## 7. Files

New:

- `packages/plugin/src/schema/session-inbox.ts`
- `packages/plugin-host/src/core/session/inbox.ts`
- `packages/plugin-host/src/core/session/synthetic.ts`
- `packages/db/drizzle/<timestamp>_session_inbox/` (generated) and `packages/db/src/migrations.gen.ts`
  (regenerated)

Changed:

- `packages/plugin/src/schema/session-event.ts`
- `packages/plugin/src/effect/session.ts`
- `packages/plugin/src/promise/session.ts`
- `packages/plugin/src/promise/adapter.ts`
- `packages/plugin/src/README.md` (:274, :391)
- `packages/plugin-host/src/core/session.ts`
- `packages/plugin-host/src/core/plugin/host.ts`
- `packages/plugin-host/src/core/session/projector.ts`
- `packages/db/src/schema.ts`
- `packages/core/src/runtime/plugin-sessions.ts`
- `packages/core/src/sessions/session-actions.ts`
- `packages/core/src/app.ts` (`onRunEnd`)
- `packages/chat/src/index.ts` (wake, promote at run start)
- `packages/ai/src/server/chat-stores.ts` (only if OPEN 5 needs it)
- `packages/ui-kit-chat/src/primitives/thread/thread.tsx` and `styled/thread.tsx`
- `apps/conciv/src/pane/chat-pane.tsx` (the notice row)
- one changeset

## 8. Tests

Node tests use `createEngine` from `@conciv/plugin-testkit`. The app case uses `@conciv/plugin-testkit/browser`
`mount` in browser mode (main deleted the happy-dom layer at 83c6c3181). Each test has a small plugin folder under
test. A tool of that plugin calls `ctx.session.synthetic`, and `engine.requests()` shows whether a turn ran and what
the model received.

Each opencode test named is the one the case copies.

Node, `packages/plugin-host/src/core/session/synthetic.test.ts`:

1. A notice wakes an idle session and a turn runs. The next scripted reply is used, and the model's last user message
   is the notice text. Copies `session-runner.test.ts:5325`.
2. With `resume: false`, no turn starts. The notice goes in with the user's next message, ahead of it.
   `session-runner.test.ts:1241`.
3. A notice admitted while a run is live starts one run after it ends. `session-runner.test.ts:1505`.
4. A stopped run keeps a waiting notice, and the next run delivers it. `session-runner.test.ts:4739`.
5. The same `id` twice stores one notice, and the second call returns the first payload. `session-prompt.test.ts:1387`.
6. A deleted session refuses it with `NotFoundError`. Its waiting rows are gone after delete.
7. `experimental.idle` does not run while a notice waits. A hook's own `synthetic` with `resume: false` still runs a
   turn. `session-runner.test.ts:1281`, 1241.
8. Queued items go one per run, oldest first; steers go together. `session-runner.test.ts:4793`, 4879.
9. The model gets the text only, never description or metadata. `session-instructions.test.ts:364`.

Browser, in the app: 10. A delivered notice shows as its own row with `description ?? text`, not as a user bubble,
and a notice with no description shows no row (section 10, decision 6). The thread code is ui-kit-chat, a package the
app is made of, and the ruling of 2026-11-20 (as opencode; `docs/specs/test-rewrite-after-port.md` at 2ff22de0e,
AGENTS.md Testing) says such a package never mounts the app. The case mounts the whole app on a `createEngine` with a
small plugin of the app's own fixtures, so it lives in the app's thread browser file,
`apps/conciv/src/pane.browser.test.tsx`, as the first step of the notice journey that
`docs/specs/page-plugin-out-of-core.md` section 5 shares with the page queue and outside-call notices (one journey,
not three tests). Main has no happy-dom project any more, so the case runs in browser mode. If the notice row is a
ui-kit-chat component, its states are a story in ui-kit-chat, without the kit.

**OPEN 8:** answered by the kit on main: `engine.requests()` returns every request the scripted harness received
(`packages/harness-testkit/src/scripted-harness.ts`, `recorded`), so cases 1 and 9 read the model's input there. No new
kit API.

## 9. OPEN points

Each lists my pick first, then the alternative.

1. **Item types and inbox ops.**
   - Pick: port only the `synthetic` item and the ops PR 1 uses (`admit`, `reconcile`, `has`, `nextPromotable`,
     `promote`, `list`). Conciv queues user messages in the widget and compacts directly, so `user`, `compaction`,
     `move`, `cancel`, `steer` and `queue` have no caller, and nothing is ported without one.
   - Alternative: port the whole schema now.
2. **Delete.**
   - Pick: `deleteSession` deletes the session's inbox rows, because a tombstone does not cascade. The FK is kept
     anyway.
   - Alternative: rely on the tombstone and filter tombstoned sessions in `has` and `promote`.
3. **The stored message.**
   - Pick: a role `user` `ModelMessage` with `messageId` = the synthetic id and `metadata.conciv.synthetic =
     {description?, metadata?}`, beside the existing `metadata.conciv` tags. Conciv messages have no `type` field; the
     tag carries opencode's `type: 'synthetic'`.
   - Alternative: a new role or column in `chat_messages`, which TanStack's `ModelMessage` does not have.
4. **Steer cannot join a running turn.**
   - Pick: steer waits for the live run to end, then all steers go into one new run, without interrupting. This keeps
     opencode's "never interrupts" and its "all steers together, queued one at a time".
   - Alternative: steer ends the live run at once (conciv's own Steer button does that), which opencode's synthetic
     never does.
5. **Joining `send`.**
   - Pick: promotion happens on the server at run start for `send` too. The promoted messages go into the stored
     thread before the user's new message, and `send` merges the client's list with the stored thread so a promoted
     notice is never dropped. The writer checks `saveThread` and the `send` path first and reports if they need
     `chat-stores.ts` changes.
   - Alternative: promote only on `drive` wakes, which loses `resume: false` notices whenever the user sends.
6. **Which synthetics show.**
   - Pick: every delivered synthetic shows as a notice row in PR 1, because conciv has no settings for notice
     placement (`detail.notices.placement`).
   - Alternative: opencode's `isNotice` filter (subagent source, or a non-empty description), with the rest hidden.
7. **Reaching an open widget.** RULED 2026-11-21, as opencode: see section 5.
   - The first pick (the run that delivers the notice carries it) left a notice delivered on the widget's own send
     unseen until reload, because the widget skips refreshing for its own run.
   - Instead, opencode's two inbox events, `session.inbox.enqueued` and `session.inbox.delivered`, are carried on the
     session stream, and `list` comes back for a widget opened later.
8. **Reading the model's input in tests.**
   - Pick: the scripted harness already gets the request, so a test reads it from there if the kit exposes it.
   - Alternative: the scripted reply matches the expected text.
   - Adding a kit read is new testkit API and goes to the maintainer first.

## 10. Orchestrator review, 2026-11-20

Decided under the maintainer's "rule without me, stay as opencode"; the maintainer sees this list before code starts.

- 1: the pick. Nothing is ported without a caller.
- 2: the pick.
- 3: the pick. TanStack's `ModelMessage` has no message type, so the tag carries it.
- 4: the pick. It is the one real difference from opencode and it cannot be closed: the turn runs inside an outside
  CLI. A synthetic never interrupts a run, as opencode.
- 5: the pick.
- 6: the alternative, because it is exactly opencode: a delivered synthetic shows as a notice only when it has a
  non-empty `description` (opencode's `isNotice`, without its subagent case, which conciv does not have). The page
  plugin and the outside-call notices pass a description.
- 7: the pick.
- 8: no new kit API in PR 1. What `replies` and the kit expose is decided in `docs/specs/kit-replies.md`; until then
  tests 1 and 9 assert through the stored thread.
