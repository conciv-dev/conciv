# Pi-exact tool + effect contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace conciv's builder-chain tool contract + effect registry with Pi's
self-describing `ToolDefinition` API (zod + Solid swaps), restructure built-in tools into
Pi's `createTool` switch/presets, and re-express effects as a small `defineEffect` shape
carried by an **extension** — deleting the `page-effects.ts` registry. `highlight` ships as
a bundled built-in extension applied via the existing `use()` pipe (no discovery loader, no
effect switch).

**Architecture:** `@conciv/extensions` becomes the single source of the `ToolDefinition`
/ `EffectDefinition` shapes (Pi field names verbatim, four documented divergences). One
loadable unit — the Extension — carries `tools?` and `effects?`. `@conciv/tools` defines
conciv's own tools as `ToolDefinition`s with `execute` (assembled by a `createToolDefinition`
switch that injects server ctx); `@conciv/tool-ui` cards become render-only `ToolDefinition`s
(no `execute`) matched by `name`/`names` to foreign harness tools. Built-in effects need no
server ctx, so `highlight` is a plain extension carrying `effects:[highlightEffect]`, bundled
and `use()`-applied like a user extension.

**Tech Stack:** TypeScript, zod, SolidJS, vitest (+ Storybook browser project + real-browser
Playwright ITs), turborepo, oxlint/oxfmt, jiti (server extension load), Vite (`import.meta.glob`).

## Global Constraints

- **One PR, break freely, green only at the end.** v0, no users ([[v0-break-api-freely]]).
  Reshape every API and update every call site in this branch; no back-compat shims.
- **No module-level mutable state, no registry, no hand-maintained list.** All state inside
  functions; dispatch by name over discovered/switched units.
- **Pi field names verbatim** except the documented swaps: `parameters` is zod, `renderCall`/
  `renderResult` return Solid `JSX.Element`, `execute` is server-side **and optional**
  (absent = render-only card for a foreign harness tool).
- **Tests are native + real.** getByRole/getByText/toBeVisible, never querySelector/class
  selectors ([[test-assertions-native]]); no jsdom ([[no-jsdom]]); no stubs/mocks — real
  http server + real browser ([[no-stubs-or-mocks]]); widget ITs use `browser.newPage()`
  ([[widget-it-newpage-not-newcontext]]); `domcontentloaded` not networkidle
  ([[playwright-networkidle-hangs-live-widget]]).
- **Build via turbo** ([[use-turbo-build]]); reproduce CI with the real `turbo … --filter`
  from root, unique `browser.api.port` per parallel test ([[reproduce-with-exact-ci-command]]).
- Run everything from the worktree `.claude/worktrees/page-effects` ([[worktree-stay-in-worktree]]).
- Production code: zero narration comments, functional style ([[code-style-no-comments-functional]]).

---

## Phase 1 — Contract (`@conciv/extensions`)

### Task 1.1: `ToolDefinition` + render context + `defineTool`

**Files:**

- Modify: `packages/extensions/src/contract.ts`
- Test: `packages/extensions/test/contract.test.ts` (create)

**Interfaces:**

- Produces: `ToolDefinition<TParams, TResult>`, `ToolRenderContext<TArgs>`,
  `ToolRenderResultOptions`, `defineTool(tool) => tool`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/extensions/test/contract.test.ts
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineTool} from '../src/contract.js'

