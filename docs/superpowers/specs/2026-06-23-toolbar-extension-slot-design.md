# Floating toolbar extension slot — design

Date: 2026-06-23
Status: approved (brainstorm), pending spec review

## Summary

Add a floating, on-page toolbar to the widget that recreates the react-grab
"select an element on the page → feed it to the agent" experience. The toolbar
is a **platform-owned dock** that renders **declarative toolbar items contributed
by extensions**. The platform owns only the dock chrome (consistent item styling,
drag + snap-to-edge, collapse-to-grip, position persistence). Everything an item
shows and does is plain SolidJS supplied by the extension.

Built-in actions (select, comment, copy) ship as built-in extensions through the
same public API — dogfooding. The element-picking experience is rebuilt on the
existing effect page-bus introspection; the `react-grab` dependency is removed.

## Motivation

react-grab is already a dependency and the current element-selection engine, but
its own floating toolbar is deliberately disabled and selection is launched from a
composer button. We want the floating toolbar experience back, owned by us, and
extensible: extensions declare toolbar items the same declarative way they declare
`tools` and `effects`. No imperative `register*` calls.

## Dependency

This builds on the (currently unmerged) `page-effects` branch, which introduces:

- `defineEffect` / `EffectDefinition` / `EffectCtx` in `@conciv/extensions`.
- `effects-host.ts` + `page-effects.ts` in the widget (effect registry, the `effect`
  page verb, `enable`/`disable`/`isEnabled`, `listEffects`).
- Page-bus introspection on `EffectCtx.page` (`elementAt`, `componentHostAt`,
  `describe`, `locate`, `inspect`, `tree`, `find`, `addRef`).

This spec lands after page-effects merges, or rebased onto it. It reuses
`EffectCtx.page` for element picking, so `react-grab` is no longer needed.

## Contract additions (`@conciv/extensions`)

```ts
// A capability bag a toolbar item's render() receives. Mirrors EffectCtx.page plus
// the sinks an item needs to route a grabbed element. The widget supplies the
// concrete implementation; items never see widget internals.
export type ToolbarCtx = {
  page: EffectCtx['page'] // same introspection effects get
  capture: (el: Element) => Promise<ElementSnapshot> // styled, self-contained clone
  chat: {
    stageGrab: (grab: Grab) => void // open chat + stage chip + text as one unit
    open: () => void
    insert: (text: string) => void
  }
  clipboard: {copy: (text: string) => Promise<void>}
  toast: (msg: string, tone?: 'info' | 'success' | 'error') => void
  // Control the dock itself from an item (e.g. collapse to the grip while picking,
  // expand again on completion). Drives the same collapsed state the grip toggles,
  // so programmatic + manual hide/show stay in sync and persist.
  toolbar: {
    show: () => void // expand the dock
    hide: () => void // collapse to the grip
    toggle: () => void
    isVisible: () => boolean // false when collapsed to the grip
  }
}

// One toolbar entry. render() returns the button JSX — the author owns its look and
// behavior; the platform only frames/positions it. id is for upsert (HMR) + ordering.
export type ToolbarItemDefinition = {
  id: string
  order?: number
  render: (ctx: ToolbarCtx) => JSX.Element
}

// Identity helper, the parallel to defineTool / defineEffect.
export function defineToolbarItem(item: ToolbarItemDefinition): ToolbarItemDefinition {
  return item
}
```

`defineExtension` gains a `toolbar` array, collected exactly like `tools`/`effects`:

```ts
export function defineExtension(meta: {
  id: string
  tools?: ToolDefinition[]
  effects?: EffectDefinition[]
  toolbar?: ToolbarItemDefinition[]
}): ExtensionBuilder
```

`ConcivExtension` gains `toolbar?: ToolbarItemDefinition[]`; `discovery.ts`
`collectClientContributions` collects `toolbarItems` alongside `effects`.

`Grab` / `StagedGrab` / `ElementSnapshot` / `ElementSource` move from
`widget/src/react-grab/grab-types.ts` **into the `@conciv/extensions` contract**
(they are plain types the contract now references via `ToolbarCtx`). The widget
imports them from `@conciv/extensions` instead of its own `grab-types.ts`.

## Platform: the dock

