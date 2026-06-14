# Quick-Terminal Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, on `main` per user) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second widget layout (top drop-down quick terminal) alongside the corner modal, both independently enableable, modeled on the TanStack Devtools shell + panel architecture. Bring in the Devtools trigger position, drag-resize, and Picture-in-Picture behaviors (MIT, adapted). Extract the chat UI once so both layouts share it.

**Architecture (mirrors TanStack Devtools):** a generic `createWidgetShell()` (factory closure, not a class) owns the chrome (trigger, layout mode, resize, PiP, settings, persistence) and hosts content as panels. `ChatPanel` is the one registered panel. Shell features are headless primitives: `createDraggablePosition`, `createResizable`, `createPiP`, `createDropSheet`. Quick-terminal panes are multiple `ChatPanel` instances in a row.

**Tech Stack:** SolidJS + `@tanstack/ai-solid` (widget), `@tanstack/solid-hotkeys` (new), h3 + `@tanstack/ai` (core), Zod (protocol), Vitest + Playwright (tests), Turborepo (build/typecheck). Per project rules: never jsdom — widget behavior tested in a real browser; build via turbo.

**Spec:** `docs/superpowers/specs/2026-06-14-quick-terminal-layout-design.md`

**Mockup (visual reference):** `packages/widget/mockups/quick-terminal.html`

---

## Dependency graph

```
T1 ChatPanel extraction (behavior-preserving)         ← gate: modal parity
        │
T2 Config seam (protocol → core → plugin → mount)     ← independent of T1, do in parallel
        │
        ▼
T3 createWidgetShell + modal mode renders ChatPanel    (needs T1 + T2)
        │
   ┌────┼─────────────┐
   ▼    ▼             ▼
T4 trigger     T5 resize       (shell features; need T3)
position+drag  (modal panel)
   │    │             │
   └────┴─────────────┘
        ▼
T6 quick-terminal drop sheet (single pane) + hotkeys   (needs T3)
        ▼
T7 quick-terminal pane row (split / gutters / close)   (needs T6)
        ▼
T8 PiP for both layouts                                (needs T3; best after T6)
        ▼
T9 docs page + screenshots                             (needs T6, T7, T4 for shots)
        ▼
T10 full verification sweep                            (all)
```

**Checkpoints (human review):** after T1 (extraction parity), after T5 (shell + modal feature-complete), after T7 (quick terminal complete), after T8 (PiP).

---

## File structure

| File | Change | Responsibility |
|------|--------|----------------|
| `packages/widget/src/chat-panel.tsx` | create | `ChatPanel` — chat UI + `useChat`, extracted from chat-shell |
| `packages/widget/src/chat-shell.tsx` | modify | slim to wiring; chat internals move out |
| `packages/protocol/src/config-types.ts` | modify | `WidgetConfig`, `ModalConfig`, `QuickTerminalConfig`, `TriggerPosition` |
| `packages/core/src/widget-tags.ts` | modify | emit `pw-widget` meta (JSON) |
| `packages/plugin/src/core/vite.ts` | modify | pass `widget` config into `htmlTags()` |
| `packages/widget/src/mount.tsx` | modify | `resolveWidget`, create shell, register ChatPanel |
| `packages/widget/src/widget-shell.tsx` | create | `createWidgetShell()` — chrome + layout + panel host |
| `packages/widget/src/draggable-position.ts` | create | `createDraggablePosition()` |
| `packages/widget/src/trigger.tsx` | create | positioned, draggable trigger button |
| `packages/widget/src/resize.ts` | create | `createResizable()` (adapted from Devtools, MIT) |
| `packages/widget/src/drop-sheet.ts` | create | `createDropSheet()` |
| `packages/widget/src/quick-terminal.tsx` | create | quick-terminal layout: sheet + pane row + gutters |
| `packages/widget/src/pip.tsx` | create | `createPiP()` (adapted from Devtools, MIT) |
| `packages/widget/src/styles.css` | modify | `.pw-qt-*`, position, resize, pane styles |
| `packages/widget/package.json` | modify | + `@tanstack/solid-hotkeys` |
| `apps/site/content/docs/usage/quick-terminal.mdx` | create | docs page |
| `apps/site/content/docs/usage/meta.json` | modify | nav entry |
| `apps/site/content/docs/configuration.mdx` | modify | widget config rows |
| `apps/site/public/screenshots/*.png` | create | real-widget screenshots |

