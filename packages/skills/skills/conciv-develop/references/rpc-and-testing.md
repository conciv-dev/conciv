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

The testkit boots the real engine with a fake model; only the model and the agent CLIs are faked.

- `bootCoreKit({id, plugins, files, stateRoot})` from `@conciv/plugin-testkit/core-kit`. `stateRoot`
  is the project folder (its `conciv/plugins` load as in an app); `files` writes more files there.
  The kit has `rpc.plugin.list()` (each plugin's `state` is `{status: 'active'}` or
  `{status: 'failed', error}`), `callTool(name, input)` (code mode, name without `external_`),
  `writeProjectFile`, `base`, `origin`, `token`, `home`, `stateRoot` and `cleanup()`.
- `openPluginWidget(browser, {id, plugins, widgetBundle, files, stateRoot, body})` from
  `@conciv/plugin-testkit/widget-suite` serves a page with `@conciv/embed`'s
  `conciv-widget.global.js` and returns `{page, kit, close}`.
- `rpcObserverFor(page)`, `rpcSocketFor(page)` and the `rpc-fault` helpers (`failRpcCalls`,
  `abortRpcCalls`, `garbleRpcReplies`, `holdRpcCalls`, `gateRpcCalls`) observe or break the widget's
  RPC socket without swapping the transport.

```ts
const widget = await openPluginWidget(browser, {
  id: 'fake',
  plugins: [PACKAGE_DIR],
  widgetBundle: WIDGET_BUNDLE,
  files: {...fixtureFiles(), 'gate.test.ts': GATED_VITEST_TEST},
  stateRoot: realpathSync(tempDir('conciv-test-runner-panel-')),
})
```

Rules: drive the widget by role and visible text; no `page.evaluate`, test-ids or class selectors;
`browser.newPage()`, not `newContext()`; wait for `domcontentloaded` or a visible signal, never
`networkidle`; rebuild the plugin's `dist` before a run.

## Sources

- `packages/plugin/src/effect/rpc.ts`
- `packages/plugins/test-runner/src/rpc.ts`
- `packages/plugins/test-runner/src/index.ts`
- `packages/plugins/test-runner/src/follow.ts`
- `packages/plugins/test-runner/test/test-runner.browser.test.ts`
- `packages/plugin-testkit/src/core-kit.ts`
- `packages/plugin-testkit/src/widget-suite.ts`
- `packages/plugin-testkit/src/rpc-fault.ts`
