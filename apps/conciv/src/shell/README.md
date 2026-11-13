# shell

## Overview

App shell pieces: launcher FAB, notices and toasts, engine stale and unreachable notices, picture-in-picture window, layer stack, effects portal, error and pending screens.

## Interface

- `ShellFab`, `FabRobot` (`fab.tsx`, `fab-robot.tsx`): launcher button controlling `#conciv-chat-panel`; the robot's binary digits avoid the open panel's frame (`avoid`), going around its nearer free side
- `createNoticeStore()`, `NoticeStore`, `Notify`, `NoticeOptions`, `NoticeHandle`, `NoticeIcon`, `NoticeTone` (`notices.tsx`): toaster with `notify` (message, optional description, lucide icon, duration, loading state, one `action` or several `actions`; returns a handle whose `dismiss` removes that notice), `remove`, `Toaster`
- `NoticeContextProvider`, `useNotices`, `NoticeSurface`, `useEngineNotices` (`notice-context.tsx`): one store, provided in `routes/__root.tsx`; the panel, quick terminal and picture-in-picture layouts each draw the surface
- `EngineStaleNotice`, `EngineUnreachableNotice` (`engine-notice.tsx`): standing danger notices driven by `meta.engine` and reachability
- `EngineOutdatedNotice` (`engine-notice.tsx`, mounted in the panel): fetches `${apiBase}/health` once and shows a standing notice naming the widget version and asking to update the @conciv packages to it when the `x-conciv-version` response header is missing or semver-older than the `@conciv/app` version; a newer engine shows nothing
- `openPipWindow(opts)`, `openPipTarget()`, `PipWindow` (`pip.ts`): popup window `conciv-pip` with a shadow root and the app styles
- `makeLayerStack()`, `LayerStack` (`dialogs.ts`): tracks open dialogs and whether any hides the page
- `EffectsSurface({instances})` (`effects-surface.tsx`): portals extension effects into a fixed shadow host on `document.body`
- `ErrorScreen`, `defaultErrorComponent`, `EmptyStateSlot`, `RefreshButton` (`error-screen.tsx`, `default-error-component.tsx`, `empty-state.tsx`, `refresh-button.tsx`)
- `PendingPane`, `SessionPillPending`, `UsagePending`, `ComposerActionsPending` (`pending.tsx`)
- `classifyRpcError(error, transportMessage, genericMessage)` (`rpc-error-message.ts`)
- `rpcErrorCode(error)` (`rpc-error-message.ts`): the string `code` of an rpc error, else null
- `escapeInTerminal(scopeEl)` (`terminal-focus.ts`): true when focus is inside `[data-terminal-screen]`

## Invariants

- `notices.tsx:createNoticeStore`: at most 3 standing toasts (`STANDING_LIMIT`); a toast never expires while `persist` or `loading` is set; otherwise it expires after `duration` when one is given, with or without actions; with no `duration`, a toast with an action stays and one without expires after 6 s (`FUSE_MS`)
- `notices.tsx:createNoticeStore`: a `key` dedupes a notice by toast id
- `notices.tsx:createNoticeStore`: a single action renders inline through Ark's toast `action`; several ride the toast's `meta` and wrap to a row under the text; each runs its action and dismisses the notice
- `notices.tsx:createNoticeStore`: a success notice with no icon shows the lucide `check`; a loading notice shows the kit `Loader` in the icon slot
- `notice-context.tsx:useNotices`: throws outside `NoticeContextProvider`
- `engine-notice.tsx:EngineStaleNotice`: one standing notice per engine `fingerprint`; cleared when the engine reports not stale and when the component unmounts
- `engine-notice.tsx:EngineUnreachableNotice`: shown only while `sustainedOffline()`; Retry re-runs the login check, then calls `resetBrowserRpcConnection` and `router.invalidate()`
- `default-error-component.tsx:defaultErrorComponent`: runs its Retry when it mounts on a refused (`UNAUTHORIZED`) error while the engine already trusts this browser, and on a trust flip from untrusted or revoked to trusted while it is shown
- `rpc-error-message.ts:classifyRpcError`: reachability errors map to the transport message, otherwise the error message or the generic one
- `refresh-button.tsx:RefreshButton`: disabled while a run is in progress or a refresh is running
- `effects-surface.tsx:decorateHost`: the effects host is `position: fixed`, `z-index: 2147483000`, marked `data-conciv-effects`

## Side Effects

- `pip.ts:openPipWindow`: `window.open('', 'conciv-pip', 'width=480,height=620,popup')`, writes the popup document, attaches a shadow root and delegates events to it
- `engine-notice.tsx:EngineStaleNotice`: reads `meta.engine` while connected and again on window refocus and on every reconnect of the engine socket (`refetchOnReconnect: 'always'`), never on a timer; reachability itself comes from the socket's open and close
- `engine-notice.tsx:EngineUnreachableNotice`: Retry re-runs the login check and resets the browser rpc connection
- `effects-surface.tsx:EffectsSurface`: portals a shadow host into `document.body`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