describe('defineTool', () => {
  it('is an identity that preserves the definition and infers params', () => {
    const t = defineTool({
      name: 'demo',
      label: 'Demo',
      description: 'd',
      parameters: z.object({x: z.number()}),
      execute: (input) => input.x + 1,
    })
    expect(t.name).toBe('demo')
    expect(t.execute?.({x: 1})).toBe(2)
  })
  it('allows a render-only definition with no execute', () => {
    const t = defineTool({name: 'Bash', label: 'Bash', description: 'd', parameters: z.object({})})
    expect(t.execute).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @conciv/extensions exec vitest run test/contract.test.ts`
Expected: FAIL — `defineTool` not exported / type errors.

- [ ] **Step 3: Implement in `contract.ts`** (replace `ExtensionTool`/`ToolBuilder`/`defineTool` builder)

```ts
import {z} from 'zod'
import type {JSX} from 'solid-js'

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
  names?: string[]
  label: string
  description: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters: TParams
  renderShell?: 'default' | 'self'
  prepareArguments?: (args: unknown) => z.infer<TParams>
  execute?: (input: z.infer<TParams>) => Promise<TResult> | TResult
  renderCall?: (args: z.infer<TParams>, ctx: ToolRenderContext<z.infer<TParams>>) => JSX.Element
  renderResult?: (
    result: TResult,
    options: ToolRenderResultOptions,
    ctx: ToolRenderContext<z.infer<TParams>>,
  ) => JSX.Element
}

export function defineTool<TParams extends z.ZodObject<z.ZodRawShape>, TResult = unknown>(
  tool: ToolDefinition<TParams, TResult>,
): ToolDefinition<TParams, TResult> {
  return tool
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @conciv/extensions exec vitest run test/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/src/contract.ts packages/extensions/test/contract.test.ts
git commit -m "feat(extensions): Pi-shaped ToolDefinition + defineTool (zod+Solid, execute optional)"
```

### Task 1.2: `EffectDefinition` + `EffectCtx` + `defineEffect`

**Files:**

- Modify: `packages/extensions/src/contract.ts`
- Modify: `packages/extensions/src/index.ts` (export new symbols)
- Test: `packages/extensions/test/contract.test.ts` (extend)

**Interfaces:**

- Consumes: protocol result types from Task 2.1 — author this task to import
  `LocateResult`, `InspectResult`, `TreeResult` from `@conciv/protocol/page-introspect-types`.
- Produces: `EffectDefinition`, `EffectCtx`, `EffectSetupCtx`, `defineEffect`.

- [ ] **Step 1: Write the failing test** (append)

```ts
import {defineEffect} from '../src/contract.js'
describe('defineEffect', () => {
  it('is an identity helper carrying the effect metadata', () => {
    const e = defineEffect({name: 'highlight', label: 'Highlight', description: 'd', render: () => null})
    expect(e.name).toBe('highlight')
  })
})
```

- [ ] **Step 2: Run, verify fails** — `pnpm --filter @conciv/extensions exec vitest run test/contract.test.ts` → FAIL.

- [ ] **Step 3: Implement** (add to `contract.ts`)

```ts
import type {LocateResult, InspectResult, TreeResult} from '@conciv/protocol/page-introspect-types'

export interface EffectCtx {
  page: {
    elementAt: (x: number, y: number) => Element | null
    componentHostAt: (el: Element) => Element | null
    describe: (host: Element) => {component: string; file: string | null}
    locate: (el: Element) => Promise<LocateResult | null>
    inspect: (el: Element) => Promise<InspectResult | null>
    tree: () => Promise<TreeResult>
    find: (name: string) => {matches: {ref: string; component: string}[]; total: number}
    addRef: (el: Element) => string
  }
  openSource: (locate: LocateResult) => Promise<'opened' | 'no-source' | 'failed'>
  toast: (msg: string, tone?: 'info' | 'success' | 'error') => void
  env: {reducedMotion: () => boolean; doc: Document; win: Window}
  disable: () => void
}
export interface EffectSetupCtx {
  enable: () => void
  disable: () => void
  isEnabled: () => boolean
}
export interface EffectDefinition {
  name: string
  label: string
  description: string
  render: (ctx: EffectCtx) => JSX.Element
  setup?: (ctx: EffectSetupCtx) => (() => void) | void
}
export function defineEffect(effect: EffectDefinition): EffectDefinition {
  return effect
}
```

- [ ] **Step 4: Run, verify passes.**
- [ ] **Step 5: Commit** — `feat(extensions): Pi-shaped EffectDefinition + EffectCtx + defineEffect`

### Task 1.3: extension surface + collectors

**Files:**

- Modify: `packages/extensions/src/contract.ts` (`ConcivExtension`, `defineExtension`)
- Modify: `packages/extensions/src/discovery.ts` (collect tools + effects)
- Modify: `packages/extensions/src/index.ts`
- Test: `packages/extensions/test/discovery.test.ts` (create)

**Interfaces:**

- Produces: `ConcivExtension {id; tools?: ToolDefinition[]; effects?: EffectDefinition[]; clientFn?; serverFn?}`,
  `collectServerContributions(exts) => {tools: ToolDefinition[]; systemPrompt: string[]}`,
  `collectClientContributions(exts) => {tools: ToolDefinition[]; effects: EffectDefinition[]}`.

- [ ] **Step 1: Failing test**

```ts
// packages/extensions/test/discovery.test.ts
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  defineExtension,
  defineTool,
  defineEffect,
  collectClientContributions,
  collectServerContributions,
} from '../src/index.js'

const ext = defineExtension({
  id: 'x',
  tools: [
    defineTool({
      name: 'do',
      label: 'Do',
      description: 'd',
      parameters: z.object({}),
      execute: () => 'ok',
      renderResult: () => null,
    }),
  ],
  effects: [defineEffect({name: 'fx', label: 'Fx', description: 'd', render: () => null})],
})

describe('collectors', () => {
  it('client gathers tools (with renderResult) and effects', () => {
    const c = collectClientContributions([ext])
    expect(c.tools.map((t) => t.name)).toEqual(['do'])
    expect(c.effects.map((e) => e.name)).toEqual(['fx'])
  })
  it('server gathers executable tools + prompt text', () => {
    const s = collectServerContributions([ext])
    expect(s.tools.map((t) => t.name)).toEqual(['do'])
  })
})
```

- [ ] **Step 2: Run, verify fails.**

- [ ] **Step 3: Implement** — update `ConcivExtension`/`defineExtension` to carry `effects?`, and rewrite `discovery.ts`:

```ts
export function collectServerContributions(extensions: ConcivExtension[]) {
  const tools: ToolDefinition[] = []
  const systemPrompt: string[] = []
  const add = (t: ToolDefinition) => {
    if (t.execute) tools.push(t)
    if (t.promptSnippet) systemPrompt.push(t.promptSnippet)
    if (t.promptGuidelines?.length) systemPrompt.push(...t.promptGuidelines)
  }
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) add(t)
    ext.serverFn?.({registerTool: add, systemPrompt: {append: (text) => systemPrompt.push(text)}})
  }
  return {tools, systemPrompt}
}

export function collectClientContributions(extensions: ConcivExtension[]) {
  const tools: ToolDefinition[] = []
  const effects: EffectDefinition[] = []
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) if (t.renderCall || t.renderResult) tools.push(t)
    for (const e of ext.effects ?? []) effects.push(e)
  }
  return {tools, effects}
}
```

- [ ] **Step 4: Run, verify passes.**
- [ ] **Step 5: Commit** — `feat(extensions): extension surface carries tools+effects; collectors gather both`

---

## Phase 2 — Relocate page-introspection result types to `@conciv/protocol`

### Task 2.1: move result types; re-export from react-bridge

**Files:**

- Create: `packages/protocol/src/page-introspect-types.ts`
- Modify: `packages/protocol/package.json` (exports map: add `./page-introspect-types`)
- Modify: `packages/widget/src/react-bridge.ts` (import + re-export the moved types)
- Test: covered by `turbo typecheck` (pure types).

- [ ] **Step 1: Create the protocol module** — move these verbatim from `react-bridge.ts`:

```ts
// packages/protocol/src/page-introspect-types.ts
export type RawFrame = {fileName?: string; line?: number; column?: number; fn?: string}
export type SourceLoc = {file: string; line: number; column: number}
export type Owner = {component: string; ref: string}
export type Rect = {x: number; y: number; w: number; h: number}
export type TreeNode = {component: string; ref: string; children: TreeNode[]; truncated?: number}
export type HookNode = {id: number; name: string; value: unknown; editable: boolean}
export type LocateResult = {
  component: string | null
  stack: string[]
  frames: RawFrame[]
  owners: Owner[]
  source?: SourceLoc
}
export type InspectResult = {
  component: string | null
  props: unknown
  state: unknown
  hooks: HookNode[]
  rect: Rect | null
}
export type TreeResult = {nodes: TreeNode[]; truncated: number}
```

- [ ] **Step 2: Add the exports-map entry** in `packages/protocol/package.json`:

```json
"./page-introspect-types": {"types": "./dist/page-introspect-types.d.ts", "import": "./dist/page-introspect-types.js"}
```

- [ ] **Step 3: In `react-bridge.ts`** delete those local `export type` defs and re-export:

```ts
export type {
  RawFrame,
  SourceLoc,
  Owner,
  Rect,
  TreeNode,
  HookNode,
  LocateResult,
  InspectResult,
  TreeResult,
} from '@conciv/protocol/page-introspect-types'
```

- [ ] **Step 4: Verify** — `pnpm turbo build typecheck --filter=@conciv/protocol --filter=@conciv/widget --filter=@conciv/extensions` → PASS.
- [ ] **Step 5: Commit** — `refactor(protocol): own page-introspection result types (shared by widget + extensions)`

---

## Phase 3 — conciv's own tools become `ToolDefinition`s

### Task 3.1: convert each conciv tool def

**Files (each holds a `conciv*ToolDef`):**

- Modify: `packages/tools/src/page.ts`, `ui.ts`, `test.ts`, `open.ts`, `extensions-tool.ts`
  (`effect.ts` is removed in Phase 6 — folded into the highlight extension's tool, see Task 6.2).
- Modify: `packages/tools/src/server.ts`, `packages/tools/src/types.ts`
- Test: `packages/tools/test/*` (existing, adjust to new shape)

**Recipe (apply to each):** replace `concivXToolDef = defineTool({...}).server(...)`-style with a
single `defineTool({...})` object carrying `name`, `label`, `description`, `parameters` (the existing
zod schema), `promptSnippet`/`promptGuidelines` where present, and `execute(input)` (the body that was
in `.server()`). `server.ts` stops calling `.server(...)`; it reads `def.execute` directly:

```ts
function toServerTool(def: ToolDefinition, run: (input: unknown) => Promise<unknown>): ConcivServerTool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.parameters,
    execute: (input) => run(def.parameters.parse(input)),
  }
}
```

`ConcivServerTool` in `types.ts` stays (the MCP wire shape). The per-tool `ctx` wiring (`ctx.page`,
`ctx.injectUi`, `ctx.test`, `ctx.open`) moves into each def's `execute` via a factory
`createXToolDefinition(ctx)` (Pi `create<Name>ToolDefinition` parity).

- [ ] **Step 1–N (per tool):** write/adjust the tool's IT (e.g. `page-tool.it.test.ts`) to call the
      new `createPageToolDefinition(ctx).execute(input)`, run → fail, implement the def, run → pass.
- [ ] **Commit** per tool — `refactor(tools): <name> as Pi ToolDefinition with execute`

### Task 3.2: `tools/index.ts` — Pi mirror

**Files:**

- Create: `packages/tools/src/index.ts` (or replace barrel)
- Modify: `packages/tools/src/server.ts` (consume `createAllToolDefinitions`)
- Test: `packages/tools/test/tools-index.test.ts` (create)

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from 'vitest'
import {allToolNames, createToolDefinition, createAllToolDefinitions} from '../src/index.js'
const ctx = /* minimal stub ctx with no-op page/ui/test/open */ {} as never
describe('tools index (pi mirror)', () => {
  it('createToolDefinition switches by name', () => {
    expect(createToolDefinition('page', ctx).name).toBe('conciv_page')
  })
  it('createAllToolDefinitions covers allToolNames', () => {
    expect(new Set(Object.keys(createAllToolDefinitions(ctx)))).toEqual(allToolNames)
  })
})
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Implement** mirroring `pi tools/index.ts`:

```ts
export type ToolName = 'page' | 'ui' | 'test' | 'open' | 'extensions'
export const allToolNames: Set<ToolName> = new Set(['page', 'ui', 'test', 'open', 'extensions'])
export function createToolDefinition(name: ToolName, ctx: ConcivToolContext): ToolDefinition {
  switch (name) {
    case 'page':
      return createPageToolDefinition(ctx)
    case 'ui':
      return createUiToolDefinition(ctx)
    case 'test':
      return createTestToolDefinition(ctx)
    case 'open':
      return createOpenToolDefinition(ctx)
    case 'extensions':
      return createExtensionsToolDefinition(ctx)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
export function createAllToolDefinitions(ctx: ConcivToolContext): Record<ToolName, ToolDefinition> {
  return {
    page: createPageToolDefinition(ctx),
    ui: createUiToolDefinition(ctx),
    test: createTestToolDefinition(ctx),
    open: createOpenToolDefinition(ctx),
    extensions: createExtensionsToolDefinition(ctx),
  }
}
```

`server.ts` builds its MCP tools from `Object.values(createAllToolDefinitions(ctx)).map((d) => toServerTool(d, d.execute!))`.

- [ ] **Step 4: Run, verify passes.** + `pnpm turbo build --filter=@conciv/tools`.
- [ ] **Step 5: Commit** — `refactor(tools): Pi-style index (ToolName, createToolDefinition switch, presets)`

