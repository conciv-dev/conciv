# Quick-Terminal Layout: Design Spec

Date: 2026-06-14
Status: Approved for planning

## Summary

Expand the mandarax widget with a richer layout system, drawing the floating-button
position, drag, resize, and Picture-in-Picture behaviors from TanStack Devtools
(MIT, adapted into our own source with a credit comment).

Two layouts, independently enableable (and, not or):

- **Modal**: the existing bottom-right corner panel, now with a configurable
  trigger position (6 presets, draggable with snap), a resizable panel, and PiP.
- **Quick terminal**: a full-width sheet that drops from the top edge on a
  hotkey, like the iTerm2 / Ghostty quick terminal. Draggable height, splittable
  into multiple independent-session panes, and PiP.

A host can enable either or both. The reference mockup for the quick terminal
lives at `packages/widget/mockups/quick-terminal.html`.

## Goals

- Quick-terminal drop sheet anchored to the top edge, toggled by a hotkey.
- Configurable hotkey(s) in plugin config, supporting multiple bindings and combos.
- Quick-terminal draggable height (bottom grip), persisted. No fixed height.
- No page-dimming backdrop. The sheet drops over the page, which stays lit.
- Quick-terminal split into a horizontal row of panes; each pane is a fresh,
  independent agent session; draggable gutters; survivors reflow on close.
- Modal trigger button: 6 position presets, draggable, snaps to nearest preset,
  position persisted (ported from TanStack Devtools).
- Modal panel: edge resize-drag with collapse-on-small (ported from Devtools).
- Picture-in-Picture: pop either layout into a separate OS window (ported from
  Devtools).
- All config namespaced under `MandaraxConfig.widget`.

## Non-goals

- Nested row + column splits (tmux-style). v1 is a horizontal row only. Pane
  state is tree-shaped so nesting can be added later.
- Duplicating / branching a session into a new pane. New pane starts fresh.
- Persisting pane layout / sessions across reloads (only sheet height, FAB
  position, and panel size persist).
- Mobile-specific pane layout. Narrow viewports show one pane.

## Decisions (resolved)

| Question              | Resolution                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Config shape          | Namespaced under `MandaraxConfig.widget`; `modal` and `quickTerminal` are independent toggles (both can be on) |
| Split scope (v1)      | Horizontal row only; tree-shaped state for future nesting                                                      |
| New pane session      | Fresh, empty session per pane                                                                                  |
| Backdrop              | None (no dimming)                                                                                              |
| Quick-terminal height | Draggable bottom grip, persisted to localStorage                                                               |
| Hotkey default        | `Mod+\`` (Cmd+backtick on mac, Ctrl+backtick elsewhere)                                                        |
| Hotkey library        | `@tanstack/solid-hotkeys` (new dependency)                                                                     |
| Pane-close behavior   | Reset survivors' flex so a lone pane returns to full width                                                     |
| FAB position          | 6 presets (`top/middle/bottom` x `left/right`) + drag-to-reposition with snap; persisted. Ported from Devtools |
| Panel resize          | Modal panel gets Devtools-style edge drag, collapse under threshold                                            |
| PiP                   | Both layouts can pop into a separate OS window. Ported from Devtools                                           |
| License               | TanStack Devtools is MIT; adapted code keeps a one-line credit                                                 |

## Architecture overview

```
plugin config (Vite/Next)         core injection         widget (SolidJS)
─────────────────────────         ──────────────         ────────────────
MandaraxConfig {                       htmlTags() adds        mount.tsx reads <meta pw-widget>:
  widget?: {                         <meta pw-widget>     → { modal, quickTerminal }
    modal?: boolean | {              (one JSON blob)        │
      position?: TriggerPosition }                          ├─ modal: FAB(position, drag) + panel(resize) + PiP
    quickTerminal?: boolean | {                             └─ quickTerminal: hotkeys + drop sheet
      hotkey?: string | string[] }                             + height grip + pane row + PiP
  }
}
```

### Component architecture (modeled on TanStack Devtools)

