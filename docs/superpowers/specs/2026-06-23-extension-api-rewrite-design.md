# Extension API Rewrite — Declarative, Slot-Branching, Bundler-Agnostic

Date: 2026-06-23
Status: Approved (design)
Supersedes: the imperative `register`-based contract in `packages/extensions/src/contract.ts`

## Goal

Replace the imperative builder (`defineExtension({id}).client(api => api.registerTool(...)).server(api => api.systemPrompt.append(...))`) with a fully declarative, fully-typed SolidJS contract:

- One definition object per extension. **No `register` calls anywhere.**
- One `Component` per extension, **mounted with zero props** into the surface slots it claims; it branches on `useSlot()`.
- `defineExtension()` returns the extension object, and that object carries the **typed hooks** `useSlot()` and `useContext(select?)`. The Component reads everything through those hooks — nothing is passed as a prop.
- `.server()` runs in node only; its code and node-only imports never reach the browser.
- The strip transform is bundler-agnostic via **unplugin**; client discovery/serving + HMR stay Vite-first in v1 (see Build).

Tool cards are **not** part of this slot model. They stay co-located on the tool via `defineTool(...).render(Card)`, keeping the `z.infer<S>` typing end to end. This rewrite is about the extension _surfaces_, not tool rendering.

## Authoring contract

```ts
import {defineExtension} from '@mandarax/extensions'
import {readDeploymentTargets} from 'node:fs'   // referenced only inside .server() -> stripped from client

export const canvasExtension = defineExtension({
  name: 'canvas',
  Component: CanvasSurface,                       // Solid, zero props; the only UI surface
  systemPrompt: 'You can draw on the canvas.',    // declarative, optional
  theme: canvasThemeTokens,                       // declarative theme override, optional
  tools: [drawTool],                              // defineTool(...).render(...), optional
})
  .client(() => {
    // browser only, runs once per panel before its Component mounts (websocket, listeners, derived state)
    const [selection, setSelection] = createSignal<string | null>(null)
    return {
      value: {selection},                         // merged into useContext(), typed
      dispose: () => {/* tear down listeners; called on HMR + panel unmount */},
    }
  })
  .server(() => {
    // node only; returns node contributions (never crosses to the browser)
    return {tools: [serverOnlyTool], systemPrompt: 'Extra node-derived guidance.'}
  })

function CanvasSurface() {
  const slot = canvasExtension.useSlot()                       // reactive accessor, constant per mount
  const insert = canvasExtension.useContext((context) => context.insert)   // generic selector, typed exactly
  if (slot() === 'composer') return <CanvasButton onClick={() => insert('draw this')} />
  if (slot() === 'header') return <CanvasTitle />
  return null                                                  // opt out of every other slot
}
```

`Component` **must be a hoisted `function` declaration** (not an arrow assigned to the field): the body references the `canvasExtension` const defined after it, which type-checks cleanly only when hoisted. An inline arrow self-references its own initializer and collapses to `any` (TS7022). The scaffold emits the function form and a lint flags the arrow form.

Both `.server()` and `.client()` are **optional** and **chain in any order**, each returning one object.

### Slots — the `useSlot()` union

```ts
type ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | `widget:${string}`
```

The widget mounts the extension's `Component` into the slots it claims, inside a per-slot error boundary; the Component returns `null`/`undefined` for slots it does not handle. `tool:*` is intentionally **absent** — tool cards render through `defineTool(...).render(Card)` and the existing by-name dispatch in `tool-ui`, never through this Component.

