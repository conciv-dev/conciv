# Page Effects + Highlight-to-Open — Design

Date: 2026-06-20
Status: Approved (design); pending implementation plan

## Summary

Give the agent a way to toggle reversible, visual "page effects" on the live page, and ship the
first effect: a **hover inspector** that outlines the React component under the cursor and, on a user
click, opens that component's source in the editor.

The deliverable is two things:

1. A general, reusable **page-effect registry** — a clean way to define an effect (`setup() →
teardown`) and an agent tool to toggle effects by id, with the catalog auto-derived so the AI
   always knows exactly which effects exist.
2. The **`highlight`** effect as the first registered effect.

## Interaction model

- The **agent toggles** an effect on/off (`mandarax_page_effect`).
- While `highlight` is on, the **user hovers** to see the component outline + name/file label and
  **clicks** to open that component's source in their editor.
- The agent never clicks elements through this feature — it already has `locate` + `mandarax_open`.

## Layering principle (load-bearing)

Most code is plain, framework-agnostic, and tested on its own (Storybook stories + real-browser ITs)
with **no agent involvement**. The LLM-facing surface is a **thin pass-through**: the
`mandarax_page_effect` tool and the `effect` bus handler only parse `{effect, action}` and delegate
to the already-tested registry. No behavior lives in the agent layer. This keeps the hardest-to-test
path trivial and pushes all real logic into fast deterministic tests.

## Components

### 1. Effect registry (`packages/widget/src/page-effects.ts`) — the framework

An effect **is a Solid component**. The effect host `render()`s it into a style-isolated page-level
mount (a `document.body` host with its own shadow root, reusing the widget's `shadow.ts` pattern) on
enable, and calls Solid's `dispose()` on disable — Solid runs every `onCleanup`, so teardown is total
and automatic, no manual node/listener bookkeeping. Visual effects return overlay JSX (signals drive
position/label); behavioral effects return `null` and work in `onMount`/`createEffect`/`onCleanup`.
Setup/teardown collapse entirely into Solid's lifecycle.

The component's only argument is `EffectCtx` — the **curated platform** of capabilities, each a handle
to already-tested code (`react-bridge`, the transport, the source/editor channel). This keeps effects
thin and makes them trivially testable: a Storybook story renders `<effect.component ctx={seamCtx}/>`
with seams (spy `openSource`, scripted `server`) and no backend.

```ts
type PageEffect = {
  id: string // must match a PAGE_EFFECTS catalog id
  component: (ctx: EffectCtx) => JSX.Element // Solid component; rendered on enable, disposed on disable
}

// No onCleanup (use Solid's), no overlay (the component IS the overlay) — just capabilities.
type EffectCtx = {
  // introspect the live DOM + React tree — the SAME primitives the page verbs use
  page: {
    elementAt: (x: number, y: number) => Element | null // elementFromPoint with our overlay's
    // pointer-events toggled off around the call, so it returns the page element, not the capture layer
    componentHostAt: (el: Element) => Element | null
    describe: (host: Element) => {component: string; file: string | null} // cheap SYNC hover label
    locate: (el: Element) => Promise<LocateResult | null> // full async resolve for click→open
    inspect: (el: Element) => Promise<InspectResult | null>
    tree: () => Promise<TreeResult>
    find: (name: string) => {matches: {ref: string; component: string}[]; total: number}
    addRef: (el: Element) => string // hand the agent a targetable ref (ties effects back to verbs)
  }

  // source + editor (connect-both-paths) and arbitrary server access
  openSource: (locate: LocateResult) => Promise<'opened' | 'no-source' | 'failed'>
  server: Transport // route()/fetch any /api/* endpoint — effects aren't limited to editor open

  // talk to the user (panel may be closed → on-page) and the environment (injectable for tests)
  toast: (msg: string, tone?: 'info' | 'success' | 'error') => void
  env: {reducedMotion: () => boolean; doc: Document; win: Window}
}

function defineEffect(effect: PageEffect): PageEffect
function registerEffect(effect: PageEffect): void
function setEffect(id: string, on: boolean): {effect: string; enabled: boolean} | {error: string}
function toggleEffect(id: string): {effect: string; enabled: boolean} | {error: string}
function listEffects(): {effects: {id: string; title: string; description: string; enabled: boolean}[]}
```

- The registry owns **enabled-state bookkeeping** and **idempotency**: enable-while-enabled is a
  no-op; enable does `render(() => effect.component(ctx), mount)` and stores the Solid `dispose`;
  disable calls it. Teardown is Solid's `onCleanup` chain — total, automatic, no manual bookkeeping.
- Capabilities are **handles to existing tested modules**, not new logic on the ctx: `page.*` wraps
  `react-bridge` + the snapshot ref registry; `server` is the widget transport; `openSource` composes
  source-resolution + the editor channel. The ctx is a curated façade, so an effect never reaches past
  it into globals. (The overlay layer is no longer a ctx handle — the component renders it as JSX into
  the page-level shadow mount.)
- `highlight` uses only a slice of this (`page.componentHostAt`/`locate`, `openSource`, `toast`) — but
  the surface is there so effect #2 (e.g. annotate, measure, grid overlay, a11y audit) isn't blocked
  on extending the platform.

### 2. Protocol catalog (`@mandarax/protocol`) — single source of truth

```ts
export const PAGE_EFFECTS = [
  {
    id: 'highlight',
    title: 'Highlight + open',
    description: 'Outline the React component under the cursor; the user clicks one to open its source in the editor.',
  },
] as const
export type PageEffectId = (typeof PAGE_EFFECTS)[number]['id']
```

Everything derives from this array:

- the `mandarax_page_effect` tool's `effect` **enum** (model can't name a non-existent effect);
- the tool **description** (each id + description, inline, never stale);
- `action: 'list'` returns the same catalog **+ live enabled-state**;
- a **contract test** asserts the widget registry registers exactly these ids.

