# React Grab Element Picker — Composer Integration Plan (v2, rewritten for the post-quick-terminal widget)

> **For workers:** Implement **inline** (no subagents — project convention). Steps use checkbox (`- [ ]`) syntax. Build/typecheck/lint via **turbo** (`pnpm turbo run … --filter=@aidx/widget`), never manual dist rebuilds. Test UI in a real browser (Playwright), never jsdom.

> **Why v2:** The original plan (same filename, committed in `91d5fde`) targeted `packages/widget/src/chat-shell.tsx`, which has since been **deleted** and replaced by the quick-terminal refactor. The composer now lives in `ChatPanel` (`chat-panel.tsx`), the shell hosts panels via a registry (`widget-shell.tsx`), and `ChatPanel` is **multi-instance** (modal, each quick-terminal pane, PiP). The original implementation was prototyped in a now-deleted worktree and never committed, so **no code survives** — only this plan. This rewrite preserves the original's full feature set and re-maps it onto the current architecture, and makes the composer's extension model first-class.

---

## Goal

Add an extensible **actions row** to the widget's chat composer. The first action is **Select element**: clicking it lets the user point at any DOM node in the host page (react-grab's hover highlight + selection box), and the selected element's context is **inserted into the composer input** of the panel that started the pick, for the user to edit before sending. react-grab's full feature set comes along: the right-click **context menu** (Copy · Style · Comment · Open), live **style editing**, **comment** prompt mode, **open-in-editor** — because we integrate react-grab itself rather than reimplement it.

## Two extension layers (the part to get right)

The user wants the composer "extensible with a plugin arch like react-grab." There are **two distinct, complementary layers** — keep them separate:

1. **Composer actions** (buttons in the row next to the textarea) — an **aidx shell registry**, `registerComposerAction(def)`, modeled exactly on the existing `registerPanel(def)` in `widget-shell.tsx`. This is *our* UI surface. The element-picker is composer-action #1. Host apps and future features add buttons the same way panels are registered.
2. **react-grab context-menu actions** (Copy/Style/Comment/Open + custom) — react-grab's **own plugin system**, reached via `window.__AIDX__.registerPlugin` bound to our headless instance. This is react-grab's page overlay, not our chat UI.

These do not merge: composer buttons are not react-grab's model (it owns the page overlay/context-menu, not the chat composer), and react-grab plugins can't render into our Solid composer. Each layer extends its own surface.

## Architecture

- Integrate `react-grab` as the selection/edit/context-menu **engine**; drive it from the aidx composer. react-grab renders its overlay in the **light DOM** (its normal mode); we **hide its own toolbar** (`theme.toolbar.enabled:false`) and trigger it from the composer via its API (`api.activate()` for selection, `api.comment()` for prompt mode).
- Every grab flow — plain select, Comment, Style-edit — converges on react-grab's internal `runCopyFlow`, so a **single hook (`transformCopyContent`)** captures the final content string.
- **Multi-instance routing (new vs v1):** there is exactly **one** react-grab instance per page (it owns a single light-DOM overlay), but there are **N composers** (`ChatPanel` is created by the modal, by each quick-terminal pane, and by PiP). The grabbed content must land in the composer that *started* the pick. We solve this with a **per-activation sink**: the adapter is a page-lifetime singleton, but `activate(onGrab)` rebinds the current sink immediately before entering selection mode. Because react-grab selection is modal (one pick at a time, auto-deactivates on click), there is no sink race. The invoking `ChatPanel` passes its own `insert` as the sink, so content routes back to the right textarea.
- The widget's shadow-DOM chat UI and react-grab's light-DOM overlay coexist in the same document (no z-index conflict observed in the spike). The aidx FAB stays the only visible launcher.

## Tech Stack

TypeScript, `react-grab@^0.1.44` (widget dep; bundles `bippy`, already a widget dep), Solid widget in an open Shadow DOM, Vite lib build (ES + IIFE), `lucide-solid` for icons (the composer now uses `ArrowRight`/`Square`; the picker uses `Crosshair`), vitest + Playwright (example e2e). `react` is react-grab's *optional* peer — on non-React hosts selection still works; source-mapping/edit degrade gracefully.

