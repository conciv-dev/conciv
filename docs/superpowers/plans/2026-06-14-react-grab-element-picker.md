# React Grab Element Picker — Composer Integration Plan

> **For workers:** Implement **inline** (no subagents — project convention). Steps use checkbox (`- [ ]`) syntax for tracking. Build/typecheck via **turbo** (`pnpm turbo run …`), never manual dist rebuilds.

**Goal:** Add an element-selection action to the widget's chat composer. Clicking **Select element** lets the user point at any DOM node in the host page (react-grab's hover highlight + selection box), and the selected element's context is **inserted into the composer input** for the user to edit before sending. The full react-grab feature set comes along: the right-click **context menu** (Copy · Style · Comment · Open), live **style editing**, **comment** prompt mode, and **open-in-editor** — because we integrate react-grab itself rather than reimplementing it.

**Architecture:** We integrate `react-grab` as the selection/edit/context-menu engine and drive it from the aidx widget. react-grab renders its overlay in the **light DOM** (its normal mode); we **hide its own toolbar** (`theme.toolbar.enabled:false`) and trigger it from the composer via its API (`api.activate()` for selection, `api.comment()` for prompt mode). Every grab flow — plain select, Comment, and Style-edit — converges on react-grab's internal `runCopyFlow`, so a **single hook (`transformCopyContent`)** captures the final content string and routes it into the Solid composer's input signal. The widget's shadow-DOM chat UI and react-grab's light-DOM overlay coexist; the aidx FAB stays the only visible launcher.

**Tech Stack:** TypeScript, `react-grab@^0.1.44` (widget dep; bundles `bippy`, already a widget dep), Solid widget in an open Shadow DOM, Vite lib build (ES + IIFE), vitest + Playwright (example e2e). `react` is react-grab's *optional* peer — on non-React hosts selection still works, source-mapping/edit degrade gracefully.

**Proven by spike (2026-06-14, against `apps/examples/tanstack-start`, React 19 + Vite):**
1. **Headless init works:** set `window.__REACT_GRAB_DISABLED__ = true` to suppress auto-init, then `init({telemetry:false})` and `registerPlugin(...)`. Toolbar hidden via `theme:{toolbar:{enabled:false}}` — no react-grab FAB/toolbar appeared in the DOM.
2. **Driven by API:** `api.activate()` enters selection; hovering shows the highlight box; a left-click grabs one element then auto-deactivates (toggle mode). `onElementSelect` fired with the element.
3. **Single interception point:** both `transformCopyContent` and `onCopySuccess` fired with the **final content** on a plain left-click grab. Confirmed by source that **Comment** and **Style-edit** also route through `runCopyFlow` (`core/edit-mode.ts` `submit() → performCopyWithLabel → runCopyFlow`, passing the formatted CSS prompt as `extraPrompt`). So one hook captures all three flows.
4. **Context menu renders** anchored to the element with **Copy ⌘C · Style S · Comment ↵ · Open O** (screenshot captured at `/tmp/spike-crop.png` during the spike).
5. **Source/component context resolves on Vite/TanStack:** captured `in Header / in RootDocument (at /src/routes/__root.tsx) / in MatchView (@tanstack/react-router)` — richer than react-grab's README implies for non-Next bundlers.

**Decisions (locked with user):**
- **Integrate react-grab** (not reimplement, not fork). Light-DOM overlay, aidx FAB drives it.
- **Auto-insert on select**, and **keep** react-grab's Copy/Style/Comment/Open as-is. (A plain grab both writes the clipboard — react-grab default — *and* inserts into the composer via our hook. The clipboard write is a harmless side effect.)
- **Dev-only, lazy on first use.** The widget already mounts only when the aidx dev routes answer, so it is effectively dev-only. We `import('react-grab')` lazily on first **Select element** click; this also lets us set `__REACT_GRAB_DISABLED__` *before* the module evaluates.