We mirror the TanStack Devtools architecture: a generic **shell** owns all the
chrome (trigger, layout container, resize, PiP, settings, persistence) and hosts
content as **panels** mounted into it. The chat is just one panel. This is what
makes everything reusable: the shell knows nothing about chat, and any future
panel mounts into the same chrome.

One adaptation: Devtools' shell is a `TanStackDevtoolsCore` class. Per the repo
rule (functions, not classes), ours is a `createWidgetShell()` factory returning
a closure (`mount` / `unmount` / `registerPanel`). Same architecture, no class.

```
Shell core — createWidgetShell()            (analogue of TanStackDevtoolsCore)
  mount(rootEl) / unmount() / registerPanel(panel)
  owns: trigger button (position + drag), layout mode (modal | quick-terminal),
        resizable panel, PiP, pane/tab management, settings + localStorage.
  Renders chrome and panel containers. No chat knowledge.

Shell features — headless primitives the shell composes (individually reusable)
  createDraggablePosition()  6-preset placement + drag → snap-to-nearest + persist
  createResizable()          edge drag → height + collapse threshold + persist
  createPiP()                pop ANY subtree into a separate window
  createDropSheet()          open/close + slide-from-top state machine

Panels — the "plugins" (content, layout-agnostic)
  type Panel = { id: string; title: string; render: (container) => void }
  ChatPanel                  one useChat + log + composer + parts + genui/test cards
                             the default (and, today, only) registered panel.
  A modal body, a quick-terminal pane, and a PiP body each render a Panel.

Entry — mount.tsx
  const shell = createWidgetShell(resolveWidget())
  shell.registerPanel(ChatPanel(apiBase))
  shell.mount(shadowRoot)
```

Why this holds up:

- The shell hosts panels; a non-chat panel registers the same way (Devtools' plugin model).
- `createPiP` / `createResizable` / `createDraggablePosition` carry no chat knowledge.
- Quick-terminal panes are just multiple panel instances in a row; the modal is one.
- The ported Devtools logic lives behind shell primitives, not in the chat UI.
- Each primitive owns its own localStorage key, so persistence is local to it.

### Config seam (reuses the existing meta-tag rail)

`apiBase` already flows plugin → `htmlTags()` → `<meta>` → `mount.tsx`. The widget
config rides the same rail as one JSON blob (nesting + arrays survive cleanly).

`packages/protocol/src/config-types.ts`

```ts
export type TriggerPosition = 'top-left' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-right'

export interface ModalConfig {
  /** Initial trigger position. Draggable at runtime; snaps + persists. Default 'bottom-right'. */
  position?: TriggerPosition
}

export interface QuickTerminalConfig {
  /** Hotkey(s) to toggle the quick terminal. One binding or many. Default 'Mod+`'. */
  hotkey?: string | string[]
}

export interface WidgetConfig {
  /** Bottom-right corner modal. On by default; set false to disable, object configures it. */
  modal?: boolean | ModalConfig
  /** Top drop-down quick terminal. On by default; set false to disable, object configures the hotkey(s). */
  quickTerminal?: boolean | QuickTerminalConfig
}

export interface MandaraxConfig {
  // ...existing fields...
  widget?: WidgetConfig
}
```

Host examples:

```ts
mandarax() // both on (defaults)
mandarax({widget: {modal: {position: 'top-left'}}}) // both on, move the button
mandarax({widget: {quickTerminal: false}}) // modal only
mandarax({widget: {modal: false, quickTerminal: {hotkey: ['Mod+`', 'Control+k']}}}) // qt only, custom keys
```

`packages/core/src/widget-tags.ts`

```ts
// One JSON blob; the widget normalizes booleans/objects + applies defaults.
{ tag: 'meta', attrs: { name: 'pw-widget', content: JSON.stringify(opts.widget ?? {}) }, injectTo: 'head' }
```

`packages/widget/src/mount.tsx`

```ts
type WidgetSettings = {
  modal: {enabled: boolean; position: TriggerPosition}
  quickTerminal: {enabled: boolean; hotkeys: string[]}
}

