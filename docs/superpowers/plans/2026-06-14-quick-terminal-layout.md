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

| File                                              | Change | Responsibility                                                          |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `packages/widget/src/chat-panel.tsx`              | create | `ChatPanel` — chat UI + `useChat`, extracted from chat-shell            |
| `packages/widget/src/chat-shell.tsx`              | modify | slim to wiring; chat internals move out                                 |
| `packages/protocol/src/config-types.ts`           | modify | `WidgetConfig`, `ModalConfig`, `QuickTerminalConfig`, `TriggerPosition` |
| `packages/core/src/widget-tags.ts`                | modify | emit `pw-widget` meta (JSON)                                            |
| `packages/plugin/src/core/vite.ts`                | modify | pass `widget` config into `htmlTags()`                                  |
| `packages/widget/src/mount.tsx`                   | modify | `resolveWidget`, create shell, register ChatPanel                       |
| `packages/widget/src/widget-shell.tsx`            | create | `createWidgetShell()` — chrome + layout + panel host                    |
| `packages/widget/src/draggable-position.ts`       | create | `createDraggablePosition()`                                             |
| `packages/widget/src/trigger.tsx`                 | create | positioned, draggable trigger button                                    |
| `packages/widget/src/resize.ts`                   | create | `createResizable()` (adapted from Devtools, MIT)                        |
| `packages/widget/src/drop-sheet.ts`               | create | `createDropSheet()`                                                     |
| `packages/widget/src/quick-terminal.tsx`          | create | quick-terminal layout: sheet + pane row + gutters                       |
| `packages/widget/src/pip.tsx`                     | create | `createPiP()` (adapted from Devtools, MIT)                              |
| `packages/widget/src/styles.css`                  | modify | `.pw-qt-*`, position, resize, pane styles                               |
| `packages/widget/package.json`                    | modify | + `@tanstack/solid-hotkeys`                                             |
| `apps/site/content/docs/usage/quick-terminal.mdx` | create | docs page                                                               |
| `apps/site/content/docs/usage/meta.json`          | modify | nav entry                                                               |
| `apps/site/content/docs/configuration.mdx`        | modify | widget config rows                                                      |
| `apps/site/public/screenshots/*.png`              | create | real-widget screenshots                                                 |

---

## Task 1: Extract `ChatPanel` (behavior-preserving) — GATE

**Why first:** the no-fork rule. Everything renders this one component. Must change zero behavior.

**Files:** create `chat-panel.tsx`; modify `chat-shell.tsx`.

- [x] **Step 1:** Moved the chat-rendering JSX + `useChat` wiring + helpers into `ChatPanel(props: {apiBase, active?, onWorkingChange?})` in `chat-panel.tsx`. ChatPanel owns chat + genUi state and stays mounted (so the FAB pulse + state survive close).
- [x] **Step 2:** `chat-shell.tsx` slimmed to chrome (FAB + panel section + header + open/close + focus trap), renders `<ChatPanel>`. Modal open/close now a CSS class toggle (`.pw-chat-open`) instead of conditional mount — pre-aligns with the shell.
- [x] **Verify:** `turbo build` green (vite + tsc, 279 modules). Widget browser IT (Playwright, real built bundle): 7/7 pass — chat probe, streamed reply, tool cards, approval, test-runner, page-bus, locate.

**Acceptance:** modal works exactly as today; chat code now lives in one place.

**CHECKPOINT 1** — confirm extraction parity before any layout work.

---

## Task 2: Config seam under `widget` (vertical: protocol → core → plugin → mount)

**Files:** `config-types.ts`, `widget-tags.ts`, `vite.ts`, `mount.tsx`; tests in core.

- [x] **Step 1-3:** Added `TriggerPosition`/`ModalConfig`/`QuickTerminalConfig`/`WidgetConfig` + `widget?` on `ConcivConfig`; `htmlTags()` emits `<meta name="pw-widget">` as `JSON.stringify(opts.widget ?? {})`. Test `widget-tags.test.ts` (3) green.
- [x] **Step 4:** `vite.ts` passes `options.widget` into `htmlTags()` (static passthrough; not env-derived, so not threaded through resolveConfig).
- [x] **Step 5-6:** Pure `parseWidgetSettings(raw)` in `widget-settings.ts` (no DOM, jsdom-free unit test, 7 cases); `resolveWidget()` in `mount.tsx` wraps it with `metaContent`. mount gates the corner modal on `settings.modal.enabled`.
- [x] **Verify:** `turbo build` green (protocol/core/widget/plugin); widget 14/14 (7 unit + 7 IT), core widget-tags 3/3, plugin injection IT 8/8.

