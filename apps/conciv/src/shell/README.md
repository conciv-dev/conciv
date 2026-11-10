# shell

## Overview

App shell pieces: launcher FAB, notices and toasts, engine stale and unreachable notices, picture-in-picture window, layer stack, effects portal, error and pending screens.

## Interface

- `ShellFab`, `FabRobot` (`fab.tsx`, `fab-robot.tsx`): launcher button controlling `#conciv-chat-panel`; the robot's binary digits avoid the open panel's frame (`avoid`), going around its nearer free side
- `createNoticeStore()`, `NoticeStore`, `Notify`, `NoticeTone` (`notices.tsx`): toaster with `notify`, `remove`, `Toaster`
- `NoticeContextProvider`, `useNotices`, `NoticeSurface`, `useEngineNotices` (`notice-context.tsx`)
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

- `notices.tsx:createNoticeStore`: at most 3 standing toasts (`STANDING_LIMIT`); toasts expire after 6 s (`FUSE_MS`) unless `persist` or an `action` is set
- `notices.tsx:createNoticeStore`: a `key` dedupes a notice by toast id
- `notice-context.tsx:useNotices`: throws outside `NoticeContextProvider`
- `engine-notice.tsx:EngineStaleNotice`: one standing notice per engine `fingerprint`; cleared when the engine reports not stale
- `engine-notice.tsx:EngineUnreachableNotice`: shown only while `sustainedOffline()`; Retry re-runs the login check, then calls `resetBrowserRpcConnection` and `router.invalidate()`
- `default-error-component.tsx:defaultErrorComponent`: runs its Retry when it mounts on a refused (`UNAUTHORIZED`) error while the engine already trusts this browser, and on a trust flip from untrusted or revoked to trusted while it is shown
- `rpc-error-message.ts:classifyRpcError`: reachability errors map to the transport message, otherwise the error message or the generic one
- `refresh-button.tsx:RefreshButton`: disabled while a run is in progress or a refresh is running
- `effects-surface.tsx:decorateHost`: the effects host is `position: fixed`, `z-index: 2147483000`, marked `data-conciv-effects`

## Side Effects

- `pip.ts:openPipWindow`: `window.open('', 'conciv-pip', 'width=480,height=620,popup')`, writes the popup document, attaches a shadow root and delegates events to it
- `engine-notice.tsx:EngineStaleNotice`: polls `meta.engine` with a refetch interval while connected
- `engine-notice.tsx:EngineUnreachableNotice`: Retry re-runs the login check and resets the browser rpc connection
- `effects-surface.tsx:EffectsSurface`: portals a shadow host into `document.body`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
