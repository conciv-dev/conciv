# Extension overlay primitives + foreground suppression

Date: 2026-06-30
Status: design approved, ready for implementation plan

## Problem

When a user clicks the whiteboard "comment on an element" button, the flow is:
`grab.pick()` (react-grab element picker) → pick resolves → the compose dialog opens. While the
picker is active the chat widget hides itself (the `picking()` signal drives a
`[data-pw-picking]` "invisible + click-through" rule on the panel / FAB / quick-terminal). But the
instant the pick resolves, `picking()` flips back to `false` and the widget reappears — right as the
compose dialog opens on top of it. The chat panel then overlaps the compose box (see the reported
screenshot), making it hard to type a comment.

Two concrete defects:

1. The chat widget re-appears over the compose dialog because `picking()` is a react-grab-specific
   signal that knows nothing about an extension's own follow-on UI.
2. The compose dialog's Cancel / Add buttons are `size="sm"` — too small to comfortably hit.

The fix must be **systemic**: it must be structurally impossible for the chat widget to overlap an
extension's foreground dialog, for this extension and any future one, without per-feature wiring that
someone can forget.

## Principle

`toast` is already a host-owned UI primitive on `ClientApi` — the host renders it and owns its state.
Overlays (dialogs, popovers) are the same kind of cross-cutting host concern. So the host (widget)
provides the overlay primitives; because the host owns every overlay instance, it inherently knows
when an extension is showing foreground UI, and can hide the chat widget. There is **no registration
call, no claim/release token** for extensions to manage — using the only mechanism that shows an
overlay *is* the signal. The widget reappears automatically when the last overlay closes, because
suppression is *derived* from overlay open-state, not asserted.

## Scope

In scope: the chat widget hides while any host overlay is open, across the whole comment flow
(pick → compose → thread popover), and returns when the last floating dialog closes. Compose + thread
popover + the delete-confirm modal move onto the host overlay primitives. Cancel / Add sizing.

Out of scope (per design discussion): the docked inbox side-panel and the canvas overlay do **not**
suppress the widget — you can chat alongside them. No multi-human concerns. No new claim/token API.

## API

Two host-owned overlay primitives on `ClientApi`, reusing the existing components' prop shapes via
`ComponentProps` — no re-declared prop types. `@mandarax/extension` already depends on
`@mandarax/ui-kit-system` (it imports `ThemeTokens` / `TOKENS` today), so the components are
referenced directly:

```ts
// @mandarax/extension/types.ts
import {Dialog, Popover} from '@mandarax/ui-kit-system'
import type {Component, ComponentProps} from 'solid-js'

export type ClientApi = {
  // …existing: apiBase, activeSession, requestMeta, page, openSource, toast, surface, env
  Dialog: () => Component<ComponentProps<typeof Dialog>>
  Popover: () => typeof Popover
}
```

- `Dialog` is a flat function component today (`{open, onOpenChange, label, dismissable, children}`),
  so `ComponentProps<typeof Dialog>` is exactly its props, and `api.Dialog()` returns a flat component.
- `Popover` is the **compound** Ark object (`Object.assign({}, Ark, {Root, Content})`). Option A keeps
  the compound shape: `api.Popover()` returns a value of the same type `typeof Popover`, with only
  `Root` wrapped for tracking (below). The consumer writes `<api.Popover.Root>…<api.Popover.Content>…`
  and the tracked prop shape on `Root` is exactly `ComponentProps<typeof Popover.Root>` — no
  re-declared types either way.

### Consumer surface (Option A — host-wrapped primitives)

```tsx
const Popover = api.Popover()
const Dialog = api.Dialog()

// compose / thread — anchored, non-modal
<Popover.Root open={open()} onOpenChange={onChange} positioning={{getAnchorRect}}>
  <Popover.Positioner>
    <Popover.Content>{/* body */}</Popover.Content>
  </Popover.Positioner>
</Popover.Root>

// delete-confirm — centered modal
<Dialog open={open()} onOpenChange={onChange} label="Delete this thread?">…</Dialog>
```

