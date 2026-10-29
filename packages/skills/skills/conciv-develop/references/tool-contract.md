# Tool contract, in depth

`defineTool`/`toolDefinition`/`toolError`/`isToolError` all come from `@conciv/extension`
(`packages/extension/src/define-tool.ts`); `toolDefinition` is also reachable from the smaller
`@conciv/extension/tool` subpath when you want a shared definition file that doesn't pull in the
rest of the package (see "Split def/server/client files" below).

## Every `ToolDefinition` field

```ts
type ToolDefinition<Name, Schema, Output, Errors> = {
  name: Name // the id the agent calls; snake_case or dot.case by convention
  description: string // what the agent reads to decide when to call it
  inputSchema: Schema // z.ZodObject — reparsed at the boundary
  outputSchema?: Output // optional, documents the result shape
  errors?: Errors // Record<code, {message, data?: z.ZodType}>
  meta?: ToolMeta
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
  approval?: 'ask'
}

type ToolMeta = {
  summary: string // required if meta is passed at all; must not repeat the name
  category?: string
  mutating?: boolean
  mirrors?: boolean // client tool that mirrors a server tool's name — used by collectClientTools
  keywords?: readonly string[]
  positional?: string
  hint?: string
  icon?: ToolIconKey
  label?: ToolLabel
}
```

(`packages/extension/src/define-tool.ts:5-62`.) `assertToolMeta` runs synchronously inside
`defineTool` — a bad `meta.summary` throws at module load, before any handler runs
(`define-tool.ts:205-213`).

## Binding rules

A `ToolBuilder` starts unbound. `.server(execute)` and `.client(execute?)` each claim the binding
exactly once — calling either a second time (including calling `.client()` again after
`.client(fn)`) throws `tool "<name>" already has a <binding> binding` (`define-tool.ts:215-217`,
verified by `packages/extension/test/define-tool.test.ts:56-64`). `.render(renderer)` is
independent of binding and can be chained before or after `.server`/`.client`.

Derivations never leak into siblings: calling `.server(...)` on a base builder returns a _new_
builder; the base stays unbound and can still be `.client(...)`'d separately
(`packages/extension/test/define-tool.test.ts:33-49`) — this is how the split
`def.ts`/`server.ts`/`client.ts` pattern below works: one `toolDefinition(...)` feeds an independent
`defineTool(def)` call per build target.

## Split def/server/client files (installable packages)

For a package meant to be installed by other apps, keep tool metadata, server execution, and card
rendering in separate files so the server build never imports Solid and the client build never
imports node-only code. Real example, `@conciv/extension-tanstack`:

```ts title="packages/extensions/tanstack/src/tool/def.ts (shape)"
import {toolDefinition} from '@conciv/extension/tool'
export const routerStateDef = toolDefinition({
  name: 'tanstack_router_state',
  description: '…',
  inputSchema: z.object({}),
  outputSchema: RouterCurrentSchema,
})
```

```ts title="packages/extensions/tanstack/src/tool/client.ts (shape)"
import {defineTool} from '@conciv/extension'
import {routerStateDef /* … */} from './def.js'
import {readRouterState} from '../client/router-adapter.js'
import {routerStateCard} from './router-state-card.js'

export const tanstackClientTools = [
  defineTool(routerStateDef)
    .client(() => readRouterState())
    .render(routerStateCard),
]
```

```ts title="packages/extensions/tanstack/src/tool/server.ts (shape)"
import {defineTool, toolError} from '@conciv/extension'
import {routeManifestDef, TANSTACK_PAGE_TOOL_DEFS} from './def.js'

export const tanstackServerTools = [
  defineTool(routeManifestDef).server((_input, ctx: ToolCtx, _request, _page, tools) =>
    ctx.makeAdapter(tools).server.manifest.routes(),
  ),
  ...TANSTACK_PAGE_TOOL_DEFS.map(pageToolDeclaration),
]
```