**Acceptance:** host config flows to the widget as normalized settings, both layouts default on, `false` disables each. (v0: cleanest shape, no back-compat.)

- [x] **GAP FOUND + FIXED (post-checkpoint):** the plugin has TWO injection seams — `htmlTags` (vite `transformIndexHtml`, static index.html only) AND `widget-middleware.ts` (`widgetTags`, rewrites the final SSR HTML response — the path TanStack Start / the docs site uses). T2 only updated `htmlTags`, so `pw-widget` never reached SSR apps. The unit test + widget IT both injected the meta via a static fixture, so neither covered the middleware seam → false green. Fix (TDD): deleted the false-confidence `core/widget-tags.test.ts`; added a RED test in `plugin/test/widget-inject.it.test.ts` asserting the middleware injects `pw-widget` (real HTTP round-trip); threaded `options.widget` → `makeWidgetInject` → `widgetTags`; now GREEN (plugin 9/9). **Lesson: test the seam the app runs through, not the function in isolation.**

---

## Task 3: `createWidgetShell()` + modal mode renders ChatPanel

**Needs:** T1, T2. **Files:** create `widget-shell.tsx`; modify `mount.tsx`, `chat-shell.tsx`.

- [x] **Step 1:** `createWidgetShell({settings})` returns `{ mount, unmount, registerPanel }`. Holds a registered-panels list. `PanelDef = { id; title; create(ctx) }`, `PanelContext = { active(); onWorkingChange() }` (reactive `active` accessor drives focus/hydrate; `onWorkingChange` drives the FAB pulse).
- [x] **Step 2:** `ModalLayout` inside `widget-shell.tsx` owns the FAB + corner panel chrome (moved from `chat-shell.tsx`), rendering `panel.create(ctx)` as the body.
- [x] **Step 3:** `chatPanelDef(apiBase)` in `chat-panel.tsx`; `mount.tsx` creates the shell, registers it, mounts into the shadow root. `chat-shell.tsx` deleted.
- [x] **Verify:** `turbo build` green (vite + tsc; fixed `ShadowRoot` mount type + `Show` panel narrowing). Widget tests 14/14.

**Acceptance:** shell hosts ChatPanel in modal mode, behavior identical; chrome is shell-owned.

**Note:** `trigger.tsx` dropped — the reusable unit is `createDraggablePosition` (positions any floating element); the FAB button is 8 lines of modal-only chrome inlined in `ModalLayout` (the quick terminal has no FAB).

---

## Task 4: `createDraggablePosition()` + trigger button

**Needs:** T3. **Files:** create `draggable-position.ts`, `trigger.tsx`; modify `styles.css`.

- [x] **Step 1:** Ported the Devtools 6-preset placement into CSS keyed by `TriggerPosition` (`.pw-fab-pos-*`, MIT credit). FAB lost its hardcoded corner; panel anchors to the matching corner (`.pw-panel-pos-*` + transform-origin).
- [x] **Step 2:** `createDraggablePosition({initial, storageKey})` → `{position, dragging, dragStyle, onPointerDown, consumeClick}`. Pointerdown tracks the pointer (no transition); pointerup snaps to the nearest preset and **animates** the glide to it (280ms ease-out-expo to the exact resting center), commits + persists to `conciv-fab-position`. `consumeClick` suppresses the click that follows a drag.
- [x] **Step 3:** Folded the FAB into `ModalLayout` using the primitive (no `trigger.tsx`); position drives both FAB + panel classes.
- [x] **Verify:** Playwright IT (15/15) — FAB renders at configured `top-left`; drag to opposite corner snaps to `bottom-right` + persists. Build green.

**Acceptance:** FAB position is config-driven, draggable, snaps (animated), persists.

---

## Task 5: `createResizable()` — modal panel resize (Devtools port)