## Spike findings (2026-06-14, against `apps/examples/tanstack-start`, React 19 + Vite — still valid, react-grab API unchanged)

1. **Headless init works:** set `window.__REACT_GRAB_DISABLED__ = true` to suppress auto-init, then `init({telemetry:false})` and `registerPlugin(...)`. Toolbar hidden via `theme:{toolbar:{enabled:false}}` — no react-grab FAB/toolbar in the DOM.
2. **Driven by API:** `api.activate()` enters selection; hovering shows the highlight box; a left-click grabs one element then auto-deactivates (toggle mode). `onElementSelect` fired.
3. **Single interception point:** both `transformCopyContent` and `onCopySuccess` fired with the **final content** on a plain grab. Source confirms **Comment** and **Style-edit** also route through `runCopyFlow` (`core/edit-mode.ts` `submit() → performCopyWithLabel → runCopyFlow`, passing the formatted CSS prompt as `extraPrompt`). One hook captures all three flows.
4. **Context menu renders** anchored to the element: **Copy ⌘C · Style S · Comment ↵ · Open O**.
5. **Source/component context resolves on Vite/TanStack:** captured `in Header / in RootDocument (at /src/routes/__root.tsx) / in MatchView (@tanstack/react-router)`.

## Build behavior (verified 2026-06-14 in the original spike; re-verify in Task 5)

`pnpm turbo run build --filter=@aidx/widget` succeeded for **both** formats with no Rollup error:
- **ESM (`dist/mount.js`)**: react-grab is **code-split** into lazy chunks — true byte-laziness on this path.
- **IIFE (`dist/aidx-widget.global.js`, the injected global)**: cannot code-split, so react-grab is **inlined** — but execution is still deferred to first click (the import resolves an already-present module). Behavioral laziness + dev-only gating hold; only byte-laziness is lost. Acceptable: the widget is dev-only and already bundles `bippy`, `shiki`, `marked`. **No CDN/script-injection fallback required.**

## Decisions (locked with user)

- **Integrate react-grab** (not reimplement, not fork). Light-DOM overlay, aidx FAB drives it.
- **Composer extensibility = shell registry** (`registerComposerAction`), mirroring `registerPanel`. react-grab plugins are a separate layer for context-menu actions.
- **Auto-insert on select**, into the composer of the panel that started the pick, for the user to edit before sending. Keep react-grab's Copy/Style/Comment/Open as-is. (A plain grab both writes the clipboard — react-grab default — *and* inserts into the composer via our hook. The clipboard write is a harmless side effect.)
- **Want all react-grab plugins:** Copy, Style-edit, Comment, Open all come along for free via the integrated context menu.
- **Dev-only, lazy on first use.** The widget already mounts only when the aidx dev routes answer. We `import('react-grab')` lazily on first **Select element** click; this also lets us set `__REACT_GRAB_DISABLED__` *before* the module evaluates.

## Shippable milestone

Tasks 0–5 deliver the headline (Select element → insert into the right composer, full context menu, style edits) through an extensible registry. Task 6 is the e2e proof. Task 7 documents both extension layers.

---

### Task 0: Add react-grab to the widget

**Files:** `packages/widget/package.json` (+ `pnpm-lock.yaml`).

- [ ] **Step 1:** `pnpm -C packages/widget add react-grab` → `dependencies` gains `react-grab ^0.1.44`. (Was done in the deleted worktree; redo — it is **not** in the current `package.json`.)
- [ ] **Step 2:** `pnpm turbo run typecheck --filter=@aidx/widget` → PASS (confirms resolution; no usage yet).
- [ ] **Step 3:** Commit: `build: add react-grab to @aidx/widget for the element picker`.

---

### Task 1: react-grab adapter module (singleton + per-activation sink)

**Files:** Create `packages/widget/src/react-grab/adapter.ts`.

A lazy, single-instance adapter that initializes react-grab headless and exposes control methods. The grab **sink** is rebound on each `activate(onGrab)` so content routes to the composer that started the pick.