One tool per verb, one name. A page verb IS the tool: the browser build binds it with `.client(impl)`
and hangs its card off the same builder, while the server build registers the same definition as a
bare `.client()` declaration so the server registry knows the name exists and routes a `tools.call`
to the page. Never wrap a page verb in a second server-bound tool under a different name — the model
would then see two catalog entries for one capability. A tool only earns a `.server(...)` binding
when its work genuinely happens in node (reading a manifest off disk, draining a bundler ring).

The extension's `server.ts` entry imports the server tools array into its `tools`; its `client.tsx`
entry imports the client tools array into its own. The bundler transform picks the right file per
build target the same way it splits a single-file extension — the tanstack extension just does the
split by hand across three files instead of relying on the transform inside one file, because it
ships as an installable package with real client/server build outputs.

## Error contract

Declare every code a tool can throw in its `errors` field, then throw with `toolError(code,
{message?, data?})` from inside `.server`/`.client`:

```ts title="packages/extensions/whiteboard/src/tool/comment/def.ts:18,59,108"
const COMMENT_NOT_FOUND = {COMMENT_NOT_FOUND: {message: 'no comment with that cid in this session'}}
// commentReadDef: errors: COMMENT_NOT_FOUND
// commentResolveDef: errors: COMMENT_NOT_FOUND, approval: 'ask'
```

```ts title="packages/extensions/whiteboard/src/tool/comment/server.ts:2,23"
import {defineTool, toolError} from '@conciv/extension'
if (!row) throw toolError('COMMENT_NOT_FOUND', {message: `comment ${cid} not found`})
```

`isToolError(value)` (`define-tool.ts:42-44`) narrows an unknown catch value back to `ToolError &
{code, data?}` on the render/consuming side — it checks `value instanceof Error && 'isToolError' in
value && value.isToolError === true`, so a plain `Error` you throw yourself never satisfies it; use
`toolError` to throw, not a hand-rolled `Object.assign(new Error(...), {isToolError: true})`, so the
shape stays exactly what `isToolError` expects.

## `approval: 'ask'`

Set on any tool whose side effect a user should confirm before it runs — every mutating whiteboard
comment/pin tool (`comment_resolve`, `comment_delete`) sets it alongside `mutating: true` in `meta`.
The widget surfaces an Approve/Deny card; from a test, `callToolApproved` (see
`references/rpc-and-testing.md`) answers that prompt automatically so you can assert on the
post-approval result.

## Client tool context (`ClientToolCtx`)

`.client(execute)` handlers receive `ClientToolCtx` (`packages/extension/src/define-tool.ts:28-36`):

```ts
type ClientToolCtx = {
  document: Document
  target: (locator: ClientToolLocator) => Element // throws if the locator can't resolve
  resolve: (locator: ClientToolLocator) => Element | null // null instead of throwing
  addRef: (el: Element) => string
  resetRefs: () => void
  consoleEntries: (since?: number) => ClientConsoleEntry[]
  effects: readonly ClientEffect[]
}
```

`ClientToolLocator` is `{ref?, selector?, name?}` — how the built-in page-inspection tools address
DOM elements the agent has referenced (`packages/extensions/page/src/client/bodies.ts:220` throws
`toolError('UNKNOWN_EFFECT', ...)`, imported at `packages/extensions/page/src/client/bodies.ts:2`,
from inside a client handler using exactly this pattern).

## Card renderer signature

```ts
type ToolCardProps = {
  part: ToolCallPart // the call: id, name, arguments
  result: ToolResultPart | undefined // undefined while streaming; .content / .error once landed
  ctx: ToolViewCtx // apiBase, harnessId, sendMessage, catalog, respondApproval?, durationFor?
  durationMs?: number
}
```

(`packages/protocol/src/tool-view-types.ts:23-37`.) Guard `result === undefined` for a pending
state before reading `result.content`/`result.error` — a card that assumes `result` always exists
breaks the instant the tool call starts streaming.