The overlay renders **in the extension's own component tree**, so its content keeps its owner/context
(`useComments()`, the Ark `EnvironmentProvider` shadow root) — nothing is rendered out of tree, so
there is no owner/context plumbing to get wrong.

## Host implementation (widget)

A **signal-backed stack** of overlay layers, mirroring `react-grab/picking.ts` (a module-level
reactive value imported and read by the shell — that read *is* the cross-component wire; no store is
needed for the connection). The stack (not a keyed map) is the right structure: ordered by open, so it
also yields "topmost" for Escape / focus-return / z-order later. A plain `createSignal<Layer[]>` (not
`createStore`) lets layers be removed by reference identity, so no per-layer `id` is needed — a store
would proxy entries and force a key, and buys nothing here since the shell only ever reads the whole
stack via `anyOpen`/`topOpen` (per-layer reactivity already comes from the `isOpen` accessor).

```tsx
// widget/src/shell/dialogs.ts
type Layer = {isOpen: () => boolean}

const [stack, setStack] = createSignal<Layer[]>([])
const pushLayer = (layer: Layer): void => setStack((s) => [...s, layer])
const removeLayer = (layer: Layer): void => setStack((s) => s.filter((l) => l !== layer))

export const anyOpen = createMemo(() => stack().some((l) => l.isOpen()))      // suppression wire
export const topOpen = createMemo(() => stack().findLast((l) => l.isOpen()))  // future Escape/focus
```

The `track()` wrapper pushes a layer on mount, removes it (by reference) on cleanup, and stores a live
`isOpen` accessor — no effects, no per-change writes. A mounted-but-closed overlay (the prop-toggled
delete-confirm) contributes `false` until it opens.

```tsx
export function track<P extends {open?: boolean; defaultOpen?: boolean; onOpenChange?: (o: {open: boolean}) => void}>(
  Inner: Component<P>,
): Component<P> {
  return (props) => {
    const [local, setLocal] = createSignal(props.defaultOpen ?? false)
    const isOpen = () => props.open ?? local()
    const layer = {isOpen}
    onMount(() => pushLayer(layer))
    onCleanup(() => removeLayer(layer))
    return <Inner {...props} onOpenChange={(o) => { setLocal(o.open); props.onOpenChange?.(o) }} />
  }
}

// api.Dialog / api.Popover, exposed by makeWidgetClientApi (page/client-api.ts), next to toast/surface:
Dialog: () => track(Dialog),                                   // flat component
Popover: () => Object.assign({}, Popover, {Root: track(Popover.Root)}),  // compound, only Root tracked
```

`makeWidgetClientApi` exposes `Dialog`/`Popover`. The `dialogs.ts` module lives at widget shell level
(the `ClientApi` is installed before the shell mounts, same as `picking.ts`), and both the shell and
`client-api.ts` import from it.

### Shell suppression

```ts
const suppressed = () => picking() || anyOpen()
```

The hide rule in `widget/src/styles.css` moves from `[data-pw-panel][data-pw-picking]` (+ fab + qt) to
`[data-pw-panel][data-pw-suppressed]` (+ fab + qt). Those three elements get
`data-pw-suppressed={suppressed() ? '' : undefined}`. `data-pw-picking` stays **only** on the pick-mode
pill (`<Show when={picking()}>`), which should still appear during a pick but not during a plain
compose.

## Whiteboard cutover

Complete inventory of the whiteboard's floating surfaces (swept 2026-06-30). Every hand-rolled or
overlapping surface is accounted for — migrated or explicitly left, with rationale.

### Migrate → host primitives (these suppress the widget)

- **compose** (`client/pins/compose.tsx`): replace the hand-rolled positioned `role="dialog"` div with
  `api.Popover` anchored at the clicked element's rect (`getAnchorRect`). Cancel / Add go from
  `size="sm"` → `size="md"`.