New widget module `toolbar-dock.tsx` (rendered at Shell top-level, sibling to the
modal, **always mounted** regardless of chat open/closed):

- Reads the collected toolbar items; renders each `render(ctx)` result inside a
  consistent item frame (uniform sizing/spacing/hit-area), sorted by `order` then
  registration. Upsert by `id` for HMR.
- Renders nothing (fully hidden) when zero items registered.
- Drag + snap-to-edge + position persistence via the existing
  `createDraggablePosition` (`draggable-position.ts`). Default position offset from
  the FAB-robot so they do not overlap.
- Collapse-to-grip: a control collapses the dock to a small grip pinned to its snap
  edge; click the grip to re-expand. Collapsed + position state persisted via
  `persisted-signal`.
- Builds the single `ToolbarCtx` once (closes over the widget's stageGrab bag,
  navigator.clipboard, the effect-host page introspection, the toast surface, and
  the dock's own collapsed signal) and passes it to every item's `render`.
- `ctx.toolbar` (`show`/`hide`/`toggle`/`isVisible`) drives the **same** collapsed
  signal the grip control toggles — programmatic and manual hide/show share one
  source of truth and the same persistence.

The dock does not know what any item does. It frames and positions; the item's JSX
owns content and clicks.

## Built-in toolbar items (dogfooded)

Shipped as built-in extensions (in the extensions package / widget built-ins,
matching how `highlight-extension.ts` ships the highlight effect), registered in
`mount.tsx` through the same collection path:

- **select** — button toggles an inspector overlay (the `highlight` effect's
  outline+label pattern) using `ctx.page`; on click of an element, runs
  `ctx.capture` together with `ctx.page.locate`/`describe`, then
  `ctx.chat.stageGrab({snapshot, source, text})`.
- **comment** — like select, plus a small prompt input; stages prompt + element
  context.
- **copy** — select an element → `ctx.clipboard.copy(referenceText)` +
  `ctx.toast('Copied')`.

App authors add their own from `conciv/extensions/*.ts`:

```ts
import {defineExtension, defineToolbarItem} from '@conciv/extensions'
import {Crosshair} from 'lucide-solid'

export default defineExtension({
  id: 'my-tools',
  toolbar: [
    defineToolbarItem({
      id: 'my-grab',
      render: (ctx) => (
        <button aria-label="Grab" onClick={async () => {
          // ...drive ctx.page picking, then:
          // ctx.chat.stageGrab(grab)
        }}>
          <Crosshair />
        </button>
      ),
    }),
  ],
})
```

## react-grab removal

- Remove the `react-grab` dependency.
- Remove `widget/src/react-grab/adapter.ts`, `picker-action.ts`, `picking.ts`
  (react-grab-coupled).
- Relocate `capture-element.ts` (generic DOM, no coupling), `grab-types.ts`,
  `grab-reference.tsx` (the chip) as shared grab utilities.
- Remove the composer crosshair button (`elementPickerAction` registration in
  `mount.tsx`); the toolbar `select` item supersedes it.
- Remove `window.__CONCIV__.registerPlugin`/`unregisterPlugin` and the
  react-grab references in `conciv-global.ts` / `widget-shell.ts`.

## Phasing

- **Phase 1 (this spec):** contract additions (`ToolbarItemDefinition`,
  `defineToolbarItem`, `toolbar` on `defineExtension`, `ToolbarCtx`); discovery
  collection; the dock; built-in select / comment / copy items; react-grab removal.
- **Phase 2 (separate spec):** style / live-CSS-edit toolbar item.

## Testing

- Widget IT (real browser via Playwright, core built, `newPage()`, native
  role/text/aria assertions, no jsdom, no mocks):
  - dock renders registered items; renders nothing with zero items.
  - clicking the `select` item enters pick mode; clicking a page element stages a
    chip in the composer (assert the chip + its source label).
  - collapse-to-grip toggles and re-expands; dock position + collapsed state persist
    across reload.
- Unit coverage for `discovery.ts` collecting `toolbarItems`, and for the dock's
  ctx construction (stageGrab/clipboard/capture wired).

## Open questions

None blocking. (Built-in items' exact icon set and the comment prompt UI are
implementation detail.)