function resolveWidget(): WidgetSettings {
  let raw: any = {}
  try {
    raw = JSON.parse(metaContent('pw-widget') || '{}')
  } catch {
    raw = {}
  }
  const m = raw.modal,
    qt = raw.quickTerminal
  const hk = (qt && typeof qt === 'object' && qt.hotkey) || ['Mod+`']
  return {
    // both layouts default ON unless explicitly disabled with `false`
    modal: {enabled: m !== false, position: (m && typeof m === 'object' && m.position) || 'bottom-right'},
    quickTerminal: {enabled: qt !== false, hotkeys: Array.isArray(hk) ? hk : [String(hk)]},
  }
}
```

### Hotkey binding (`@tanstack/solid-hotkeys`)

```tsx
import {createHotkey} from '@tanstack/solid-hotkeys'

// One registration per configured binding. Reactive + auto-disposed by Solid.
for (const binding of props.hotkeys) {
  createHotkey(
    binding,
    () => toggleQuickTerminal(),
    () => ({enabled: true}),
  )
}
```

`Mod` resolves to Cmd on mac, Ctrl elsewhere. Combos + sequences native. `ignoreInputs`
guards typing in host inputs where relevant.

### FAB position + drag (ported from TanStack Devtools, MIT)

Source of truth: `TanStack/devtools` `trigger.tsx` + `use-styles.ts` `mainCloseBtnPosition`.

- Six presets placed by fixed offsets; the middle row uses `translateY(-50%)`:

```ts
const PLACEMENT: Record<TriggerPosition, string> = {
  'top-left': 'top: var(--pw-edge); left: var(--pw-edge);',
  'top-right': 'top: var(--pw-edge); right: var(--pw-edge);',
  'middle-left': 'top: 50%; left: var(--pw-edge); transform: translateY(-50%);',
  'middle-right': 'top: 50%; right: var(--pw-edge); transform: translateY(-50%);',
  'bottom-left': 'bottom: var(--pw-edge); left: var(--pw-edge);',
  'bottom-right': 'bottom: var(--pw-edge); right: var(--pw-edge);',
}
```

- Drag (our addition on top of the enum): pointerdown on the FAB tracks the
  pointer; on pointerup, snap to the nearest preset by comparing the FAB centre
  against the 6 anchor points; write the chosen preset to localStorage
  (`mandarax-fab-position`). This is the superset the user asked for. Devtools itself
  only sets position by enum, so the snap-on-drop is mandarax-specific but built on
  their preset model.

### Modal panel resize (ported from TanStack Devtools, MIT)

Source: `devtools.tsx` `handleDragStart`. Port verbatim, adapted to our panel:

```ts
// mousedown on the panel's resize edge → track pageY delta → set height.
const handleDragStart = (panelEl, startEvent) => {
  if (startEvent.button !== 0 || !panelEl) return
  setIsResizing(true)
  const info = {originalHeight: panelEl.getBoundingClientRect().height, pageY: startEvent.pageY}
  const run = (e) => {
    const delta = info.pageY - e.pageY // corner panel grows upward
    const next = info.originalHeight + delta
    setHeight(next)
    setOpen(next >= 70) // collapse under threshold, like Devtools
  }
  const unsub = () => {
    setIsResizing(false)
    document.removeEventListener('mousemove', run)
    document.removeEventListener('mouseup', unsub)
  }
  document.addEventListener('mousemove', run)
  document.addEventListener('mouseup', unsub)
}
```

Persist the panel height to localStorage (`mandarax-modal-height`).

### Picture-in-Picture (ported from TanStack Devtools, MIT)

Source: `context/pip-context.tsx`. Port the provider near-verbatim:

- `requestPipWindow(settings)`: `window.open('', 'mandarax-widget', '${settings},popup')`;
  clear the PiP doc head + body; copy every `document.styleSheets` entry into the
  PiP head (inline cssText, with a `<link>` fallback for cross-origin sheets);
  `delegateEvents([...], pip.document)` so Solid delegation works inside PiP.
- Observe our injected style node for mutations and mirror them into the PiP doc
  (Devtools watches `#_goober`; we watch our shadow style node).
