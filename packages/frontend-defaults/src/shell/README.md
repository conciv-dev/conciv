# shell

## Overview

App shell pieces: launcher FAB, notices and toasts, engine stale and unreachable notices, picture-in-picture window, layer stack, effects portal, error and pending screens.

## Interface

- `ShellFab`, `FabRobot` (`fab.tsx`): launcher button controlling `#conciv-chat-panel`; the robot's binary digits avoid the open panel's frame (`avoid`), going around its nearer free side
- `createNoticeStore()`, `NoticeStore`, `Notify`, `NoticeOptions`, `NoticeHandle`, `NoticeIcon`, `NoticeTone` (`notices.tsx`): toaster with `notify` (message, optional description, lucide icon, duration, loading state, one `action` or several `actions`; returns a handle whose `dismiss` removes that notice), `remove`, `Toaster`
- `NoticeContextProvider`, `useNotices`, `NoticeSurface`, `useEngineNotices` (`notice-context.tsx`): one store, provided in `routes/__root.tsx`; the panel, quick terminal and picture-in-picture layouts each draw the surface, and a standing notice a layout raises is removed when that layout unmounts
- `EngineStaleNotice`, `EngineUnreachableNotice` (`engine-notice.tsx`): standing danger notices driven by `meta.engine` and reachability
- `lockedMessage(locked)` (`engine-lock-messages.ts`): the locked notice's sentence for an `EngineLock` (`null` when not locked), also the pane's send refusal and disabled Send label while locked; `EngineLockedNotice` shows while `useEngineReachability().locked()` is not `null`
- `EngineOutdatedNotice` (`engine-notice.tsx`, mounted in the panel): reads the engine connection's `version()` (the real connection fetches `${apiBase}/health`) once the engine is connected (a same-origin engine, `apiBase` `''`, included) and shows a standing notice naming the widget version and asking to update the @conciv packages to it when the `x-conciv-version` response header is missing or semver-older than the `@conciv/app` version; a newer engine shows nothing; the query (`engineVersionQueryOptions`) and the version check (`engineOlderThanWidget`) are exported so the plugin host's engine server reads the same cached health response
- `openPipWindow(opts)`, `openPipTarget()`, `PipWindow` (`pip.ts`): popup window `conciv-pip` with a shadow root that adopts a widget sheet made for the popup's document with `createStyleSheet(widgetStyles, win.document)` and held only by that window
- `makeLayerStack()`, `LayerStack` (`dialogs.ts`): tracks open dialogs and whether any hides the page
- `createPluginTabs`, `PluginPanelKeys`, `PluginOverlay`, `PluginWindowBottom`, `PluginSession`, `PluginRegion`, `PluginTabContent` (`plugin-surfaces.tsx`): where the routes draw the plugin host: route-backed panel tabs and their status bar entries, the `$view` guard's panel key lookup, the `page.overlay` slot (inside an Ark `FocusTrap` while an overlay that hides the widget is open, which gives focus back on close) and the `window.bottom` slot, the mounted session of the quick and picture-in-picture panes, and the pane region with its tab content
- `ErrorScreen`, `defaultErrorComponent`, `EmptyState`, `RefreshButton` (`error-screen.tsx`, `router.tsx`, `pane/chat-pane.tsx`, `refresh-button.tsx`)
- `PendingPane`, `SessionPillPending`, `UsagePending`, `ComposerActionsPending` (`pending.tsx`)
- `classifyRpcError(error, transportMessage, genericMessage)` (`rpc-error-message.ts`)
- `rpcErrorCode(error)` (`rpc-error-message.ts`): the string `code` of an rpc error, else null
- `SESSION_NOT_FOUND_MESSAGE` (`rpc-error-message.ts`): the sentence `This session no longer exists.` that any `NOT_FOUND` answer for a session shows (model switch, compaction)
- `escapeInTerminal(scopeEl)` (`routes/__root.tsx`): true when focus is inside `[data-terminal-screen]`

## Invariants

- `notices.tsx:createNoticeStore`: at most 3 standing toasts (`STANDING_LIMIT`); a toast never expires while `persist` or `loading` is set; otherwise it expires after `duration` when one is given, with or without actions; with no `duration`, a toast with an action stays and one without expires after 6 s (`FUSE_MS`)
- `notices.tsx:createNoticeStore`: a `key` dedupes a notice by toast id
- `notices.tsx:createNoticeStore`: a single action renders inline through Ark's toast `action`; several ride the toast's `meta` and wrap to a row under the text; each runs its action and dismisses the notice
- `notices.tsx:createNoticeStore`: a success notice with no icon shows the lucide `check`; a loading notice shows the kit `Loader` in the icon slot
- `notice-context.tsx:useNotices`: throws outside `NoticeContextProvider`
- `engine-notice.tsx:EngineStaleNotice`: one standing notice per engine `fingerprint`; cleared when the engine reports not stale and when the component unmounts
- `engine-notice.tsx:EngineUnreachableNotice`: shown only while `sustainedOffline()`, and removed when the component unmounts; Retry calls the connection's `reset()` at once, then re-runs the login check and `router.invalidate()`
- `router.tsx:defaultErrorComponent`: runs its Retry when it mounts on a refused (`UNAUTHORIZED`) error while the engine already trusts this browser, and on a trust flip from untrusted or revoked to trusted while it is shown
- `rpc-error-message.ts:classifyRpcError`: reachability errors map to the transport message, otherwise the error message or the generic one
- `refresh-button.tsx:RefreshButton`: disabled while a run is in progress or a refresh is running

## Side Effects

- `pip.ts:openPipWindow`: `window.open('', 'conciv-pip', 'width=480,height=620,popup')`, writes the popup document, attaches a shadow root and delegates events to it
- `engine-notice.tsx:EngineStaleNotice`: reads `meta.engine` while connected and again on window refocus and on every reconnect of the engine socket (`refetchOnReconnect: 'always'`), never on a timer; reachability itself comes from the socket's open and close
- `engine-notice.tsx:EngineUnreachableNotice`: Retry re-runs the login check and resets the browser rpc connection

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=@conciv/app` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
