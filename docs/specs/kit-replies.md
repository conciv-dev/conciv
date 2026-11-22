# Kit replies: opencode's test model shapes

Status: design, 2026-11-20. No code yet. Ruling A: the `replies` option of `createEngine` and `createHarnessEngine`
takes the reply shapes of opencode's test model (`docs/specs/test-rewrite-after-port.md`, "The kits"). Anything that
cannot be exactly opencode is marked **OPEN**, with my pick first.

## 1. What opencode has

Source: `_ref/opencode/packages/ai/src/testing.ts` (218 lines, read in full), exported as `TestLLM`
(`export * as TestLLM from "./testing.js"`, line 1).

### The reply type

```ts
export type Response =
  | readonly LLMEvent[]
  | Stream.Stream<LLMEvent, AIError>
  | CompactionResponse
  | CompactionCheckpointResponse

export type Gate = Readonly<{started: Effect.Effect<void>; release: Effect.Effect<void>}>

export type Responder = (request: LLMRequest) => Response
```

### The helpers that build a `Response`

| helper                                                     | what it returns                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `complete({reason, usage?, providerMetadata?}, ...events)` | `stepStart`, the events, `stepFinish`, then `finish`                                                             |
| `stop(...events)`                                          | `complete` with reason `stop`                                                                                    |
| `toolCalls(...events)`                                     | `complete` with reason `tool-calls`                                                                              |
| `text(value, id)`                                          | `stop` around `textStart`, `textDelta` and `textEnd` for that id                                                 |
| `textWithUsage(value, id, inputTokens)`                    | `text` that also reports input tokens                                                                            |
| `toolCall(id, name, input)`                                | `toolCalls` around one `toolCall({id, name, input})` event                                                       |
| `failAfter(error, ...events)`                              | a `Stream` of the events, then `Stream.fail(error)`: the reply fails part-way                                    |
| `hangAfter(...events)`                                     | a `Stream` of the events, then `Stream.never`: the reply never ends, so the turn stays running until interrupted |

### The controls on the `TestLLM.Test` service

These sit next to the client.

| control              | what it does                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `push(...responses)` | queues one-shot replies, one per model request, in order                                                                                                                   |
| `always(response)`   | sets the fallback used once the queue is empty                                                                                                                             |
| `serve(responder)`   | sets a fallback that is a function of the request                                                                                                                          |
| `wait(count)`        | waits until `count` requests have arrived                                                                                                                                  |
| `requests()`         | a snapshot of the requests seen so far                                                                                                                                     |
| `gate()`             | the held reply, in the test's scope. The next request offers `started` and then waits on `release` before its reply is returned. `release` also runs when the scope closes |

`testLayer({fallback?, transformRequest?})` builds the service. With no `fallback`, a request beyond the queue dies with
`TestLLM has no response for request N` (lines 175-176).

### How opencode's tests use it

`core/test/session-runner.test.ts`:

- **Text reply:** `s.llm.push(TestLLM.text("Done", "text-done"))` (lines 1212, 1233).
- **Tool turn:** two replies, the call and then the answer after the tool ran:
  `s.llm.push(TestLLM.toolCall("call-echo", "echo", { text: "hello" }), TestLLM.text("Done", "text-done"))`
  (line 1286). An empty `[]` is the follow-up when no answer is needed (1146, 1186).
- **Fails part-way:** `s.llm.push(TestLLM.failAfter(failure, ...fixture.partialEvents))`. The test then expects the
  run to fail with that error and the partial content to be kept (lines 961-976).
- **Never ends, then interrupted:**
  `s.llm.push(TestLLM.hangAfter(LLMEvent.stepStart({index: 0}), LLMEvent.toolCall({...})))`. The test waits for the
  tool to start, calls `s.session.interrupt(sessionID)`, and expects the step to be recorded `aborted`
  (lines 5795-5825).
- **Held reply:** `const stream = yield* s.llm.gate()`, start the run, `yield* stream.started`, do something while the
  model request is held, then `yield* stream.release` (lines 1377-1392). `resumePaused` wraps the same pattern
  (lines 626-631).