- **drag-prompt** (`client/pins/drag-prompt.tsx`): the "Disconnect / Keep / Cancel" panel shown while
  dragging a source-linked pin — another hand-rolled positioned `role="dialog"` div anchored at the
  drop point (`{x+16, y}`), rendered by `PinsLayer` under `<Show when={prompt()}>`. Replace with
  `api.Popover` anchored at the drop point. Keeps its Escape-to-cancel and initial focus.
- **thread popover** (`client/pins/thread.tsx` → `ThreadPopover`): replace the local `client/ui.tsx`
  `Popover` wrapper with `api.Popover` (anchored at the pin via `model.anchorRect`).
- **delete-confirm** (inside `ThreadPopover`): use `api.Dialog` (centered modal) instead of importing
  `Dialog` from ui-kit-system directly.

### Catalogued, intentionally left

- **per-comment overflow `Menu`** (in `thread.tsx`): a dropdown nested inside `ThreadPopover`, which
  already suppresses the widget — no independent handling needed. Stays an Ark `Menu`.
- **inbox filter `Menu`** (in `inbox.tsx`): a dropdown nested inside the docked inbox, which is out of
  scope per the design choice. Stays.
- **ThreadHeader `Tooltip`s** (in `thread.tsx`): transient hover affordances, not modal — do not
  suppress. Stay.
- **`overlay.tsx` NOTICE** (loading / error): `pointer-events-none` status text, not a dialog. Stays.

### Mechanics

- The local `Popover` wrapper in `client/ui.tsx` is removed (consolidated into `api.Popover`); the
  other local wrappers (Avatar / Menu / Tooltip / Tabs) stay.
- The overlay's `ClientApi` is already in scope (`Canvas`/`Board` receive `api`), so the primitives are
  obtained once (`const Popover = api.Popover()`) and reach the views via the existing comments
  context, not prop-drilled.

## Pick → compose handoff (no flicker)

During `grab.pick()` the widget is suppressed by `picking()`. When the pick resolves, the compose
`api.Popover` opens (a layer pushed → `anyOpen()` true), so suppression is continuous *except* for the
microtask between `picking()` clearing and the compose layer mounting.

- Primary: the suppression rule keeps the existing `transition: opacity 140ms` on un-hide, which
  absorbs a sub-frame ordering gap (opacity barely moves before it is re-asserted). Verify in the
  running app that no flash is visible.
- Deterministic fallback (only if a flash is observed): defer react-grab's `setPicking(false)` in the
  adapter `onDeactivate` to the next animation frame, so the compose layer is mounted before the pick
  suppression releases. One-line change, isolated to the adapter.

## Tests (regression)

- **Widget IT**: render the shell, mount an `api.Dialog` / `api.Popover` with `open`; assert the panel
  / FAB carry `data-pw-suppressed` and are not interactable; flip `open` to false; assert they return.
  Assert via roles / attributes, no test-ids.
- **Whiteboard IT** (testkit, `callTool` → assert `api.page`, keyboard not pointer): the existing
  compose / thread ITs continue to pass against `api.Popover`; add an assertion that opening compose
  pushes a layer (`anyOpen()` true) and closing it clears the layer.
- No tests in example apps.

## Non-goals / risks

- Topmost-driven Escape / focus-return / z-stacking is enabled by the stack but not implemented here
  (Ark already handles per-instance Escape / focus-trap / scrim); `topOpen` is laid down for a later
  pass.
- The `track()` wrapper assumes the wrapped component accepts `open` / `defaultOpen` / `onOpenChange`;
  both `Dialog` and `Popover.Root` do.

## House rules

Functions not classes, no IIFE, no `any` / casts, no non-null `!`, no `useEffect` / `createEffect` for
this glue (the stack is effect-free), one-line comments. Views stay presentational; overlay logic and
state live in the comments model / host stack, not prop-drilled.