**Build behavior (verified 2026-06-14, not a guess):** `pnpm turbo run build --filter=@aidx/widget` succeeds for **both** formats with **no Rollup error**:
- **ESM (`dist/mount.js`)**: react-grab is **code-split** into separate lazy chunks (`action-shortcuts-*.js` 116kB, `renderer-*.js` 150kB, `dist-*.js` 133kB) — true byte-laziness on this path.
- **IIFE (`dist/aidx-widget.global.js`, the injected global)**: cannot code-split, so react-grab is **inlined** into the single file (1,693kB total) — but **execution is still deferred** to first click (the import resolves an already-present module). Behavioral laziness + dev-only gating hold; only byte-laziness is lost here.
This is acceptable: the widget is dev-only and already bundles `bippy` (shared with react-grab), `shiki`, `marked`. **No fallback (CDN/script-injection) is required.**

**Shippable milestone:** Tasks 0–4 deliver the headline (Select element → insert into composer, full context menu, style edits). Task 5 adds the e2e proof. Task 6 exposes the plugin API for host extensibility.

**Validation log (2026-06-14, prototype run to retire unknowns):**
- `pnpm turbo run build --filter=@aidx/widget` → **PASS**, both formats (ESM splits react-grab; IIFE inlines; no Rollup error).
- `pnpm turbo run typecheck --filter=@aidx/widget` → **PASS** (react-grab `init`/`registerPlugin`/`transformCopyContent`/`activate`/`comment` all typecheck).
- `pnpm turbo run lint --filter=@aidx/widget` → **PASS** (0 errors; 6 warnings, all pre-existing, none from new files).
- The interaction (select → context menu → content capture) was proven by the earlier Playwright spike against `apps/examples/tanstack-start`.

> **Note:** This plan was prototyped to resolve build/type unknowns; the resulting `adapter.ts` / `chat-shell.tsx` / `styles.css` changes exist in the working tree but are **pending review** — they are not committed. Treat the tasks below as the canonical record; reconcile the working tree to them on execution.

---

### Task 0: Add react-grab to the widget  ✅ (already done)

**Files:** Modify `packages/widget/package.json` (+ `pnpm-lock.yaml`).

- [x] **Step 1:** `pnpm -C packages/widget add react-grab` → `dependencies` gains `react-grab ^0.1.44`.
- [ ] **Step 2:** `pnpm turbo run typecheck` → PASS (confirms resolution; no usage yet).
- [ ] **Step 3:** Commit: `build: add react-grab to @aidx/widget for the element picker`.

---

### Task 1: react-grab adapter module

**Files:** Create `packages/widget/src/react-grab/adapter.ts`.

A lazy, single-instance adapter that initializes react-grab headless and exposes control methods. `onGrab` is invoked with the final content of every grab flow.

```ts
// Lazy, dev-only integration of react-grab as the element-selection engine. Auto-init and the
// react-grab toolbar are disabled; we drive it from the composer. Every grab (select/comment/
// style-edit) converges on runCopyFlow, so transformCopyContent is the one hook that routes the
// final content into the chat composer. Dynamic import (not static) so we can set the disable
// flag before the module evaluates, and to defer init to first use.

export type ReactGrabAdapter = {
  activate: () => void          // enter selection mode (Select element button)
  comment: () => void           // enter selection + prompt mode
  deactivate: () => void
  isActive: () => boolean
}

let adapterPromise: Promise<ReactGrabAdapter> | null = null

export function getReactGrabAdapter(onGrab: (content: string) => void): Promise<ReactGrabAdapter> {
  if (!adapterPromise) adapterPromise = create(onGrab)
  return adapterPromise
}

async function create(onGrab: (content: string) => void): Promise<ReactGrabAdapter> {
  ;(window as unknown as {__REACT_GRAB_DISABLED__?: boolean}).__REACT_GRAB_DISABLED__ = true
  const rg = await import('react-grab')
  const api = rg.init({telemetry: false})
  api.registerPlugin({
    name: 'aidx',
    theme: {toolbar: {enabled: false}},
    hooks: {
      // Captures plain-select, Comment, and Style-edit content alike.
      transformCopyContent: (content: string) => {
        onGrab(content)
        return content
      },
    },
  })
  // Host-app extensibility: register new context-menu/toolbar actions + hooks against OUR instance
  // (see Task 6). A literal `export {registerPlugin} from 'react-grab'` would NOT work — see below.
  ;(window as unknown as {__AIDX__?: unknown}).__AIDX__ = {
    registerPlugin: api.registerPlugin,
    unregisterPlugin: api.unregisterPlugin,
  }
  return {
    activate: () => api.activate(),
    comment: () => api.comment(),
    deactivate: () => api.deactivate(),
    isActive: () => api.isActive(),
  }
}
```