```ts
// Lazy, dev-only integration of react-grab as the element-selection engine. Auto-init and the
// react-grab toolbar are disabled; we drive it from the composer. Every grab (select/comment/
// style-edit) converges on runCopyFlow, so transformCopyContent is the one hook that routes the
// final content into whichever composer started the current pick. Dynamic import (not static) so
// we can set the disable flag before the module evaluates, and to defer init to first use.

export type ReactGrabAdapter = {
  activate: (onGrab: (content: string) => void) => void  // bind sink, then enter selection mode
  comment: (onGrab: (content: string) => void) => void   // bind sink, then enter prompt mode
  deactivate: () => void
  isActive: () => boolean
}

let adapterPromise: Promise<ReactGrabAdapter> | null = null

export function getReactGrabAdapter(): Promise<ReactGrabAdapter> {
  if (!adapterPromise) adapterPromise = create()
  return adapterPromise
}

async function create(): Promise<ReactGrabAdapter> {
  ;(window as unknown as {__REACT_GRAB_DISABLED__?: boolean}).__REACT_GRAB_DISABLED__ = true
  const rg = await import('react-grab')
  const api = rg.init({telemetry: false})
  // The current pick's destination. react-grab selection is modal (one pick at a time), so a single
  // mutable sink is race-free; activate()/comment() set it immediately before entering selection.
  let sink: ((content: string) => void) | null = null
  api.registerPlugin({
    name: 'aidx',
    theme: {toolbar: {enabled: false}},
    hooks: {
      // Captures plain-select, Comment, and Style-edit content alike.
      transformCopyContent: (content: string) => {
        sink?.(content)
        return content
      },
    },
  })
  // Host-app extensibility (Task 7): register react-grab context-menu/toolbar actions + hooks
  // against OUR instance. A literal `export {registerPlugin} from 'react-grab'` would NOT work.
  ;(window as unknown as {__AIDX__?: unknown}).__AIDX__ = {
    registerPlugin: api.registerPlugin,
    unregisterPlugin: api.unregisterPlugin,
  }
  return {
    activate: (onGrab) => {
      sink = onGrab
      api.activate()
    },
    comment: (onGrab) => {
      sink = onGrab
      api.comment()
    },
    deactivate: () => api.deactivate(),
    isActive: () => api.isActive(),
  }
}
```

- [ ] **Step 1:** Write the module above.
- [ ] **Step 2:** `pnpm turbo run typecheck --filter=@aidx/widget` → PASS. If `init`/`registerPlugin`/hook types mismatch, reconcile against react-grab's shipped `.d.ts` (`Options.telemetry`, `Plugin.theme`, `PluginHooks.transformCopyContent` all existed per the spike).

---

### Task 2: Composer action registry (the extensibility primitive)

**Files:** `packages/widget/src/widget-shell.tsx`, `packages/widget/src/chat-panel.tsx`.

Add a registry on the shell that mirrors `registerPanel`, and thread the registered actions down to every `ChatPanel` through the existing `PanelContext`.

- [ ] **Step 1:** In `widget-shell.tsx`, define the action types and a per-invocation context:
  ```ts
  import type {Component} from 'solid-js'

  // A handle to the live composer a button was clicked in, so output routes to the right
  // composer even with multiple mounted. This is a CAPABILITY BAG, not a text-only API: the
  // composer owns all draft state (text today; attachments once chat-image-input lands), so
  // future actions like "add attachment" extend the bag rather than reshaping the registry.
  export type ComposerActionContext = {
    insert: (text: string) => void  // append text to this composer's input + focus it
    setBusy: (busy: boolean) => void
    // FUTURE (chat-image-input plan): addAttachment: (file: File | Blob) => void
    // An "Add attachment" action would call ctx.addAttachment(file) from a file/clipboard picker;
    // the composer holds the pending attachments and sends them with the next message. The
    // element-picker uses ctx.insert; the attachment button would use ctx.addAttachment — same
    // registry, same per-invocation context, different capability. Do not collapse the context to
    // `insert` only.
  }
  export type ComposerActionDef = {
    id: string
    label: string                   // aria-label / tooltip
    icon: Component<{class?: string}>
    onClick: (ctx: ComposerActionContext) => void | Promise<void>
  }
  ```
