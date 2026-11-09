# Settings page in apps/conciv: nested routes with tabs

Status: approved direction (Omri, 2026-11-09). Third PR of the settings stack (on top of settings storage, on
top of #778 kit controls).

## Goal

A real settings page in the conciv panel. Every tab is its own nested route. It is built from the
`@conciv/ui-kit-system` controls (kit `Tabs` with its sliding `Indicator`, `Switch`, `SegmentGroup`, `Select`,
`HotkeyRecorder`, `ConfirmDialog`, `FieldShell`, ...) and saves through the Devframe-contract settings store
from the previous PR (`useScope('conciv').settings`). Everything settings-specific lives in the app, not the kit.

Layout reference: `docs/specs/settings-page-variant-a.html` (top tabs, all options of a tab visible together,
no drill-in). Behaviour reference: Devframe's built-in settings view
(`packages/hub-ui/src/client/components/views-builtin/ViewBuiltinSettings.vue` and its `Settings*.vue` tabs in
`/Users/omrikatz/Public/web/_ref/devframe`, read via `git show origin/main:<path>`), but with routes instead of
local tab state.

## Routes

- `/panel/$sessionId/settings` layout route: header (title, close back to chat), the tab list, `<Outlet />`.
- `/panel/$sessionId/settings/` index redirects (replace) to the first tab.
- One child route per tab: `settings/appearance`, `settings/views`, `settings/shortcuts`, `settings/advanced`.
- The tab list is the kit `Tabs` driven by the route: `value` = matched child route, selecting a tab navigates
  (the same pattern as the view tabs in `apps/conciv/src/pane/status-bar.tsx`). Arrow keys move between tabs;
  Back/Forward walk tab history; a reload lands on the same tab.
- Entry: a settings button (gear) in the panel rail header, a `Link` to `settings`. Close and Esc navigate back
  to the chat route; nothing calls a local `setOpen(false)`.
- Static `settings` must win over the existing `/panel/$sessionId/$view` route; verify with the generated route
  tree and a navigation test.
- Load the intent skills before router work: `router-core`, `router-core/navigation`,
  `router-core/code-splitting`, and `@conciv/client#client/solid-query` for data.

## Tabs and settings (every setting must take effect, not just save)

Shapes follow Devframe's hub user settings (`DevframeDocksUserSettings`) where they overlap.

- Appearance: color scheme (follow page / light / dark, `SegmentGroup`), skin (default / terminal). Applies
  live to the widget through the existing `lib/color-scheme.ts` path.
- Views: show or hide each view tab in the status bar, and their order (Devframe's `docksHidden`,
  `docksCustomOrder`). The status bar honours it immediately.
- Shortcuts: the quick terminal hotkey and any other app hotkeys, recorded with `HotkeyRecorder`, with a
  conflict warning (Devframe's `commandShortcuts`: empty array = disabled).
- Advanced: reset all conciv settings, behind `ConfirmDialog` (focus starts on Cancel). The dialog is the route
  `/settings/advanced/reset`: "Reset all" links to it; Cancel, Escape, an outside click and Back leave it by navigating
  to `/settings/advanced` (replace); Confirm runs the reset and announces "Settings reset".

Storage: namespace `conciv`, `project` scope (Devframe keeps its hub user settings per checkout). Values set by
the host in `conciv({...})` (`ConcivSettings`, read-only) show as locked with the reason, and win over stored
values.

## Form wiring (app code, `apps/conciv/src/settings/`)

- `@tanstack/solid-form` is an app dependency. One `createFormHook` in the app with field components that
  wrap kit controls in the kit `FieldShell` and add the app-only parts: changed marker, "Reset to default",
  locked-with-reason.
- Choices and toggles save on change; text and numbers on blur or Enter. There is no save button.
- Reads come from the store snapshot (solid-query over the store's `changes` stream, or the store's
  `onChange`; follow the solid-query intent skill). No local mirror state.

## Tests

- `apps/conciv` browser test file: one journey `describe` (no new file): open settings from the gear, walk
  every tab by pointer and by arrow keys, assert the URL per tab, change the color scheme and see it applied,
  reload and see it kept, hide a view and see the status bar drop it, record a shortcut, reset all through the
  dialog, close with Esc back to chat with focus restored. Fail-first per step.
- No mocks, no CSS/DOM implementation assertions, no test ids. Headless only.

## Rules (all apply)

Functions, not classes. No IIFEs. Zero comments. No `any` / `as` / `!` / `@ts-ignore`. No em dashes. No raw
`createSignal` / `createEffect` in new code. Route-scoped router APIs only under `src/routes/`. Overlay and tab
state is the route. UnoCSS from kit tokens. Nothing added to `@conciv/ui-kit-system` unless it is a generic Ark
control the kit is missing (ask first). Changeset. Fallow: nothing INTRODUCED. Commit locally; do NOT push, do
NOT open a PR.

## Out of scope

Extension settings tabs generated from a declared shape (next PR).
