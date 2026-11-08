# routes

## Overview

TanStack Solid file routes; the route is the layout: closed, panel, per-session panel and extension views, connect, quick terminal and picture-in-picture.

## Interface

- root `Route` (`__root.tsx`): `createRootRouteWithContext<ConcivRouterContext>()`, search `{open?: true}` retained across navigations; renders the outlet, `ShellFab` and polite/assertive live regions
- `/` (`index.tsx`): `Closed` component, the panel is closed
- `/panel` (`panel.tsx`): `PanelLayout`
- `/panel/latest` (`panel.latest.tsx`): resolves the latest session through `rpc.sessions.resolve({})` and redirects
- `/panel/connect` (`panel.connect.tsx`): `ConnectRoute`; binds an api base found by the `connect` extension slot, then opens the session
- `/panel/$sessionId` (`panel.$sessionId.tsx`): `PanelSession`, search `{popOut?: 'lost'}`; reads its session through `sessions.get`; clicking the header title (or Enter/Space on it) opens the session menu (`Popover`: open while an `options` child route matches; Ark's open/close requests navigate to or from that child, Ark owns focus, Escape and outside click, and returns focus to the title) hosting `SessionSelector`, context and refresh/pop-out/disconnect rows, and a pencil (`Editable`) renames in place through `rpc.sessions.rename`
- `/panel/$sessionId/_chat` (`panel.$sessionId._chat.tsx`): pathless `ChatPaneRoute`, the chat pane plus its outlet
- `/panel/$sessionId/` (`panel.$sessionId._chat.index.tsx`): chat with the session menu closed; renders nothing
- `/panel/$sessionId/options` (`panel.$sessionId._chat.options.tsx`): chat with the session menu open; renders nothing
- `/panel/$sessionId/$view` (`panel.$sessionId.$view.tsx`): `PanelView`, an extension view plus its outlet
- `/panel/$sessionId/$view/options` (`panel.$sessionId.$view.options.tsx`): the view with the session menu open; renders nothing
- `/quick` (`quick.tsx`): quick terminal layer, search `QuickSearchSchema` (`panes`, `focus`)
- `/pip/$sessionId` (`pip.$sessionId.tsx`): `PipSession`, renders the session into a popup window
- `panelHeightCap`, `defaultPanelHeight` (`panel-height.ts`): panel height from viewport, at most 750 px

## Invariants

- `__root.tsx:Route.validateSearch`: `open` is either `true` or absent
- `panel.$sessionId.tsx:Route.beforeLoad`: a param that fails `isSessionId` is resolved through `rpc.sessions.resolve` and redirected with `replace: true`
- `panel.$sessionId.$view.tsx:Route.beforeLoad`: an unknown view id redirects to `/panel/$sessionId`
- the session menu is open exactly when `/panel/$sessionId/options` or `/panel/$sessionId/$view/options` matches; any navigation off those routes (a session pick, a new session, a view tab, back) closes it, and opening or closing it never remounts the chat pane or the view
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