- [ ] **Step 1:** Write the module above.
- [ ] **Step 2:** `pnpm turbo run typecheck` → PASS. If `init`/`registerPlugin`/hook types mismatch, reconcile against `react-grab`'s shipped `.d.ts` (`Options.telemetry`, `Plugin.theme`, `PluginHooks.transformCopyContent` all exist per investigation).

---

### Task 2: Composer button + insert wiring

**Files:** Modify `packages/widget/src/chat-shell.tsx`.

- [ ] **Step 1:** Add a `Crosshair` icon component (inline SVG, sibling of `SendArrow`/`StopIcon`).
- [ ] **Step 2:** In `ChatFeature`, add a loading signal and the grab handler:
  ```ts
  const [pickerLoading, setPickerLoading] = createSignal(false)
  // Insert the grabbed reference into the composer for the user to edit, then send.
  const onGrab = (content: string) => {
    setInput((prev) => (prev ? `${prev}\n${content}` : content))
    openPanel()
    requestAnimationFrame(() => inputEl?.focus())
  }
  const startPick = async () => {
    setPickerLoading(true)
    try {
      const adapter = await getReactGrabAdapter(onGrab)
      adapter.activate()
    } finally {
      setPickerLoading(false)
    }
  }
  ```
- [ ] **Step 3:** Add an **actions row** to the composer (extensible — future buttons live here), with the Select-element button to the left of the textarea:
  ```tsx
  <button
    type="button"
    class="pw-chat-act"
    aria-label="Select an element from the page"
    classList={{'pw-chat-act-busy': pickerLoading()}}
    onClick={() => void startPick()}
  >
    <Crosshair />
  </button>
  ```
- [ ] **Step 4:** Import `getReactGrabAdapter` from `./react-grab/adapter.js`.
- [ ] **Step 5:** `pnpm turbo run typecheck` → PASS.

