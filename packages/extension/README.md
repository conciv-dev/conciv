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

## Browser page verbs (`pageVerbs` + `server.page.call`)

An extension can declare typed, zod-validated verbs that run **in the browser** (where the widget
is mounted, with access to live client state, the DOM, or a framework fiber) and invoke them from
its **server** half over a scoped, fully-typed caller. Core routes the call through one generic
`ext` page-query kind — there is no framework-specific wiring.

### Author verbs in `.client(...)`

Verbs are always authored with `pageVerb(schema, handler)` (never `{args, handler}` literals) and
grouped with `definePageVerbs`. Return them alongside the client `value`:

```ts
import {z} from 'zod'
import {defineExtension, definePageVerbs, pageVerb} from '@conciv/extension'

const verbs = definePageVerbs({
  routerState: pageVerb(z.object({}), () => ({path: location.pathname})),
  echo: pageVerb(z.object({n: z.number()}), (args) => ({n: args.n})),
})

export default defineExtension({name: 'demo'})
  .client(() => ({value: {}, pageVerbs: verbs}))
  .server((server) => {
    async function currentPath() {
      const state = await server.page.call('routerState', {})
      return state.path
    }
    return {context: {currentPath}}
  })
```

`.call('routerState', {})` is fully typed: the verb name, its argument shape, and the resolved
return type all flow from the `pageVerbs` map. Handlers are closures over the client factory scope —
no injected context, no registration boilerplate; mount registers the verbs and dispose unregisters
them.

### `.client(...)` must come before `.server(...)`

The `Verbs` generic is captured from `.client(...)`. Call `.client` **before** `.server` or the
server half sees an empty verb map and `server.page.call` will not type-check your verb names. This
is an ordering requirement of the builder, not a runtime flag.

### Every failure is a typed `PageVerbError`

`server.page.call` rejects with a `PageVerbError` (guard it with `isPageVerbError`) carrying a
`code`, the `extension` name, and the `verb`:

| `code`          | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| `no-widget`     | No widget is connected, so the verb cannot run in any browser.       |
| `timeout`       | A widget is connected but never replied within the page-bus timeout. |
| `unknown-verb`  | The named verb is not registered for this extension.                 |
| `invalid-args`  | The arguments failed the verb's zod schema.                          |
| `handler-error` | The handler threw, or returned a non-JSON-serializable value.        |

```ts
import {isPageVerbError} from '@conciv/extension'

try {
  await server.page.call('echo', {n: 1})
} catch (error) {
  if (isPageVerbError(error) && error.code === 'no-widget') {
    // degrade gracefully — nothing is looking at the page
  }
}
```

### Loading / error card contract

When a tool's `execute` awaits `server.page.call`, the tool part stays in its **running** state
until the call resolves or rejects, so the card renders a loading state and then a result — or, if
the call rejects, an **error** card (the rejection propagates out of `execute` and surfaces as the
tool part's `output-error` state). A failed page verb never renders as a green success. Do not catch
and swallow a `PageVerbError` inside `execute` if you want the failure reflected in the card; let it
reject.
