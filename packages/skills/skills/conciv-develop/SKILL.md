---
name: conciv-develop
description: Use when building a conciv extension in your own app — a file under conciv/extensions/ (or a package you plan to publish) that adds an agent tool via defineTool, a chat-attachment type via defineAttachment, or UI in the widget via Component/Surface/views. Covers defineExtension, the tool contract (server/client/render, errors, approval, meta), getExtensionApi/getHostApi, RPC to your extension's own server (makeExtRpcClient, subscriptionIterator), and testing with @conciv/extension-testkit. This is the consumer-facing skill, for an app that imports @conciv/extension as a dependency, not conciv's own source.
metadata:
  package: '@conciv/skills'
---

# Building a conciv extension

## Who this is for

You are a developer (or an agent working in a developer's app) adding a `conciv/extensions/*.tsx`
file to teach the conciv agent widget a new capability, or publishing a package that does the same
for other people's apps. Everything here is the public contract of `@conciv/extension`, installed
as a normal dependency. If you are instead working **inside the conciv monorepo itself** — editing
the built-in whiteboard/terminal/recorder extensions, or the extension package's own source — the
conciv repo has its own internal equivalent of this skill for contributors
(https://github.com/conciv-dev/conciv, `packages/harness/plugins/claude/skills/conciv-extensions/`),
which may describe internal scaffolding tools this skill does not cover.

## The shape: one file, two runtimes

An extension is one `.tsx`/`.ts` file default-exporting a `defineExtension(...)` builder. A bundler
transform splits it: `.server(...)` code runs in your dev-server's node process, everything else
(`Component`, `Surface`, `views`, tool `.render(...)` cards) compiles into the browser widget as
Solid JSX — even inside a React host app, because the conciv plugin compiles `conciv/extensions/**`
as its own Solid zone. You never wire the two halves together yourself.

```tsx
export {defineExtension} from '@conciv/extension'
export {defineTool, toolDefinition, toolError, isToolError} from '@conciv/extension'
export {defineAttachment} from '@conciv/extension'
export {getExtensionApi} from '@conciv/extension'
export {getHostApi, HostApiProvider} from '@conciv/extension'
export {MountedExtension, MountedSurface, MountedView} from '@conciv/extension'
export {makeExtRpcClient, subscriptionIterator} from '@conciv/extension'
```

(`packages/extension/src/index.ts` — every name above, plus their types, is what `@conciv/extension`
publishes. `./client` re-exports the identical module, so `@conciv/extension` and
`@conciv/extension/client` are interchangeable import specifiers.)

## Your first extension, trimmed for brevity

Two real, current example extensions ship in this repo's Vite example app. Read both before writing
your own — the real file additionally draws an inline SVG icon on the button, trimmed below:

```tsx title="apps/examples/tanstack-start/conciv/extensions/deploy-button.tsx:1-46 (trimmed)"
import {z} from 'zod'
import {defineExtension, defineTool, getHostApi} from '@conciv/extension'

const deployRun = defineTool({
  name: 'deploy_run',
  description: 'Deploy the current branch',
  inputSchema: z.object({env: z.enum(['staging', 'prod'])}),
  outputSchema: z.object({url: z.string()}),
  promptSnippet: 'You can deploy with the deploy_run tool.',
  meta: {summary: 'deploy the current branch', category: 'deploy', mutating: true},
  approval: 'ask',
})
  .server(({env}) => ({url: `https://${env}.example.com`}))
  .render((props) => <div data-pw-deploy-card>Deploying… ({props.part.name})</div>)

const deploy = defineExtension({name: 'deploy', Component: DeploySurface, tools: [deployRun]})
export default deploy

function DeploySurface() {
  const host = getHostApi()
  const slot = host.useSlot()
  const notify = host.useToast()
  if (slot === 'composer')
    return (
      <button type="button" aria-label="Deploy" onClick={() => notify('Deploy requested')}>
        Deploy
      </button>
    )
  if (slot === 'status') return <span>env: staging</span>
  return null
}
```

The real file's `deployRun` has no `approval: 'ask'` — it's added above because `mutating: true` tools
should ask by default (see the red flags below); the real button also draws an SVG rocket icon instead
of the text "Deploy". Drop the file (or your own version of it) into `conciv/extensions/` at your
project root — create
the directory if it does not exist. No registration, no config: conciv discovers every file there.
Restart your dev server (`.server(...)` code and top-level `systemPrompt` load at boot; `Component`
and `.render(...)` hot-reload). Ask the widget to "deploy this to staging" and the agent calls
`deploy_run`, your `.server` runs in node, and your `.render` card draws the result.

The sibling example, `apps/examples/tanstack-start/conciv/extensions/blue.tsx`, shows a `theme`
field and a status-slot-only `Component` — read it for the smallest possible extension that still
does something visible.

## `defineExtension` fields

```ts
defineExtension({
  name, // required, unique — this is the registered id, not the filename
  configSchema, // optional zod schema; plugin options land here, parsed before .server() sees them
  tools, // AnyToolBuilder[] — see below
  attachments, // AnyAttachmentBuilder[] — see below
  commands, // ExtensionCommand[] — {name, description, argumentHint?, prompt(args) => string}
  views, // ExtensionView[] — {id, label, icon?, Component, actions?}, one per full panel
  Component, // Solid component mounted once per widget slot (header/footer/composer/empty/status/widget/surface/connect)
  Surface, // Solid component for the dedicated 'surface' slot — mount via MountedSurface, not branching on useSlot
  systemPrompt, // string, or (config, {cwd}) => string, appended to the agent's system prompt
  theme, // ThemeTokens — CSS custom-property overrides
  connectGate, // {preflight: () => Promise<string | null>} — gate the widget's connect flow
})
```

(`packages/extension/src/define-extension.ts:29-46` for the exact `ExtensionMeta` type.) Chain
`.client(factory)` and `.server(factory)` on the returned builder for the two runtime halves — both
optional, chain only what you need:

```tsx title="packages/extensions/whiteboard/src/client.tsx:43-84 (trimmed)"
const whiteboard = defineExtension({
  name: WHITEBOARD_NAME,
  tools: whiteboardToolClients,
  systemPrompt: WHITEBOARD_PROMPT,
  Component,
  Surface,
}).client(() =>
  createRoot((dispose) => ({
    value: {toggle, open, engaged /* … */},
    dispose,
  })),
)
export default whiteboard
```

`.client(factory)`'s return `{value, effects?, dispose?}` — `value` is merged into what
`getExtensionApi(name).useContext()` / your own `useContext` return, typed. `.server(factory)`
receives a `ServerApi<Config>` (`config`, `cwd`, `basePath`, `stateDir`, `sessions`, `harness`,
`page`, `tools`, `symbolicate`, `bundler?`, `nativeUrl()` —
`packages/extension/src/types.ts:96-108`) and returns `{context, router?, app?, turnEnd?, dispose?}`:
`context` feeds your tools' server handlers, `router` is an oRPC router mounted at
`/rpc/ext/<name>` (see RPC below), `app` is an optional Hono app for anything a tool result can't
carry (SSE, uploads), `dispose` runs at shutdown.

## The tool contract

`defineTool(definition)` returns a builder; chain `.server(execute)` XOR `.client(execute?)` to bind
it to a runtime (calling both throws — a tool has exactly one binding), then optionally
`.render(renderer)` for a card. `toolDefinition(definition)` is the identity function used when a
def needs to be imported by both a `server.ts` and a `client.ts` file (split-bundle packages);
`defineTool` itself works for `toolDefinition`'s return value too.

```ts
const tool = defineTool({
  name: 'deploy_run',            // the id the agent calls, snake_case by convention
  description: '…',              // what the agent reads to decide when to call it
  inputSchema: z.object({...}),  // zod object; reparsed at the boundary, invalid calls never reach you
  outputSchema: z.object({...}), // optional, documents the result shape
  errors: {CODE: {message: '…', data?: someZodType}}, // optional named error contract
  approval: 'ask',               // optional: surface an Approve/Deny card before every run
  promptSnippet: '…',            // optional line merged into the system prompt
  promptGuidelines: ['…'],       // optional bullet list of usage rules
  streamTitle: '…',              // optional label while the card streams
  meta: {summary, category?, mutating?, mirrors?, keywords?, positional?, hint?, icon?, label?},
})
  .server(async (input, ctx, request) => ({ /* small structured result the agent reads verbatim */ }))
  .render((props) => <Card {...props} />)
```

(`packages/extension/src/define-tool.ts:46-96` for the exact `ToolDefinition`/`ToolBuilder` types.)
`meta.summary` is required whenever you pass `meta` at all, and must not just repeat the tool name —
`defineTool` throws at module-load time otherwise
(`packages/extension/src/define-tool.ts:205-213`).

- `.server(execute)` runs in node. `execute(input, ctx, request)`: `input` is fully typed and
  already `inputSchema.parse`d; `ctx` is whatever your extension's `.server(...)` factory returned
  as `context` (unknown unless you annotate the handler's `ctx` parameter — the generic
  `server<HandlerCtx>` signature lets you write `ctx: YourCtxType`, as
  `packages/extensions/tanstack/src/tool/server.ts:18-20` does with a `type ToolCtx =
{adapter: FrameworkAdapter}` annotation); `request` is `{sessionId: string; model: string | null}`
  for the calling chat turn.
- `.client(execute?)` binds the tool to run in the browser instead (a DOM inspection tool, for
  example) — its handler receives `ClientToolCtx` (`document`, `target`, `resolve`, `addRef`,
  `resetRefs`, `consoleEntries`, `effects`). Calling `.client()` with no argument still claims the
  client binding (useful when only a render/no-op is needed).
- `.render(renderer)` replaces the generic result card. The renderer is a Solid component receiving
  `ToolCardProps`: `{part, result, ctx, durationMs?}` — `part` is the tool call, `result` is
  `undefined` while running and carries `.content`/`.error` once it lands, `ctx` is the widget's
  `ToolViewCtx` (`packages/protocol/src/tool-view-types.ts:32-37`). To restyle a **built-in** tool
  you don't own, define a render-only tool with its exact name (no `.server`/`.client`) — a
  same-name tool wins over the built-in card.

### Errors: `toolError` / `isToolError`

Throw a `toolError(code, {message?, data?})` from inside `.server`/`.client` for a structured
failure the card can branch on; `isToolError(value)` narrows it back on the render side.

```ts title="packages/extensions/tanstack/src/tool/server.ts (excerpted)"
import {defineTool, toolError} from '@conciv/extension'
// …
throw toolError('MANIFEST_UNREADABLE', {message: error instanceof Error ? error.message : String(error)})
```

(`packages/extensions/tanstack/src/tool/server.ts:1` for the import, `:76` for the throw.) Declare
the codes you can throw in the definition's `errors` field so the contract is visible from the type
alone — `packages/extensions/whiteboard/src/tool/comment/def.ts:18` declares
`const COMMENT_NOT_FOUND = {COMMENT_NOT_FOUND: {message: 'no comment with that cid in this session'}}`
and `packages/extensions/whiteboard/src/tool/comment/def.ts:59` attaches it via
`errors: COMMENT_NOT_FOUND` on a tool that can throw it.

Full field-by-field reference and the split `def.ts`/`server.ts`/`client.ts` pattern for
installable packages: `references/tool-contract.md`.

## Attachments

`defineAttachment<Ctx>({mime})` registers a chat-attachment type: `.card(component)` renders it in
the composer/thread, `.server(expand)` turns the raw document part into `ContentPart[]` the model
sees.

```ts title="packages/extensions/recorder/src/shared/attachment.ts"
import {defineAttachment} from '@conciv/extension'
export const recordingAttachment = defineAttachment<{recorder: RecorderRuntime}>({mime: RECORDER_MIME})
```

Register it on the extension's `attachments` array; the `Ctx` generic ties `.server(expand)`'s
second argument to whatever your extension's `.server(...)` factory context provides, the same way
tool `.server` handlers get typed context.

## Widget UI: `Component`, `Surface`, `views`

- **`Component`** mounts once per slot (`header`, `footer`, `composer`, `empty`, `status`,
  `widget`, `surface`, `connect`); branch on `getHostApi().useSlot()` inside it, as
  `deploy-button.tsx` does above. The host wraps it in `MountedExtension` — you normally never call
  that directly; it exists for custom hosts (see Testing below).
- **`Surface`** is a second, always-mounted component for the dedicated `'surface'` slot — used for
  a persistent overlay (the whiteboard canvas) that coexists with whatever `Component` currently
  renders. Mounted via `MountedSurface`.
- **`views`** is an array of full panels the host can route to (`ExtensionView = {id, label, icon?,
Component, actions?}`), mounted via `MountedView` when the user navigates to that view's route:

```tsx title="packages/extensions/terminal/src/client.tsx:8-19"
export const terminal = defineExtension({
  name: TERMINAL_NAME,
  views: [
    {id: 'terminal', label: 'Terminal', icon: SquareTerminal, Component: TerminalPanelView, actions: TerminalActions},
  ],
}).client(() => ({value: {store: createTerminalStore()}}))
```

`getHostApi()` (`packages/extension/src/hooks.tsx:20-38`) is the host surface available inside any
mounted `Component`/`Surface`/view/render: `useSlot`, `useToast`, `useDialog`, `usePopover`,
`useSessionId`, `useGrab`, `useComposerInsert`, `useComposerAttach`, `useNewSession`, `useRpc`,
`useApiBase`, `useOpenEditor`, `useConnect`, `useViewLock`, `useLeaveView`, plus `Suppress`/
`YieldFocus` layer-gate components. Each throws with a clear "used outside a host that provides…"
message if called where the host never wired that value — that error means the component rendered
outside `MountedExtension`/`MountedSurface`/`MountedView` (a stray render in your own test harness,
usually), not a bug in the hook.

`getExtensionApi(id)` returns `{useSlot, useContext}` scoped to one named extension — use it from a
sibling module that needs your own extension's client value without importing the whole
`defineExtension(...)` object:

```ts title="packages/extensions/terminal/src/client/terminal-context.ts"
import {getExtensionApi} from '@conciv/extension'
export const useTerminalContext = getExtensionApi(TERMINAL_NAME).useContext
```

Declare `RegisterExtension<typeof yourExtension>` against `@conciv/protocol/config-types`'s
`ExtensionRegistry` interface to get `getExtensionApi('your-name')` fully typed instead of `object`:

```ts title="packages/extensions/terminal/src/client.tsx:21-23"
declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof terminal> {}
}
```

## RPC to your own extension's server

`.server(...)`'s return can include an oRPC `router`; the host mounts it at `/rpc/ext/<name>`.
`makeExtRpcClient<TRouter>(apiBase, extensionSlug)` builds a typed client for it from the browser
(it auto-picks the browser transport when `location` exists, a node fetch client otherwise):

```ts title="packages/extensions/whiteboard/src/client/db.tsx:3,28"
import {makeExtRpcClient} from '@conciv/extension'
const client: WhiteboardClient = makeExtRpcClient<WhiteboardRouter>(apiBase, 'whiteboard')
```

For a push stream (SSE, a subscription) from a plain callback-based source, `subscriptionIterator`
turns an `emit`-style subscribe function into an `AsyncGenerator`, which oRPC's `eventIterator`
output type expects directly:

```ts title="packages/extensions/recorder/src/server.ts:5,6"
import {eventIterator, os} from '@orpc/server'
import {subscriptionIterator} from '@conciv/extension'
```

Deeper RPC and streaming patterns (custom Hono routes vs. an oRPC router, `subscriptionIterator`'s
exact signature): `references/rpc-and-testing.md`.

## Testing

`@conciv/extension-testkit`'s `getExtensionTestApi({server, host, harness?})` boots your real
`.server(...)` half, serves a real (prebuilt) client bundle through `host`, opens a real Playwright
page, and returns `{page, callTool, callToolApproved, runTypescript, session, apiBase,
serverContext, secondClient, dispose}` — no mocks, the same HTTP contract the widget uses.

```ts title="packages/extensions/whiteboard/test/canvas-it-helpers.ts:1-9"
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import whiteboard from '../src/server.js'

export const testHost = fixtureHost(fileURLToPath(new URL('../dist/test-host', import.meta.url)))
export function bootWhiteboard(): Promise<ExtensionTestApi> {
  return getExtensionTestApi({server: whiteboard, host: testHost})
}
```

`fixtureHost(distDir)` serves a directory your build already produced (build the extension's client
bundle first — testing against source is testing stale code, the same rule as the widget's own
prebuilt-bundle tests); `host` can also be a hand-written `async ({apiBase, session}) => {origin,
close}` for a custom fixture app, as `packages/extensions/tanstack/test/helpers/tanstack-test-api.ts`
does with `serveDir`. `callToolApproved` is the variant that also answers the Approve/Deny prompt for
tools with `approval: 'ask'`. Full API and the two-client (`secondClient`) pattern for realtime
features: `references/rpc-and-testing.md`.

## Installing a published extension (someone else's, or your own)

A published extension is one dependency plus a one-line re-export stub whose basename becomes the
discovery key — `conciv/extensions/tanstack.tsx` containing only `export {default} from
'@conciv/extension-tanstack'`. Publishing your own follows the same conditional-exports shape:
`browser` condition → client build, `import` condition → server build (see
`apps/site/content/docs/extending/install-first-party.mdx` for the exact `package.json` `exports`
block and the Next.js-specific JSX constraint on local, non-installed extensions).

## Red flags — stop and fix

- A tool with both `.server(...)` and `.client(...)` chained, or `.client()` called twice — a tool
  has exactly one binding; the second call throws `"already has a … binding"` at module load.
- `meta` passed without `meta.summary`, or `meta.summary` that just repeats the tool name — `defineTool`
  throws at load time, so this fails immediately, not in some later review.
- A `.render` card that assumes `result` is always defined — it is `undefined` while the tool call
  streams; render a pending state.
- `getHostApi()`/`getExtensionApi(...).useContext()` called from a component never mounted through
  `MountedExtension`/`MountedSurface`/`MountedView` (a bare unit test, a stray `render()`) — every
  hook throws "used outside a host that provides …"; mount through the testkit or those exports
  instead of hand-assembling a `HostApiContext.Provider`.
- A mutating tool (`meta.mutating: true`, or anything that changes real state) shipped without
  `approval: 'ask'` and without a documented reason — the whiteboard's own destructive tools
  (`comment.delete`, `comment.resolve`) both set it.
- Extension-testkit `host` pointed at source instead of a built `dist/` — you are testing stale
  code, same trap as the widget's own prebuilt-bundle integration tests.
- A local (non-installed) extension in a Next.js app using Solid JSX — Next compiles
  `conciv/extensions/*.tsx` as React JSX, so a local file there must be JSX-free
  (`install-first-party.mdx`'s "Local extensions alongside installed ones" section); this constraint
  does not apply to installed packages, whose browser half ships prebuilt.

## Sources

- `packages/extension/src/index.ts`
- `packages/extension/src/define-extension.ts`
- `packages/extension/src/define-tool.ts`
- `packages/extension/src/define-attachment.ts`
- `packages/extension/src/types.ts`
- `packages/extension/src/host-context.ts`
- `packages/extension/src/hooks.tsx`
- `packages/extension/src/extension-api.ts`
- `packages/extension/src/mount-extension.tsx`
- `packages/extension/src/ext-rpc.ts`
- `packages/extension/src/server-stream.ts`
- `packages/extension/src/collect-client.ts`
- `packages/extension/package.json`
- `packages/extension-testkit/src/get-extension-test-api.ts`
- `packages/extension-testkit/src/fixture-host.ts`
- `packages/protocol/src/tool-view-types.ts`
- `apps/examples/tanstack-start/conciv/extensions/deploy-button.tsx`
- `apps/examples/tanstack-start/conciv/extensions/blue.tsx`
- `packages/extensions/whiteboard/src/client.tsx`
- `packages/extensions/whiteboard/src/tool/comment/def.ts`
- `packages/extensions/terminal/src/client.tsx`
- `packages/extensions/terminal/src/client/terminal-context.ts`
- `packages/extensions/tanstack/src/tool/server.ts`
- `packages/extensions/tanstack/src/tool/client.ts`
- `packages/extensions/tanstack/test/helpers/tanstack-test-api.ts`
- `packages/extensions/recorder/src/shared/attachment.ts`
- `packages/extensions/recorder/src/server.ts`
- `packages/extensions/whiteboard/test/canvas-it-helpers.ts`
- `apps/site/content/docs/extending/index.mdx`
- `apps/site/content/docs/extending/your-first-extension.mdx`
- `apps/site/content/docs/extending/install-first-party.mdx`
- `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md`
