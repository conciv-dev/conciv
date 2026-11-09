# routes

## Overview

TanStack Solid file routes; the route is the layout: closed, panel, per-session panel and extension views, connect, quick terminal and picture-in-picture.

## Interface

- root `Route` (`__root.tsx`): `createRootRouteWithContext<ConcivRouterContext>()`, search `{open?: true}` retained across navigations; renders the outlet, `ShellFab` and polite/assertive live regions
- `/` (`index.tsx`): `Closed` component, the panel is closed
- `/panel` (`panel.tsx`): `PanelLayout`
- `/panel/latest` (`panel.latest.tsx`): resolves the latest session through `rpc.sessions.resolve({})` and redirects
- `/panel/connect` (`panel.connect.tsx`): `ConnectRoute`; binds an api base found by the `connect` extension slot, then opens the session
- `/panel/$sessionId` (`panel.$sessionId.tsx`): `PanelSession`, search `{popOut?: 'lost'}`; reads its session through `sessions.get`; clicking the header title (or Enter/Space on it) opens the session menu (`Popover`: Ark owns open state, focus, Escape and outside click, and returns focus to the title) hosting `SessionSelector`, context and refresh/pop-out/disconnect rows, and a pencil (`Editable`) renames in place through `rpc.sessions.rename`
- `/panel/$sessionId/` (`panel.$sessionId.index.tsx`): `ChatPaneRoute`
- `/panel/$sessionId/$view` (`panel.$sessionId.$view.tsx`): `PanelView`, an extension view
- `/panel/$sessionId/settings` (`panel.$sessionId_.settings.tsx`): `SettingsLayout`, outside the session layout; header with Close, kit `Tabs` driven by the matched child route (selecting a tab navigates), the tab's route in the panel; the index redirects to `appearance`
- `/panel/$sessionId/settings/appearance`, `/views`, `/shortcuts`, `/advanced` (`panel.$sessionId_.settings.<tab>.tsx`): one route per settings tab, each a `PreferencesForm`
- `/panel/$sessionId/settings/advanced/reset` (`panel.$sessionId_.settings.advanced.reset.tsx`): the reset-all `ConfirmDialog`; closing it navigates back to `advanced`
- `/quick` (`quick.tsx`): quick terminal layer, search `QuickSearchSchema` (`panes`, `focus`)
- `/pip/$sessionId` (`pip.$sessionId.tsx`): `PipSession`, renders the session into a popup window
- `panelHeightCap`, `defaultPanelHeight` (`panel-height.ts`): panel height from viewport, at most 750 px

## Invariants

- `__root.tsx:Route.validateSearch`: `open` is either `true` or absent
- `panel.$sessionId.tsx:Route.beforeLoad`: a param that fails `isSessionId` is resolved through `rpc.sessions.resolve` and redirected with `replace: true`
- `panel.$sessionId.$view.tsx:Route.beforeLoad`: an unknown view id redirects to `/panel/$sessionId`
- `__root.tsx:onKeyDown`: Escape on a settings route navigates to the chat route with `replace` and history state `restoreFocus: 'settings'`, which focuses the settings link in the session header and keeps `panel.tsx` from focusing the composer
- `quick.tsx:Route.beforeLoad`: redirects to `/` when `settings.quickTerminal.enabled` is false
- `panel.$sessionId.tsx:SessionTitle`: no rename when the trimmed title is empty or unchanged
- `pip.$sessionId.tsx:PipSession`: if the popup cannot open, returns inline with `popOut: 'lost'`; closing the popup (`pagehide`) returns inline
- `routeTree.gen.ts` (in `../`) is regenerated from these files by `pnpm generate-routes`

## Side Effects

- `panel.latest.tsx`, `panel.$sessionId.tsx`: `rpc.sessions.resolve` network calls in `beforeLoad`
- `__root.tsx:RootComponent`: registers quick-terminal hotkeys (`createHotkey` per `settings.quickTerminal.hotkeys`), `window` `resize` and capture `keydown` (Escape) listeners, and navigates with `setShutter`
- `quick.tsx`: `Mod+D` adds a pane; `window` `pointermove`/`pointerup` listeners during resize; navigation to `/pip/$sessionId`
- `pip.$sessionId.tsx:PipSession`: opens a popup through `openPipWindow`
- `panel.connect.tsx:ConnectRoute`: `binding.bind(apiBase)` mutation, then navigation to the session

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
