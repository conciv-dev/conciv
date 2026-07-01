# Extension API Rewrite — Slice 3 (Widget Wiring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@conciv/extension` extensions actually render in the widget (header/footer/composer/empty/status/widget slots) via a per-panel SolidJS Provider, and flow their server tools + system prompt to the engine — end to end, proven in a real browser.

**Architecture:** The widget mounts each extension's single `Component` into every singleton slot inside an `ExtensionRuntimeContext.Provider`; the Component branches on `useSlot()` and reads the per-panel host bag via `useContext()`. Server halves are drained by a new `collectServerContributions` over the builder array. Extension tool-card renderers (`defineTool().render()`) still merge into the existing `tools` accessor — tool cards are NOT slots.

**Tech Stack:** SolidJS (createContext/Provider/Dynamic), `@conciv/extension` (slice 1 contract), `@conciv/plugin` strip transform (slice 2), Playwright real-browser ITs, vitest node ITs.

## Global Constraints

- Production code: ZERO narration comments; functional style (map/reduce over if/else); no `else`; no `any`/casts beyond the one documented builder-return cast already in slice 1; full descriptive names (no `ExtCtx`/`mx`).
- No classes, no IIFEs.
- Tests: real browser (Playwright) / real server (`http.createServer`) / real MCP — NO jsdom, NO mocks/stubs. Native assertions (getByRole/getByText/toBeVisible), never querySelector/class selectors.
- Widget ITs use `browser.newPage()` not `newContext()`; rebuild `@conciv/core` + `@conciv/widget` deps before running ITs.
- Run every command from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/extension-api-rewrite`.
- Solid components must be hoisted `function` declarations where they reference the extension const.

---

## Feasibility summary (read first)

Slice 3 is **substantially smaller than the spec's worst case**, because three feared sub-problems dissolve under the locked decisions:

1. **No mount explosion.** Tool cards stayed on `defineTool().render()` (your call), so the slot set is only the ~6 fixed singleton slots — NOT `tool:*` × N tool calls. Mounting one Component into 6 slots × a few extensions is trivial; the reviewer's O(extensions × live-slots) concern was driven entirely by `tool:*`. So we mount the Component into each singleton slot and let it return `null` — exactly your original design — with no cost problem and no `slots` hint / build inference needed.

2. **The host context is complete — types relocated to clean leaves (DONE).** The full `ExtensionHostContext` ships: `ToolViewCtx` + the composer bag (`insert`, `notify`, `setBusy`, `newSession`, `addDivider`, `compact`, `resetUsage`) + `client: SessionClient` + `requestMeta: () => RequestMeta` + `grab: GrabApi` + `currentSlot`. The widget-coupled types were extracted into two new leaves both `@conciv/widget` and `@conciv/extension` consume: **`@conciv/api-client`** (the network seam — `transport` + `defineClient`/`SessionClient` + `RequestMeta`) and **`@conciv/grab`** (the element-grab contract — `Grab`/`StagedGrab`/`ElementSnapshot`/`ElementSource` + `GrabApi`). No drift (`SessionClient` stays `ReturnType<typeof defineClient>` in the leaf), no cycle, nothing deferred.

3. **No built-in composer-action migration.** `elementPickerAction`/`newSessionAction`/`compactAction`/`openInTerminal`/`modelSelectorControl` stay registered shell-internally via `shell.registerComposerAction` (mount.tsx:89-93) — they are NOT extensions. (Extensions get grab via `grab.pick()`, which the widget implements over react-grab — the extension never constructs a `Grab`.)

What genuinely remains: (a) drain server contributions from the new builder shape; (b) render Components into slots via a per-panel Provider, building the full host bag (incl. `grab`/`client`/`requestMeta`); (c) keep extension tool-renderers flowing into the `tools` accessor; (d) delete `ui-store.tsx` + the empty-state override + the old `clientApi`/`installExtensionGlobal` plumbing; (e) one real example extension + a two-panel browser IT + a node IT.

### Slots are a fixed union (not keyed)

`ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget'` — the host renders this fixed set of mount points and the Component branches on `useSlot()`. There is no `setWidget(key)` and no `` `widget:${string}` `` keyed family; `widget` is simply the generic content region (above the log, replacing the old `ExtWidgetsSlot`).

### v1 scope cuts (deferred, stated explicitly)

- File-based user-extension discovery + virtual module → carried to a slice 3b; v1 proves built-in extensions passed via the engine array, injected for ITs through a `window.__CONCIV__` builder queue.

### Done ahead of this plan (prerequisite relocations, committed)