---

## Phase 4 — Render split in `@conciv/tool-ui`

### Task 4.1: `ToolCallCard` calls `renderCall`/`renderResult`; cards become render-only `ToolDefinition`s

**Files:**

- Modify: `packages/tool-ui/src/tool-call.tsx` (dispatch), `src/index.tsx` (export `builtinTools`)
- Modify: every `packages/tool-ui/src/cards/*.tsx`
- Modify: `packages/tool-ui/src/types.ts` (drop `ToolCardEntry`, use `ToolDefinition`)
- Test: existing storybook stories + widget ITs

**Interfaces:**

- Consumes: `ToolDefinition` (Phase 1), `ToolRenderContext`/`ToolRenderResultOptions`.
- Produces: `builtinTools: ToolDefinition[]` (replaces `builtinToolCards`).

**Recipe (per card):** convert `export const shellTool: ToolCardEntry = {names:['Bash'], render: ShellCard}`
into a render-only `ToolDefinition`:

```ts
export const shellTool = defineTool({
  name: 'Bash',
  label: 'Bash',
  description: '',
  parameters: ShellInput,
  renderResult: (_result, _options, ctx) => <ShellCard args={ctx.args} /* …host ctx via context… */ />,
})
```

The existing single `render(props: ToolCardProps)` body maps to `renderResult`. `ToolViewCtx` (apiBase,
sendMessage, openEditor, subscribeTestRunner, respondApproval, durationMs) is supplied by the widget; the
host passes it alongside the part — keep a `ToolHostCtx` provided via Solid context so `renderResult` stays
Pi-shaped (`(result, options, ctx)`), with host seams read from context, not the signature.