- [ ] **Step 2:** Extend `PanelContext` with the registered actions, and have `createWidgetShell` collect + expose them:
  ```ts
  export type PanelContext = {
    active: () => boolean
    onWorkingChange: (working: boolean) => void
    composerActions: () => ComposerActionDef[]   // NEW
  }
  ```
  In `createWidgetShell`: keep a `composerActions: ComposerActionDef[]`, return `registerComposerAction(def)` alongside `registerPanel`, and pass `composerActions: () => composerActions` into the `PanelContext` that `Shell` builds for `panel.create(ctx)`. The `Shell` component already forwards `ctx` from both `ModalLayout` and `QuickTerminalLayout` — extend the `PanelContext` they construct (`{active, onWorkingChange}` → add `composerActions`).
- [ ] **Step 3:** `pnpm turbo run typecheck --filter=@aidx/widget` → PASS (registry compiles, not yet rendered).

**Design notes:**
- The registry lives on the shell (page-lifetime), the actions render inside each `ChatPanel`. `onClick` gets a *fresh* `ComposerActionContext` bound to the panel instance that was clicked — this is what makes multi-instance routing correct without any global "active composer" state.
- This is the analogue of `registerPanel` — same factory-closure pattern, no classes (project convention).
- **Future-fit (known next button: "Add attachment").** The context is a capability bag, not a text-only API, precisely so the next planned action fits without reshaping the registry. "Add attachment" is its own action def (`{id:'add-attachment', icon: Paperclip, onClick}`) whose `onClick` opens a file/clipboard picker and calls `ctx.addAttachment(file)`. That capability arrives with the **`2026-06-14-chat-image-input.md`** plan (which adds drag-drop / paste / upload + multimodal send to the composer); this picker plan only needs `ctx.insert`. When the two land together, the composer exposes both `insert` and `addAttachment` on the same context — the actions row simply gains a second button. Sequencing: either plan can land first; if chat-image-input lands first, add `addAttachment` to the context then; if this one lands first, leave the `FUTURE` comment as the contract.

---

### Task 3: Element-picker action + ChatPanel actions row + insert wiring

**Files:** `packages/widget/src/chat-panel.tsx`, and registration at the call site that builds the shell (where `registerPanel(chatPanelDef(...))` is called — likely `mount.tsx`).

- [ ] **Step 1:** In `chat-panel.tsx`, add an `insert` helper bound to this panel's input signal (append, grow, focus):
  ```ts
  // Append grabbed/inserted text into this composer for the user to edit, then send.
  const insert = (text: string) => {
    setInput((prev) => (prev ? `${prev}\n${text}` : text))
    requestAnimationFrame(() => {
      if (inputEl) {
        autoGrow(inputEl)
        inputEl.focus()
      }
    })
  }
  ```
- [ ] **Step 2:** Render the actions row from `props` (passed via `chatPanelDef`/`PanelContext.composerActions`). Add a per-action busy signal keyed by id, and build the `ComposerActionContext` on click:
  ```tsx
  const [busy, setBusy] = createSignal<string | null>(null)
  const runAction = (a: ComposerActionDef) => {
    void Promise.resolve(
      a.onClick({insert, setBusy: (b) => setBusy(b ? a.id : null)}),
    )
  }
  ```
  Markup (see Task 4 for the layout — actions row beneath the textarea):
  ```tsx
  <div class="pw-chat-actions">
    <For each={props.composerActions()}>
      {(a) => {
        const Icon = a.icon
        return (
          <button
            type="button"
            class="pw-chat-act"
            aria-label={a.label}
            title={a.label}
            classList={{'pw-chat-act-busy': busy() === a.id}}
            onClick={() => runAction(a)}
          >
            <Icon class="pw-icon" />
          </button>
        )
      }}
    </For>
  </div>
  ```
