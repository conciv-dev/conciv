# RPC and testing, in depth

## The contract

`Rpc.define({id, methods, events})` from `@conciv/backend-plugin-api/rpc`. Each method has an `input`
and an `output` schema and optional named `errors`; each event has a `schema`. An error name that starts
with `rpc.` is reserved and throws (`packages/protocol/src/schema/rpc.ts:53-56`). Keep the contract in
its own module so the engine part, the browser part and the terminal import the same object.

## Registering handlers

`ctx.rpc.register(contract, handlers)` returns a registration with `dispose` and
`events.emit(name, data)`. A handler gets the parsed input and a call context with
`error(name, message, data)`, which builds one of the method's declared errors. In the Effect entry it
returns an `Effect`. The test runner's `registerRpc`, from `packages/plugins/test-runner/src/test-runner.ts:37-59`:

```ts
function registerRpc(rpc: Context['rpc'], manager: TestRunnerManager) {
  return rpc.register(TestRunner, {
    status: () => manager.status,
    current: () => manager.current,
    list: (input, call) =>
      manager
        .list(input.failedOnly)
        .pipe(
          Effect.catchTag('TestRunner.RunnerUnavailable', (error: RunnerUnavailable) =>
            Effect.fail(call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: error.message})),
          ),
        ),
    run: (input, call) =>
      manager
        .run(input)
        .pipe(
          Effect.catchTag('TestRunner.RunnerUnavailable', (error: RunnerUnavailable) =>
            Effect.fail(call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: error.message})),
          ),
        ),
    stop: () => manager.stop.pipe(Effect.as(OK)),
  })
}
```

Map each typed failure to a declared error once, at the edge. In the promise entry a handler returns a
`Promise` and returns `call.error(...)` to fail. RPC methods never ask the user; an operation that must
ask is a tool.

## Calling it

- Another plugin's engine part: `ctx.rpc(Contract)` returns a typed client. The TanStack plugin calls
  the page plugin this way (`ctx.rpc(PageDefinition)`, `packages/plugins/tanstack/src/tools.ts:105-109`).
- The browser part: `ctx.client.rpc(Contract).method(input, {signal})`. Events arrive on
  `ctx.client.event.subscribe({types: ['rpc.<id>.<event>']})`, and `server.connected` marks the moment
  to read the current state again (`packages/plugins/test-runner/src/follow.ts:24-42`).
- A terminal: `conciv plugin call <rpcId> <method> [--data <json>]`
  (`apps/site/content/docs/plugins/terminal.mdx`).

## Testing with `@conciv/backend-test-utils`

`test` from `@conciv/backend-test-utils` is vitest's `test` with a `createEngine` fixture
(`packages/backend-test-utils/src/backend-test-utils.ts:23`). `createEngine(config, start)` starts the
real engine on a free port with a scripted model; only the model and the agent CLIs are faked.

- `config` is the product's own conciv config (`{plugins: ['<your package>']}`, `permission`, ...).
  A package name is the package under test or one installed for it, loaded from its built `.` export;
  a path that starts with `./` is read from the package folder.
- `start` holds what is not product config: `directory` (the project the engine runs in), `plugins`,
  `timeouts`, `harnesses`, `env`, `fs`, `clock` and `tokensPerSecond`.
- `engine.reply(...)` queues the scripted model's next replies: `TestLLM.text`, `TestLLM.toolCall`,
  `TestLLM.failAfter`, `TestLLM.hang`. A tool call runs the real tool, so a test sees the plugin's
  permission ask.
- The engine has `session.send(text)`, `session.tool(name).call(input)` and `.failure(input)`,
  `session.stop()`, `requests()`, `rpc.call(id, method, input)` and `rpc.failure(...)`,
  `event(type, match)` (its `.arrived` resolves on the next match), `gate()`, `restart()`, and
  `write(path, content)` to put a file in the project (`packages/engine-kit/src/harness-engine.ts:130-153`).
- The fixture stops every engine its test started when the test ends, pass or fail. A test never stops
  one itself.

An RPC event and a method call, from `packages/plugins/test-runner/test/it/tools.it.test.ts:72-78`:

```ts
const started = await engine.event('rpc.test-runner.event', {data: {type: 'run-start', runId: 'r1'}})

const endless = engine.rpc.call('test-runner', 'run', {})
expect((await started.arrived).data).toMatchObject({
  type: 'run-start',
  files: expect.arrayContaining([expect.stringContaining('watering.test.js')]),
})
```

`@conciv/client/testing` (published) gives `createFakeEngine()` and `FakeLLM`: a fake engine built on
the real RPC contract that answers like the real one. Inside this repo the widget render helpers
(`renderInTestApp`, `renderTestApp`, `createExtensionTester` from `@internal/frontend-test-utils`) and
`concivTest()` (from `@internal/vitest-config`, which registers the browser commands browser-mode
`createEngine` needs) drive a plugin's screens. Both are private and not published, so a plugin outside
this repo tests its engine part in node and has no widget render helpers today
(`apps/site/content/docs/plugins/testing.mdx`).

Rules: drive the widget by role and visible text; assert with the jest-dom matchers (`toBeVisible`,
`toHaveAccessibleName`, ...), never `toBeDefined()` or `toBeTruthy()` on a query, which already throws
when nothing matches; no test-ids or class selectors; no mocks and no sleeps; rebuild the plugin's
`dist` before a run (tests load the built plugin).

## Sources

- `packages/protocol/src/schema/rpc.ts`
- `packages/plugins/test-runner/src/rpc.ts`
- `packages/plugins/test-runner/src/test-runner.ts`
- `packages/plugins/test-runner/src/follow.ts`
- `packages/plugins/test-runner/test/it/tools.it.test.ts`
- `packages/plugins/tanstack/src/tools.ts`
- `packages/backend-test-utils/src/backend-test-utils.ts`
- `packages/engine-kit/src/harness-engine.ts`
- `apps/site/content/docs/plugins/testing.mdx`
- `apps/site/content/docs/plugins/terminal.mdx`