- `@conciv/api-client` leaf created; `transport`/`defineClient`/`SessionClient`/`RequestMeta` moved out of widget; all 9 widget import sites repointed; tests moved.
- `@conciv/grab` leaf created; grab data types + `GrabApi` moved out of `widget/react-grab`; 5 widget importers repointed.
- `ExtensionHostContext` (in `@conciv/extension`) extended with `client`, `requestMeta`, `grab`; `addDivider` aligned to `(kind) => void`. Typecheck/build/lint green across all touched packages.

---

## File structure

- `packages/extension/src/types.ts` — MODIFY: finalize `ExtensionSlot` union (`'header'|'footer'|'composer'|'empty'|'status'|'widget'`); align `ComposerActions.addDivider` to `(kind: 'new'|'compact') => void`.
- `packages/extension/src/collect-server.ts` — CREATE: `collectServerContributions(builders)` drains top-level + `.server()` tools/systemPrompt into `ExtensionServerContributions`.
- `packages/extension/src/collect-client.ts` — CREATE: `collectToolRenderers(builders)` → `{names, render}[]` for the widget tools accessor.
- `packages/extension/src/index.ts` — MODIFY: export the two collectors.
- `packages/extension/test/collect-server.test.ts` — CREATE: node unit test.
- `packages/widget/src/extension-slots.tsx` — CREATE: `<ExtensionSlot>` + per-panel host-bag plumbing.
- `packages/widget/src/chat-panel.tsx` — MODIFY: replace 5 old slot sites with `<ExtensionSlot>`; build the per-panel host bag; thread the extensions list.
- `packages/widget/src/mount.tsx` — MODIFY: remove `clientApi`/`installExtensionGlobal`/`collectClientContributions`/ui-store/empty-state-override; collect extension builders; merge tool renderers; apply theme; thread extensions to `chatPanelDef`.
- `packages/widget/src/empty-state.tsx` — MODIFY: drop the override signal/`setEmptyStateOverride`; keep `DefaultEmptyState`; `EmptyStateSlot` becomes the `'empty'`-slot host.
- `packages/widget/src/ui-store.tsx` — DELETE.
- `packages/widget/src/extension-runtime.ts` — MODIFY: `installExtensionGlobal` now drains a queue of `ExtensionBuilder` objects into a signal the widget reads.
- `packages/widget/src/conciv-global.ts` — MODIFY: `use/queue` typed `ExtensionBuilder` (from `@conciv/extension`) instead of `ConcivExtension`.
- `apps/examples/tanstack-start/conciv/extensions/*` — MODIFY/CREATE: a real example extension on the new contract.
- `packages/widget/test/extension.it.test.ts` — REWRITE: two-panel browser IT.

---

## Task 1: Finalize slot union + host-context field shapes

**Files:**

- Modify: `packages/extension/src/types.ts`
- Test: `packages/extension/test/types.test-d.ts` (extend the slice-1 fixture)

**Interfaces:**

- Produces: `ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget'`; `ComposerActions.addDivider: (kind: 'new' | 'compact') => void`.

- [ ] **Step 1: Update the slot union and addDivider type**

In `packages/extension/src/types.ts`, replace the `ExtensionSlot` line and the `addDivider` field:

```ts
export type ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget'

export type ComposerActions = {
  insert: (text: string) => void
  notify: (message: string) => void
  setBusy: (busy: boolean) => void
  newSession: () => void
  addDivider: (kind: 'new' | 'compact') => void
  compact: () => void
  resetUsage: () => void
}
```

- [ ] **Step 2: Extend the type fixture to assert the slot union**

Append to `packages/extension/test/types.test-d.ts`:

```ts
import type {ExtensionSlot} from '../src/types.js'
const slotProbe: ExtensionSlot[] = ['header', 'footer', 'composer', 'empty', 'status', 'widget']
export {slotProbe}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @conciv/extension typecheck`
Expected: PASS (no output)

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/types.ts packages/extension/test/types.test-d.ts
git commit -m "refactor(extension): finalize v1 slot union (drop keyed widget) + addDivider kind"
```

---

## Task 2: Server-contribution collector

**Files:**

- Create: `packages/extension/src/collect-server.ts`
- Modify: `packages/extension/src/index.ts`
- Test: `packages/extension/test/collect-server.test.ts`

**Interfaces:**

- Consumes: `ExtensionBuilder` (slice 1), `ExtensionServerContributions`, `ExtensionServerTool` (slice 1 types).
- Produces: `collectServerContributions(builders: ExtensionBuilder<object>[]): ExtensionServerContributions` — merges each builder's top-level `tools` and its `serverFactory()` return (`{tools, systemPrompt}`); dedups tools by `name` (first wins, extension order); concatenates non-empty `systemPrompt` strings + each tool's `promptSnippet`.

- [ ] **Step 1: Write the failing test**

`packages/extension/test/collect-server.test.ts`:

```ts
import {describe, it, expect} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'
import {collectServerContributions} from '../src/collect-server.js'