- [ ] **Step 3:** Thread `composerActions` into `ChatPanel`. Update `chatPanelDef` and the `ChatPanel` props so `create: (ctx) => <ChatPanel … composerActions={ctx.composerActions} />`.
- [ ] **Step 4:** Define the element-picker action and register it. Put the action factory next to the adapter (e.g. `react-grab/picker-action.ts`) so the picker is self-contained:
  ```ts
  import {Crosshair} from 'lucide-solid'
  import {getReactGrabAdapter} from './adapter.js'
  import type {ComposerActionDef} from '../widget-shell.js'

  export const elementPickerAction: ComposerActionDef = {
    id: 'pick-element',
    label: 'Select an element from the page',
    icon: Crosshair,
    onClick: async (ctx) => {
      ctx.setBusy(true)
      try {
        const adapter = await getReactGrabAdapter()
        adapter.activate(ctx.insert)   // sink = THIS composer's insert
      } finally {
        ctx.setBusy(false)
      }
    },
  }
  ```
  At the shell build site (where `registerPanel` is called): `shell.registerComposerAction(elementPickerAction)`.
- [ ] **Step 5:** `pnpm turbo run typecheck --filter=@aidx/widget` → PASS.

**Design notes:**
- No `onCleanup`-dispose: the adapter is a page-lifetime singleton (react-grab owns one overlay). Re-activating just calls `activate()` again with a fresh sink.
- The picker inserts a reference the user edits in the composer — same outcome as react-grab's prompt mode, in our own input. `comment()` stays available for a future second action; not surfaced in v1.

---

### Task 4: Styles — composer actions row + ghost buttons

**Files:** `packages/widget/src/styles.css`.

The current composer (line ~1058) is a single flex row `[textarea(flex:1)][send]` with `align-items:flex-end`. Restructure to a **column**: textarea on top, an actions row beneath holding `[…action buttons] [spacer] [send]`. This is the extensible shape (the row grows with registered actions).

- [ ] **Step 1:** Change `.pw-chat-composer` to `flex-direction: column; align-items: stretch;` and wrap the textarea + a new `.pw-chat-actions` row. The `<form>` becomes `[textarea][.pw-chat-actions]`; move the existing send/stop button into `.pw-chat-actions` (right-aligned via a spacer or `margin-left:auto` on send).
- [ ] **Step 2:** Add the actions row + ghost-button styles using existing `--pw-*` tokens:
  ```css
  .pw-chat-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .pw-chat-send { margin-left: auto; }   /* push send to the right of the action buttons */
  .pw-chat-act {
    width: 38px; height: 38px; border-radius: 999px;
    border: 1px solid var(--pw-line); background: var(--pw-fill-soft);
    color: var(--pw-text-2); cursor: pointer; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    transition: color 120ms var(--pw-ease), border-color 120ms var(--pw-ease), background-color 120ms var(--pw-ease);
  }
  .pw-chat-act:hover { color: var(--pw-text-hi); border-color: var(--pw-line-2); }
  .pw-chat-act-busy { opacity: 0.6; cursor: progress; }
  ```
- [ ] **Step 3:** Verify token names exist in `styles.css` (`--pw-fill-soft`, `--pw-text-2`, `--pw-text-hi`, `--pw-line-2`); if any differ, use the closest existing token (do not invent tokens).
- [ ] **Step 4:** Visually confirm in a real browser that `[textarea]` over `[act … | send]` lays out in modal, quick-terminal pane, and PiP.

---

### Task 5: Build + verify the IIFE dynamic-import

**Files:** none (build only).