**Design notes:**
- We do **not** wire `onCleanup`-dispose: the adapter is a page-lifetime singleton (the widget mounts once). Re-activating just calls `activate()` again.
- The `comment()` method is available for a future second button; not surfaced in v1 (selection already inserts a reference the user edits in the composer — same outcome as react-grab's prompt mode, in our own input).

---

### Task 3: Styles

**Files:** Modify `packages/widget/src/styles.css`.

- [ ] **Step 1:** Add a ghost-button style for composer actions using existing `--pw-*` tokens, aligned with the composer's `align-items:flex-end`:
  ```css
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
- [ ] **Step 2:** Confirm `.pw-chat-composer` (flex row) lays out `[act][textarea][send]` correctly; no structural CSS change expected.

---

### Task 4: Build + verify the IIFE dynamic-import

**Files:** none (build only).

- [ ] **Step 1:** `pnpm turbo run build --filter=@aidx/widget`.
  - Expected: builds both `dist/mount.js` (ES) and `dist/aidx-widget.global.js` (IIFE). A Rollup **warning** about inlining the dynamic import in the IIFE output is acceptable.
  - If the IIFE build **errors** on the dynamic import: fall back to runtime `<script>` injection of react-grab's own global build served by the dev engine (documented as the fallback path), or split the picker into the ES entry only. Decide with evidence from the actual error.
- [ ] **Step 2:** `pnpm turbo run lint --filter=@aidx/widget` → PASS (oxlint).
- [ ] **Step 3:** Commit: `feat(widget): add element picker to the chat composer via react-grab`.

---

### Task 5: End-to-end proof (Playwright, no jsdom)

**Files:** Create `packages/widget/test/element-picker.e2e.ts` (or extend the example app's Playwright suite — match existing convention).

- [ ] **Step 1:** Start the example app dev server (`pnpm --filter tanstack-start-example dev`) with the built widget injected.
- [ ] **Step 2:** Drive in a real browser:
  - Open the widget panel (✦ FAB), click **Select element**.
  - Assert react-grab's toolbar is **not** present; assert the hover highlight appears on `pointermove`.
  - Click a source-mapped element (e.g. a Header link); assert the composer textarea now contains the reference (`in Header` / selector).
  - Right-click an element while active; assert the context menu shows **Copy / Style / Comment / Open**.
- [ ] **Step 3:** `pnpm turbo run test --filter=@aidx/widget` (or the e2e script) → PASS.

---

### Task 6: Expose plugin API for host extensibility

**Files:** `packages/widget/src/react-grab/adapter.ts` (the `window.__AIDX__` assignment is already in the Task 1 code).

**Why NOT a literal re-export.** It is tempting to add `export {registerPlugin, unregisterPlugin} from 'react-grab'` to a widget entry. **This does not work here**, for two compounding reasons:
1. The widget **bundles its own copy** of react-grab inside the IIFE — a host app's `import {registerPlugin} from 'react-grab'` is a *different module instance* than the widget's.
2. react-grab's top-level `registerPlugin` coordinates across instances via `window.__REACT_GRAB__`, but that global is only published by react-grab's **auto-init** — which we **disable** (`__REACT_GRAB_DISABLED__ = true`) and replace with our own `init()` call that does **not** set `window.__REACT_GRAB__`.

So a host calling the re-exported `registerPlugin` would queue its plugin against a global that never appears, and it would never reach our live instance.

**What we do instead.** Bind an aidx-branded API to *our* instance on the window (already in Task 1):
```ts
window.__AIDX__ = {
  registerPlugin: api.registerPlugin,
  unregisterPlugin: api.unregisterPlugin,
}
```
Host code adds actions/hooks against the live engine:
```js
// host app, dev only — runs after the widget has initialized react-grab (first picker use):
window.__AIDX__?.registerPlugin({
  name: 'my-action',
  actions: [{id: 'inspect', label: 'Inspect', onAction: (ctx) => console.dir(ctx.element)}],
})
```

- [ ] **Step 1:** Confirm the `window.__AIDX__` assignment is present in `adapter.ts` (from Task 1).
- [ ] **Step 2:** Document the `window.__AIDX__.registerPlugin` one-liner above in the widget README, including the timing caveat (only live after the adapter has initialized — i.e. after the first **Select element** click).
- [ ] **Step 3 (optional alternative):** If we want react-grab's *own* `registerPlugin` to also resolve, publish our instance ourselves with `window.__REACT_GRAB__ = api` right after `init()`. Trade-off: re-introduces the react-grab-branded global we were keeping behind aidx. Default: do **not** do this; keep only `window.__AIDX__`.

---

## Open considerations (not blockers)

- **Clipboard side effect:** a plain grab still writes the clipboard (react-grab default). Accepted per "keep Copy". If undesired later, intercept earlier / override `getContent`.
- **Non-React hosts:** selection + selector reference work; source-mapping and Style-edit degrade (react-grab handles the fallback). aidx stays framework-agnostic.
- **Two overlay systems:** react-grab (light DOM) + aidx widget (shadow DOM) coexist; only the aidx FAB is a visible launcher. No z-index conflict observed in the spike.
- **Bundle size:** ~react-grab added to the dev-only widget global; `bippy` is shared (already a widget dep), so the incremental is react-grab's own minified code.
