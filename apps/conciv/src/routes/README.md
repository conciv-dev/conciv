# routes

## Overview

TanStack Solid file routes; the route is the layout: closed, panel, per-session panel and extension views, connect, quick terminal and picture-in-picture.

## Interface

- root `Route` (`__root.tsx`): `createRootRouteWithContext<ConcivRouterContext>()`, search `sessionPickerSearchSchema` (`lib/session-search-schemas.ts`): `open?: true`, `sessionSearch` (the picker's search term, `''` by default) and `allProjects` (`false` by default), all retained across navigations and the defaults stripped from the URL; renders the outlet, `ShellFab` and polite/assertive live regions
- `/` (`index.tsx`): `Closed` component, the panel is closed
- `/panel` (`panel.tsx`): `PanelLayout`; reads only `open` from the search (a `select`), so a picker term or switch written to the URL never reruns the open-panel composer focus
- `/panel/latest` (`panel.latest.tsx`): resolves the latest session through `rpc.sessions.resolve({})` and redirects
- `/panel/connect` (`panel.connect.tsx`): `ConnectRoute`; binds an api base found by the `connect` extension slot, then opens the session
- `/panel/$sessionId` (`panel.$sessionId.tsx`): `PanelSession`, search `{popOut?: 'lost'}`; reads its session through `sessions.get`; clicking the header title (or Enter/Space on it) opens the session menu (`Popover`: open while an `options` child route matches; Ark's open/close requests navigate to or from that child, Ark owns focus, Escape and outside click, and returns focus to the title) hosting `SessionSelector`, context and refresh/pop-out/disconnect rows, and a pencil (`Editable`) renames in place through `rpc.sessions.rename`
- `/panel/$sessionId/_chat` (`panel.$sessionId._chat.tsx`): pathless `ChatPaneRoute`, the chat pane plus its outlet
- `/panel/$sessionId/` (`panel.$sessionId._chat.index.tsx`): chat with the session menu closed; renders nothing
- `/panel/$sessionId/options` (`panel.$sessionId._chat.options.tsx`): chat with the session menu open; renders nothing
- `/panel/$sessionId/$view` (`panel.$sessionId.$view.tsx`): `PanelView`, an extension view plus its outlet
- `/panel/$sessionId/$view/options` (`panel.$sessionId.$view.options.tsx`): the view with the session menu open; renders nothing
- `/panel/$sessionId/settings` (`panel.$sessionId_.settings.tsx`): `SettingsLayout`, outside the session layout; header with a Back to chat button, kit `Tabs` driven by the matched child route (selecting a tab navigates and remembers the tab), top tabs on a narrow panel and a left rail from the `@lg` container size, with the tabs gliding between the two; footer shows the route; the index redirects to the last opened tab
- `/panel/$sessionId/settings/general`, `/views`, `/shortcuts`, `/advanced` (`panel.$sessionId_.settings.<tab>.tsx`): one route per settings tab, each a `PreferencesForm`; Advanced also resets every extension's settings
- `/panel/$sessionId/settings/extensions/$name` (`panel.$sessionId_.settings.extensions.$name.tsx`): the generated settings page of an extension that declares `settings`; its tab sits after Shortcuts with the extension's `icon` (else `Puzzle`)
- `/quick` (`quick.tsx`): quick terminal layer, search `QuickSearchSchema` (`panes`, `focus`)
- `/pip/$sessionId` (`pip.$sessionId.tsx`): `PipSession`, renders the session into a popup window
- `panelHeightCap`, `defaultPanelHeight` (`panel-height.ts`): panel height from viewport, at most 750 px

## Invariants

- `__root.tsx:Route.validateSearch`: `open` is either `true` or absent; a malformed `sessionSearch` or `allProjects` falls back to its default (zod `.catch`), and a digit-only term is coerced back to a string
- `panel.$sessionId.tsx:Route.beforeLoad`: a param that fails `isSessionId` is resolved through `rpc.sessions.resolve` and redirected with `replace: true`
- `panel.$sessionId.$view.tsx:Route.beforeLoad`: an unknown view id redirects to `/panel/$sessionId`
- `panel.$sessionId_.settings.extensions.$name.tsx:Route.beforeLoad`: an unknown extension, or one without `settings`, redirects to `/panel/$sessionId/settings/general` with `replace`
- `__root.tsx:onKeyDown`: Escape on a settings route navigates to the chat route with `replace` and history state `restoreFocus: 'settings'`, which focuses the settings link in the session header and keeps `panel.tsx` from focusing the composer
- the session menu is open exactly when `/panel/$sessionId/options` or `/panel/$sessionId/$view/options` matches by path alone (`matchRoute` with `includeSearch: false`, so a search write from inside the menu, such as `sessionSearch`, never closes it mid-navigation); any navigation off those routes (a session pick, a new session, a view tab, back) closes it, and opening or closing it never remounts the chat pane or the view
- `panel.$sessionId.tsx:useSessionMenu`: opening pushes the `options` child with history state `sessionMenuOpened`; closing an in-app opened menu (that mark and `useCanGoBack()`) goes back one entry, a menu loaded directly on `/options` replaces it with the parent; picking a session while the menu is open (in-app or loaded directly) replaces the `options` entry, and picking the active session closes the menu the same way, so no close leaves a duplicate history entry
- the static `options` segment outranks `$view`, so no extension view can use the id `options`
- `panel.$sessionId.$view.tsx:PanelView`: a locked view blocks leaving it, but not opening or closing its session menu
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