- Sync close on `pagehide` / `beforeunload`; track `pip_open` in localStorage.
- The widget renders its tree into the PiP window's body when active, and back
  into the shadow root when closed.

A PiP button sits in both the modal header and the quick-terminal header.

### Pane model (quick terminal)

```ts
// v1 stores a flat ordered list; the type is tree-ready for later nesting.
type Pane = {id: string; sessionId: string} // each pane owns one useChat instance
type Layout = {panes: Pane[]; focusedId: string} // v1: row of panes
```

- Split (⊞ button or `Mod+D`) appends a fresh pane and focuses it.
- Focus follows pointer-down / composer focus; the focused pane shows the accent
  top line, others recede.
- Gutters set explicit flex-basis on the left neighbour during drag.
- On close: remove the pane + its adjacent gutter, then clear every survivor's
  inline flex so they redistribute (a lone pane returns to full width).
- Closing the last pane closes the terminal.

### Open / close behavior

- Hotkey toggles the drop sheet.
- Opening the quick terminal closes the modal panel if open, and vice versa. One
  layer is visible at a time (even when both are enabled).
- Close via hotkey, `Escape`, or the header close button. No click-away (no scrim).
- Persisted to localStorage: quick-terminal height (`mandarax-qt-height`), modal
  panel height (`mandarax-modal-height`), FAB position (`mandarax-fab-position`).

## Commands

```bash
turbo build              # build all packages (per repo convention, not manual dist)
turbo lint
turbo test               # unit + integration
open packages/widget/mockups/quick-terminal.html   # quick-terminal visual reference
```

## Project structure (files touched)

```
packages/protocol/src/config-types.ts      # + WidgetConfig, ModalConfig, QuickTerminalConfig, TriggerPosition
packages/core/src/widget-tags.ts            # + pw-widget meta (JSON blob)
packages/plugin/src/core/vite.ts            # pass widget config into htmlTags()
packages/widget/src/mount.tsx               # create shell, register ChatPanel, apply settings
packages/widget/src/widget-shell.tsx        # NEW: createWidgetShell() — chrome, layout modes, panel host
packages/widget/src/chat-panel.tsx          # NEW: ChatPanel — chat content extracted from chat-shell.tsx
packages/widget/src/quick-terminal.tsx      # NEW: quick-terminal layout (drop sheet + pane row + gutters)
packages/widget/src/trigger.tsx             # NEW: positioned, draggable trigger button
packages/widget/src/draggable-position.ts   # NEW: createDraggablePosition() primitive
packages/widget/src/drop-sheet.ts           # NEW: createDropSheet() primitive
packages/widget/src/pip.tsx                 # NEW: createPiP() (adapted from TanStack Devtools, MIT)
packages/widget/src/resize.ts               # NEW: createResizable() (adapted from TanStack Devtools, MIT)
packages/widget/src/chat-shell.tsx          # slimmed: chat internals move to chat-panel.tsx
packages/widget/src/styles.css              # + .pw-qt-* / position / resize styles
packages/widget/package.json                # + @tanstack/solid-hotkeys

apps/site/content/docs/usage/quick-terminal.mdx   # NEW: docs page (fumadocs)
apps/site/content/docs/usage/meta.json            # + "quick-terminal" in pages
apps/site/content/docs/configuration.mdx          # + widget.modal / widget.quickTerminal rows
apps/site/public/screenshots/quick-terminal.png         # NEW screenshot
apps/site/public/screenshots/quick-terminal-split.png   # NEW screenshot (panes)
apps/site/public/screenshots/fab-positions.png          # NEW screenshot (position presets)
```

Files adapted from TanStack Devtools carry a one-line credit comment (MIT).

## Documentation deliverable

Ships on the fumadocs site at `apps/site/content/docs/`.

