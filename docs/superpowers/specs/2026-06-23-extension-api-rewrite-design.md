# Extension API Rewrite — Declarative, Slot-Branching, Bundler-Agnostic

Date: 2026-06-23
Status: Approved (design)
Supersedes: the imperative `mx.register*` contract in `packages/extensions/src/contract.ts`

## Goal

Replace the imperative builder (`defineExtension({id}).client(mx => mx.registerTool(...)).server(mx => mx.systemPrompt.append(...))`) with a fully declarative, fully-typed SolidJS contract:

- One definition object per extension. **No `register*` calls anywhere.**
- One `Component` per extension, mounted into every slot; it branches on `useSlot()`.
- `useContext(select?)` returns the host context the widget already passes, with an optional generic selector.
- `.server()` runs in node only; its code and node-only imports never reach the browser.
- The build is an **unplugin** transform (vite/webpack/rspack/rollup/esbuild), not a vite-only plugin.

## Authoring contract

```ts
import {defineExtension} from '@mandarax/extensions'
import {db} from 'node:x'              // used only by .server() -> stripped from client chunk

export const canvasExtension = defineExtension({
  name: 'canvas',
  Component: Canvas,                    // Solid; the only UI surface
  systemPrompt: 'You can draw on the canvas.',  // shared/declarative, optional
  theme: tokens,                        // declarative theme override, optional
  tools: [drawTool],                    // MCP tools, optional (defineTool, unchanged shape)
})
  .server(() => {
    // node only: side effects, returns node contributions if any
    return {tools: [serverOnlyTool]}
  })
  .client(() => {
    // browser only, runs once even with no slot mounted (ws, listeners, derived state)
    const selection = createSignal(null)
    return {selection}                  // merged into useContext(), typed
  })

function Canvas() {
  const slot = canvas.useSlot()                    // reactive accessor of the current slot
  const insert = canvas.useContext(c => c.insert)  // generic selector, typed exactly
  if (slot() === 'composer') return <CanvasButton onClick={() => insert('draw this')} />
  if (slot() === 'header') return <CanvasTitle />
  return null                                      // opt out of every other slot
}
```

Both `.server()` and `.client()` are **optional** and chain in **any order**, each returning one object.

### Slots — the `useSlot()` union

```ts
type Slot = 'header' | 'footer' | 'composer' | 'empty' | `widget:${string}` | `tool:${string}`
```

The widget mounts the same `Component` into each slot inside an error boundary. The component returns `null`/`undefined` for slots it does not handle. Tool cards are unified into this model: a tool's card renders under `tool:<toolName>`, with `part`/`result` available from `useContext()` on those slots. This removes the separate `ToolCardEntry` array.

### `useContext(select?)`

Returns the host context the widget already builds today — the **union** of `ToolViewCtx` and the composer-action bag, plus the extension's own `.client()` return, plus slot-specific `part`/`result` on `tool:*` slots:

```ts
type HostContext = {
  // ToolViewCtx (protocol, stable)
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
  respondApproval?: (approvalId: string, approved: boolean) => void
  subscribeTestRunner?: (onEvent: (e: TestEvent) => void) => () => void
  openEditor?: (file: string, line?: number) => void
  // composer bag (promoted from widget-internal to the extension context)
  insert: (text: string) => void
  notify: (message: string) => void
  client: SessionClient
  newSession: () => void
  addDivider: () => void
  compact: () => void
  resetUsage: () => void
  requestMeta: RequestMeta
  // tool slots only
  part?: ToolCallPart
  result?: ToolResultPart
} & ClientReturn // whatever .client() returned, inferred
```

Signature:

```ts
useContext(): HostContext
useContext<T>(select: (ctx: HostContext) => T): T
```

`select` is generic — the return type is inferred from what the selector picks, so `useContext(c => c.insert)` is typed `(text: string) => void` with no annotation. Implemented as a Solid reactive accessor under the hood so selection stays fine-grained.

### Typing