## 2. Our type of the `replies` option

The shapes are copied from opencode, with two changes forced by our engine:

- Our harness speaks `@tanstack/ai` stream chunks (`ChatEvent`, `packages/protocol/src/chat-event-types.ts:6`), not
  opencode's `LLMEvent`. There is no `LLMEvent` in this repo.
- Our engine's test API is promise-based (`engine.session.send` returns a `Promise`), not an Effect service.

```ts
export type Response = readonly ChatEvent[] | Stream.Stream<ChatEvent, Error>

export type Gate = Readonly<{started: Promise<void>; release: () => Promise<void>}>

replies?: readonly Response[]
```

**OPEN 1, the event type.**

- Pick: `ChatEvent`, the adapter's own output. The helpers below build the same shapes opencode's do.
- Or: copy opencode's `LLMEvent` schema into the kit and map it to `ChatEvent` inside the harness. That is a second
  event model kept only for tests.

**OPEN 2, the error type.**

- Pick: `Error`, in place of opencode's `AIError`, which conciv does not have.

**OPEN 3, the compaction replies.** `CompactionResponse` and `CompactionCheckpointResponse` are not carried: the
scripted harness declares `compaction: false` (`packages/harness-testkit/src/scripted-harness.ts:44`).

- Pick: leave them out until a compaction test needs them.

**OPEN 4, the plain-string reply.** Today `replies: string[]` (`harness-engine.ts:26`), and the sample test uses
`replies: ['done']`. Opencode has no string shorthand; a text reply is `text(value, id)`.

- Pick: as opencode, no strings. `['done']` becomes `[TestLLM.text('done', 'text-done')]`.
- Or: also accept a `string` as shorthand for `text`.

**OPEN 5, the helpers.** A test needs `text`, `toolCall`, `failAfter`, `hangAfter` (and `stop`, `toolCalls`,
`complete`) to write a reply without hand-writing every event. The ruling says the option changes and no export is
added.

- Pick: export them exactly as opencode does, as the `TestLLM` namespace. It goes from `@conciv/harness-testkit`
  and is re-exported from `@conciv/plugin-testkit/node` (and `/browser`, for browser mode). This is a new export and
  needs the maintainer's yes.
- Or: no export. Tests write `ChatEvent` arrays by hand, about six events per text reply.

**OPEN 6, run ids.** A `RUN_STARTED` or `RUN_FINISHED` chunk carries the request's `threadId` and `runId`
(`scripted-harness.ts:13-15`), and a reply written before the turn cannot know them.

- Pick: the helpers leave `threadId` and `runId` empty, and the harness writes the request's own ids into every
  `RUN_STARTED`, `RUN_FINISHED` and `RUN_ERROR` chunk it passes on.

**OPEN 7, the controls.** Only the one-shot queue (the `replies` given at start, which is `push` before the first
turn) and `gate` are carried.

- Pick: leave out `always`, `serve`, `wait` and `requests` until a test needs one. Each is added with the
  maintainer's yes.
- Pick: no fallback, as opencode. Today a request beyond the queue gets `Hello from conciv` (`scripted-harness.ts:6`,
  `:31`). Instead it fails the run with the message `the scripted harness has no reply for request N`.

## 3. How each shape maps onto the scripted harness

Each model request is one call of the adapter's `chatStream` (`makeTextAdapter`, `packages/ai/src/adapters/adapters.ts:37`).
The harness counts the request, takes the next reply from the queue, and streams it:

1. Always first: `RUN_STARTED` with the request's ids, then the harness's own `CUSTOM` `fake.session-id` chunk
   (unchanged from `scripted-harness.ts:15-21`).
2. The reply's chunks, in order, with run ids stamped (OPEN 6).
3. For an array reply, its last chunk is the `RUN_FINISHED` its helper put there. For a `Stream`, the harness turns it
   into an async iterable (`Stream.toAsyncIterable`) and passes chunks on until it ends, fails or is stopped.