---

## Task 1: Extract `ChatPanel` (behavior-preserving) — GATE

**Why first:** the no-fork rule. Everything renders this one component. Must change zero behavior.

**Files:** create `chat-panel.tsx`; modify `chat-shell.tsx`.

- [ ] **Step 1:** Move the chat-rendering JSX + `useChat` wiring + helpers (`MessageParts`, `ToolCall`, composer, log, empty state, genui/test cards) from `chat-shell.tsx` into `ChatPanel(props: {apiBase: string})`. Leave the FAB + panel chrome in `chat-shell.tsx` for now (T3 moves it to the shell).
- [ ] **Step 2:** `chat-shell.tsx` renders `<ChatPanel apiBase={...} />` inside the existing panel. No prop or behavior change.
- [ ] **Verify:** `turbo build` green. Playwright IT: open the widget, send a message, see the streamed reply, tool cards, empty-state chips — all identical to before. Screenshot diff against current `chat-thread.png` reference.

**Acceptance:** modal works exactly as today; chat code now lives in one place.

**CHECKPOINT 1** — confirm extraction parity before any layout work.

---

## Task 2: Config seam under `widget` (vertical: protocol → core → plugin → mount)

**Files:** `config-types.ts`, `widget-tags.ts`, `vite.ts`, `mount.tsx`; tests in core.

- [ ] **Step 1 (failing test):** `widget-tags.test.ts` — `htmlTags()` emits `<meta name="pw-widget">` with the JSON blob; omitting `widget` emits `{}`.
- [ ] **Step 2:** Add `TriggerPosition`, `ModalConfig`, `QuickTerminalConfig`, `WidgetConfig`; add `widget?: WidgetConfig` to `AidxConfig`.
- [ ] **Step 3:** `htmlTags()` takes `opts.widget`, emits the meta as `JSON.stringify(opts.widget ?? {})`.
- [ ] **Step 4:** `vite.ts` passes `cfg.widget` into `htmlTags()`.
- [ ] **Step 5 (failing test):** widget unit test for `resolveWidget()` — boolean vs object `modal`/`quickTerminal`, missing, malformed JSON → defaults (modal on/`bottom-right`, quick terminal off, hotkey `Mod+\``).
- [ ] **Step 6:** Implement `resolveWidget()` in `mount.tsx`.
- [ ] **Verify:** unit tests green; `turbo build` green. With no config, the injected meta + resolution reproduce today's defaults.

**Acceptance:** host config flows to the widget as normalized settings; backward compatible.

---

## Task 3: `createWidgetShell()` + modal mode renders ChatPanel

**Needs:** T1, T2. **Files:** create `widget-shell.tsx`; modify `mount.tsx`, `chat-shell.tsx`.

- [ ] **Step 1:** `createWidgetShell(settings)` returns `{ mount(rootEl), unmount(), registerPanel(panel) }`. Internally holds layout state and a registered-panels list. `type Panel = { id; title; render(container) }`.
- [ ] **Step 2:** Implement the **modal** layout inside the shell: the FAB + corner panel chrome moved out of `chat-shell.tsx`, rendering the registered panel's content (ChatPanel) as the body.
- [ ] **Step 3:** `mount.tsx`: `const shell = createWidgetShell(resolveWidget()); shell.registerPanel(ChatPanel(apiBase)); shell.mount(shadowRoot)`. `chat-shell.tsx` slims to the panel body or is folded into ChatPanel.
- [ ] **Verify:** Playwright — modal opens/closes, chat works, FAB pulse on background reply — identical to T1. `turbo build` green.