**Needs:** T3. **Files:** create `resize.ts`; modify shell + `styles.css`.

- [x] **Step 1:** `createResizable()` in `resize.ts` ports Devtools `handleDragStart` (MIT credit): pointerdown on the edge → pointer delta → set height → collapse (close) below threshold. `grow: 'up'|'down'` accessor handles corner anchoring (bottom-anchored grows up, top/middle grows down).
- [x] **Step 2:** Wired to the modal panel (`conciv-modal-height` persist); resize handle on the panel's free edge (`.pw-chat-resize-top|bottom`); min 240, collapse 140.
- [x] **Verify:** Playwright IT (16/16) — edge drag grows the panel + persists; dragging past threshold closes it (aria-hidden). Build green.

**Acceptance:** modal panel resizes like Devtools.

**CHECKPOINT 2** — shell + modal feature-complete (position, drag, resize). Review before quick terminal.

---

## Task 6: Quick-terminal drop sheet (single pane) + hotkeys

**Needs:** T3. **Files:** create `drop-sheet.ts`, `quick-terminal.tsx`; modify shell, `mount.tsx`, `styles.css`, `package.json`.

- [x] **Step 1:** Added `@tanstack/solid-hotkeys@0.10.0` (pre-approved). `createHotkey` needs no `HotkeysProvider` (context lookup falls back to `{}`).
- [x] **Step 2:** Reused `createResizable` for the sheet height (`grow: 'down'`, bottom grip, `conciv-qt-height`) instead of a separate `createDropSheet` — one fewer primitive.
- [x] **Step 3:** `quick-terminal.tsx` renders the full-width sheet (no scrim) with header (brand, mode chip, close) and one `ChatPanel` body. Tokens/motion ported from the mockup; shared icons in `icons.tsx`.
- [x] **Step 4:** Shell lifted open state to a single `layer` ('modal' | 'quick' | null) → mutual exclusion is automatic. `createHotkey` bound per `hotkeys`; Esc closes when open.
- [x] **Verify:** Playwright IT (18/18) — hotkey drops/raises the sheet; Esc closes; opening the quick terminal closes an open modal. Modal-focused tests isolated via quick-terminal-off fixtures. Build green.

**Acceptance:** quick terminal works as a single-pane drop sheet, hotkey-driven, mutually exclusive with the modal.

**Note:** `createDropSheet` dropped — `createResizable` covers the height drag. `trigger.tsx`/`drop-sheet.ts` both folded away; the reusable units are the two primitives + `ChatPanel`.

---

## Task 7: Quick-terminal pane row (split / gutters / close)

**Needs:** T6. **Files:** modify `quick-terminal.tsx`, `styles.css`.

- [x] **Step 1:** `panes` signal + `focused` id; each pane calls `panel.create(ctx)` → its own ChatPanel/session. Rendered as a flex row; `active` is true only for the focused pane (it takes composer focus + hydrates).
- [x] **Step 2:** Split via `Mod+D` and the ⊞ header button — append a fresh pane, focus it.
- [x] **Step 3:** Focus on pointer-down (accent top line; others recede). Draggable gutters (`<For>` renders gutter-before-pane so siblings line up) set the left neighbour's flex-basis.
- [x] **Step 4:** Close: filter the pane; clear survivors' inline flex so they reflow (lone pane → full width); closing the last calls `setOpen(false)` (re-seeded on next open).
- [x] **Verify:** Playwright IT (19/19) — split adds a pane with its own composer; closing one reflows; closing the last closes the sheet. Build green.

**Acceptance:** matches the mockup's pane behavior, including the close-reflow fix.

- [x] **Focus-on-open + active-pane memory (added on request):** seed the first pane at setup (mounted up front, like the modal) so opening reliably focuses the composer — a pane created lazily inside the open handler races the mount+animation and misses focus. Persist the active pane index (`conciv-qt-focused`); restore it on reopen. IT (20/20) asserts the composer is focused on open and the last-active pane is restored.

**CHECKPOINT 3** — quick terminal complete. Review before PiP.

---

## Task 8: Picture-in-Picture for both layouts (Devtools port)

**Needs:** T3 (best after T6). **Files:** create `pip.tsx`; modify shell, both headers, `styles.css`.