`defineExtension(meta)` returns a builder carrying `useSlot`/`useContext`. `.client(fn)` threads `ReturnType<fn>` into the builder's `ClientReturn` type param so `useContext()` reflects the author's own returned state. `Component` references the extension const at call time (defined after via the const), so the hooks are typed against the same instance.

## Build — unplugin AST split

One file holds both halves. The unplugin transform produces two views of each extension module:

- **Server view (node):** the module as written. The engine loads it (jiti, bundler-agnostic) at boot, runs `.server()`, drains `tools` + `systemPrompt` across all extensions, mounts tools on `/api/mcp`, appends prompt.
- **Client view (browser virtual chunk):** the transform **strips the `.server(fn)` call argument** (replaces with `undefined`) and removes import specifiers that become unreferenced after stripping; the bundler then tree-shakes the dead node imports. The browser receives `Component`, top-level fields, `theme`, `tools`' render halves, and `.client()` — never node code.

**Known limit (documented, not solved here):** side-effectful node imports (`import 'node:x'` with no binding, or imports with module side effects) cannot be statically proven dead and may survive the strip. Authors keeping heavy/native node deps behind `.server()` should import them inside the `.server` body (local import) so they are inside the stripped argument and removed cleanly. The transform warns when a top-level node-builtin import survives into the client view.

### Discovery + loading

- **User extensions:** auto-discovered at the path(s) given to the unplugin config (glob). Each is transformed into server + client views.
- **Built-in extensions:** imported by the consumer and handed to the engine via an array — `{extensions: [canvasExtension, ...]}`. The same unplugin transform applies to `@mandarax/extensions/*` sources so built-ins split identically; no separate pre-split build.
- The client virtual module re-exports the client views; the widget imports it and mounts each extension's `Component` into the slots. HMR rides the bundler graph (client) / dev-server restart (server), as today.

## Data-flow boundary

Server state does **not** cross to the browser. The only server→client path is tool execution: a tool result reaches its `tool:*` slot via `useContext().result`. `useContext()` otherwise carries browser-side state only (host bag + `.client()` return). This keeps the contract serialization-free.

## What is removed

- `ClientApi` / `ServerApi` and every `register*` method (`registerTool`, `registerComposerAction`, `ui.setWidget/setHeader/setFooter/setStatus/setEmptyState/setTheme`).
- The `ExtComposerAction` / `ComposerActionCtx` / `UiFactory` / `EmptyStateFactory` indirection — all collapse into `Component` + `useSlot()` + `useContext()`.
- The separate `ToolCardEntry` array and by-name `<Dynamic>` switch in `tool-ui` — tool cards become `tool:*` slots.
- `MandaraxExtension` / `ExtensionBuilder` imperative shapes.

## What is kept

- `defineTool(...)` zod-typed tool shape and `.server(execute)` boundary re-parse (the `.render()` half folds into the `tool:*` slot).
- `ExtensionServerTool` structural shape (so core registers extension tools alongside built-ins with no cast).
- jiti server loading + the Solid-zone compile for `.tsx` extensions in consumer bundlers.

## Testing

- Real-browser (Playwright) widget IT: an extension renders into `composer`, `header`, and a `tool:*` slot; `insert`/`notify` work; `useContext(select)` narrows.
- Node IT: `.server()` contributes a tool to `/api/mcp` and executes; `systemPrompt` lands in the prompt file.
- Build IT: unplugin client view contains no node import; server view does; a node-only symbol used by `.server()` is absent from the client chunk.
- No jsdom, no mocks — real server (`http.createServer`), real browser, real MCP.

## Open implementation details (resolved during planning, not blocking design)

1. Whether `useContext()` returns the bag directly or an accessor wrapper when no selector is passed (Solid reactivity ergonomics).
2. unplugin transform engine (oxc vs babel) for the strip pass, reusing the existing Solid-zone compile where possible.
3. Exact glob/config surface of the unplugin for discovery paths.