**Acceptance:** shell hosts ChatPanel in modal mode with no behavior change; chrome is now shell-owned.

---

## Task 4: `createDraggablePosition()` + trigger button

**Needs:** T3. **Files:** create `draggable-position.ts`, `trigger.tsx`; modify `styles.css`.

- [ ] **Step 1:** Port the Devtools 6-preset placement map (`mainCloseBtnPosition`) into CSS keyed by `TriggerPosition` (credit comment, MIT).
- [ ] **Step 2:** `createDraggablePosition({ initial, storageKey })` → `{ position, onPointerDown }`. Pointerdown tracks the pointer; pointerup snaps to the nearest preset (compare FAB centre to the 6 anchors); persist to `aidx-fab-position`.
- [ ] **Step 3:** `trigger.tsx` uses it; shell renders the trigger at `settings.modal.position` initial.
- [ ] **Verify:** Playwright — each preset renders in the right corner; dragging the FAB and releasing snaps to the nearest preset; reload restores it. Capture `fab-positions.png`.

**Acceptance:** FAB position is config-driven, draggable, snaps, persists.

---

## Task 5: `createResizable()` — modal panel resize (Devtools port)

**Needs:** T3. **Files:** create `resize.ts`; modify shell + `styles.css`.

- [ ] **Step 1:** Port `handleDragStart` from Devtools `devtools.tsx` (MIT credit): mousedown on the resize edge → `pageY` delta → set height → collapse under threshold.
- [ ] **Step 2:** Wire to the modal panel; persist height to `aidx-modal-height`; add the resize-edge affordance + `isResizing` style hook.
- [ ] **Verify:** Playwright — drag the edge resizes the panel; dragging below threshold collapses (closes); height persists across reopen.

**Acceptance:** modal panel resizes like Devtools.

**CHECKPOINT 2** — shell + modal feature-complete (position, drag, resize). Review before quick terminal.

---

## Task 6: Quick-terminal drop sheet (single pane) + hotkeys

**Needs:** T3. **Files:** create `drop-sheet.ts`, `quick-terminal.tsx`; modify shell, `mount.tsx`, `styles.css`, `package.json`.

