# RPC and testing, in depth

## The contract

`Rpc.define({id, methods, events})` from `@conciv/plugin/rpc`. Each method has an `input` and
`output` schema and optional named `errors`; each event has a `schema`. An error name that starts
with `rpc.` is reserved and throws. Keep the contract in its own module so the engine part, the
browser part and the terminal import the same object.

## Registering handlers

`ctx.rpc.register(contract, handlers)` returns a registration with `dispose` and
`events.emit(name, data)`. A handler gets the parsed input and a call context with
`error(name, message, data)`, which builds one of the method's declared errors, and returns an
`Effect`:

```ts
list: (input, call) =>
  guarded(
    () => manager.list(input.failedOnly),
    (reason) => call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
  ),
```

Map each typed failure to a declared error once, with `Effect.catchTags`. RPC methods never ask the
user; an operation that must ask is a tool.

## Calling it

- Another plugin's engine part: `ctx.rpc(Contract)` returns a typed client.
- The browser part: `ctx.client.rpc(Contract).method(input, {signal})`. Events arrive on
  `ctx.client.event.subscribe({types: ['rpc.<id>.<event>'], signal})`; the stream starts with
  `server.connected`, the moment to read current state. Wrap the follow in
  `createKeyed(() => ctx.client, (client) => ...)` and abort it in `onCleanup`.
- A terminal: `conciv plugin call <id> <method> [json]`.

## Testing with `@conciv/plugin-testkit`

The testkit runs the real engine with a scripted model; only the model and the agent CLIs are faked.

- Set up: `@conciv/plugin-testkit` in devDependencies, `concivTest()` from
  `@conciv/plugin-testkit/vitest` in the package's one `vite.config.ts`, and `"test": "conciv-test"`.
  That gives three projects: node (`*.test.ts`), happy-dom (`*.dom.test.ts(x)`) and browser
  (`*.browser.test.ts(x)`). A setting in your own `test: {...}` (a timeout, `maxWorkers`, a
  reporter) wins over the kit's.
- `createEngine(config, start)` from `@conciv/plugin-testkit/node` starts the engine in a fresh
  project folder. `config` is the product's own `ConcivConfig` (`{plugins: ['.']}`, `permission`,
  `hubAccess`, ...); `start` holds what is not product config (`directory`, `timeouts`, `harnesses`,
  `env`, `fs`, `clock`). `engine.reply(...)` answers the model's requests in order
  (`TestLLM.text(...)`, `TestLLM.toolCall(...)`); `engine.write(path, content)`,
  `engine.setting(...)`, `engine.stale(...)` and `engine.version(...)` change the engine after start.
  The engine has `session.send(text)`,
  `session.tool(name).call(input)` and `.failure(input)`, `rpc.call(id, method, input)` and
  `rpc.failure(...)`, `event(type)`, `gate()`, `requests()` and `address`. It stops when the test
  ends.
- `mount({engine, history})` from `@conciv/plugin-testkit/browser` shows the whole widget on that
  engine, in happy-dom or a real browser, and resolves when it is ready. `history` is either
  `createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})` (from the same import), the
  engine's own saved history, which the app restores as it does in production, or any TanStack
  `RouterHistory` such as `createMemoryHistory`, which the test keeps as a handle. It returns nothing: find
  things with Testing Library and act with `user-event`.

```ts
import {expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

test('the deploy tab shows the last deploy', async () => {
  const engine = await createEngine({plugins: ['.']})
  await engine.reply(TestLLM.text('done', 'a'))
  await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

  expect(await screen.findByRole('tab', {name: 'Deploy'})).toBeVisible()
})
```

Rules: drive the widget by role and visible text; assert with the jest-dom matchers (`toBeVisible`, `toHaveAccessibleName`, ...), never `toBeDefined()` or `toBeTruthy()` on a query, which already throws when nothing matches; no test-ids or class selectors; no polling waits;
rebuild the plugin's `dist` before a run (tests load the built plugin).

## Sources

- `packages/plugin/src/effect/rpc.ts`
- `packages/plugins/test-runner/src/rpc.ts`
- `packages/plugins/test-runner/src/index.ts`
- `packages/plugins/test-runner/src/follow.ts`
- `packages/plugin-testkit/README.md`
- `packages/plugin-testkit/src/engine.ts`
- `packages/plugin-testkit/src/mount.ts`
- `packages/plugin-testkit/src/test-projects.ts`