- [ ] **Step 1:** update one card's story (e.g. `shell.stories.tsx`) to assert it renders via the new
      dispatch (getByText of the command/output), run → fail.
- [ ] **Step 2: Implement** `tool-call.tsx`: match a part by `name`/`names` over `builtinTools` + ext tools,
      call `renderCall(args, ctx)` while `isPartial`/no-result, else `renderResult(result, {expanded,isPartial}, ctx)`;
      fall back to `GenericCard`. Honor `renderShell: 'self'`.
- [ ] **Step 3:** migrate every card in `cards/*.tsx` per the recipe; `index.tsx` exports
      `builtinTools: ToolDefinition[]`.
- [ ] **Step 4: Verify** — `SKIP_STORYBOOK_TESTS= pnpm --filter @conciv/tool-ui test` (storybook browser) PASS.
- [ ] **Step 5: Commit** — `refactor(tool-ui): renderCall/renderResult split; cards are render-only ToolDefinitions`

---

## Phase 5 — Effects as an extension; kill the registry

### Task 5.1: `page-effects.ts` → stateless `makeEffects`

**Files:**

- Modify: `packages/widget/src/page-effects.ts` (delete `createEffects`/singleton/`Map`/`registerEffect`/`initEffects`)
- Test: `packages/widget/test/effect-dispatch.test.ts` (rename from `effect-registry-contract.test.ts`)