- [ ] **Step 1:** Add `@tanstack/solid-hotkeys` (ask-before-install already cleared for this one dep).
- [ ] **Step 2:** `createDropSheet()` — open/close + slide-from-top state; height from/to `aidx-qt-height` with the bottom grip (port the mockup's grip logic).
- [ ] **Step 3:** `quick-terminal.tsx` renders the full-width sheet (no scrim) with header (brand, hotkey hint, PiP+close placeholders) and one `ChatPanel` body. Port look/motion/tokens from the mockup.
- [ ] **Step 4:** In the shell, bind `createHotkey` per `settings.quickTerminal.hotkeys`; toggling the sheet closes the modal panel and vice versa (one layer visible).
- [ ] **Verify:** Playwright — hotkey drops/raises the sheet; opening it closes an open modal; `Esc`/close button close it; height drag persists across reopen. Capture `quick-terminal.png`.

**Acceptance:** quick terminal works as a single-pane drop sheet, hotkey-driven, mutually exclusive with the modal.

---

## Task 7: Quick-terminal pane row (split / gutters / close)

**Needs:** T6. **Files:** modify `quick-terminal.tsx`, `styles.css`.

- [ ] **Step 1:** Pane state `{ panes: Pane[]; focusedId }`; each pane owns its own `ChatPanel` (fresh session). Render a flex row.
- [ ] **Step 2:** Split via `Mod+D` and a ⊞ header button — append a fresh pane, focus it.
- [ ] **Step 3:** Focus on pointer-down / composer focus (accent top line; others recede). Draggable gutters set left-neighbour flex-basis.
- [ ] **Step 4:** Close a pane: remove pane + adjacent gutter, clear survivors' inline flex so they reflow (lone pane → full width). Last pane closes the terminal.
- [ ] **Verify:** Playwright — split adds an independent pane (type in each separately); gutter resize works; closing one reflows the survivor to full width; closing the last closes the sheet. Capture `quick-terminal-split.png`.

**Acceptance:** matches the mockup's pane behavior, including the close-reflow fix.

**CHECKPOINT 3** — quick terminal complete. Review before PiP.

---

## Task 8: Picture-in-Picture for both layouts (Devtools port)

**Needs:** T3 (best after T6). **Files:** create `pip.tsx`; modify shell, both headers, `styles.css`.

- [ ] **Step 1:** Port `pip-context.tsx` (MIT credit): `requestPipWindow` via `window.open('', 'aidx-widget', '<settings>,popup')`; clear PiP head/body; copy `document.styleSheets` into the PiP head (inline cssText + `<link>` fallback); `delegateEvents` on the PiP doc; mutation-mirror our shadow style node; sync close on `pagehide`/`beforeunload`; track `pip_open`.
- [ ] **Step 2:** Render the active layout's content into the PiP body when active; re-dock into the shadow root on close.
- [ ] **Step 3:** PiP button in both the modal header and the quick-terminal header.
- [ ] **Verify:** Playwright (or manual where popup automation is limited) — PiP opens a separate window with styles applied, chat works inside it, closing re-docks. Document any manual step.

**Acceptance:** either layout pops out into an OS window with styles, and re-docks cleanly.

**CHECKPOINT 4** — PiP review.

---

## Task 9: Docs page + screenshots

**Needs:** T4, T6, T7. **Files:** `usage/quick-terminal.mdx`, `usage/meta.json`, `configuration.mdx`, `public/screenshots/*`.

- [ ] **Step 1:** Capture real-widget screenshots via Playwright into `apps/site/public/screenshots/` (`quick-terminal.png`, `quick-terminal-split.png`, `fab-positions.png`).
- [ ] **Step 2:** Write `usage/quick-terminal.mdx` — enabling layouts, hotkey config (single/multiple/combos), open/close, resize, splitting, PiP — example-first, `<ImageZoom>`, no em dashes, fumadocs-ui components.
- [ ] **Step 3:** Add `"quick-terminal"` to `usage/meta.json` `pages` after `chat`; add `widget.modal` (with `position`) and `widget.quickTerminal` (with `hotkey`) rows to `configuration.mdx`.
- [ ] **Verify:** docs site builds; page renders with images; nav shows the entry.

**Acceptance:** docs ship with the feature, with real screenshots and config reference.

---

## Task 10: Full verification sweep

- [ ] `turbo build`, `turbo lint`, `turbo test` all green.
- [ ] Playwright suite covers all 10 spec acceptance criteria.
- [ ] Confirm: omitting `widget` config reproduces today's behavior byte-for-byte (modal bottom-right, no quick terminal, no new hotkey).
- [ ] Re-read the spec's "Always / Never" boundaries against the diff (no jsdom, no scrim, no hardcoded hotkey/position, MIT credits present, single ChatPanel).

**Acceptance:** every acceptance criterion verified with evidence; boundaries hold.

---

## Risks / watch-items

- **Shadow DOM + PiP styles:** our styles live in a shadow root, not `document.styleSheets`. The PiP port must copy the shadow's style node specifically; verify the copy path early in T8 (highest-risk task).
- **Hotkey conflicts:** default `Mod+\`` may collide with host shortcuts; it is overridable, and `~` is offered in docs. Guard `ignoreInputs`.
- **Extraction regressions (T1):** the gate. If any modal behavior shifts, stop and fix before proceeding.
- **`@tanstack/solid-hotkeys` API drift:** pin the version; the `createHotkey(hotkey, cb, () => opts)` signature is confirmed from docs.
