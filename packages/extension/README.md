# @conciv/extension

The conciv extension-authoring contract: `defineExtension`/`defineTool` plus the SolidJS
runtime context and typed `useSlot`/`useContext` hooks.

Part of [conciv](https://github.com/conciv-dev/conciv). Author an extension under
`conciv/extensions/*.tsx` in your app:

```ts
import {defineExtension} from '@conciv/extension'

export default defineExtension({
  name: 'my-extension',
  // tools, slots, context…
})
```

## Browser-bodied tools (`defineTool().client(body)`)

An extension can declare registry tools whose bodies run **in the browser** (where the widget is
mounted, with access to live client state, the DOM, or a framework fiber) and reach them from its
**server** half through the tool registry. There is no page-only vocabulary: a browser capability is
an ordinary registry tool with a fully qualified name, dispatched to the page by that name over the
`{requestId, name, input}` wire.

### Declare once, bind twice

A declaration is registry-grade when it carries `meta` (with a `summary`) and an `outputSchema`.
Keep the declaration in a shared module; the **server** half registers it with a body-less
`.client()` (core forwards calls to the page), and the **client** half binds the browser body with
`.client(body)`:

```ts
// shared/defs.ts
import {z} from 'zod'
import {defineTool} from '@conciv/extension/tool'

export const routerStateDef = defineTool({
  name: 'demo.routerState',
  description: 'read the live router path off the page',
  inputSchema: z.object({}),
  outputSchema: z.object({path: z.string()}),
  meta: {summary: 'read the live router path off the page', category: 'demo'},
})
```

```ts
// server.ts — declaration only; the registry forwards the call into the browser
import {defineExtension} from '@conciv/extension'
import {routerStateDef} from './shared/defs.js'

export default defineExtension({name: 'demo', tools: [routerStateDef.client()]}).server((server) => {
  async function currentPath() {
    const state = await server.tools.call('demo.routerState', {})
    return state
  }
  return {context: {currentPath}}
})
```

```ts
// client.ts — the browser body, collected off the mounted extension instance
import {defineExtension} from '@conciv/extension'
import {routerStateDef} from './shared/defs.js'

export default defineExtension({
  name: 'demo',
  tools: [routerStateDef.client(() => ({path: location.pathname}))],
}).client(() => ({value: {}}))
```

Bodies are `(input, ctx)`: the input arrives schema-validated, and the dispatcher builds `ctx` per
call — `ctx.document`, a lazy `ctx.target(locator)` that resolves a `{ref, selector, name}` locator
(and fires the action mirror when the declaration sets `meta.mirrors`), a non-throwing
`ctx.resolve(locator)`, `ctx.addRef`/`ctx.resetRefs` for snapshot refs, and `ctx.consoleEntries()`.
Return a plain JSON-serializable record; declare `meta.mutating: true` and the call is journaled and
prompts for user approval on every surface.

Only tools declared by extensions the widget actually mounted are dispatchable — a failed client
mount contributes no browser tools.

### Every failure is a typed `PageVerbError`

A forwarded browser call rejects with the tool's declared transport errors (`NO_PAGE_CLIENT`,
`PAGE_TIMEOUT`, `UNKNOWN_TOOL`, `INVALID_ARGS`, `HANDLER_ERROR`); on the raw page seam these map
from a `PageVerbError` (guard it with `isPageVerbError`) carrying a `code`, the owning name, and
the verb:

| `code`          | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| `no-widget`     | No widget is connected, so the verb cannot run in any browser.       |
| `timeout`       | A widget is connected but never replied within the page-bus timeout. |
| `unknown-verb`  | No mounted extension declares a client tool by that name.            |
| `invalid-args`  | The arguments failed the verb's zod schema.                          |
| `handler-error` | The handler threw, or returned a non-JSON-serializable value.        |

```ts
import {isPageVerbError} from '@conciv/extension'

try {
  await server.tools.call('demo.routerState', {})
} catch (error) {
  if (isPageVerbError(error) && error.code === 'no-widget') {
    // degrade gracefully — nothing is looking at the page
  }
}
```

### Loading / error card contract

When a tool's `execute` awaits `server.tools.call`, the tool part stays in its **running** state
until the call resolves or rejects, so the card renders a loading state and then a result — or, if
the call rejects, an **error** card (the rejection propagates out of `execute` and surfaces as the
tool part's `output-error` state). A failed page verb never renders as a green success. Do not catch
and swallow a `PageVerbError` inside `execute` if you want the failure reflected in the card; let it
reject.
