# Pi-exact tool + effect contract (and killing the effect registry)

**Date:** 2026-06-21
**Status:** Approved (design) — pending spec review
**Supersedes:** `2026-06-21-effects-as-extensions-design.md` (folded in here) and the
contract parts of `2026-06-20-plugin-system-design.md`.

## Why

Two problems, one root cause — our extension/tool contract drifted from Pi, the model
it was explicitly built to track:

1. **The effect system carries a registry.** `packages/widget/src/page-effects.ts`
   ends in a module-level singleton over a `Map`, fed imperatively by
   `registerEffect(highlightEffect)`. Forbidden pattern.
2. **Our tool contract is a builder chain** (`defineTool(...).server(execute).render(C)`),
   not Pi's single self-describing `ToolDefinition` object. Built-in tools are a
   hand-listed `builtinToolCards` array in `tool-ui`, not Pi's `createTool` switch +
   presets. There is no first-party discovery lane, so a built-in effect has nowhere
   Pi-shaped to live.

Decision (owner): adopt **Pi's exact `ToolDefinition` structure and field names**, with
the three swaps a browser widget forces, and restructure built-ins + discovery to match
Pi. Reference: `earendil-works/pi` `packages/coding-agent/src/core/{tools,extensions}`.

## The four documented divergences (everything else is byte-faithful to Pi)

Verified against real Pi (`earendil-works/pi`, `packages/coding-agent/src/core`):

| Pi                                                                          | conciv                                 | Why                                                                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parameters: TSchema` (typebox)                                             | `parameters: z.ZodObject` (zod)        | zod is the schema lib across the repo; MCP SDK registers `.shape`                                                                                             |
| `renderCall/renderResult => Component` (pi-tui, terminal `Theme`, `TState`) | `=> JSX.Element` (Solid, shadow DOM)   | we render a browser widget, not a terminal; Solid is reactive (no `theme`/`TState`/`lastComponent`)                                                           |
| `execute(toolCallId, params, signal, onUpdate, ctx)` required, in-process   | `execute?(input)` server-side over MCP | tool execution runs in core/node behind MCP; **optional** so a render-only card can match a foreign harness tool                                              |
| (no equivalent)                                                             | `names?: string[]`                     | conciv cards render **foreign** harness tools and one card serves several (`['Edit','MultiEdit','Write']`); Pi tools own a single name so it never needs this |

All other Pi fields are adopted verbatim: `name`, `label`, `description`,
`promptSnippet?`, `promptGuidelines?`, `renderShell?`, `prepareArguments?`, plus the
`defineTool()` identity helper, the `create<Name>ToolDefinition` factories,
`wrapToolDefinition`, the `ToolName` union + `allToolNames` set, and the
`createTool`/`createAll*`/`createCoding*` switch + preset functions (for **tools**). Pi's
`executionMode` and `TState` are dropped — `executionMode` hints Pi's agent loop, which we
don't own (tools run server-side over MCP; the agent CLI schedules calls); `TState` is
unneeded because Solid re-renders reactively.

## New contract — `@conciv/extensions`

### `ToolDefinition` (Pi shape, zod + Solid)

```ts
export interface ToolRenderResultOptions {
  expanded: boolean
  isPartial: boolean
}

export interface ToolRenderContext<TArgs = unknown> {
  args: TArgs
  toolCallId: string
  expanded: boolean
  isPartial: boolean
  isError: boolean
}

export interface ToolDefinition<
  TParams extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
  TResult = unknown,
> {
  name: string
  label: string
  description: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters: TParams
  renderShell?: 'default' | 'self'
  prepareArguments?: (args: unknown) => z.infer<TParams>
  execute(input: z.infer<TParams>): Promise<TResult> | TResult
  renderCall?: (args: z.infer<TParams>, ctx: ToolRenderContext<z.infer<TParams>>) => JSX.Element
  renderResult?: (
    result: TResult,
    options: ToolRenderResultOptions,
    ctx: ToolRenderContext<z.infer<TParams>>,
  ) => JSX.Element
}

