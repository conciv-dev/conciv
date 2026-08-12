# RPC and testing, in depth

## `.server(...)`'s return contract

```ts
type ServerResult<Context> = {
  context: Context // feeds every tool's .server(input, ctx, request) second argument
  router?: AnyRouter // an oRPC router, mounted at /rpc/ext/<name>
  app?: unknown // an optional Hono app for routes an oRPC procedure can't express
  turnEnd?: (sessionId: string) => void | Promise<void>
  dispose?: () => void | Promise<void>
}
```

(`packages/extension/src/types.ts:110-116`.) Reach for `router` first — it gets you typed
request/response validation and streaming for free via `@orpc/server`'s `os` builder. Reach for
`app` only for things a procedure genuinely cannot express (the recorder's video export writes a
`File` response; several extensions use `app` for raw multipart uploads or a plain SSE endpoint that
predates their oRPC router).

## Building the router

```ts title="packages/extensions/whiteboard/src/server/router.ts:9,20-30"
import {eventIterator, os} from '@orpc/server'
const wbOs = os.$context<{request: Request}>()

export function makeWhiteboardRouter(store: Store) {
  return wbOs.router({
    list: wbOs
      .input(roomInput)
      .output(z.array(schema))
      .handler(({input}) => ops.list(input.room)),
    // …
  })
}
export type WhiteboardRouter = ReturnType<typeof makeWhiteboardRouter>
```

Export the router's inferred type (`WhiteboardRouter` above) — `makeExtRpcClient<TRouter>` needs it
as its type parameter to give the browser client full type inference.

## Streaming a subscription

`eventIterator(schema)` as an oRPC procedure's `.output(...)` declares a server-sent-events style
streaming return; the handler is an async generator. `subscriptionIterator` adapts a plain
`emit`-callback subscription (an event emitter, a store's `onEvent`) into the `AsyncGenerator` such
a handler must `yield*`:

```ts title="packages/extensions/whiteboard/src/server/router.ts:4,117-127"
import {eventIterator, os} from '@orpc/server'
import {subscriptionIterator} from '@conciv/extension'

changes: wbOs
  .input(roomInput)
  .output(eventIterator(z.custom<WhiteboardEvent>()))
  .handler(async function* ({input, signal}) {
    yield* subscriptionIterator<WhiteboardEvent>(
      (emit) => store.onEvent((event) => { if (event.room === input.room) emit(event) }),
      signal,
    )
  }),
```

Signature: `subscriptionIterator<T>(subscribe: (emit: (value: T) => void) => (() => void), signal:
AbortSignal | undefined): AsyncGenerator<T>` (`packages/extension/src/server-stream.ts:1-4`).
`subscribe` must return an unsubscribe function — `subscriptionIterator` calls it in its `finally`
block when the consumer stops iterating or `signal` aborts, so a subscription that never returns one
leaks. Pass the oRPC handler's own `signal` through so the generator tears down when the client
disconnects.

## Calling it from the browser

```ts title="packages/extensions/whiteboard/src/client/db.tsx:3,28"
import {makeExtRpcClient} from '@conciv/extension'
const client: WhiteboardClient = makeExtRpcClient<WhiteboardRouter>(apiBase, 'whiteboard')
```

`makeExtRpcClient(apiBase, extensionSlug)` (`packages/extension/src/ext-rpc.ts:20-26`) picks the
transport for you: inside a browser (`typeof location !== 'undefined'`) it reuses the widget's own
`browserRpcConnection`, scoped to `['ext', extensionSlug]`; from node (a test harness, an SSR
context) it builds a plain fetch-based `RPCLink` at `${apiBase}/rpc/ext/${extensionSlug}` with a
retry plugin. `apiBase` is the value `getHostApi().useApiBase()` gives you inside a mounted
component, or the `apiBase` the testkit hands you.

## Testing: the real `ExtensionTestApi`

```ts
function getExtensionTestApi(extension: {
  server: AnyExtension
  host: (engine: {apiBase: string; session: string}) => Promise<{origin: string; close: () => Promise<void>}>
  harness?: HarnessAdapter
}): Promise<{
  page: Page
  callTool: (name: string, input: unknown) => Promise<unknown>
  callToolApproved: (name: string, input: unknown) => Promise<unknown>
  runTypescript: (code: string) => Promise<unknown>
  session: string
  apiBase: string
  serverContext: unknown
  secondClient: () => Promise<{page: Page; close: () => Promise<void>}>
  dispose: () => Promise<void>
}>
```

(`packages/extension-testkit/src/get-extension-test-api.ts:18-22` for the input shape,
`packages/extension-testkit/src/get-extension-test-api.ts:26-38` for the returned shape.) `server` is your
extension's default export (the one with `.server(...)` already chained on it — import from your
`server.ts` entry, not `client.tsx`, if you split files). `host` produces the page the Playwright
`page` navigates to; it needs a **built** client bundle, not source:

- `fixtureHost(distDir)` (`packages/extension-testkit/src/fixture-host.ts`) serves a prebuilt
  `dist/test-host` directory and throws with a clear "run this package's build first" message if
  it's missing:

```ts title="packages/extensions/whiteboard/test/canvas-it-helpers.ts:1-9"
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import whiteboard from '../src/server.js'

export const testHost = fixtureHost(fileURLToPath(new URL('../dist/test-host', import.meta.url)))
export function bootWhiteboard(): Promise<ExtensionTestApi> {
  return getExtensionTestApi({server: whiteboard, host: testHost})
}
```

- A hand-written `host` for a custom fixture app that mounts your extension alongside real framework
  code (used when the extension needs to probe a router/query client that only exists inside a real
  app):

```ts title="packages/extensions/tanstack/test/helpers/tanstack-test-api.ts:14-24"
ctx.api = await getExtensionTestApi({
  server: tanstackExtension,
  host: async ({apiBase, session}) => {
    const served = await serveDir(hostDist, {apiBase, session})
    ctx.origin = served.origin
    return {origin: served.origin, close: () => served.close()}
  },
})
```

`serverContext` is exactly what your `.server(...)` factory returned as `context` — reach into it
when a test needs to assert on server-side state your tools don't expose directly (as
`tanstackAdapter(api)` does, pulling `context.adapter` back out). `callToolApproved` sends the tool
call and also answers the resulting Approve/Deny prompt, so use it for any tool with `approval:
'ask'`; plain `callTool` leaves the prompt unanswered.

## Two clients, one room

`secondClient()` opens a second browser page against the same session/room — the way to prove a
realtime feature actually syncs, not just that one client can read back its own write:

```ts
const second = await api.secondClient()
await api.callTool('deploy_run', {env: 'staging'})
await second.page.getByText('staging.example.com').waitFor()
await second.close()
```

Always `dispose()` in `afterAll` — it tears down the browser, the served host, and the booted
extension server in one call.