- [x] **Step 1:** `createPiP()` in `pip.tsx` (MIT credit). Simpler than the Devtools port: our styles live in the shadow root, so instead of copying `document.styleSheets` we give the PiP window its own shadow root seeded with the same style text and MOVE the live node in (chat state travels). `delegateEvents(DELEGATED, pip.document)` so Solid's delegated handlers fire in the PiP doc; close-sync on `pagehide`/`beforeunload`.
- [x] **Step 2:** A placeholder marks the home spot; the node re-docks on close. `.pw-pip` CSS fills the window (drops fixed positioning, drop-animation, card chrome, in-page resize affordances).
- [x] **Step 3:** PiP button in both headers (`PipIcon`).
- [x] **Verify:** Playwright IT (21/21) — real popup captured: sheet moves into the PiP window's shadow, **computed font is system-ui (styles travelled)**, in-page leaves a placeholder, closing re-docks. Modal uses the same `createPiP`.

**Acceptance:** either layout pops out into an OS window with styles, and re-docks cleanly.

**CHECKPOINT 4** — PiP review.

---

## Task 9: Docs page + screenshots

**Needs:** T4, T6, T7. **Files:** `usage/quick-terminal.mdx`, `usage/meta.json`, `configuration.mdx`, `public/screenshots/*`.

- [x] **Step 1:** Captured real-widget screenshots headlessly (built bundle + scripted server, same harness as the ITs) → `quick-terminal.png`, `quick-terminal-split.png`. (Skipped `fab-positions.png` — the two qt shots carry the feature; position is documented in the config table.)
- [x] **Step 2:** `usage/quick-terminal.mdx` — enable, hotkeys (single/multiple/combos, Mod, Option dead-key Callout), split panes, resize, PiP, both layouts. `<ImageZoom>`, no em dashes, fumadocs components.
- [x] **Step 3:** Added `"quick-terminal"` to `usage/meta.json` after `chat`; added `widget` to the `configuration.mdx` options table + a "Widget layouts" task documenting `modal.position` + `quickTerminal.hotkey`.
- [x] **Verify:** `turbo build --filter=site` green; `/docs/usage/quick-terminal` prerenders.

**Acceptance:** docs ship with the feature, with real screenshots and config reference.

---

## Task 10: Full verification sweep

- [x] `turbo build` + `lint` 18/18 green. Tests: protocol 7, core 34, plugin 9, widget 21, harness 34 — all green.
- [x] Playwright widget IT covers: hotkey toggle, Esc, mutual exclusion, FAB position + drag-snap, modal resize + collapse, split panes + reflow, focus-on-open + restore, PiP move + styles + re-dock. Plugin IT covers the SSR meta-injection seam.
- [x] Defaults when `widget` omitted: BOTH layouts on (modal bottom-right + quick terminal on `Mod+\``).
- [x] Boundaries hold: no jsdom (Playwright only), no scrim, hotkey/position config-driven with defaults, MIT credits on `pip.tsx`/`resize.ts`/`draggable-position.ts`, single `ChatPanel` (no fork).

**Acceptance:** every acceptance criterion verified with evidence; boundaries hold.

---

## Tech debt (deferred, agreed)

- `parseWidgetSettings` hand-rolls `unknown` + `as` narrowing. Replace with a Zod
  schema (`WidgetConfigSchema` in protocol) using `.default()` for both layouts +
  hotkey/position, then `schema.parse(JSON.parse(raw))`. The protocol package
  already uses Zod. Cleaner, validates, and self-documents. Deferred per user.

## Risks / watch-items

- **Shadow DOM + PiP styles:** our styles live in a shadow root, not `document.styleSheets`. The PiP port must copy the shadow's style node specifically; verify the copy path early in T8 (highest-risk task).
- **Hotkey conflicts:** default `Mod+\`` may collide with host shortcuts; it is overridable, and `~`is offered in docs. Guard`ignoreInputs`.
- **Extraction regressions (T1):** the gate. If any modal behavior shifts, stop and fix before proceeding.
- **`@tanstack/solid-hotkeys` API drift:** pin the version; the `createHotkey(hotkey, cb, () => opts)` signature is confirmed from docs.