| opencode shape                                                               | the chunks our helper builds                                                                                                                                                                           | what the engine does with them                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text(value, id)`                                                            | `TEXT_MESSAGE_START {messageId: id, role: 'assistant'}`, `TEXT_MESSAGE_CONTENT {messageId: id, delta: value}`, `TEXT_MESSAGE_END {messageId: id}`, `RUN_FINISHED {finishReason: 'stop'}`               | shows the assistant text; the turn ends                                                                                                                                                                         |
| `toolCall(id, name, input)`                                                  | `TOOL_CALL_START {toolCallId: id, toolCallName: name}`, `TOOL_CALL_ARGS {toolCallId: id, delta: JSON.stringify(input)}`, `TOOL_CALL_END {toolCallId: id}`, `RUN_FINISHED {finishReason: 'tool_calls'}` | `chat()` (`@tanstack/ai` 1.2.0) runs the tool in-process from the tools conciv offered, then calls `chatStream` again with the result, so the next reply in the queue answers it. Same as opencode's two pushes |
| `stop(...events)` / `toolCalls(...events)` / `complete({reason}, ...events)` | the events, then `RUN_FINISHED` with `finishReason` `'stop'` or `'tool_calls'`                                                                                                                         | as above; `complete` maps opencode's `reason.normalized` (`stop`, `tool-calls`) to `finishReason` (`'stop'`, `'tool_calls'`)                                                                                    |
| `failAfter(error, ...events)`                                                | a `Stream` of the events, then `Stream.fail(error)`                                                                                                                                                    | the iterator throws after the events. `chat()` rethrows it; the stream's durability layer ends the turn with `RUN_ERROR {message}`, and the UI shows the inline run error                                       |
| `hangAfter(...events)`                                                       | a `Stream` of the events, then `Stream.never`                                                                                                                                                          | the turn stays running. On stop (`chat.stop`), the run guard abandons the iterator and the run ends `aborted`                                                                                                   |
| `gate()`                                                                     | no chunk: the next request first resolves `started`, then waits for `release` before streaming its reply                                                                                               | the turn is running but has sent nothing yet                                                                                                                                                                    |

The rules the harness must follow, all read from the code:

- **Tool chunk fields.** `chat()` needs `toolCallId` and `toolCallName` on `TOOL_CALL_START` (not `toolName`),
  `toolCallId` and `delta` on `TOOL_CALL_ARGS`, `toolCallId` on `TOOL_CALL_END`, and then
  `RUN_FINISHED {finishReason: 'tool_calls'}`. It runs at most 5 model requests per turn (`maxIterations(5)`).
- **Stop.** The adapter gets the stop signal as `options.request?.signal`, not `abortController`. A `hangAfter` reply
  must end its stream when that signal aborts. The run guard already abandons a stream that never yields again, so
  the turn ends either way; listening to the signal only releases the harness's own work.
- **A thrown error versus a yielded one.**
  - A `RUN_ERROR` yielded as a chunk reaches the client after a lifecycle `failed` event.
  - A thrown iterator gets no lifecycle event; the durability layer adds `RUN_ERROR` at the end.

  `failAfter` throws, as opencode's `Stream.fail` does. Both show the same inline error row.

- **Retries.** A `RUN_ERROR` that carries `retryAfterMs` is retried, because conciv sets `retry: {maxRetries: 2}`.
  The helpers never set it.
- **Timeouts the test must not cross.** The engine fails a run that sends no output within 30 s (start and first
  output, `packages/chat/src/index.ts:29-30`). `RUN_STARTED` and `CUSTOM` do not count as output.
  - A `gate` holds before any output, so the test must release it (it always does, in its next steps).
  - A `hangAfter` reply must send real output first (a text or tool chunk), or the run fails after 30 s. Opencode's
    own hang tests do the same: they send a `toolCall` before hanging.

  **OPEN 8.**
  - Pick: no change; the samples always send output before hanging.
  - Or: make the first-output timeout an engine option the kit sets, since it exists as `firstChunkTimeoutMs` in
    core.

**Where tool asks come from.** A tool call from the scripted adapter asks for permission inside the tool body, through
the plugin-host Permission service, as a CLI's call does. The ask shows as an approval card, appears in
`chat.hydrate().pendingApprovals`, and is answered by `chat.permissionDecision`.

A bare engine offers the direct tool `skill`, with the built-in skills `conciv` and `report`. With
`permission: {skill: 'ask'}`, the call `skill {id: 'conciv'}` asks.

## 4. How a test holds and releases a reply

`mount` returns nothing, and `createEngine` returns the engine. So the gate is reached through the engine, as
opencode's `gate` is reached through its `TestLLM.Test` service:

```ts
const gate = await engine.gate()
await user.type(composer, 'go{Enter}')
await gate.started
await gate.release()
```

**OPEN 9.** `gate` is a new member of the returned `Engine`. That is not a new export, but it does grow the kit's
surface.

- Pick: `engine.gate()`, which returns a `Gate`.
  - A gate not released by the end of the test is released when the engine stops, as opencode's scope finalizer does.
  - One active gate at a time, as opencode (`activeGate`).

Where the engine runs:

- **node and happy-dom:** in the test's own process. The happy-dom project loads the kit's engine chunk as plain Node
  modules. `Stream` replies and the gate are passed as they are.
- **browser mode:** in the vitest server process. The browser reaches it only through browser commands
  (`packages/plugin-testkit/src/browser-commands.ts`), which carry JSON.

**OPEN 10, browser mode.** A `Stream` (`failAfter`, `hangAfter`) and a function cannot cross that boundary.

- Pick: browser-mode tests take only array replies plus `gate`. The gate goes through three internal commands:
  `concivGate`, `concivGateStarted` and `concivGateRelease`, named like today's `concivSend`/`concivApprove`.
  Failing and hanging replies are tested in node or happy-dom, which by the rules come first anyway.
- Or: a JSON form of `failAfter` and `hangAfter` that the server side turns back into a `Stream`, which is a
  conciv-only shape.

## 5. Files that change

| file                                                                                       | change                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/harness-testkit/src/scripted-harness.ts`                                         | the queue holds `Response`s. One reply is taken per `chatStream` call, with no fallback. Run ids are stamped. Arrays are streamed; a `Stream` goes through `Stream.toAsyncIterable` and ends on `options.request?.signal`. The gate is waited on before the first chunk |
| new `packages/harness-testkit/src/test-llm.ts`                                             | `Response`, `Gate`, `complete`, `stop`, `toolCalls`, `text`, `textWithUsage`, `toolCall`, `failAfter`, `hangAfter`, copied from opencode onto `ChatEvent` (OPEN 5)                                                                                                      |
| `packages/harness-testkit/src/harness-engine.ts`                                           | `HarnessEngineOptions.replies` becomes `readonly Response[]`; `HarnessEngine` gains `gate` (OPEN 9)                                                                                                                                                                     |
| `packages/plugin-testkit/src/engine.ts`                                                    | `CreateEngineOptions.replies` becomes `readonly Response[]`; `Engine` picks `gate` too                                                                                                                                                                                  |
| `packages/plugin-testkit/src/browser-engine.ts`, `browser-commands.ts`, `test-projects.ts` | the three gate commands; the replies passed to `concivCreateEngine` are arrays only (OPEN 10)                                                                                                                                                                           |
| `packages/plugin-testkit/src/node.ts`, `browser.ts`                                        | re-export `TestLLM` (only if OPEN 5 is a yes)                                                                                                                                                                                                                           |
| `packages/plugins/test-runner/src/test-runner.dom.test.tsx`                                | `replies: ['done']` becomes `[TestLLM.text('done', 'text-done')]`                                                                                                                                                                                                       |
| `packages/harness-testkit/README.md`, `packages/plugin-testkit/README.md`, a changeset     | the reply shapes and `gate`                                                                                                                                                                                                                                             |
| `docs/specs/test-rewrite-after-port.md`                                                    | its kit sample uses `replies: ['done']`; it changes with OPEN 4 (not edited here)                                                                                                                                                                                       |