### 3. Bus wiring

- Add one kind `effect` to `PAGE_QUERY_KINDS` (not an element verb — stays out of `ELEMENT_KINDS`).
- Add `effect?: string` to `PageQuerySchema`; extend the existing `action` enum with
  `enable | disable | toggle | list`.
- A `DOM_HANDLERS.effect` handler maps `{kind:'effect', effect, action}` → registry call →
  `{effect, enabled}` or, for `list`, `{effects: [...]}`. This handler is the entire agent-layer
  surface in the widget — pure delegation.

### 4. Agent tool (`packages/tools/src/...`) — thin adapter

```ts
mandarax_page_effect({ effect?: PageEffectId, action: 'enable' | 'disable' | 'toggle' | 'list' })
```

Posts the `effect` page-bus query via `ctx.page(...)`. `list` needs no `effect`. Description is built
from `PAGE_EFFECTS`.

### 5. `highlight` effect (`packages/widget/src/effects/highlight.ts`) — hover inspector

A Solid component `HighlightInspector(ctx)`. A `hovered` signal holds `{rect, component, host} | null`;
the JSX renders three parts, all derived from it:

1. **Capture layer** — full-viewport, `pointer-events: auto`, with `onPointerMove`/`onClick`/`onScroll`.
2. **Highlight box** — one outline div positioned from `hovered().rect` (outline, not border → no
   layout shift); `<Show when={hovered()}>`.
3. **Label badge** — `hovered().component` + file, positioned with the box.

- **`onPointerMove`** → `ctx.page.elementAt(x, y)` → `ctx.page.componentHostAt(el)` (new `react-bridge`
  helper: `getFiberFromHostInstance` → nearest composite → `getNearestHostFiber`) → set the `hovered`
  signal (rect + display name + file). Not over a component → `setHovered(null)`.
- **`onClick`** → `ctx.openSource(await ctx.page.locate(hovered().host))` → `ctx.toast` per result.
  `preventDefault`/`stopPropagation` so the click never reaches the app.
- **Live-tracking is implicit**: every move re-resolves from scratch, so re-renders / list changes /
  SPA navigation need no observer. `onScroll`/`resize` re-resolves from the last pointer coords
  (rAF-throttled) for the stationary-cursor case.