// Identity helper, preserves param inference — matches Pi's defineTool() exactly.
export function defineTool<TParams extends z.ZodObject<z.ZodRawShape>, TResult = unknown>(
  tool: ToolDefinition<TParams, TResult>,
): ToolDefinition<TParams, TResult> {
  return tool
}
```

Dropped from `ToolRenderContext` vs Pi (all TUI-only): `lastComponent`, `invalidate`,
`state`, `cwd`, `showImages`, `executionStarted`, `argsComplete`. Solid handles
re-render reactively; shared call/result state uses a signal/context, not `state`.

### `EffectDefinition` (a small conciv-only overlay shape — Pi has no effects)

Pi has **zero** concept of an effect (verified: the term appears nowhere in Pi's
`ToolDefinition`/extension types). Effects are entirely conciv — toggleable Solid page
overlays. An effect is a small self-describing object; `defineEffect` is **just an identity
helper** (`(x) => x`), the exact parallel to `defineTool`. It is NOT a registry, NOT a
switch, NOT assembly machinery:

```ts
export interface EffectDefinition {
  name: string
  label: string
  description: string
  render: (ctx: EffectCtx) => JSX.Element // the overlay (Solid)
  setup?: (ctx: EffectSetupCtx) => (() => void) | void // optional lifecycle (e.g. hotkey)
}
export function defineEffect(effect: EffectDefinition): EffectDefinition {
  return effect
}
```

`EffectCtx` (the stable author API) and the page-introspection result types it exposes
(`LocateResult`, `InspectResult`, `TreeResult`, …) move to shared packages so an effect
file never imports widget internals — `EffectCtx` in `@conciv/extensions`, the result
types in `@conciv/protocol`, the widget supplies the concrete ctx at render. `ctx.server`
is dropped (unused by any effect).

### Extension surface

`ConcivExtension` carries declarative `tools?: ToolDefinition[]` and
`effects?: EffectDefinition[]`; `collectServerContributions` / `collectClientContributions`
gather them. `defineExtension({id, tools, effects})`.

## Built-in assembly — mirror Pi's `tools/index.ts` exactly

`packages/tools/src/index.ts` (replacing the `builtinToolCards` array):

```ts
export type ToolName = 'shell' | 'file_edit' | 'file_read' | 'search' | 'todo' | 'page' | 'ui' | 'test'
export const allToolNames: Set<ToolName> = new Set([...])

export interface ToolsOptions { /* per-tool option bags */ }