## 6. Samples

These assume the picks above. Rule 1 holds: user-event only, queries by role and text.

### node: a held reply, and an approved tool call

```ts
import {test, expect} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'

test('a held turn runs on release, and its skill call runs once approved', async () => {
  const engine = await createEngine({
    permission: {skill: 'ask'},
    replies: [TestLLM.toolCall('call-skill', 'skill', {id: 'conciv'}), TestLLM.text('Loaded', 'text-loaded')],
  })
  const gate = await engine.gate()
  const sent = engine.session.send('load the conciv skill')
  await gate.started
  await gate.release()
  await engine.session.approve()
  await expect(sent).resolves.toBeUndefined()
})
```

`send` settles only when the run ends (`harness-engine.ts:92-118`), and the second reply is used only after the
approved tool has run. So a resolved `send` proves the tool ran and the turn finished.

**OPEN 11.** A node test cannot press stop: `EngineSession` has `send`, `approve` and `tool`, and no stop.

- Pick: stop is tested in happy-dom (below), where the user presses it.
- Or: add `stop` to `EngineSession`, as opencode's `session.interrupt`. That is new kit surface.

### happy-dom: press stop on a running turn, then approve a tool card

```tsx
import {test, expect} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'
import {mount} from '@conciv/plugin-testkit/browser'

test('a user stops a running turn, then approves a skill call', async () => {
  const engine = await createEngine({
    permission: {skill: 'ask'},
    replies: [
      TestLLM.hangAfter(
        {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'text-working', role: 'assistant'},
        {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'text-working', delta: 'Working on it'},
      ),
      TestLLM.toolCall('call-skill', 'skill', {id: 'conciv'}),
      TestLLM.text('Loaded', 'text-loaded'),
    ],
  })
  await mount({engine})
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
  await user.type(await screen.findByRole('textbox'), 'start working{Enter}')
  await expect(screen.findByText('Working on it')).resolves.toBeDefined()
  await user.click(await screen.findByRole('button', {name: 'Stop generating'}))
  await expect(screen.findByRole('button', {name: 'Send message'})).resolves.toBeDefined()

  await user.type(screen.getByRole('textbox'), 'load the conciv skill{Enter}')
  const card = await screen.findByRole('group', {name: 'Permission request'})
  await user.click(within(card).getByRole('button', {name: 'Approve'}))
  await expect(screen.findByText('Loaded')).resolves.toBeDefined()
})
```