**Interfaces:**

- Consumes: `EffectDefinition`/`EffectCtx` from `@conciv/extensions`.
- Produces: `makeEffects(getEffects: () => readonly EffectDefinition[], ctx: Omit<EffectCtx,'disable'>, styles?: string) => {setEffect, toggleEffect, listEffects, dispose}`.

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from 'vitest'
import {makeEffects} from '../src/page-effects.js'
import {defineEffect} from '@conciv/extensions'
const ctx = /* seam ctx, page no-ops */ {
  page: {
    /*…*/
  },
  openSource: async () => 'opened',
  toast: () => {},
  env: {reducedMotion: () => true, doc: document, win: window},
} as never
describe('makeEffects', () => {
  it('lists effects from the getter with their own metadata + off state', () => {
    const fx = makeEffects(() => [defineEffect({name: 'demo', label: 'D', description: 'd', render: () => null})], ctx)
    expect(fx.listEffects().effects).toContainEqual({name: 'demo', description: 'd', enabled: false})
  })
  it('unknown id returns an error', () => {
    const fx = makeEffects(() => [], ctx)
    expect(fx.setEffect('nope', true)).toEqual({error: 'unknown effect: nope'})
  })
})
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Implement** `makeEffects` (keep the shadow-mount render/dispose from the old file;
      `active = Map` of live render handles; `createRoot` + `createEffect` runs each effect's `setup` once as
      it appears in `getEffects()`; dispatch finds by `name` in `getEffects()`). No module-level state, no exports
      of singletons.
- [ ] **Step 4: Run, verify passes.**
- [ ] **Step 5: Commit** — `refactor(widget): stateless makeEffects dispatcher; delete the effect registry`

### Task 5.2: `highlight` as a bundled built-in extension

**Files:**

- Create: `packages/widget/src/effects/highlight-extension.ts` — `export default
defineExtension({id: 'highlight', effects: [highlightEffect]})`. Bundled with the widget; NOT
  in a discovery dir.
- Modify: `packages/widget/src/effects/highlight.tsx` — `import {defineEffect, type EffectCtx}
from '@conciv/extensions'`; rename the effect field `component`→`render`, add `label`; keep
  `setup` (Alt hotkey) unchanged.
- **Decision (resolved):** `conciv_page_effect` **stays a built-in tool** in `@conciv/tools`.
  It is generic effect control (list/enable/disable/toggle over ALL effects), not highlight-specific,
  so it must NOT live in the highlight extension. The highlight extension contributes ONLY the effect.
- Test: existing `effect-highlight.it.test.ts` (adjust import path/shape).

- [ ] **Step 1:** create the extension module + adjust `highlight.tsx` field renames; run highlight IT → fail (import path).
- [ ] **Step 2: Implement** the renames + the `defineExtension` wrapper.
- [ ] **Step 3:** run `effect-highlight.it.test.ts` (real browser) → PASS.
- [ ] **Step 4: Commit** — `feat(widget): highlight ships as a bundled built-in extension contributing the effect`