- [ ] **Step 1:** `pnpm turbo run build --filter=@aidx/widget`.
  - Expected: builds `dist/mount.js` (ES, react-grab code-split) and `dist/aidx-widget.global.js` (IIFE, react-grab inlined). A Rollup **warning** about inlining the dynamic import in the IIFE output is acceptable.
  - If the IIFE build **errors** on the dynamic import: decide with evidence from the actual error (split the picker into the ES entry only, or runtime `<script>` injection of react-grab's own global). Per the spike this did **not** error.
- [ ] **Step 2:** `pnpm turbo run lint --filter=@aidx/widget` → PASS (oxlint).
- [ ] **Step 3:** Commit: `feat(widget): add an extensible composer actions row with a react-grab element picker`.

---

### Task 6: End-to-end proof (Playwright, no jsdom)

**Files:** Create `packages/widget/test/element-picker.it.test.ts` (match the existing widget IT convention; use `browser.newPage()`, **not** `newContext()` — contexts leak).

- [ ] **Step 1:** Start the example app with the built widget injected (mirror the existing widget IT harness).
- [ ] **Step 2:** Drive in a real browser:
  - Open the widget panel (✦ FAB), click **Select element** in the composer actions row.
  - Assert react-grab's toolbar is **not** present; assert the hover highlight appears on `pointermove`.
  - Click a source-mapped element (e.g. a Header link); assert this panel's textarea now contains the reference (`in Header` / selector).
  - Right-click an element while active; assert the context menu shows **Copy / Style / Comment / Open**.
- [ ] **Step 3 (multi-instance):** Open a quick-terminal pane, run the pick from *that* pane's composer; assert the reference lands in the **pane's** textarea, not the modal's. This guards the per-activation sink.
- [ ] **Step 4:** `pnpm turbo run test --filter=@aidx/widget` → PASS.

---

### Task 7: Document both extension layers

**Files:** widget README (or `apps/site` docs if that is where widget extension is documented — match existing convention).

- [ ] **Step 1:** Document **composer actions** (our registry): `shell.registerComposerAction({id, label, icon, onClick})`, and that `onClick` receives `{insert, setBusy}` bound to the live composer. Example: a custom "Insert selector" button.
- [ ] **Step 2:** Document **react-grab context-menu plugins** via `window.__AIDX__.registerPlugin(...)`, including the timing caveat (only live after the adapter initializes — i.e. after the first **Select element** click) and **why a literal re-export does not work**:
  1. The widget bundles its own copy of react-grab inside the IIFE — a host's `import {registerPlugin} from 'react-grab'` is a *different module instance*.
  2. react-grab's top-level `registerPlugin` coordinates via `window.__REACT_GRAB__`, published only by react-grab's **auto-init** — which we disable and replace with our own `init()` that does not set that global.

  So we bind an aidx-branded API to *our* instance instead:
  ```js
  // host app, dev only — after the widget has initialized react-grab (first picker use):
  window.__AIDX__?.registerPlugin({
    name: 'my-action',
    actions: [{id: 'inspect', label: 'Inspect', onAction: (ctx) => console.dir(ctx.element)}],
  })
  ```
- [ ] **Step 3 (optional):** If we want react-grab's *own* `registerPlugin` to also resolve, publish our instance with `window.__REACT_GRAB__ = api` right after `init()`. Trade-off: re-introduces the react-grab-branded global. Default: **do not** — keep only `window.__AIDX__`.

---

## Open considerations (not blockers)

- **PiP cross-document:** when the chat is popped out to Picture-in-Picture (`pip.ts`), the composer lives in a **separate document**, while react-grab's overlay runs on the **main page**. A pick started from the PiP window would highlight the main page, and the grabbed text routes back into the PiP composer via the sink (works — the sink is a JS closure, document-agnostic), but the *highlight* the user sees is on the parent window, not the PiP. Acceptable for v1; if confusing, hide the picker action when rendered inside PiP (the action context could carry a `surface` hint). Decide after seeing it in Task 6.
- **Clipboard side effect:** a plain grab still writes the clipboard (react-grab default). Accepted per "keep Copy". Override `getContent` later if undesired.
- **Non-React hosts:** selection + selector reference work; source-mapping and Style-edit degrade (react-grab handles the fallback). aidx stays framework-agnostic.
- **Two overlay systems:** react-grab (light DOM) + aidx widget (shadow DOM) coexist; only the aidx FAB is a visible launcher. No z-index conflict observed in the spike.
- **Bundle size:** react-grab added to the dev-only widget global; `bippy` is shared (already a widget dep), so the incremental is react-grab's own minified code.