The UI names come from the product:

- `Stop generating` and `Send message`: `apps/conciv/src/pane/pane-composer.tsx:62-63`.
- The card group `Permission request` and its `Approve` button: `packages/ui-kit-chat/src/styled/trace/permission-block.tsx:61`,
  `:90`.

The hang sends text first, so the 30 s first-output timeout is never in play (OPEN 8).

## 7. Not checked yet

- Whether the sandbox policy `default: 'ask'` (`packages/ai/src/server/chat-server.ts:477`) also gates tools other
  than the sandbox ones. If it gates `skill`, the `permission: {skill: 'ask'}` rule is still the one that asks, but a
  second ask could show.
- None of this was run; the event flow is read from the code. The first writer proves it with the two samples.

## 8. Orchestrator review, 2026-11-20

Decided under the maintainer's "rule without me, stay as opencode", unless marked as his.

- 1: `ChatEvent`. Forced: the repo has no `LLMEvent`, and a second event model for tests is not opencode either.
- 2: `Error`.
- 3: left out until a compaction test exists.
- 4: no strings, as opencode. `['done']` becomes `[TestLLM.text('done', 'text-done')]`.
- 5: DECIDED 2026-11-20, maintainer: yes. The `TestLLM` namespace is exported from the kits, as opencode exports it
  from `@opencode/ai/testing`.
- 6: the pick.
- 7: the pick. No fallback reply, as opencode; `always`, `serve`, `wait`, `requests` are not ported without a caller.
- 8: no change. A hanging reply sends output first, as opencode's own tests do.
- 9: DECIDED 2026-11-20, maintainer: yes. `engine.gate()`.
- 10: the pick. Failing and never-ending replies are tested in node and happy-dom.
- 11: stop is pressed in happy-dom. No `stop` on the session.
- Section 7, first point: the first writer checks it before writing the samples and reports.