- **Teardown is free**: the scroll/resize listeners register via `onCleanup`; `dispose()` removes the
  whole component subtree. Nothing manual.

## Click → open (both source paths connected)

The widget already has `react-bridge.locate(el)` → `{source?, frames, component}`, which carries both
source signals. On click, run `locate(hostEl)` and:

1. **`source` present** (our vite-transformer `data-mandarax-source`) → POST `/api/editor/open
{file, line}`. Fast path, no symbolication, no extra round-trip.
2. **`source` absent** but React-DevTools `frames` present → POST frames to a new thin endpoint
   `POST /api/page/open-source`, which runs the existing `symbolicateFrames(frames, root)` →
   `{file,line}` → the existing `openInEditor`. One round-trip; same merge the `locate` verb already
   does server-side (`core/src/api/page/page.ts`), exposed to a user click instead of an agent pull.
3. **Neither** (non-React subtree, no frames) → the genuinely-rare "No source" feedback.

New code here is exactly **one thin endpoint** (`/api/page/open-source` + its protocol schema)
composing `symbolicateFrames` + `openInEditor`. Reused: `locate` (client), `symbolicateFrames`
(server), `openInEditor` / `/api/editor/open` (server).

### On-page feedback (panel may be closed, so it rides the overlay)

- **Opened** → pulse the highlight box + transient "Opened `<Component>`" label.
- **Couldn't open** (network / non-ok) → "Couldn't open" label.
- **No source** → muted/amber pulse + "No source" label.

## Data flow

```
agent: mandarax_page_effect(effect:"highlight", action:"enable")
  → tools: mandarax_page_effect (thin) → ctx.page({kind:"effect", effect:"highlight", action:"enable"})
  → page-bus → widget DOM_HANDLERS.effect (thin) → setEffect("highlight", true)
  → registry → highlight.setup(ctx) → overlay live

user hovers → elementFromPoint → componentHostAt → box + label
user clicks → ctx.openSource(locate(hostEl))
  source?  → POST /api/editor/open {file,line}                         (fast path)
  frames?  → POST /api/page/open-source {frames} → symbolicate → open  (fallback)
  → 'opened' | 'no-source' | 'failed' drives on-page feedback

agent: mandarax_page_effect(effect:"highlight", action:"disable")
  → setEffect("highlight", false) → Solid dispose() → component subtree + listeners gone
```

## Error handling

- Unknown effect id → registry returns `{error}`; tool surfaces it (enum normally prevents this).
- Idempotent toggles: enable×2 / disable-without-enable are no-ops.
- Open failures (editor unavailable, non-ok response) → on-page "Couldn't open" feedback; never throws
  into the page.
- Teardown can't be forgotten: it's Solid's `dispose()` of the rendered component, which runs every
  `onCleanup` and removes the subtree. No partial-apply hazard.

## Testing

1. **Contract test (node, protocol):** `PAGE_EFFECTS` ids === tool enum === widget registry ids.
   Mirrors the existing verb-table ↔ handler contract test.
2. **Widget Storybook story (browser, presentational):** render `<HighlightInspector ctx={seamCtx}/>`
   directly over a fake nested app (fixture components with `data-mandarax-source`); `seamCtx` has a
   spy `openSource` + scripted `server`, no backend. Drive via `play` — hover asserts box + label
   (`getByText`), click asserts the `openSource` seam got the right `file:line`, unmount asserts full
   teardown. Native assertions only. Doubles as the live demo. Registry idempotency cases fold in here.
3. **Widget IT (real browser + real React, `react-verbs.it.test.ts` style):** bundle the React
   fixture, mount the built widget global, drive the real page driver to `effect enable highlight`,
   dispatch real hover+click, assert scripted `/api/editor/open` and `/api/page/open-source` received
   the right `{file,line}` — covering both the attribute fast path and the symbolication fallback.
   Real bippy, real `locate`, real transport, scripted server, no mocks.

## Out of scope / future

