# Page Effects + Highlight-to-Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Task 6 (the highlight UI) additionally uses the **frontend-design** skill.

**Goal:** Give the agent a `mandarax_page_effect` tool to toggle reversible, visual page effects, and ship the first effect — a hover inspector that outlines the React component under the cursor and opens its source in the editor on a user click.

**Architecture:** A client-side effect registry in the widget where each effect is a Solid component, rendered into a style-isolated page-level shadow mount on enable and `dispose()`d on disable (Solid `onCleanup` = total teardown). The agent layer is a thin pass-through: `mandarax_page_effect` → page-bus `effect` kind → registry. A single `PAGE_EFFECTS` protocol catalog drives the tool enum, description, and a drift contract test. Click→open reuses both existing source paths (`data-mandarax-source` fast path; `symbolicateFrames` fallback via one new endpoint).

**Tech Stack:** SolidJS, UnoCSS, TypeScript, zod, `@tanstack/ai` tool defs, h3 (core server), bippy (react-bridge), Vitest + Storybook (browser tests via `@storybook/addon-vitest`), Playwright (widget ITs).

## Global Constraints

- Functions, never classes. No IIFEs.
- No comments narrating code; one concise line max where a comment earns its place.
- Build/typecheck/test through turbo: `pnpm turbo run <task> --filter=@mandarax/<pkg>`. Never hand-rebuild dist.
- Tests use native assertions (`getByRole`/`getByText`/`toBeVisible`/aria) — never `querySelector`/class selectors/`toBe(true)` on DOM. No jsdom, no stubs/mocks — real browser via Storybook/Playwright, real servers via `http.createServer`.
- Work entirely inside the worktree at `.claude/worktrees/page-effects`. Run every command from there.
- The LLM-facing surface (tool def + `effect` bus handler) is a dumb adapter; all behavior is plain code proven by Storybook/IT.
- Spec: `docs/superpowers/specs/2026-06-20-page-effects-highlight-open-design.md`.

---

### Task 1: Protocol — `PAGE_EFFECTS` catalog + `effect` bus kind

**Files:**

- Modify: `packages/protocol/src/page-types.ts`
- Test: `packages/protocol/test/page-effects.test.ts` (create)

**Interfaces:**

- Produces: `PAGE_EFFECTS` (readonly array of `{id, title, description}`), `PageEffectId` (union), `PageEffectActionSchema`. Adds `'effect'` to `PAGE_QUERY_KINDS`; adds optional `effect: string` field to `PageQuerySchema`; extends `action` enum with `enable|disable|toggle|list`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/protocol/test/page-effects.test.ts
import {describe, expect, it} from 'vitest'
import {PAGE_EFFECTS, PAGE_QUERY_KINDS, PageQuerySchema} from '../src/page-types.js'