### Task 5.3: host wiring (inject the effect verb handler; apply built-in highlight via `use()`)

**Files:**

- Modify: `packages/widget/src/effects-host.ts` → `createEffectsHost(deps) => {effectHandler, applyEffects}`
- Modify: `packages/widget/src/page-handlers.ts` (default `effect` handler = `err('effects not initialized')`; drop singleton imports)
- Modify: `packages/widget/src/page-driver.ts` (accept optional `refs`)
- Modify: `packages/widget/src/mount.tsx` (create refs + effectsHost; build driver with
  `{refs, handlers:{effect: effectsHost.effectHandler}}`; apply the built-in highlight extension
  through the **same `use()` path** as discovered extensions — `use(highlightExtension)`; in the
  `use()` handler, feed `collectClientContributions([ext]).effects` to `applyEffects` alongside the tool cards)
- Test: existing widget e2e ITs.

- [ ] **Step 1:** adjust the e2e highlight IT (enable→hover→click→open) to the new wiring; run → fail.
- [ ] **Step 2: Implement** the factory + injection (see spec §4). `applyEffects` upserts into an instance signal; `getEffects = () => effectsSignal()`. Built-in highlight and user effects flow through one `use()` path.
- [ ] **Step 3:** run widget ITs (real browser) → PASS.
- [ ] **Step 4: Commit** — `refactor(widget): inject effect verb handler via PageDriver; apply highlight via use()`

### Task 5.4: stories + cleanup + full green

**Files:**

- Modify: `packages/widget/src/page-effects.stories.tsx` (drive `makeEffects(() => [eff], ctx)`)
- Keep: `packages/tools/src/effect.ts` as the built-in `conciv_page_effect` tool (resolved: stays a built-in tool).
- Verify: whole branch.

- [ ] **Step 1:** rewrite the stories to the array/getter form; run storybook tests → PASS.
- [ ] **Step 2: Full verification (the merge gate):**

Run from worktree root:

```bash
SKIP_STORYBOOK_TESTS=1 pnpm turbo build typecheck lint test --filter=@conciv/extensions --filter=@conciv/protocol --filter=@conciv/tools --filter=@conciv/tool-ui --filter=@conciv/widget --filter=@conciv/plugin --filter=@conciv/cli --filter=@conciv/core
```

Expected: all PASS. Then the real-browser widget ITs (`SKIP_STORYBOOK_TESTS=1 pnpm --filter @conciv/widget test`) PASS, and storybook locally (`pnpm --filter @conciv/widget test`) PASS.

- [ ] **Step 3: Commit** — `test(widget): effect stories on makeEffects; green end-to-end`

---

## Self-Review

- **Spec coverage:** contract (P1) ✓, result-type relocation (P1 §4 / P2) ✓, built-in tools Pi mirror
  (P3) ✓, render split (P4) ✓, effects as a bundled built-in extension + kill registry (P5) ✓,
  `execute` optional / render-only cards (P1.1, P4) ✓, `executionMode`+`TState` dropped (P1.1 — absent) ✓,
  `names?` as the one conciv-only field (P1.1) ✓.
- **Resolved (grounded in real Pi):** Pi has no effects and ships no discoverable built-ins (its two
  discovery roots are both _user_ dirs), so the multi-root "discovery loader for built-in effects" is
  dropped — built-in effects ride a bundled extension via `use()` (no switch, no `createAllEffects`).
  `conciv_page_effect` stays a built-in tool (generic effect control). The `ToolHostCtx` Solid-context
  seam for render-only cards (Task 4.1) is the one item to confirm at the Phase-4 checkpoint — minimal
  context carrying `apiBase/sendMessage/openEditor/subscribeTestRunner/respondApproval/durationMs`.
- **Type consistency:** `ToolDefinition`/`EffectDefinition`/`defineTool`/`defineEffect`/`makeEffects`
  signatures match across phases; `collectClientContributions` returns `{tools, effects}` consumed in P4/P5.