- Additional effects (the registry exists to make these cheap).
- Prod (the `data-mandarax-source` attr is dev-only; the widget is a dev tool, so the attribute fast
  path is the common case and symbolication covers the rest).

## Files touched (anticipated)

- `packages/protocol/src/page-types.ts` — `effect` kind, `effect` field, extended `action`,
  `PAGE_EFFECTS` catalog.
- `packages/widget/src/page-effects.ts` — registry + `defineEffect`.
- `packages/widget/src/effects/highlight.ts` — the effect.
- `packages/widget/src/react-bridge.ts` — `componentHostAt(el)` + `describe(host)` helpers.
- `packages/widget/src/page-handlers.ts` — `effect` handler (thin).
- `packages/tools/src/` — `mandarax_page_effect` tool def (thin).
- `packages/core/src/api/page/` — `/api/page/open-source` endpoint (composes existing primitives).
- Tests: protocol contract test, widget Storybook story, widget IT.

## Appendix — `highlight` effect, illustrative

Reference shape for the first effect (~45 lines, one `onCleanup`, no manual DOM — `dispose()` reverts
everything). The agent layer never appears here; this is plain Storybook-testable Solid.

```tsx
import {createSignal, Show, onCleanup, type JSX} from 'solid-js'
import {defineEffect, type EffectCtx} from '../page-effects.js'

type Hovered = {rect: DOMRect; component: string; file: string | null; host: Element}
const ACCENT = '#ff40e0'
const MAX_Z = 2147483647

function HighlightInspector(ctx: EffectCtx): JSX.Element {
  const [hovered, setHovered] = createSignal<Hovered | null>(null)
  let lastX = -1
  let lastY = -1

  const resolve = (x: number, y: number) => {
    lastX = x
    lastY = y
    const el = ctx.page.elementAt(x, y) // sees past our capture layer (ctx toggles its pointer-events)
    const host = el && ctx.page.componentHostAt(el)
    if (!host) return setHovered(null)
    const {component, file} = ctx.page.describe(host)
    setHovered({rect: host.getBoundingClientRect(), component, file, host})
  }

  const onClick = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const h = hovered()
    if (!h) return
    const r = await ctx.openSource(await ctx.page.locate(h.host))
    const msg = r === 'opened' ? `Opened ${h.component}` : r === 'no-source' ? 'No source' : 'Couldn’t open'
    ctx.toast(msg, r === 'opened' ? 'success' : 'error')
  }

  let raf = 0
  const reposition = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => resolve(lastX, lastY))
  }
  ctx.env.win.addEventListener('scroll', reposition, true)
  ctx.env.win.addEventListener('resize', reposition)
  onCleanup(() => {
    cancelAnimationFrame(raf)
    ctx.env.win.removeEventListener('scroll', reposition, true)
    ctx.env.win.removeEventListener('resize', reposition)
  })

  const at = (r: DOMRect): JSX.CSSProperties => ({left: `${r.left}px`, top: `${r.top}px`})

  return (
    <>
      <div
        style={{position: 'fixed', inset: 0, 'z-index': MAX_Z}}
        onPointerMove={(e) => resolve(e.clientX, e.clientY)}
        onClick={onClick}
      />
      <Show when={hovered()}>
        {(h) => (
          <>
            <div
              style={{
                position: 'fixed',
                ...at(h().rect),
                width: `${h().rect.width}px`,
                height: `${h().rect.height}px`,
                outline: `2px solid ${ACCENT}`,
                'pointer-events': 'none',
                'z-index': MAX_Z,
              }}
            />
            <div
              style={{
                position: 'fixed',
                left: `${h().rect.left}px`,
                top: `${h().rect.top - 22}px`,
                background: ACCENT,
                color: '#fff',
                font: '11px system-ui',
                padding: '2px 6px',
                'border-radius': '4px',
                'pointer-events': 'none',
                'z-index': MAX_Z,
              }}
            >
              {h().component}
              <Show when={h().file}> · {h().file}</Show>
            </div>
          </>
        )}
      </Show>
    </>
  )
}

export const highlightEffect = defineEffect({id: 'highlight', component: HighlightInspector})
```