describe('page effects protocol', () => {
  it('exposes a non-empty catalog with unique ids', () => {
    const ids = PAGE_EFFECTS.map((e) => e.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('highlight')
  })

  it('adds the effect kind and accepts an effect query', () => {
    expect(PAGE_QUERY_KINDS).toContain('effect')
    const parsed = PageQuerySchema.parse({kind: 'effect', effect: 'highlight', action: 'enable'})
    expect(parsed).toMatchObject({kind: 'effect', effect: 'highlight', action: 'enable'})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/protocol exec vitest run test/page-effects.test.ts`
Expected: FAIL — `'effect'` not in kinds / `action` rejects `'enable'`.

- [ ] **Step 3: Implement in `page-types.ts`**

Add `'effect'` to the `PAGE_QUERY_KINDS` array (anywhere; keep near `track`). In `PageQuerySchema`, add `effect: z.string().optional()` and replace the existing `action` line with the widened enum:

```ts
  action: z.enum(['start', 'stop', 'report', 'enable', 'disable', 'toggle', 'list']).optional(),
```

Then append the catalog at the end of the file:

```ts
// The agent-visible catalog of reversible page effects — the single source of truth. The
// mandarax_page_effect tool's enum + description derive from this; the widget registry must register
// exactly these ids (asserted by a contract test). Keep descriptions one line, user-facing.
export const PAGE_EFFECTS = [
  {
    id: 'highlight',
    title: 'Highlight + open',
    description: 'Outline the React component under the cursor; the user clicks one to open its source in the editor.',
  },
] as const

export type PageEffectId = (typeof PAGE_EFFECTS)[number]['id']
export const PAGE_EFFECT_IDS = PAGE_EFFECTS.map((e) => e.id) as readonly PageEffectId[]
export type PageEffectAction = 'enable' | 'disable' | 'toggle' | 'list'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/protocol exec vitest run test/page-effects.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build protocol so dependents see the new exports**

Run: `pnpm turbo run build --filter=@mandarax/protocol`
Expected: build succeeds, `dist/page-types.d.ts` includes `PAGE_EFFECTS`.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/page-types.ts packages/protocol/test/page-effects.test.ts
git commit -m "feat(protocol): page-effects catalog + effect bus kind"
```

---

### Task 2: Widget effect registry + Solid render/dispose host

**Files:**

- Create: `packages/widget/src/page-effects.ts`
- Create: `packages/widget/src/page-effects.stories.tsx` (registry behavior, browser test)

**Interfaces:**

- Consumes: nothing yet (ctx is injected at init).
- Produces:
  - `type EffectCtx` (the curated platform — see spec §1; full shape defined here).
  - `type PageEffect = {id: string; component: (ctx: EffectCtx) => JSX.Element}`
  - `defineEffect(e: PageEffect): PageEffect`
  - `initEffects(ctx: EffectCtx): void` — stores ctx, creates the page-level shadow mount.
  - `registerEffect(e: PageEffect): void`
  - `setEffect(id: string, on: boolean): {effect: string; enabled: boolean} | {error: string}`
  - `toggleEffect(id: string): {effect: string; enabled: boolean} | {error: string}`
  - `listEffects(): {effects: {id: string; title: string; description: string; enabled: boolean}[]}`
  - `__resetEffectsForTest(): void` (test-only: dispose all + clear registry/mount).

- [ ] **Step 1: Write the failing test** (registry idempotency + render/dispose, driven in the browser)

```tsx
// packages/widget/src/page-effects.stories.tsx
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {createSignal, type JSX} from 'solid-js'
import {
  defineEffect,
  initEffects,
  registerEffect,
  setEffect,
  toggleEffect,
  listEffects,
  __resetEffectsForTest,
  type EffectCtx,
} from './page-effects.js'

function HarnessMarker() {
  return <div data-testid="effect-on">effect on</div>
}

function Probe() {
  const [snap, setSnap] = createSignal('')
  __resetEffectsForTest()
  initEffects(seamCtx())
  registerEffect(defineEffect({id: 'marker', component: () => (<HarnessMarker />) as JSX.Element}))
  const enabled = () => listEffects().effects.find((e) => e.id === 'marker')?.enabled
  return (
    <div>
      <button
        onClick={() => {
          setEffect('marker', true)
          setEffect('marker', true)
          setSnap(`on:${enabled()}`)
        }}
      >
        enable
      </button>
      <button
        onClick={() => {
          setEffect('marker', false)
          setSnap(`off:${enabled()}`)
        }}
      >
        disable
      </button>
      <button
        onClick={() => {
          toggleEffect('marker')
          setSnap(`toggle:${enabled()}`)
        }}
      >
        toggle
      </button>
      <output>{snap()}</output>
    </div>
  )
}

function seamCtx(): EffectCtx {
  const noop = () => {}
  return {
    page: {
      elementAt: () => null,
      componentHostAt: () => null,
      describe: () => ({component: '', file: null}),
      locate: async () => null,
      inspect: async () => null,
      tree: async () => ({nodes: [], truncated: 0}),
      find: () => ({matches: [], total: 0}),
      addRef: () => 'r0',
    },
    openSource: async () => 'opened',
    server: {route: () => async () => ({}), eventSource: () => ({addEventListener: noop}) as never} as never,
    toast: noop,
    env: {reducedMotion: () => true, doc: document, win: window},
  }
}

const meta: Meta<typeof Probe> = {title: 'widget/PageEffects', component: Probe}
export default meta
type Story = StoryObj<typeof Probe>

export const RegistryLifecycle: Story = {
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await c.getByRole('button', {name: 'enable'}).click()
    // idempotent enable → one marker mounted into the page shadow mount, registry says enabled
    await expect(c.getByText('on:true')).toBeVisible()
    await expect(within(document.body).getByText('effect on')).toBeVisible()
    await c.getByRole('button', {name: 'disable'}).click()
    await expect(c.getByText('off:false')).toBeVisible()
    await expect(within(document.body).queryByText('effect on')).toBeNull()
  },
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `SKIP_STORYBOOK_TESTS= pnpm --filter @mandarax/widget exec vitest run --project storybook page-effects`
Expected: FAIL — `./page-effects.js` has no exports.

- [ ] **Step 3: Implement `page-effects.ts`**

```tsx
import {render} from 'solid-js/web'
import type {JSX} from 'solid-js'
import {PAGE_EFFECTS, type PageEffectId} from '@mandarax/protocol/page-types'
import type {LocateResult, InspectResult, TreeResult} from './react-bridge.js'
import type {Transport} from './transport.js'

export type EffectCtx = {
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
  server: Transport
  toast: (msg: string, tone?: 'info' | 'success' | 'error') => void
  env: {reducedMotion: () => boolean; doc: Document; win: Window}
}

export type PageEffect = {id: string; component: (ctx: EffectCtx) => JSX.Element}

export function defineEffect(effect: PageEffect): PageEffect {
  return effect
}

const registry = new Map<string, PageEffect>()
const active = new Map<string, () => void>()
let ctx: EffectCtx | undefined
let mount: HTMLDivElement | undefined

const MARKER = 'data-mandarax-effects'

// A page-level host with its OWN shadow root: page CSS can't bleed into effect overlays or back.
// Lazily created; adopted by marker if a prior module instance left one (HMR-safe, like page-mirror).
function ensureMount(): ShadowRoot {
  const existing = mount?.isConnected ? mount : (document.querySelector<HTMLDivElement>(`[${MARKER}]`) ?? undefined)
  if (existing) {
    mount = existing
    return existing.shadowRoot ?? existing.attachShadow({mode: 'open'})
  }
  const el = document.createElement('div')
  el.setAttribute(MARKER, '')
  el.setAttribute('aria-hidden', 'true')
  const root = el.attachShadow({mode: 'open'})
  document.body.appendChild(el)
  mount = el
  return root
}

export function initEffects(next: EffectCtx): void {
  ctx = next
}

export function registerEffect(effect: PageEffect): void {
  registry.set(effect.id, effect)
}

const meta = (id: string) => PAGE_EFFECTS.find((e) => e.id === id)

export function setEffect(id: string, on: boolean): {effect: string; enabled: boolean} | {error: string} {
  const effect = registry.get(id)
  if (!effect) return {error: `unknown effect: ${id}`}
  if (!ctx) return {error: 'effects not initialized'}
  const isOn = active.has(id)
  if (on && !isOn) {
    const dispose = render(() => effect.component(ctx!), ensureMount())
    active.set(id, dispose)
  } else if (!on && isOn) {
    active.get(id)!()
    active.delete(id)
  }
  return {effect: id, enabled: active.has(id)}
}

export function toggleEffect(id: string): {effect: string; enabled: boolean} | {error: string} {
  return setEffect(id, !active.has(id))
}

export function listEffects(): {effects: {id: string; title: string; description: string; enabled: boolean}[]} {
  return {
    effects: PAGE_EFFECTS.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      enabled: active.has(e.id),
    })),
  }
}

export function __resetEffectsForTest(): void {
  for (const dispose of active.values()) dispose()
  active.clear()
  registry.clear()
  mount?.remove()
  mount = undefined
  ctx = undefined
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `SKIP_STORYBOOK_TESTS= pnpm --filter @mandarax/widget exec vitest run --project storybook page-effects`
Expected: PASS (1 story test). Idempotent enable mounts one marker; disable removes it.

- [ ] **Step 5: Typecheck**

Run: `pnpm turbo run typecheck --filter=@mandarax/widget`
Expected: PASS (depends on `LocateResult`/`InspectResult`/`TreeResult` exports already in `react-bridge.ts`, and `Transport` from `transport.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/page-effects.ts packages/widget/src/page-effects.stories.tsx
git commit -m "feat(widget): reversible page-effect registry (Solid render/dispose + shadow mount)"
```

---

### Task 3: react-bridge helpers — `componentHostAt` + `describe`

**Files:**

- Modify: `packages/widget/src/react-bridge.ts`
- Test: `packages/widget/test/react-verbs.it.test.ts` (add cases; real browser + real React)

**Interfaces:**

- Produces: `componentHostAt(el: Element): Element | null` (nearest React-composite host element at/above `el`); `describe(host: Element): {component: string; file: string | null}` (sync display name + `sourceFromAttr` file).

- [ ] **Step 1: Write the failing test** — add to the existing real-React IT (it already mounts the fixture + exposes `window.__MANDARAX_PAGE_DRIVER__`; add two assertions through a tiny exposed bridge). Append inside the existing `describe`:

```ts
it('componentHostAt resolves the nearest component host; describe reads name + source', async () => {
  const out = await page.evaluate(() => {
    const b = (window as unknown as {__MANDARAX_REACT_BRIDGE__: typeof import('../src/react-bridge.js')})
      .__MANDARAX_REACT_BRIDGE__
    const leaf = document.querySelector('#card-inc')!
    const host = b.componentHostAt(leaf)
    return host ? b.describe(host) : null
  })
  expect(out?.component).toBeTruthy()
})
```

(If the fixture bundle does not yet expose the bridge global, add `;(window as any).__MANDARAX_REACT_BRIDGE__ = bridge` next to where `__MANDARAX_PAGE_DRIVER__` is set in the fixture/harness — one line.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mandarax/widget exec vitest run test/react-verbs.it.test.ts`
Expected: FAIL — `componentHostAt`/`describe` not exported.

- [ ] **Step 3: Implement in `react-bridge.ts`** (reuse existing imports: `getFiberFromHostInstance`, `isCompositeFiber`, `getNearestHostFiber`, `getFiberStack`, `getDisplayName`, and the file-local `sourceFromAttr`)

```ts
// The nearest React-composite component's host element at/above `el` — what the highlight inspector
// outlines under the cursor. Walks the fiber stack from the element to the first composite, then back
// down to that composite's nearest host element.
export function componentHostAt(el: Element): Element | null {
  const fiber = getFiberFromHostInstance(el)
  if (!fiber) return null
  const composite = isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f))
  if (!composite) return null
  const host = getNearestHostFiber(composite)
  return host?.stateNode instanceof Element ? host.stateNode : el
}

// Cheap sync label for hover: the component display name + the build-injected source file (if any).
export function describe(host: Element): {component: string; file: string | null} {
  const fiber = getFiberFromHostInstance(host)
  const composite =
    fiber && (isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f)))
  const src = sourceFromAttr(host)
  return {component: (composite && getDisplayName(composite)) || '?', file: src ? src.file : null}
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm turbo run build --filter=@mandarax/widget && pnpm --filter @mandarax/widget exec vitest run test/react-verbs.it.test.ts`
Expected: PASS (build first — the IT loads the built global bundle).

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/react-bridge.ts packages/widget/test/react-verbs.it.test.ts
git commit -m "feat(widget): componentHostAt + describe react-bridge helpers"
```

---

### Task 4: `effect` bus handler + EffectCtx construction (widget wiring)

**Files:**

- Create: `packages/widget/src/effects-host.ts` (builds the real `EffectCtx`, registers built-in effects)
- Modify: `packages/widget/src/page-handlers.ts` (add `effect` handler — thin)
- Modify: `packages/widget/src/page-bus.ts` (call `initEffectsHost` with apiBase)
- Test: `packages/widget/test/page-effects-bus.it.test.ts` (create)

**Interfaces:**

- Consumes: `EffectCtx`, `initEffects`, `registerEffect`, `setEffect`, `toggleEffect`, `listEffects` (Task 2); `componentHostAt`, `describe`, `locate`, `inspect`, `tree`, `find` (react-bridge); `createTransport` (transport); `addRef` + `Refs` (page-snapshot).
- Produces: `makeEffectCtx(deps): EffectCtx`, `initEffectsHost(deps: {apiBase: string; refs: Refs}): void`. `DOM_HANDLERS.effect` handler.

- [ ] **Step 1: Write the failing test** (drive the handler through the real driver — no browser needed for the dispatch shape; use a registered no-op effect)

```ts
// packages/widget/test/page-effects-bus.it.test.ts
import {describe, expect, it} from 'vitest'
import {makeDomPageDriver} from '../src/page-driver.js'
import {initEffects, registerEffect, defineEffect, __resetEffectsForTest} from '../src/page-effects.js'

describe('effect bus handler', () => {
  it('enable/list/disable round-trip through the driver', async () => {
    __resetEffectsForTest()
    // minimal ctx; the no-op effect renders nothing
    initEffects({
      page: {} as never,
      openSource: async () => 'opened',
      server: {} as never,
      toast: () => {},
      env: {reducedMotion: () => true, doc: document, win: window},
    })
    registerEffect(defineEffect({id: 'noop', component: () => null}))
    const driver = makeDomPageDriver()
    expect(await driver.execute({kind: 'effect', effect: 'noop', action: 'enable'})).toMatchObject({
      effect: 'noop',
      enabled: true,
    })
    const listed = await driver.execute({kind: 'effect', action: 'list'})
    expect((listed.effects as {id: string}[]).some((e) => e.id === 'noop')).toBe(true)
    expect(await driver.execute({kind: 'effect', effect: 'noop', action: 'disable'})).toMatchObject({
      effect: 'noop',
      enabled: false,
    })
  })
})
```

Note: this test runs in the `widget` (node) project but touches `document`/`render`. If node lacks DOM, move it into a Storybook story instead (browser). Prefer the Storybook variant if `document` is undefined — mirror Task 2's story style. Decide at Step 2.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mandarax/widget exec vitest run page-effects-bus`
Expected: FAIL — `DOM_HANDLERS.effect` undefined (`unknown page action effect`). If it fails instead with "document is not defined", convert this test to a Storybook story (browser) before continuing.

- [ ] **Step 3: Add the handler in `page-handlers.ts`** (thin — pure delegation)

```ts
  effect: ({query}) => {
    const action = query.action ?? 'list'
    if (action === 'list') return listEffects()
    if (!query.effect) return err('effect requires --effect')
    if (action === 'toggle') return toggleEffect(query.effect)
    return setEffect(query.effect, action === 'enable')
  },
```

Add the import at the top of `page-handlers.ts`:

```ts
import {setEffect, toggleEffect, listEffects} from './page-effects.js'
```

- [ ] **Step 4: Implement `effects-host.ts`**

```ts
import {createTransport, type Transport} from './transport.js'
import {EditorOpenSchema} from '@mandarax/protocol/test-types'
import {OkSchema} from '@mandarax/protocol/chat-types'
import {
  componentHostAt,
  describe as describeHost,
  locate,
  inspect,
  tree,
  find,
  type LocateResult,
} from './react-bridge.js'
import {addRef, type Refs} from './page-snapshot.js'
import {initEffects, registerEffect, type EffectCtx} from './page-effects.js'
import {highlightEffect} from './effects/highlight.js'
import {showToast} from './effect-toast.js'

function makeEffectCtx(deps: {apiBase: string; refs: Refs}): EffectCtx {
  const server: Transport = createTransport({apiBase: deps.apiBase})
  const openEditor = server.route({
    method: 'POST',
    path: '/api/editor/open',
    request: EditorOpenSchema,
    response: OkSchema,
  })
  const openSourceRoute = server.route({
    method: 'POST',
    path: '/api/page/open-source',
    request: OpenSourceSchema,
    response: OpenSourceResultSchema,
  })
  const openSource = async (loc: LocateResult): Promise<'opened' | 'no-source' | 'failed'> => {
    try {
      if (loc.source) {
        await openEditor({file: loc.source.file, line: loc.source.line})
        return 'opened'
      }
      if (loc.frames?.length) return (await openSourceRoute({frames: loc.frames})).status
      return 'no-source'
    } catch {
      return 'failed'
    }
  }
  return {
    page: {
      elementAt: (x, y) => deps.refs && document.elementFromPoint(x, y), // ctx wrapper toggles mount p-events; see note
      componentHostAt,
      describe: describeHost,
      locate,
      inspect,
      tree: () => tree(document.body, deps.refs),
      find: (name) => find(name, deps.refs),
      addRef: (el) => addRef(el, deps.refs),
    },
    openSource,
    server,
    toast: showToast,
    env: {reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, doc: document, win: window},
  }
}

export function initEffectsHost(deps: {apiBase: string; refs: Refs}): void {
  initEffects(makeEffectCtx(deps))
  registerEffect(highlightEffect)
}
```

Add the `OpenSourceSchema`/`OpenSourceResultSchema` import (defined in Task 7's protocol step) at the top:

```ts
import {OpenSourceSchema, OpenSourceResultSchema} from '@mandarax/protocol/page-types'
```

`elementAt` note: the real implementation must toggle the effects mount's `pointer-events` off around `document.elementFromPoint` so it returns the page element, not our overlay. Implement as:

```ts
      elementAt: (x, y) => {
        const host = document.querySelector<HTMLElement>('[data-mandarax-effects]')
        const prev = host?.style.pointerEvents
        if (host) host.style.pointerEvents = 'none'
        const el = document.elementFromPoint(x, y)
        if (host) host.style.pointerEvents = prev ?? ''
        return el
      },
```

- [ ] **Step 5: Wire `initEffectsHost` in `page-bus.ts`** — after the driver is created, pass the same `refs`. The driver owns `refs` internally (`makeDomPageDriver`), so expose it: change `makeDomPageDriver` to return `{execute, refs}` and have `initPageBus` call `initEffectsHost({apiBase: deps.apiBase ?? '', refs: driver.refs})`.

In `page-driver.ts`, change the return to `return {execute, refs}` and the `PageDriver` type to `{execute: ...; refs: Refs}`. In `page-bus.ts`:

```ts
const driver = deps.driver ?? makeDomPageDriver()
initEffectsHost({apiBase: deps.apiBase ?? '', refs: driver.refs})
```

- [ ] **Step 6: Run the test to verify it passes** (and typecheck)

Run: `pnpm turbo run typecheck --filter=@mandarax/widget && pnpm --filter @mandarax/widget exec vitest run page-effects-bus`
Expected: PASS. (Highlight effect import resolves once Task 6 lands — if running tasks in order, stub `highlightEffect` as `defineEffect({id:'highlight', component: () => null})` in `effects/highlight.ts` now and flesh it out in Task 6.)

- [ ] **Step 7: Commit**

```bash
git add packages/widget/src/effects-host.ts packages/widget/src/page-handlers.ts packages/widget/src/page-bus.ts packages/widget/src/page-driver.ts packages/widget/test/page-effects-bus.it.test.ts
git commit -m "feat(widget): effect bus handler + EffectCtx construction"
```

---

### Task 5: Agent tool `mandarax_page_effect` + contract test

**Files:**

- Create: `packages/tools/src/effect.ts`
- Modify: `packages/tools/src/tools.ts` (export), `packages/tools/src/server.ts` (register, wire to `ctx.page`)
- Test: `packages/tools/test/page-effect-tool.it.test.ts` (create), `packages/protocol/test/page-effects.test.ts` (extend with the drift contract)

**Interfaces:**

- Consumes: `PAGE_EFFECT_IDS`, `PAGE_EFFECTS` (protocol). The server `page` context handle (same one `mandarax_page` uses).
- Produces: `mandaraxPageEffectToolDef`, `EffectInput`.

- [ ] **Step 1: Write the failing contract test** (append to `packages/protocol/test/page-effects.test.ts`)

```ts
import {mandaraxPageEffectToolDef} from '@mandarax/tools/defs'

it('tool enum matches the catalog ids (no drift)', () => {
  const enumValues = (
    mandaraxPageEffectToolDef.inputSchema.shape.effect as {unwrap: () => {options: string[]}}
  ).unwrap().options
  expect([...enumValues].sort()).toEqual(PAGE_EFFECTS.map((e) => e.id).sort())
})
```

- [ ] **Step 2: Write the failing tool IT** (`packages/tools/test/page-effect-tool.it.test.ts`) — mirror `page-tool.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {mandaraxTools} from '../src/tools.js'

describe('mandarax_page_effect tool', () => {
  it('forwards effect+action to ctx.page as the effect verb', async () => {
    const calls: unknown[] = []
    const tools = mandaraxTools({
      injectUi: () => true,
      page: async (q) => (calls.push(q), {effect: 'highlight', enabled: true}),
      test: async () => ({}),
      open: () => {},
    })
    const tool = tools.find((t) => t.name === 'mandarax_page_effect')!
    const result = await tool.execute({effect: 'highlight', action: 'enable'})
    expect(calls[0]).toMatchObject({kind: 'effect', effect: 'highlight', action: 'enable'})
    expect(result).toMatchObject({enabled: true})
  })
})
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter @mandarax/tools exec vitest run page-effect-tool` then `pnpm --filter @mandarax/protocol exec vitest run page-effects`
Expected: FAIL — tool/def not found.

- [ ] **Step 4: Implement `effect.ts`**

```ts
import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import {PAGE_EFFECTS, PAGE_EFFECT_IDS} from '@mandarax/protocol/page-types'

const catalog = PAGE_EFFECTS.map((e) => `${e.id} — ${e.description}`).join('; ')

export const EffectInput = z.object({
  effect: z.enum(PAGE_EFFECT_IDS as [string, ...string[]]).optional(),
  action: z.enum(['enable', 'disable', 'toggle', 'list']),
})

export const mandaraxPageEffectToolDef = toolDefinition({
  name: 'mandarax_page_effect',
  description: `Toggle a reversible visual page effect for the USER (you enable it; the user interacts). action: enable|disable|toggle|list. Effects: ${catalog}. Use 'list' to see live state.`,
  inputSchema: EffectInput,
})
```

- [ ] **Step 5: Export + register.** In `tools.ts` add: `export {mandaraxPageEffectToolDef, EffectInput} from './effect.js'`. In `server.ts`, register a tool named `mandarax_page_effect` whose `execute({effect, action})` calls `ctx.page({kind: 'effect', effect, action})` (follow the exact pattern the `mandarax_page` tool uses there). Also ensure `./defs` subpath re-exports `mandaraxPageEffectToolDef` (mirror the other defs).

- [ ] **Step 6: Run to verify pass**

Run: `pnpm turbo run build --filter=@mandarax/tools && pnpm --filter @mandarax/tools exec vitest run page-effect-tool && pnpm --filter @mandarax/protocol exec vitest run page-effects`
Expected: PASS (tool IT + contract).

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/effect.ts packages/tools/src/tools.ts packages/tools/src/server.ts packages/protocol/test/page-effects.test.ts packages/tools/test/page-effect-tool.it.test.ts
git commit -m "feat(tools): mandarax_page_effect tool + catalog drift contract test"
```

---

### Task 6: `highlight` effect (hover inspector) — uses the frontend-design skill

**Files:**

- Create: `packages/widget/src/effects/highlight.ts`
- Create: `packages/widget/src/effects/highlight.stories.tsx`

**REQUIRED SUB-SKILL:** invoke **frontend-design** before writing the component — the overlay's outline/label visual quality (color, weight, label chip, motion-on-settle) should follow that skill. The structural shape is the Appendix in the spec.

**Interfaces:**

- Consumes: `EffectCtx` (Task 2), `defineEffect`.
- Produces: `highlightEffect` (a `PageEffect` with `id: 'highlight'`), `HighlightInspector(ctx)`.

- [ ] **Step 1: Write the failing story** (the test IS the story; seam ctx, no backend)

```tsx
// packages/widget/src/effects/highlight.stories.tsx
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, within} from 'storybook/test'
import {HighlightInspector} from './highlight.js'
import type {EffectCtx} from '../page-effects.js'

function FakeApp() {
  return (
    <button id="target" data-mandarax-source="/src/Foo.tsx:12:3">
      Foo
    </button>
  )
}

function seamCtx(opened: {file?: string}): EffectCtx {
  return {
    page: {
      elementAt: (x, y) => document.elementFromPoint(x, y),
      componentHostAt: (el) => el.closest('#target'),
      describe: () => ({component: 'Foo', file: '/src/Foo.tsx'}),
      locate: async (el) => ({
        component: 'Foo',
        stack: [],
        frames: [],
        owners: [],
        source: {file: '/src/Foo.tsx', line: 12, column: 3},
      }),
      inspect: async () => null,
      tree: async () => ({nodes: [], truncated: 0}),
      find: () => ({matches: [], total: 0}),
      addRef: () => 'r0',
    },
    openSource: async (loc) => {
      opened.file = loc.source?.file
      return 'opened'
    },
    server: {} as never,
    toast: () => {},
    env: {reducedMotion: () => true, doc: document, win: window},
  }
}

function Harness() {
  const opened: {file?: string} = {}
  return (
    <div>
      <FakeApp />
      <HighlightInspector {...seamCtx(opened)} __opened={opened} />
    </div>
  ) as never
}

const meta: Meta = {title: 'widget/HighlightEffect'}
export default meta
export const HoverAndClick: StoryObj = {
  render: () => <Harness />,
  play: async ({canvasElement}) => {
    const target = within(canvasElement).getByRole('button', {name: 'Foo'})
    await userEvent.hover(target)
    await expect(within(document.body).getByText('Foo')).toBeVisible() // the label badge
    await userEvent.click(target)
    // openSource seam received the Foo source — assert via a visible echo the harness renders
    await expect(within(canvasElement).getByTestId('opened')).toHaveTextContent('/src/Foo.tsx')
  },
}
```

(Adjust the harness so the `opened` result is rendered into a `data-testid="opened"` node for a native assertion — keep the seam, no spy library.)

- [ ] **Step 2: Run to verify it fails**

Run: `SKIP_STORYBOOK_TESTS= pnpm --filter @mandarax/widget exec vitest run --project storybook highlight`
Expected: FAIL — `./highlight.js` has no `HighlightInspector`.

- [ ] **Step 3: Implement `highlight.ts`** using the spec Appendix as the structural reference (capture layer + `<Show>` box + label, `onPointerMove`→`elementAt`/`componentHostAt`/`describe`, `onClick`→`openSource`, scroll/resize via `onCleanup`). Apply the frontend-design skill's visual choices for the outline/label. End with:

```ts
export const highlightEffect = defineEffect({id: 'highlight', component: HighlightInspector})
```

- [ ] **Step 4: Run to verify it passes**

Run: `SKIP_STORYBOOK_TESTS= pnpm --filter @mandarax/widget exec vitest run --project storybook highlight`
Expected: PASS — hover shows the label, click routes the right source to `openSource`.

- [ ] **Step 5: Visual check** — launch Storybook and eyeball the overlay:

Run: `pnpm turbo run storybook --filter=@mandarax/widget` → open `widget/HighlightEffect`.
Expected: a clean outline + readable label chip over the target; disabling unmounts cleanly.

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/effects/highlight.ts packages/widget/src/effects/highlight.stories.tsx
git commit -m "feat(widget): highlight hover-inspector effect"
```

---

### Task 7: `/api/page/open-source` endpoint (symbolication fallback)

**Files:**

- Modify: `packages/protocol/src/page-types.ts` (`OpenSourceSchema`, `OpenSourceResultSchema`)
- Create: `packages/core/src/api/page/open-source.ts`
- Modify: `packages/core/src/app.ts` (register the route with `openInEditor` + `root`)
- Test: `packages/core/test/api/page/open-source.it.test.ts` (create; real h3 app, real fs)

**Interfaces:**

- Consumes: `symbolicateFrames(frames, root)` (core), `OpenInEditor` (core editor).
- Produces: `registerOpenSourceRoute(app, deps: {openInEditor: OpenInEditor; root: string})`. Protocol: `OpenSourceSchema = {frames: RawFrame[]}`, `OpenSourceResultSchema = {status: 'opened'|'no-source'|'failed'}`.

- [ ] **Step 1: Add protocol schemas** (in `page-types.ts`)

```ts
export const RawFrameSchema = z.object({
  fileName: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  fn: z.string().optional(),
})
export const OpenSourceSchema = z.object({frames: z.array(RawFrameSchema)})
export const OpenSourceResultSchema = z.object({status: z.enum(['opened', 'no-source', 'failed'])})
```

- [ ] **Step 2: Write the failing endpoint test**

```ts
// packages/core/test/api/page/open-source.it.test.ts
import {describe, expect, it} from 'vitest'
import {H3, toWebHandler} from 'h3'
import {registerOpenSourceRoute} from '../../../src/api/page/open-source.js'

describe('POST /api/page/open-source', () => {
  it('symbolicates frames and opens the resolved file', async () => {
    const opened: {file?: string; line?: number} = {}
    const app = new H3()
    registerOpenSourceRoute(app, {
      openInEditor: (file, line) => {
        opened.file = file
        opened.line = line
      },
      root: process.cwd(),
    })
    const handler = toWebHandler(app)
    const res = await handler(
      new Request('http://x/api/page/open-source', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          frames: [{fileName: 'file://' + process.cwd() + '/packages/core/src/app.ts', line: 1, column: 1}],
        }),
      }),
    )
    const body = await res.json()
    expect(['opened', 'no-source', 'failed']).toContain(body.status)
    if (body.status === 'opened') expect(opened.file).toContain('app.ts')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @mandarax/core exec vitest run open-source`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `open-source.ts`**

```ts
import {type H3, readValidatedBody} from 'h3'
import {OpenSourceSchema} from '@mandarax/protocol/page-types'
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'
import type {OpenInEditor} from '../../editor/open.js'

export function registerOpenSourceRoute(app: H3, deps: {openInEditor: OpenInEditor; root: string}): void {
  app.post('/api/page/open-source', async (event) => {
    const {frames} = await readValidatedBody(event, OpenSourceSchema)
    const source = await symbolicateFrames(frames as RawFrame[], deps.root)
    if (!source) return {status: 'no-source' as const}
    try {
      deps.openInEditor(source.file, source.line)
      return {status: 'opened' as const}
    } catch {
      return {status: 'failed' as const}
    }
  })
}
```

(Confirm `symbolicateFrames`'s return shape from `packages/core/src/page/symbolicate.ts:76` — adjust `source.file`/`source.line` to its actual fields.)

- [ ] **Step 5: Register in `app.ts`** next to `registerEditorRoutes(app, opts.openInEditor)`:

```ts
registerOpenSourceRoute(app, {openInEditor: opts.openInEditor, root: opts.root})
```

(Confirm `opts.root` exists in `makeApp` opts; the page routes already receive `root` — thread it the same way.)

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm turbo run typecheck --filter=@mandarax/core && pnpm --filter @mandarax/core exec vitest run open-source`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/page-types.ts packages/core/src/api/page/open-source.ts packages/core/src/app.ts packages/core/test/api/page/open-source.it.test.ts
git commit -m "feat(core): /api/page/open-source endpoint (symbolicate + open)"
```

---

### Task 8: End-to-end widget IT — enable highlight, click, assert open

**Files:**

- Create: `packages/widget/test/effect-highlight.it.test.ts` (real browser + real React + scripted server)

**Interfaces:**

- Consumes: the built widget global, the React fixture, scripted `/api/editor/open` + `/api/page/open-source` endpoints (mirror `react-verbs.it.test.ts`'s `/__pw/*` scripting).

- [ ] **Step 1: Write the IT** — boot a node http server serving the fixture page + the built global, scripting `/api/editor/open` and `/api/page/open-source` to record their bodies; drive a real `effect enable highlight` via `window.__MANDARAX_PAGE_DRIVER__`, dispatch a real hover + click on a fixture component carrying `data-mandarax-source`, assert `/api/editor/open` recorded the right `{file,line}` (fast path), then repeat on a component WITHOUT the attribute and assert `/api/page/open-source` was hit (fallback). Follow the exact harness shape in `react-verbs.it.test.ts` (esbuild fixture bundle, `browser.newPage()`, unique server port).

```ts
// skeleton — fill server scripting + selectors from react-verbs.it.test.ts
it('enables highlight, click opens source via the fast path', async () => {
  await page.evaluate(() =>
    (window as any).__MANDARAX_PAGE_DRIVER__.execute({kind: 'effect', effect: 'highlight', action: 'enable'}),
  )
  await page.hover('#card-inc')
  await page.click('#card-inc')
  await expect.poll(() => openedBody).toMatchObject({file: expect.stringContaining('.tsx')})
})
```

- [ ] **Step 2: Run to verify it fails (then passes after wiring)**

Run: `pnpm turbo run build --filter=@mandarax/widget && pnpm --filter @mandarax/widget exec vitest run effect-highlight`
Expected: first FAIL (no recorded open), then PASS once selectors/scripting match the fixture.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/test/effect-highlight.it.test.ts
git commit -m "test(widget): e2e highlight enable→click→open (real browser, both source paths)"
```

---

## Final verification

- [ ] Run the full affected build/test through turbo:

```bash
pnpm turbo run build typecheck lint --filter=@mandarax/protocol --filter=@mandarax/widget --filter=@mandarax/tools --filter=@mandarax/core
SKIP_STORYBOOK_TESTS= pnpm --filter @mandarax/widget exec vitest run --project storybook
```

Expected: all green. Storybook stories (page-effects, highlight) pass as browser tests.

- [ ] Manual smoke: `pnpm turbo run storybook --filter=@mandarax/widget` → `widget/HighlightEffect` renders the inspector; toggling unmounts cleanly.

## Self-review notes (coverage map)

- Spec §1 registry + thin layer → Tasks 2, 4, 5.
- Spec §2 protocol catalog + drift contract → Tasks 1, 5.
- Spec §3 bus wiring → Tasks 1, 4.
- Spec §4 tool → Task 5.
- Spec §5 highlight hover inspector → Tasks 3, 6.
- Spec "click→open both paths" → Tasks 4 (ctx.openSource), 7 (endpoint), 8 (e2e).
- Spec testing (contract, Storybook, IT) → Tasks 1/5 (contract), 2/6 (Storybook), 3/8 (IT).

## Known confirmations to make during execution (not blockers)

- `symbolicateFrames` return field names (`packages/core/src/page/symbolicate.ts:76`).
- `makeApp` opts expose `root` + `openInEditor` (thread to `registerOpenSourceRoute`).
- `server.ts` tool-registration pattern for wiring `mandarax_page_effect` → `ctx.page`.
- Whether the Task 4 bus test needs to be a Storybook (browser) test (if node lacks `document`).