export function createToolDefinition(name: ToolName, options?: ToolsOptions): ToolDefinition { switch (name) { ... } }
export function createTool(name: ToolName, options?: ToolsOptions): AgentTool { return wrapToolDefinition(createToolDefinition(name, options)) }
export function createAllToolDefinitions(options?: ToolsOptions): Record<ToolName, ToolDefinition> { ... }
export function createAllTools(options?: ToolsOptions): Record<ToolName, AgentTool> { ... }
```

Each card module exports `create<Name>ToolDefinition()` returning a single
`ToolDefinition` with co-located `renderCall`/`renderResult`. `wrapToolDefinition`
adapts a definition into the runtime tool the harness registers.

This is Pi's hand-listed switch for built-ins — which Pi itself uses (`tools/index.ts`
is a switch, not discovery). It is NOT a mutable registry: pure factory functions,
exhaustive `switch`, no global state, no runtime mutation. The switch exists **for tools
only**, because conciv's tools need the server `ctx` injected (`injectUi/page/test/open`)
exactly like Pi's tools need `cwd` — a static array can't carry injected ctx.

**Effects get NO switch and NO `createAllEffects`.** An effect needs no server ctx (its
ctx — page introspection, openSource, toast — is built in the widget at mount, client-side),
so it is just a static object an extension carries. Built-in effects ride a built-in
**extension** (see Discovery). That is the whole point: an effect is an extension's payload,
not a separately-assembled built-in kind.

## Discovery — corrected to what Pi actually does

Pi's `discoverAndLoadExtensions` loads from **two roots, both user-writable filesystem
dirs**: `cwd/.pi/extensions/` (project) and `~/.pi/agent/extensions/` (global home). Pi
**never** ships discoverable units inside its own package — built-in _tools_ are the
`createTool` switch, full stop. The earlier "product extensions dir discovered via a
multi-root loader" was a **misread** of Pi (it read Pi's two _user_ roots as "built-in +
user"). There is no such pattern in Pi, so we drop it.

What we actually do:

- **User extensions:** the single `<root>/conciv/extensions/` dir, as today. Server side
  `readdirSync` + jiti; client side one `import.meta.glob`, feeding `window.__CONCIV__.use()`.
  (A global `~/.conciv/extensions` root can be added later as a user convenience, mirroring
  Pi's two user roots — out of scope here.)
- **Built-in `highlight`** is a normal **extension** (`defineExtension({id:'highlight',
effects:[highlightEffect]})`), bundled with the widget and applied through the **same
  `use()` pipe** as a discovered user extension — one `use(highlightExtension)` call at mount.
  No glob into node_modules, no product dir, no multi-root loader, no effect switch.

So there is one loadable unit — the **Extension** — carrying `tools?` and `effects?`.
Built-in tools are the `createTool` switch (need server ctx); built-in effects ride a
bundled built-in extension. Effects flow through extensions, exactly like a user would
author one.

## Render adaptation (the only deep UI change)

Pi splits a tool's UI into `renderCall` (args/while-running) and `renderResult` (output).
Our `tool-ui` `ToolCallCard` currently takes one `ToolRenderer`. Slice B swaps it to call
`renderCall(args, ctx)` while `isPartial`/pre-result and `renderResult(result, options, ctx)`
once output lands — keyed by `part.name` (no classify layer, per existing convention).
`renderShell: 'self'` lets a card skip the standard `ToolCard` shell.

## What dies

`createEffects()`, the `effects` singleton, the `Map` registry, `registerEffect` /
`initEffects`, the imperative `registerEffect(highlightEffect)`, the builder-chain
`defineTool().server().render()`, and the hand-listed `builtinToolCards` array.

## One PR — break freely, green by the end

This is v0, pre-release, no users ([[v0-break-api-freely]]): the whole change lands in
**one PR on the existing worktree branch**. No slices, no independently-shippable steps,
no back-compat shims — reshape every API and update every call site in the same change.
Mid-PR red is fine; the only gate is the branch is green (build + typecheck + lint + ITs)
at the end. The phases below are a **build order**, not separate PRs:

1. **Contract.** `@conciv/extensions`: `ToolDefinition` (zod+Solid) + `defineTool`
   identity + `ToolRenderContext`/`ToolRenderResultOptions`; `EffectDefinition`/
   `defineEffect`; `ConcivExtension.{tools,effects}`; `collect*` updated.
2. **Built-in tools.** `tools/index.ts` Pi mirror (`ToolName`, `createTool` switch,
   presets, `wrapToolDefinition`); delete the builder chain + `builtinToolCards`.
3. **Render split.** `tool-ui` `ToolCallCard` calls `renderCall`/`renderResult`; migrate
   every built-in card.
4. **Effects as an extension; kill the registry.** Move `EffectCtx`/result types to shared
   packages; `highlight` becomes a bundled built-in **extension** (`effects:[highlightEffect]`)
   applied via the existing `use()` pipe; `makeEffects(getEffects, ctx)` stateless dispatch
   (over effects collected from applied extensions) injected into the `effect` page-verb via
   `PageDriver`'s handler override; delete the `page-effects.ts` registry. No multi-root
   loader, no effect switch.

## Risks / open questions

- **`@conciv/tools` MCP server tools vs extension tools.** Both must end up as one
  `ToolDefinition` shape so core registers them uniformly; phases 1-2 reconcile them.
- **Render split** is the riskiest change (touches every built-in card + the e2e tool
  card ITs). Validate against the real widget per [[playwright-networkidle-hangs-live-widget]].
- **Scope.** This rewrites a contract PRs #8/#10 just shipped and supersedes the contract
  half of the plugin-system design — expected and fine (v0, break freely).

## Decision log

- **Adopt Pi's exact `ToolDefinition` structure + field names**, four documented
  divergences (zod params, Solid render, `execute?` optional/server-side, `names?` for
  foreign-harness matching). `executionMode` + `TState` dropped. Verbatim-where-possible per owner.
- **Built-in tools = Pi's `createTool` switch/presets** (need server ctx — Pi parity).
  **Built-in effects = a bundled built-in extension** applied via the `use()` pipe — NOT a
  discovery loader, NOT a switch. (Corrected: Pi's two discovery roots are both _user_ dirs;
  Pi ships no discoverable built-ins, and Pi has no effects at all.)
- **One loadable unit: the Extension**, carrying `tools?: ToolDefinition[]` and
  `effects?: EffectDefinition[]`. `defineEffect` is an identity helper only (parallel to
  `defineTool`) — no registry, no `createAllEffects`.
- **No module-level mutable state, no registry, no hand-maintained list.**
- **One PR, break freely, green by the end** (v0, no users).
