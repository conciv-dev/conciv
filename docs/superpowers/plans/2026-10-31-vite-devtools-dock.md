# conciv in the Vite DevTools Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Vite project has Vite DevTools enabled, conciv lives in their dock with our logo and fills the dock panel, so there is one dock in the corner, not two.

**Architecture:** The plugin detects DevTools at `configResolved`. In that mode it registers one `custom-render` dock entry whose renderer is the existing extensions module, and passes `surface: 'dock'` through the widget settings. The widget then uses its existing full-size phone layout, inside a host that is a containing block for its fixed children. The engine, RPC and page effects do not change. Without DevTools, nothing changes.

**Tech Stack:** Vite 8.3+, `@vitejs/devtools` 0.8 (test only), Solid, Playwright.

**Spec:** none; decisions came from Spike C (report kept outside the repo) and this plan.

## Global Constraints

- No runtime dependency on `@vitejs/devtools` or its kit. Vite 6 and 7 users are unaffected.
- Dock icon is the conciv mark, not an Iconify glyph. `@conciv/brand` is private, so the plugin carries the mark as a data URI.
- Repo rules apply: zero comments, no classes, no `as`, no new test files (test budget).

## Review Focus

- Escape or close inside the dock: must not leave a blank panel with no way back.
- Switching dock entries and back: conversation and draft stay.
- Tab key in the dock: focus must be able to leave the widget to reach their dock.
- `widget: false` or `enabled: false`: no dock entry at all.
- First use before the DevTools code is entered: their authorize card shows and conciv mounts afterwards.

---

### Task 1: `surface` setting

**Files:** Modify `packages/protocol/src/config-types.ts`, `apps/conciv/src/data/settings.ts`, `apps/conciv/src/lib/shadow.ts`, `packages/embed/src/mount-impl.tsx`, `apps/conciv/src/routes/panel.tsx`, `apps/conciv/src/routes/__root.tsx`, `apps/conciv/src/routes/panel.$sessionId.tsx`.

**Produces:** `ConcivSettingsInit.surface?: 'page' | 'dock'`, `ConcivSettings.surface`, `createShadowRoot(host, surface)`.

- [ ] Parse `surface`, defaulting to `'page'`.
- [ ] In dock surface the shadow host is `position: relative`, 100% by 100%, `contain: layout`.
- [ ] In dock surface the panel uses `PANEL_SHEET`, no resize handles, focus trap disabled, close is a no-op and the close button is hidden.

### Task 2: dock entry

**Files:** Modify `packages/extension-compiler/src/extensions.ts`, `packages/extension-compiler/src/vite-plumbing.ts`, `packages/plugin/src/core/vite.ts`, `packages/plugin/src/core/widget-middleware.ts`.
**Test:** `packages/extension-compiler/test/extension-compiler.it.test.ts`, `packages/plugin/test/plugin.it.test.ts`.

**Consumes:** Task 1 `surface`.

- [ ] Failing test: dock source exports a default renderer and never calls `mountConciv`; page source is unchanged.
- [ ] `extensionsModuleSource` gains `surface: 'page' | 'dock' = 'page'`. The renderer handles both a panel that already exists and `dom:panel:mounted`.
- [ ] `makeViteHook` detects the `vite:devtools` plugin and, when conciv is enabled and `widget !== false`, registers `{id: 'conciv', title: 'conciv', icon: <mark data URI>, type: 'custom-render', renderer: {importFrom: EXTENSIONS_ROUTE, importName: 'default'}}`, and sends `{launcher: false, defaultOpen: true, surface: 'dock'}`.
- [ ] Failing then passing IT: real Vite with DevTools, click the dock entry in Chromium, the chat fills the panel.

### Task 3: ship

- [ ] Changeset for `@conciv/plugin`.
- [ ] Manual check in Chromium and Firefox with a screenshot of each state, then fallow audit.