`status` is a first-class slot (the prior `ui.setStatus` keyed lines collapse into the `status` slot's Component, which may render multiple lines). `widget:${string}` keys are declared by the host surfaces that exist; an extension's Component reads `useSlot()` to know which it is mounted in.

### Mount discipline (resolves the cost concern)

The Component is mounted **only into the slots an extension actually claims**, not into every slot speculatively. An extension declares the slots it paints via a `slots` hint computed at build/registration time (the scaffold infers it from the `slot()` comparisons in the Component, or the author lists them); the host mounts the Component once per claimed singleton slot. This keeps mounts O(claimed-slots), not O(all-slots), and keeps body-level `createSignal` from silently multiplying. `useSlot()` is therefore a **constant accessor per mount** — it never changes under a stable mount; it is an accessor purely for Solid call-site ergonomics (read inside JSX without prop drilling), and authors must not `createEffect(on(slot, ...))` expecting it to fire.

### The hooks live on the returned object

`defineExtension(meta)` returns the extension object carrying `useSlot` and `useContext`. There are **no Component props**. Internally both hooks read one Solid context:

```ts
// in the runtime (@mandarax/extensions client entry)
const ExtensionRuntimeContext = createContext<ExtensionHostContext>()
```

- `canvasExtension.useSlot(): () => ExtensionSlot` reads the slot off `ExtensionRuntimeContext`.
- `canvasExtension.useContext()` reads the bag off `ExtensionRuntimeContext`; the overload with a selector returns the selected slice.

The **widget owns the Provider**, set **per panel and per claimed slot mount**. Per panel it runs the extension's `.client()` once, builds that panel's host bag (every `insert`/`notify`/`client`/`requestMeta` is a closure over that panel's signals), merges the `.client()` return under the bag, and wraps each `<Component/>` mount in `<ExtensionRuntimeContext.Provider value={bagForThisPanelAndSlot}>`. So two concurrent panels (modal, quick-terminal, picture-in-picture) each get their own bag, and an extension button in panel B's composer calls panel B's `insert` — never panel A's.

### `useContext(select?)`

Returns the per-panel host bag — the union of `ToolViewCtx` and the composer-action bag — plus the extension's own `.client()` return:

```ts
type ExtensionHostContext = {
  // ToolViewCtx (protocol, stable)
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
  respondApproval?: (approvalId: string, approved: boolean) => void
  subscribeTestRunner?: (onEvent: (event: TestEvent) => void) => () => void
  openEditor?: (file: string, line?: number) => void
  // composer bag (promoted from widget-internal to the extension context)
  insert: (text: string) => void
  notify: (message: string) => void
  stageGrab: (reference: GrabReference) => void
  setBusy: (busy: boolean) => void
  client: SessionClient
  newSession: () => void
  addDivider: () => void
  compact: () => void
  resetUsage: () => void
  requestMeta: () => RequestMeta // accessor, matches the widget's signal
  currentSlot: ExtensionSlot
} & ClientReturnValue // whatever .client() returned under `value`, inferred
```

Signature (two discrete overloads — do not collapse to one `select?`, which would break inference):

```ts
useContext(): ExtensionHostContext
useContext<Selected>(select: (context: ExtensionHostContext) => Selected): Selected
```

`select` is generic — the return type is inferred from what the selector picks, so `useContext((context) => context.insert)` is typed `(text: string) => void` with no annotation. Backed by a Solid reactive read so selection stays fine-grained.

`stageGrab` and `setBusy` are included because the built-in element-picker action depends on `stageGrab`; promoting them keeps built-in actions expressible as extensions.

### Typing

`defineExtension(meta)` returns `ExtensionBuilder<{}>`. Each chain step returns a **re-parameterized builder type** (the runtime returns the same instance; only the type changes):

```ts
interface ExtensionBuilder<ClientReturnValue> {
  name: string
  useSlot: () => () => ExtensionSlot
  useContext: {
    (): ExtensionHostContext & ClientReturnValue
    <Selected>(select: (context: ExtensionHostContext & ClientReturnValue) => Selected): Selected
  }
  client<ReturnValue extends object>(
    fn: () => {value: ReturnValue; dispose?: () => void},
  ): ExtensionBuilder<ClientReturnValue & ReturnValue>
  server(fn: () => ExtensionServerContributions): ExtensionBuilder<ClientReturnValue>
}
```

`.client()` adds its `value` type to `ClientReturnValue`; `.server()` preserves it. Both chain orders compile (verified against the repo `tsc` under `--strict`). The hooks are typed against the same instance the Component closes over.

## Build — strip transform (bundler-agnostic) + Vite-first serving

One file holds both halves. The transform produces two views:

- **Server view (node):** the module as written. The engine loads it (jiti, bundler-agnostic) at boot, runs `.server()`, drains `tools` + `systemPrompt` across all extensions, mounts tools on `/api/mcp`, appends the prompt.
- **Client view (browser):** an AST pass **strips the `.server(fn)` call argument** (replaces with `undefined`) and removes import bindings that become unreferenced after stripping; the bundler then tree-shakes the dead node imports. The browser receives `Component`, top-level fields, `theme`, `tools`, and `.client()` — never node code.

### Strip engine + honest limits

- The strip pass uses **babel** (`path.scope.getBinding().references` gives real binding analysis), not the repo's parse-only `oxc-parser` (which has no scope table). It reuses the existing Solid-zone babel compile in `packages/plugin/src/core/compile-extension.ts`.
- The strip is reliable only for node imports referenced **exclusively inside the `.server` argument's own scope**. Authors keeping node-only deps must import them **inside** the `.server()` body so they sit within the stripped argument and drop cleanly. This is a **requirement**, not a recommendation.
- **Transitive node imports through a local util** (`import {x} from './util'` where `util` imports `node:fs`) cannot be seen by a single-file strip pass; they are **unsupported** and the Build IT must assert against them.
- The build **fails** (not warns) in CI when a top-level `node:*` import survives into the client view.
- Each tool's own `.server(execute)` (`defineTool`) is a **second strip site** with the same rules.

### Discovery + loading

- **User extensions:** auto-discovered at the path(s) given to the plugin config (glob). Each is transformed into server + client views.
- **Built-in extensions:** imported by the consumer and handed to the engine via an array — `{extensions: [canvasExtension, ...]}`. Because npm imports resolve into `node_modules` (which the transform skips by design), `@mandarax/extensions` built-ins **ship pre-split at publish time** via a conditional `exports` map (`browser` condition → client view, `node`/`default` → full). There is no "same transform handles built-ins" shortcut.
- The client virtual module re-exports the client views; the widget imports it and mounts each extension's `Component` into its claimed slots.
- **Bundler scope (v1):** the strip pass runs in unplugin's shared `transform` hook (portable). Client discovery/serving (the virtual module, the `import.meta.glob` expansion, the dev route, HMR) remain **Vite-first** — they use Vite-only primitives. Under webpack/rspack/esbuild the server engine boots and the host serves the client bundle; full client parity for those bundlers is out of scope for v1 and stated as such.

### HMR

- Client `.client()` re-runs on HMR. The contract's `dispose` (returned alongside `value`) is called before re-running, so websockets/listeners are not duplicated.
- Server `.server()` needs a dev-server restart (no live server watcher this round); the tool description + skill say so.

## Data-flow boundary

Server state does **not** cross to the browser via the context. There are exactly **two** server→client paths, both per-tool-call (not via `useContext()`):

1. **Tool results** reach a card via `defineTool(...).render(Card)`'s `ToolCardProps.result`.
2. **Approval** — `part.state === 'approval-requested'` reaches the card; the decision posts back out-of-band via `respondApproval` (the harness owns the loop). The host renders the uniform `ApprovalBar` around every tool card, unchanged.

The extension context bag carries browser-side state only (per-panel host closures + `.client()` return). This keeps the contract serialization-free.

## Ordering + conflict semantics

- **Tools merge** = top-level `tools` ∪ `.server()`-returned `tools`, deduped by `name`. Extension tools come **before** built-ins so an extension can override a built-in by name (matches the current `tool-ui` first-match dispatch). Across extensions, consumer-array order then glob order sorted by path (deterministic).
- **systemPrompt** is appended in the same deterministic order: built-ins, then consumer-array extensions, then path-sorted glob extensions. Per-tool `promptSnippet`/`promptGuidelines` on `defineTool` are **kept** and drained into the prompt as today.
- **theme** is shallow-merged in the same definition order (last wins on a key) and applied once at boot into the shadow-root/`document.head` target per the wind4 `@property` constraint. An extension whose Component returns `null` for every slot can still contribute `theme`.

## What is removed

- `ClientApi` / `ServerApi` and every `register` method (`registerTool`, `registerComposerAction`, `ui.setWidget/setHeader/setFooter/setStatus/setEmptyState/setTheme`).
- `ExtComposerAction` / `ComposerActionCtx` / `UiFactory` / `EmptyStateFactory` — collapsed into `Component` + `useSlot()` + `useContext()`.
- The `MandaraxExtension` / `ExtensionBuilder` (old imperative) shapes, `collectClientContributions` / `toolRenderers`, the `window.__MANDARAX__.use/queue` install seam in `extension-runtime.ts` / `mandarax-global.ts` (replaced by the client virtual module + Provider; the browser ITs gain a new injection path through the array/virtual module), `ui-store.tsx` (the `setWidget/Header/Footer/Status` store).
- The `defineExtension({id})` field — renamed to `name`.

## What is kept

- `defineTool(...)` zod-typed tool shape, `.server(execute)` boundary re-parse, and **`.render(Card)`** (tool cards do not move into the slot model).
- `ExtensionServerTool` structural shape (core registers extension tools alongside built-ins with no cast) and `ExtensionServerContributions`.
- The by-name tool-card dispatch in `tool-ui` and the uniform `ApprovalBar`.
- jiti server loading + the Solid-zone babel compile for `.tsx` extensions in consumer bundlers.

## Testing

- Real-browser (Playwright) widget IT: an extension renders into `composer`, `header`, `status`; `insert`/`notify` work; `useContext(select)` narrows; **two concurrent panels** prove per-panel `insert` isolation.
- Real-browser IT: the live test card (`subscribeTestRunner`) opens exactly one SSE connection per card and tears down on unmount; HMR re-run of `.client()` does not duplicate listeners (`dispose` fires).
- Node IT: `.server()` contributes a tool to `/api/mcp` and executes; `systemPrompt` lands in the prompt file in deterministic order.
- Build IT (real consumer bundler, transitive-util fixture): the emitted client chunk contains **no node import**; the server view does; a node-only symbol used by `.server()` is absent from the client chunk; a surviving top-level `node:*` import fails the build.
- Agent-tool IT: `mandarax_extensions` catalog/scaffold/validate reflect the new contract.
- No jsdom, no mocks — real server (`http.createServer`), real browser, real MCP.

## Implementation slices

This is too large for one PR. Land in slices, each independently testable:

1. **Contract + discovery** (`@mandarax/extensions`): new `defineExtension`/`useSlot`/`useContext`, the `ExtensionRuntimeContext`, builder generics, `.server()`/`.client()` return-object drain, keep `defineTool`/`.render`/`ExtensionServerTool`. Unit + node IT. Rewrite `blue.ts`/`deploy-button.tsx` as fixtures.
2. **Build transform** (`@mandarax/plugin`): babel `.server`-strip pass + built-in pre-split + client virtual module + jiti server load. Build IT. Highest risk — isolate it.
3. **Widget slots** (`mount.tsx`, delete `ui-store.tsx`, rewire `empty-state.tsx`/`chat-panel.tsx`, per-panel `ExtensionRuntimeContext.Provider`, fold the composer bag + `ToolViewCtx` into `ExtensionHostContext`, the `status` slot). Browser IT (incl. two-panel).
4. **tool-ui** stays mostly as-is (tool cards not moving); only the `tools` prop threading and any `ToolCardEntry` naming touched. Confirm no regression.
5. **Agent tool + SKILL + scaffolds + catalog** (`@mandarax/tools` description, `catalog.ts` templates/validate, `SKILL.md`): rewrite to the new shape. Lands last once the authoring surface is frozen.

Core (`engine.ts`/`app.ts`/`mcp.ts`) needs no slice if `ExtensionServerContributions`/`ExtensionServerTool` are preserved — verify before slice 1.

## Open implementation details (resolved during planning, not blocking design)

1. Whether `slots` is author-listed or build-inferred from the `slot()` comparisons (mount-discipline hint).
2. Exact glob/config surface of the plugin for discovery paths.
3. The precise `widget:${string}` key registry (which host surfaces expose widget slots).
