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
  keywords?: readonly string[]
  positional?: string
  hint?: string
  icon?: ToolIconKey
  label?: ToolLabel
}
```

(`packages/extension/src/define-tool.ts:10-46`.) `assertToolMeta` runs synchronously inside
`defineTool` — a bad `meta.summary` throws at module load, before any handler runs
(`define-tool.ts:186-194`).

## Binding rules

A `ToolBuilder` starts unbound. `.server(execute)` is the only binding: it claims it exactly once,
and calling it a second time throws `tool "<name>" already has a server binding`
(`define-tool.ts:196-198`, verified by `packages/extension/test/extension.test.ts:829-832`).
`.render(renderer)` is independent of binding and can be chained before or after `.server`. A tool
with no binding is render-only: it carries the card for a tool whose work runs somewhere else.

Derivations never leak into siblings: calling `.server(...)` on a base builder returns a _new_
builder; the base stays unbound and can still be `.render(...)`'d separately
(`packages/extension/test/extension.test.ts:331-342`) — this is how the split
`def.ts`/`server.ts`/`client.ts` pattern below works: one `toolDefinition(...)` feeds an independent
`defineTool(def)` call per build target.

## Split def/server/client files (installable packages)

For a package meant to be installed by other apps, keep tool metadata, server execution, and card
rendering in separate files so the server build never imports Solid and the client build never
imports node-only code. Real example, `@conciv/extension-recorder`:

```ts title="packages/extensions/recorder/src/tool/def.ts (shape)"
import {toolDefinition} from '@conciv/extension/tool'
export const startToolDef = toolDefinition({
  name: 'recording_start',
  description: '…',
  inputSchema: StartInput,
  outputSchema: z.union([z.object({error: z.string()}), z.object({captureId: z.string(), startedAt: z.number()})]),
})
```

```ts title="packages/extensions/recorder/src/tool/client.ts"
import {defineTool} from '@conciv/extension'
import {pullToolDef, startToolDef, stopToolDef} from './def.js'
import {recordingToolCard} from './card.js'

export const startToolClient = defineTool(startToolDef).render(recordingToolCard)
```

```ts title="packages/extensions/recorder/src/tool/server.ts (shape)"
import {defineTool} from '@conciv/extension'
import {pullToolDef, startToolDef, stopToolDef} from './def.js'

export const startTool = defineTool(startToolDef).server(async (_input, ctx: Ctx) => {
  const {captureId, startTs} = ctx.recorder.control.startCapture()
  return {captureId, startedAt: startTs}
})
```

A tool only earns a `.server(...)` binding when its work genuinely happens in node (reading a
manifest off disk, draining a bundler ring). Work that has to happen in the page (reading the DOM,
the router, the query cache) is not a tool binding: it is an operation of a plugin's browser half,
which the engine calls over the plugin's connection to the tab. The page plugin answers its page
operations in `packages/builtin-plugins/src/page/operations.ts`, and the TanStack plugin answers
its router and query operations in `packages/plugins/tanstack/src/client/operations.ts`.

The extension's `server.ts` entry imports the server tools array into its `tools`; its `client.tsx`
entry imports the client tools array into its own. The bundler transform picks the right file per
build target the same way it splits a single-file extension — the tanstack extension just does the
split by hand across three files instead of relying on the transform inside one file, because it
ships as an installable package with real client/server build outputs.

## Error contract

Declare every code a tool can throw in its `errors` field, then throw with `toolError(code,
{message?, data?})` from inside `.server`:

```ts title="packages/extensions/whiteboard/src/tool/comment/def.ts:18,59,108"
const COMMENT_NOT_FOUND = {COMMENT_NOT_FOUND: {message: 'no comment with that cid in this session'}}
// commentReadDef: errors: COMMENT_NOT_FOUND
// commentResolveDef: errors: COMMENT_NOT_FOUND, approval: 'ask'
```

```ts title="packages/extensions/whiteboard/src/tool/comment/server.ts:2,23"
import {defineTool, toolError} from '@conciv/extension'
if (!row) throw toolError('COMMENT_NOT_FOUND', {message: `comment ${cid} not found`})
```

`isToolError(value)` (`packages/protocol/src/tool-call-types.ts:18-20`, re-exported from
`define-tool.ts:7`) narrows an unknown catch value back to `ToolError &
{code, data?}` on the render/consuming side — it checks `value instanceof Error` and an `isToolError`
property of `true`, so a plain `Error` you throw yourself never satisfies it; use
`toolError` to throw, not a hand-rolled `Object.assign(new Error(...), {isToolError: true})`, so the
shape stays exactly what `isToolError` expects.

## `approval: 'ask'`

Set on any tool whose side effect a user should confirm before it runs — every mutating whiteboard
comment/pin tool (`comment_resolve`, `comment_delete`) sets it alongside `mutating: true` in `meta`.
The widget surfaces an Approve/Deny card; from a test, `callToolApproved` (see
`references/rpc-and-testing.md`) answers that prompt automatically so you can assert on the
post-approval result.

## Page work belongs to a plugin

There is no browser-bound tool. A capability that runs in the page is an operation of a plugin's
browser half, and the engine reaches it through that plugin's connection to the tab serving the
session. The page plugin's operations address the elements the agent has referenced by `{ref?,
selector?, name?}` and throw structured failures the same way a server tool does:
`packages/builtin-plugins/src/page/operations.ts:303` throws `toolError('UNKNOWN_EFFECT', ...)`,
imported at `packages/builtin-plugins/src/page/operations.ts:19`.

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