- New page `usage/quick-terminal.mdx`, added to `usage/meta.json` `pages` after
  `chat`. Covers enabling layouts, hotkey config (single / multiple / combos),
  open / close, resize, splitting panes, and PiP.
- New / updated config rows for `widget.modal` (with `position`) and
  `widget.quickTerminal` (with `hotkey`) in `configuration.mdx`.
- Screenshots captured from the real widget into `apps/site/public/screenshots/`,
  shown with `<ImageZoom>` like the existing usage pages.
- Writing style: no em dashes, concise, example-first, fumadocs-ui components.

## Code style

- Functions, not classes. No IIFEs.
- All colors / radii / motion flow from the existing `--pw-*` tokens. New
  selectors use the `pw-qt-` / `pw-fab-` prefix. Change a token, not a literal.
- Single-line comments only.
- Match the existing SolidJS idiom in `chat-shell.tsx` (signals, `Show`, `For`).
- Code adapted from TanStack Devtools: one-line credit comment (MIT); adapt
  names to our tokens but do not silently rewrite the algorithm.

## Testing strategy

- No jsdom. UI verified in a real browser via Playwright.
- Unit: `resolveWidget` meta normalization (boolean vs object, missing, malformed
  → defaults); `htmlTags()` emits the `pw-widget` meta with correct JSON.
- Integration (Playwright, against the dev-server widget):
  - Hotkey toggles the sheet open / closed.
  - Opening the quick terminal closes an open modal panel.
  - Split adds a pane; both panes accept independent input.
  - Closing one pane grows the survivor back to full width; closing the last
    closes the terminal.
  - Quick-terminal height drag persists across a reopen.
  - FAB drag snaps to the nearest preset and persists.
  - Modal panel resize-drag changes height and collapses under threshold.
  - PiP opens a separate window with styles applied; closing it re-docks.
- The mockup is the visual acceptance reference for motion and spacing.

## Boundaries

Always:

- One chat implementation. Extract the chat UI + `useChat` logic into `ChatPanel`
  once; the modal body, every quick-terminal pane, and the PiP body render that
  same component. Never copy or fork the chat code per layout. Extraction is a
  prerequisite task and must be behavior-preserving (verified before any layout
  work begins).
- Keep modal behavior unchanged when only `modal` is enabled with defaults.
- Default to modal-on / quick-terminal-off / `bottom-right` / `Mod+\`` when config
  omits fields (backward compatible).
- Drive visuals from `--pw-*` tokens.
- Keep the one-line MIT credit on code adapted from TanStack Devtools.

Ask first:

- Before adding any dependency beyond `@tanstack/solid-hotkeys`.
- Before expanding split scope to nested row + column.
- Before persisting pane layout / sessions across reloads.

Never:

- Add jsdom or happy-dom.
- Introduce a page-dimming backdrop for the quick terminal.
- Hardcode the hotkey or FAB position in the widget (config-driven, with defaults).

## Acceptance criteria

1. `mandarax()` (no widget config) enables BOTH layouts: modal FAB bottom-right and
   the quick terminal on `Mod+\``.
2. `mandarax({ widget: { quickTerminal: { hotkey: ['Mod+`', 'Control+k'] } } })`toggles the sheet on either binding;`quickTerminal: false` disables it.
3. `mandarax({ widget: { modal: { position: 'top-left' } } })` starts the FAB top-left;
   dragging it snaps to the nearest preset and the choice persists; `modal: false`
   disables the corner modal.
4. Each layout can be disabled independently with `false`, leaving the other.
5. Quick-terminal height is draggable and survives a reopen.
6. The terminal splits into a row of independent-session panes; gutters resize
   them; closing a pane reflows survivors; closing the last closes the sheet.
7. Modal panel resizes by edge drag and collapses under threshold (Devtools port).
8. PiP pops either layout into a separate OS window with styles applied, and
   re-docks on close.
9. No jsdom; Playwright integration tests cover the above.
10. A `usage/quick-terminal.mdx` docs page ships with real-widget screenshots,
    is linked in the usage nav, and `configuration.mdx` documents the widget config.

```

```