const draw = defineTool({name: 'draw', description: 'd', inputSchema: z.object({x: z.number()})}).server((i) => i.x)

describe('collectServerContributions', () => {
  it('drains top-level tools, .server() tools and systemPrompt', () => {
    const ext = defineExtension({name: 'canvas', systemPrompt: 'top', tools: [draw]}).server(() => ({
      systemPrompt: 'srv',
      tools: [],
    }))
    const out = collectServerContributions([ext])
    expect(out.tools?.map((t) => t.name)).toEqual(['draw'])
    expect(out.systemPrompt).toContain('top')
    expect(out.systemPrompt).toContain('srv')
  })

  it('dedups tools by name across extensions, first wins', () => {
    const a = defineExtension({name: 'a', tools: [draw]})
    const b = defineExtension({name: 'b', tools: [draw]})
    expect(collectServerContributions([a, b]).tools?.length).toBe(1)
  })

  it('produces an executable server tool from .server(execute)', async () => {
    const ext = defineExtension({name: 'canvas', tools: [draw]})
    const tool = collectServerContributions([ext]).tools?.[0]
    expect(await tool?.execute({x: 41})).toBe(41)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @conciv/extension exec vitest run test/collect-server.test.ts`
Expected: FAIL — cannot find module `../src/collect-server.js`

- [ ] **Step 3: Implement the collector**

`packages/extension/src/collect-server.ts`:

```ts
import type {ExtensionBuilder} from './define-extension.js'
import type {ExtensionServerContributions, ExtensionServerTool, ExtensionTool} from './types.js'

function toServerTool(tool: ExtensionTool): ExtensionServerTool | null {
  if (!tool.serverExecute) return null
  return {name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: tool.serverExecute}
}

export function collectServerContributions(builders: ExtensionBuilder<object>[]): ExtensionServerContributions {
  const seen = new Set<string>()
  const tools: ExtensionServerTool[] = []
  const prompts: string[] = []
  for (const builder of builders) {
    const contributed = builder.serverFactory?.()
    const declaredTools = [...(builder.tools ?? []), ...(contributed?.tools ?? [])]
    for (const tool of declaredTools) {
      if (seen.has(tool.name)) continue
      const serverTool = toServerTool(tool)
      if (!serverTool) continue
      seen.add(tool.name)
      tools.push(serverTool)
    }
    for (const tool of builder.tools ?? []) if (tool.promptSnippet) prompts.push(tool.promptSnippet)
    if (builder.systemPrompt) prompts.push(builder.systemPrompt)
    if (contributed?.systemPrompt) prompts.push(contributed.systemPrompt)
  }
  return {tools, systemPrompt: prompts.join('\n\n')}
}
```

Note: `serverFactory`/`tools`/`systemPrompt` are already public fields on `ExtensionBuilder` (slice 1). The `.server()`-returned tools are `ExtensionTool`-shaped but lack `serverExecute`; in v1 only top-level `tools` (which carry `.server(execute)`) become executable — `.server()`-returned bare tools without an execute are dropped by `toServerTool`. If `.server()` must return executable tools, they should be `defineTool().server()` instances too (same shape), which `toServerTool` then accepts.

- [ ] **Step 4: Export it**

In `packages/extension/src/index.ts` add:

```ts
export {collectServerContributions} from './collect-server.js'
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @conciv/extension exec vitest run test/collect-server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @conciv/extension typecheck
git add packages/extension/src/collect-server.ts packages/extension/src/index.ts packages/extension/test/collect-server.test.ts
git commit -m "feat(extension): collectServerContributions over builder array"
```

---

## Task 3: Tool-renderer collector

**Files:**

- Create: `packages/extension/src/collect-client.ts`
- Modify: `packages/extension/src/index.ts`
- Test: `packages/extension/test/collect-client.test.ts`

**Interfaces:**

- Produces: `collectToolRenderers(builders: ExtensionBuilder<object>[]): {names: string[]; render: ToolRenderer}[]` — one entry per tool that has a `clientRender`, dedup by name (first wins).

- [ ] **Step 1: Write the failing test**

`packages/extension/test/collect-client.test.ts`:

```ts
import {describe, it, expect} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'
import {collectToolRenderers} from '../src/collect-client.js'

const Card = () => null
const draw = defineTool({name: 'draw', description: 'd', inputSchema: z.object({})}).render(Card)

describe('collectToolRenderers', () => {
  it('returns a render entry per tool with a clientRender', () => {
    const ext = defineExtension({name: 'canvas', tools: [draw]})
    const entries = collectToolRenderers([ext])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.names).toEqual(['draw'])
    expect(entries[0]?.render).toBe(Card)
  })

  it('skips tools without a render half', () => {
    const bare = defineTool({name: 'bare', description: 'd', inputSchema: z.object({})})
    expect(collectToolRenderers([defineExtension({name: 'x', tools: [bare]})])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @conciv/extension exec vitest run test/collect-client.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

`packages/extension/src/collect-client.ts`:

```ts
import type {ExtensionBuilder} from './define-extension.js'
import type {ToolRenderer} from './types.js'

export function collectToolRenderers(builders: ExtensionBuilder<object>[]): {names: string[]; render: ToolRenderer}[] {
  const seen = new Set<string>()
  const entries: {names: string[]; render: ToolRenderer}[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      if (!tool.clientRender || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({names: [tool.name], render: tool.clientRender})
    }
  return entries
}
```

- [ ] **Step 4: Export + run + commit**

In `packages/extension/src/index.ts`: `export {collectToolRenderers} from './collect-client.js'`

```bash
pnpm --filter @conciv/extension exec vitest run test/collect-client.test.ts
pnpm --filter @conciv/extension typecheck
git add packages/extension/src/collect-client.ts packages/extension/src/index.ts packages/extension/test/collect-client.test.ts
git commit -m "feat(extension): collectToolRenderers over builder array"
```

---

## Task 4: The `<ExtensionSlot>` host component + per-panel host bag

**Files:**

- Create: `packages/widget/src/extension-slots.tsx`
- Test: covered by the browser IT in Task 9 (this component has no node-testable surface; it renders Solid + the Provider).

**Interfaces:**

- Consumes: `ExtensionRuntimeContext` from `@conciv/extension/runtime`; `ExtensionBuilder` from `@conciv/extension`; `ExtensionHostContext`, `ExtensionSlot` from `@conciv/extension`.
- Produces:
  - `type ExtensionHostBag = Omit<ExtensionHostContext, 'currentSlot'>` (the per-panel bag minus the slot).
  - `ExtensionSlot(props: {name: ExtensionSlotName; extensions: ExtensionBuilder<object>[]; bag: ExtensionHostBag}): JSX.Element` — for each extension, runs its `clientFactory` once (memoized) and mounts its `Component` inside `<ExtensionRuntimeContext.Provider value={{...bag, ...clientValue, currentSlot: name}}>`, each behind an `ErrorBoundary`.
  - rename to avoid clashing with the type `ExtensionSlot`: export the component as `ExtensionSurface`.

- [ ] **Step 1: Implement the component**

`packages/widget/src/extension-slots.tsx`:

```tsx
import {createMemo, ErrorBoundary, For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ExtensionRuntimeContext} from '@conciv/extension/runtime'
import type {ExtensionBuilder, ExtensionHostContext, ExtensionSlot as SlotName} from '@conciv/extension'

export type ExtensionHostBag = Omit<ExtensionHostContext, 'currentSlot'>

function clientValueOf(extension: ExtensionBuilder<object>): object {
  const factory = extension.clientFactory
  return factory ? factory().value : {}
}

export function ExtensionSurface(props: {
  name: SlotName
  extensions: ExtensionBuilder<object>[]
  bag: ExtensionHostBag
}): JSX.Element {
  const values = createMemo(() => props.extensions.map((extension) => ({extension, value: clientValueOf(extension)})))
  return (
    <For each={values()}>
      {(entry) => (
        <Show when={entry.extension.Component}>
          {(component) => (
            <ErrorBoundary fallback={null}>
              <ExtensionRuntimeContext.Provider value={{...props.bag, ...entry.value, currentSlot: props.name}}>
                <Dynamic component={component()} />
              </ExtensionRuntimeContext.Provider>
            </ErrorBoundary>
          )}
        </Show>
      )}
    </For>
  )
}
```

Note on lifecycle / HMR dispose: `clientFactory` is invoked inside `createMemo` so it runs once per panel mount; the `.client()` `dispose` is wired in Task 8 when the example exercises a websocket. For v1 (no long-lived listeners in the example) the memo is sufficient; the dispose hook is part of the public type and called by a follow-up if/when an extension returns one.

- [ ] **Step 2: Typecheck the widget (expect only pre-existing dep errors, none in this file)**

Run: `pnpm turbo build --filter='@conciv/widget^...' && pnpm --filter @conciv/widget typecheck 2>&1 | grep extension-slots`
Expected: no lines referencing `extension-slots.tsx`.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/extension-slots.tsx
git commit -m "feat(widget): ExtensionSurface host mounts Component per slot via Provider"
```

---

## Task 5: Wire the per-panel host bag + slot mount points into chat-panel

**Files:**

- Modify: `packages/widget/src/chat-panel.tsx`

**Interfaces:**

- Consumes: `ExtensionSurface`, `ExtensionHostBag` (Task 4); the existing per-instance closures `insert` (615), `notify` (699), `setBusyAction` (706), `doNewSession` (653), `addDivider` (633), `compact` (665), `resetUsage` (642), and the `toolCtx` fields (449-465).
- Produces: each `ChatPanel` builds `hostBag: ExtensionHostBag` and renders `<ExtensionSurface name=... extensions={props.extensions} bag={hostBag}/>` at the header/widget/empty/status/footer/composer sites. Adds a `extensions: () => ExtensionBuilder<object>[]` prop to `ChatPanel` + `chatPanelDef`.

- [ ] **Step 1: Add imports + the `extensions` prop**

Replace the slot imports (lines 34-35) `import {ExtHeaderSlot, ExtFooterSlot, ExtWidgetsSlot, ExtStatusSlot} from './ui-store.js'` and `import {EmptyStateSlot} from './empty-state.js'` with:

```ts
import {ExtensionSurface, type ExtensionHostBag} from './extension-slots.js'
import {EmptyStateSlot} from './empty-state.js'
import type {ExtensionBuilder} from '@conciv/extension'
```

Add to the `ChatPanel` props type (near line 339-354): `extensions: () => ExtensionBuilder<object>[]`.

- [ ] **Step 2: Build the per-panel host bag**

After `toolCtx` is constructed (after line 465) and after the closures `insert`/`notify`/`compact`/`addDivider`/`resetUsage`/`doNewSession`/`stageGrab` are defined (they are defined later, ~615-704, so place the bag builder AFTER line 704, just before `runAction` at 706). The `grab: GrabApi` is built per-panel over the existing react-grab adapter + `cancelPick` + the per-panel `stageGrab`/`grabs` signal:

```ts
import {getReactGrabAdapter} from './react-grab/adapter.js'
import {cancelPick} from './react-grab/picking.js'
import type {GrabApi} from '@conciv/grab'

const pickWith = (mode: 'activate' | 'comment'): Promise<Grab | null> =>
  new Promise((resolve) => {
    let settled = false
    const done = (grab: Grab | null) => {
      if (settled) return
      settled = true
      resolve(grab)
    }
    void getReactGrabAdapter().then((adapter) => adapter[mode]((grab) => done(grab)))
  })

const grab: GrabApi = {
  pick: () => pickWith('activate'),
  comment: () => pickWith('comment'),
  cancel: cancelPick,
  isActive: picking,
  stage: stageGrab,
}

const hostBag: ExtensionHostBag = {
  ...toolCtx,
  insert,
  notify,
  setBusy: (busy) => setBusyAction(busy ? `extension:${props.harnessId}` : null),
  newSession: () => void doNewSession(),
  addDivider: (kind) => void addDivider(kind),
  compact: () => void compact(),
  resetUsage,
  client,
  requestMeta,
  grab,
}
```

(`toolCtx` provides `apiBase`/`harnessId`/`sendMessage`/`respondApproval`/`subscribeTestRunner`/`openEditor`; `client` is the per-panel `props.client`; `requestMeta` is the per-panel signal accessor (line 407); `grab` is the per-panel `GrabApi`. `isActive` reuses the shared `picking` signal accessor from `./react-grab/picking.js`. Verify during execution: `adapter.activate`/`adapter.comment` fire the sink once per pick; cancellation currently leaves the promise pending — if the example needs cancel-to-null, wire `setCancelPick` to also call `done(null)`.)

- [ ] **Step 3: Replace the five slot render sites**

In the return JSX (732+):

- Line 734 `<ExtHeaderSlot />` → `<ExtensionSurface name="header" extensions={props.extensions()} bag={hostBag} />`
- Line 735 `<ExtWidgetsSlot />` → `<ExtensionSurface name="widget" extensions={props.extensions()} bag={hostBag} />`
- Line 799 `<ExtStatusSlot />` → `<ExtensionSurface name="status" extensions={props.extensions()} bag={hostBag} />`
- Line 800 `<ExtFooterSlot />` → `<ExtensionSurface name="footer" extensions={props.extensions()} bag={hostBag} />`
- The empty-state fallback at line 739 stays `<EmptyStateSlot .../>` (Task 6 makes EmptyStateSlot render the `'empty'` extension surface over the default).
- Add a composer surface: inside the `<form>` (after the action-button `<For>` at ~838), insert `<ExtensionSurface name="composer" extensions={props.extensions()} bag={hostBag} />`.

- [ ] **Step 4: Thread `extensions` through `chatPanelDef`**

Update `chatPanelDef` (line 876) signature to:

```ts
export function chatPanelDef(
  apiBase: string,
  harnessId: string,
  tools: () => ToolCardEntry[],
  extensions: () => ExtensionBuilder<object>[],
): PanelDef {
```

and pass `extensions={extensions}` to `<ChatPanel .../>` in `create` (~892).

- [ ] **Step 5: Typecheck (only after deps built)**

Run: `pnpm --filter @conciv/widget typecheck 2>&1 | tail -20`
Expected: errors only about `ui-store.js` still imported by `mount.tsx` (fixed in Task 6) — none from `chat-panel.tsx` itself.

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/chat-panel.tsx
git commit -m "feat(widget): render extension slots via ExtensionSurface + per-panel host bag"
```

---

## Task 6: Rewire mount.tsx + empty-state, delete ui-store

**Files:**

- Modify: `packages/widget/src/mount.tsx`, `packages/widget/src/empty-state.tsx`, `packages/widget/src/extension-runtime.ts`, `packages/widget/src/conciv-global.ts`
- Delete: `packages/widget/src/ui-store.tsx`

**Interfaces:**

- Consumes: `collectToolRenderers` (Task 3), `ExtensionSurface` (Task 4), `installExtensionGlobal` (rewired), `applyThemeOverrides`.
- Produces: `mount.tsx` collects `extensions: ExtensionBuilder<object>[]` (built-ins arg + global queue), derives the tools accessor `() => [...collectToolRenderers(exts).map(toEntry), ...builtinToolCards]`, applies `extension.theme` for each, and passes `() => extensions` to `chatPanelDef`.

- [ ] **Step 1: Rewrite `conciv-global.ts`**

```ts
import type {ReactGrabAPI} from 'react-grab'
import type {ExtensionBuilder} from '@conciv/extension'

type ConcivGlobal = {
  use?: (extension: ExtensionBuilder<object>) => void
  queue?: ExtensionBuilder<object>[]
  registerPlugin?: ReactGrabAPI['registerPlugin']
  unregisterPlugin?: ReactGrabAPI['unregisterPlugin']
}

declare global {
  interface Window {
    __CONCIV__?: ConcivGlobal
  }
}
```

- [ ] **Step 2: Rewrite `extension-runtime.ts` to drain into a signal**

```ts
import {createSignal, type Accessor} from 'solid-js'
import type {ExtensionBuilder} from '@conciv/extension'
import './conciv-global.js'

export function installExtensionGlobal(seed: ExtensionBuilder<object>[]): Accessor<ExtensionBuilder<object>[]> {
  const [extensions, setExtensions] = createSignal<ExtensionBuilder<object>[]>(seed)
  const add = (extension: ExtensionBuilder<object>) =>
    setExtensions((prev) => [...prev.filter((e) => e.name !== extension.name), extension])
  for (const queued of window.__CONCIV__?.queue ?? []) add(queued)
  window.__CONCIV__ = {...window.__CONCIV__, use: add}
  return extensions
}
```

- [ ] **Step 3: Rewrite the extension block in `mount.tsx`**

Remove lines 78-85 (extToolCards/addToolCard) and 95-118 (clientApi/installExtensionGlobal/collectClientContributions). Replace the imports (18-22) and wiring with:

```ts
import {installExtensionGlobal} from './extension-runtime.js'
import {collectToolRenderers} from '@conciv/extension'
import {builtinToolCards, type ToolCardEntry} from '@conciv/tool-ui'
import {applyThemeOverrides} from './theme.js'
```

```ts
const extensions = installExtensionGlobal(builtinExtensions)
for (const extension of extensions()) if (extension.theme) applyThemeOverrides(root, extension.theme)
const tools = (): ToolCardEntry[] => [...collectToolRenderers(extensions()), ...builtinToolCards]
shell.registerPanel(chatPanelDef(apiBase, models.harness.id, tools, extensions))
```

`builtinExtensions` is the array of built-in `ExtensionBuilder`s passed into `mount()` (empty `[]` for v1 until a built-in ships; the example app injects via the global queue). `collectToolRenderers` returns `{names, render}` which is structurally `ToolCardEntry` — no adapter needed.

- [ ] **Step 4: Prune `empty-state.tsx`**

Remove `override`/`setOverride`/`setEmptyStateOverride` and the `EmptyStateFactory` import. Keep `DefaultEmptyState`. Rewrite `EmptyStateSlot` to render the `'empty'` extension surface over the default:

```tsx
export function EmptyStateSlot(props: {
  onStarter: (text: string) => void
  extensions: () => ExtensionBuilder<object>[]
  bag: ExtensionHostBag
}): JSX.Element {
  return (
    <>
      <ExtensionSurface name="empty" extensions={props.extensions()} bag={props.bag} />
      <DefaultEmptyState onStarter={props.onStarter} />
    </>
  )
}
```

Update the `EmptyStateSlot` call site in chat-panel (line 739) to pass `extensions={props.extensions}` and `bag={hostBag}`. (For v1 the default always renders; a `'empty'` extension renders above it. If full replacement is wanted, gate `DefaultEmptyState` behind a `Show` when no extension claims `empty` — deferred.)

- [ ] **Step 5: Delete ui-store**

```bash
git rm packages/widget/src/ui-store.tsx
```

- [ ] **Step 6: Build deps, typecheck the whole widget**

Run: `pnpm turbo build --filter='@conciv/widget^...' && pnpm --filter @conciv/widget typecheck`
Expected: PASS (no output). Fix any dangling `ui-store`/`ConcivExtension`/`ClientApi` references the compiler flags.

- [ ] **Step 7: Lint + commit**

```bash
pnpm --filter @conciv/widget lint
git add packages/widget/src/mount.tsx packages/widget/src/empty-state.tsx packages/widget/src/extension-runtime.ts packages/widget/src/conciv-global.ts
git commit -m "refactor(widget): declarative extension wiring, delete ui-store + clientApi"
```

---

## Task 7: Engine server-contribution wiring for the new contract

**Files:**

- Modify: `packages/plugin/src/core/extensions.ts` (new loader using `@conciv/extension`'s `collectServerContributions`)

**Interfaces:**

- Consumes: `collectServerContributions` from `@conciv/extension` (Task 2); jiti (existing).
- Produces: `loadServerContributions(root)` jiti-imports each discovered extension file's default export (now an `ExtensionBuilder`), and returns `collectServerContributions(builders)`. The engine path (`boot.ts`/`vite.ts` → `start({extensions})`) is unchanged because the return type `ExtensionServerContributions` is identical to the old one.

- [ ] **Step 1: Repoint the loader**

In `packages/plugin/src/core/extensions.ts`, change the import from `@conciv/extensions` to `@conciv/extension`, retype the jiti import as `{default?: ExtensionBuilder<object>}`, push `mod.default` into a `builders` array, and `return collectServerContributions(builders)`. Keep the `extensionFiles(root)` discovery and the jiti `solid-js` jsx config unchanged.

- [ ] **Step 2: Add `@conciv/extension` as a plugin dependency**

In `packages/plugin/package.json` dependencies add `"@conciv/extension": "workspace:^"`. Run `pnpm install`.

- [ ] **Step 3: Build deps, typecheck plugin**

Run: `pnpm turbo build --filter='@conciv/extension' && pnpm --filter @conciv/plugin typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/src/core/extensions.ts packages/plugin/package.json pnpm-lock.yaml
git commit -m "feat(plugin): load server contributions from @conciv/extension builders"
```

---

## Task 8: Real example extension on the new contract

**Files:**

- Modify: `apps/examples/tanstack-start/conciv/extensions/blue.tsx` (rename from `.ts`, new contract)
- Reference: the app's `conciv/extensions/tsconfig.json` (Solid jsx config — verify unchanged)

**Interfaces:**

- Produces: a `canvasExample` extension that sets `theme`, renders a `composer` button (calls `useContext(c => c.insert)`), a `status` line, and a `header` title — all from one `Component` branching on `useSlot()`; plus a `draw` tool with `.server(execute)`.

- [ ] **Step 1: Write the example**

`apps/examples/tanstack-start/conciv/extensions/blue.tsx`:

```tsx
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const draw = defineTool({
  name: 'draw',
  description: 'Draw on the canvas',
  inputSchema: z.object({shape: z.string()}),
}).server((input) => ({drawn: input.shape}))

export const blue = defineExtension({
  name: 'blue',
  Component: BlueSurface,
  systemPrompt: 'You can draw on the canvas with the draw tool.',
  theme: {'color-accent': '#2563eb'},
  tools: [draw],
}).server(() => ({systemPrompt: 'Draw runs in node.'}))

function BlueSurface() {
  const slot = blue.useSlot()
  const insert = blue.useContext((context) => context.insert)
  if (slot() === 'header') return <div data-pw-ext="blue-header">Blue</div>
  if (slot() === 'status') return <span data-pw-ext="blue-status">Blue theme active</span>
  if (slot() === 'composer')
    return (
      <button type="button" data-pw-ext="blue-btn" onClick={() => insert('draw a square')}>
        Draw
      </button>
    )
  return null
}
```

Note: `data-pw-ext` hooks are interim test affordances; per repo policy (`no-test-ids-in-code`) they are removed before merge and the IT asserts via role/text. Keep them only through Task 9 bring-up, then delete.

- [ ] **Step 2: Typecheck the example dir**

Run: `pnpm --filter <example-app> typecheck` (the app includes `conciv/extensions` in its typecheck script).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/examples/tanstack-start/conciv/extensions/blue.tsx
git rm apps/examples/tanstack-start/conciv/extensions/blue.ts
git commit -m "feat(example): blue extension on the declarative contract"
```

---

## Task 9: Two-panel browser IT + node server-tool IT

**Files:**

- Rewrite: `packages/widget/test/extension.it.test.ts`
- Reference pattern: existing widget ITs (`browser.newPage()`, real `http.createServer`, getByRole/getByText).

**Interfaces:**

- Consumes: the rewired `mount()` + global queue injection; the example surface shapes.

- [ ] **Step 1: Write the browser IT (inject two builders, assert per-panel isolation)**

Seed `window.__CONCIV__ = {queue: [blueBuilder]}` before the widget script loads (the IT builds a minimal extension inline via `defineExtension`), mount two panels (modal + a second pane), then assert:

- header shows text `Blue`, status shows `Blue theme active`, the composer button labeled `Draw` is visible (`getByRole('button', {name: 'Draw'})`).
- clicking `Draw` in panel B inserts `draw a square` into panel B's textarea and NOT panel A's (per-panel `insert` isolation — the core C4 regression guard).
- the accent CSS custom property resolves to the theme value on the host.

(Assert via roles/text and `getByRole(...).getRootNode()` to reach the shadow root per repo policy; no querySelector, no `data-pw-ext`.)

- [ ] **Step 2: Write the node IT (server tools reach MCP)**

Reuse the existing core MCP IT harness: boot the engine with `start({extensions: collectServerContributions([blue])})`, then assert `tools/list` over `/api/mcp` includes `draw` and that calling it executes `{drawn: 'square'}`. Assert the system prompt file contains `You can draw on the canvas` and `Draw runs in node`.

- [ ] **Step 3: Build core + widget, run the ITs**

Run: `pnpm turbo build --filter='@conciv/core' --filter='@conciv/widget' && pnpm --filter @conciv/widget test`
Expected: PASS.

- [ ] **Step 4: Remove the interim `data-pw-ext` hooks from the example, re-run**

Delete the `data-pw-ext` attributes from `blue.tsx`; confirm the IT still passes asserting via role/text only.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/test/extension.it.test.ts apps/examples/tanstack-start/conciv/extensions/blue.tsx
git commit -m "test(widget): two-panel extension IT + node server-tool IT"
```

---

## Self-review notes

- **Spec coverage:** header/footer/composer/empty/status/widget slots (Task 5), per-panel Provider fixing the multi-panel bug (Tasks 4-5, IT in 9), `useContext(select)` (example + IT), server tools + systemPrompt ordering (Tasks 2,7,9), theme (Task 6), tool cards staying on `.render()` and flowing via `collectToolRenderers` (Task 3,6), deletion of `ui-store`/`clientApi`/override (Task 6). Deferred items (keyed widgets, `client`/`stageGrab`/`requestMeta`, file discovery/virtual module, `.client()` dispose) are listed in the Feasibility summary with reasons. (Extension composer buttons are just JSX the `composer` Component renders — no structured-action array; not a deferral.)
- **Carried from slice 2:** file-based discovery + the client virtual module for USER extensions (not built-ins) — slice 3 proves built-ins via the array/global; user-file discovery is slice 3b (it needs the strip transform wired into the per-bundler client entry, which is the remaining slice-2 wiring).
- **Type consistency:** `ExtensionHostBag = Omit<ExtensionHostContext,'currentSlot'>` used in Tasks 4/5/6; `collectToolRenderers` returns `{names,render}` ≡ `ToolCardEntry` (Task 3/6); `chatPanelDef(apiBase,harnessId,tools,extensions)` consistent across Tasks 5/6.
- **Open risk to verify during execution:** Task 5 places the `hostBag` after line 704 so all closures exist; if any closure is defined below 704, move the bag builder down accordingly. The `setBusy` mapping uses a synthetic id — confirm `busyAction` semantics don't conflict with real action ids.
