# routes

## Overview

TanStack Solid file routes; the route is the layout: closed, panel, per-session panel and plugin panel tabs, connect, quick terminal and picture-in-picture.

## Interface

- root `Route` (`__root.tsx`): `createRootRouteWithContext<ConcivRouterContext>()`, search `sessionPickerSearchSchema` (`lib/session-search-schemas.ts`): `open?: true`, `sessionSearch` (the picker's search term, `''` by default) and `allProjects` (`false` by default), all retained across navigations and the defaults stripped from the URL; renders the outlet, `ShellFab` and polite/assertive live regions
- `/` (`index.tsx`): `Closed` component, the panel is closed
- `/panel` (`panel.tsx`): `PanelLayout`; reads only `open` from the search (a `select`), so a picker term or switch written to the URL never reruns the open-panel composer focus
- `/panel/latest` (`panel.latest.tsx`): resolves the latest session through `rpc.sessions.resolve({})` and redirects
- `/panel/connect` (`panel.connect.tsx`): `ConnectRoute`; binds an api base the connect flow found, then opens the session
- `/panel/$sessionId` (`panel.$sessionId.tsx`): `PanelSession`, search `{popOut?: 'lost'}`; its loader waits on `sessions.get` (`queryClient.query` with `staleTime: 'static'`, which returns a cached row without fetching and makes one attempt with no retry, so a seeded row draws at once and a deep link waits behind the pending pane; a failed load is logged and falls through to the component's own query, which retries with the defaults while the chat is already usable and the title shows its loading state), and the status bar counts the session as having run when that row's `lastRunAt` is set or a run is live, so a session that never ran shows no status chip and no task in the header; when `sessions.get` fails, once that query settles as an error the header shows `Couldn’t load this session` with Retry (`PaneAlert`, which refetches `sessions.get`) on the title line, beside a title that reads `Session`, the title button reads `This session could not be loaded, session options` and still opens the session menu, and the chat below keeps working; clicking the header title (or Enter/Space on it) opens the session menu (`Popover`: open while an `options` child route matches; Ark's open/close requests navigate to or from that child, Ark owns focus, Escape and outside click, and returns focus to the title) hosting `SessionSelector`, context and refresh/pop-out rows, and a pencil (`Editable`) renames in place through `rpc.sessions.rename`
- `/panel/$sessionId/_chat` (`panel.$sessionId._chat.tsx`): pathless `ChatPaneRoute`, the chat pane plus its outlet
- `/panel/$sessionId/` (`panel.$sessionId._chat.index.tsx`): chat with the session menu closed; renders nothing
- `/panel/$sessionId/options` (`panel.$sessionId._chat.options.tsx`): chat with the session menu open; renders nothing
- `/panel/$sessionId/$view` (`panel.$sessionId.$view.tsx`): `PanelView`, the routed plugin panel tab (`PluginTabContent`) plus its outlet
- `/panel/$sessionId/$view/options` (`panel.$sessionId.$view.options.tsx`): the view with the session menu open; renders nothing
- `/panel/$sessionId/settings` (`panel.$sessionId_.settings.tsx`): `SettingsLayout`, outside the session layout; header with a Back to chat button, kit `Tabs` driven by the matched child route (matched by path only, `includeSearch: false`, so a scope flip never unselects the open tab mid-navigation) (selecting a tab navigates), a left rail at every width (Ark `orientation` vertical), Advanced pinned to its bottom; the tab body wraps the outlet in a page keyed on the open tab that carries the `anim-rise` entrance, so it plays when a tab opens and not when the scope flips; footer shows the route; the index redirects to the last opened tab; search `settingsSearchSchema` (`settings/settings-search-schemas.ts`): `scope` (`project` by default, stripped from the URL; `global`), retained across tab navigations, chosen by the kit `Switch` labelled `All projects` (off: `project`) in the non-scrolling header (navigates to the current location with the new `scope`)
- `/panel/$sessionId/settings/general`, `/shortcuts`, `/advanced` (`panel.$sessionId_.settings.<tab>.tsx`): one route per settings tab, each a `PreferencesForm`; each remembers itself as the last tab in `onEnter`; every reset acts on the selected scope
- `/panel/$sessionId/settings/advanced/reset` (`panel.$sessionId_.settings.advanced.reset.tsx`): the Reset all confirmation, kit `ConfirmDialog` open while the route matches (focus on Cancel); closing it in any way navigates back to `/advanced` with `replace`, Confirm clears every key stored in the selected scope (its description names it) and announces the result
- `/panel/$sessionId/settings/plugins` (`panel.$sessionId_.settings.plugins.tsx`): a layout route (its outlet only) that remembers `plugins` as the last tab in `onEnter`, so its children (the installed list, and later a plugin's own settings page beside it) count as that tab; its index `/panel/$sessionId/settings/plugins/` (`panel.$sessionId_.settings.plugins.index.tsx`) is the installed plugins: opencode's `ExtensionPlugins` view (`runtime/plugin/extension-plugins.tsx`) over the engine's `plugin.list` (a solid-query read through the app's query utils, enabled while connected), one row per plugin with its Reload and enable switch acting through the plugin context's `usePluginManager()`; the index route alone reads that list, and the settings layout invalidates it (by its query key, without reading it) on the plugin context's `usePluginListChange` notice, so it is fresh whichever settings page is open; the `Plugins` tab (lucide `Box`, after Shortcuts) is always present, as opencode's, and is selected on the layout path
- `/quick` (`quick.tsx`): quick terminal layer, search `QuickSearchSchema` (`panes`, `focus`)
- `/pip/$sessionId` (`pip.$sessionId.tsx`): `PipSession`, renders the session into a popup window
- `panelHeightCap`, `defaultPanelHeight` (`panel.tsx`): panel height from viewport, at most 750 px

## Invariants

- `__root.tsx:Route.validateSearch`: `open` is either `true` or absent; a malformed `sessionSearch` or `allProjects` falls back to its default (zod `.catch`), and a digit-only term is coerced back to a string
- `panel.$sessionId.tsx:Route.beforeLoad`: every param is resolved through `sessions.resolve` (the query `warm-session.ts` shares), which recreates a session id whose row the engine swept; a param that resolves to another id redirects with `replace: true`, and a `NOT_FOUND` (a deleted session, which stays deleted) redirects to `/panel/latest`
- `panel.$sessionId.$view.tsx:Route.beforeLoad`: an unknown view id redirects to `/panel/$sessionId`
- `__root.tsx:onKeyDown`: Escape on a settings route navigates to the chat route with `replace` and history state `restoreFocus: 'settings'`, which focuses the settings link in the session header and keeps `panel.tsx` from focusing the composer
- the session menu is open exactly when `/panel/$sessionId/options` or `/panel/$sessionId/$view/options` matches by path alone (`matchRoute` with `includeSearch: false`, so a search write from inside the menu, such as `sessionSearch`, never closes it mid-navigation); any navigation off those routes (a session pick, a new session, a view tab, back) closes it, and opening or closing it never remounts the chat pane or the view
- `panel.$sessionId.tsx:useSessionMenu`: opening pushes the `options` child with history state `sessionMenuOpened`; closing an in-app opened menu (that mark and `useCanGoBack()`) goes back one entry, a menu loaded directly on `/options` replaces it with the parent; picking a session while the menu is open (in-app or loaded directly) replaces the `options` entry, and picking the active session closes the menu the same way, so no close leaves a duplicate history entry
- the static `options` segment outranks `$view`, so no plugin panel key can be `options` (a panel key always holds a `:`)
- `panel.$sessionId.$view.tsx:PanelView`: a locked view blocks leaving it, but not opening or closing its session menu
- `quick.tsx:Route.beforeLoad`: redirects to `/` when `settings.quickTerminal.enabled` is false
- `quick.tsx`: each pane's `PaneProvider` gets `onReplaceSession`, so a deleted pane's `New session` swaps that pane's id in `panes` at the same index (order kept, focus on it) instead of leaving for `/panel`; every new session (Split pane, `Mod+D`, the session menu, the panel and view routes) starts through `useStartSession`, so a failed create shows its danger notice; in the empty quick state a fresh pane is created with `appData.createSession()` directly, so a failed one shows only `conciv could not start a pane` with its `Retry`
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

- Run: `pnpm exec turbo run typecheck test --filter=@conciv/app` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
