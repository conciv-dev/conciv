# frontend-defaults/src/shell

## Overview

App shell pieces: launcher FAB, notices and toasts, engine stale and unreachable notices, picture-in-picture window, layer stack, effects portal, error and pending screens.

## Interface

- `fab.tsx`: the launcher button controlling `#conciv-chat-panel`; the robot's binary digits avoid the open panel's frame.
- `notices.tsx`, `notice-context.tsx`: the one notice store, provided in `routes/__root.tsx`; the panel, quick terminal and picture-in-picture layouts each draw the surface, and a standing notice a layout raises is removed when that layout unmounts.
- `engine-notice.tsx`, `engine-lock-messages.ts`: the standing engine notices (stale, unreachable, locked, outdated) and the locked notice's sentence, also the pane's send refusal and disabled Send label while locked. The outdated notice reads the connection's `version()` (the `x-conciv-version` header of `${apiBase}/health`, `packages/client/src/engine-connection.ts:547`) and asks to update the @conciv packages when it is missing or semver-older than the widget.
- `pip.ts`: the picture-in-picture popup, with a shadow root that adopts a widget sheet made for the popup's own document.
- `plugin-surfaces.tsx`: where the routes draw the plugin host: route-backed panel tabs and their status bar entries, the `page.overlay` slot (inside an Ark `FocusTrap` while an overlay that hides the widget is open) and the `window.bottom` slot.
- `error-screen.tsx`, `pending.tsx`, `refresh-button.tsx`, `rpc-error-message.ts`: error, empty and pending screens, and the rpc error sentences (`SESSION_NOT_FOUND_MESSAGE` is `This session no longer exists.`).
- The layer stack lives in `@internal/frontend-app-api/lib/layers`.

## Invariants

- `notices.tsx:createNoticeStore`: at most 3 standing toasts (`STANDING_LIMIT`); a toast never expires while `persist` or `loading` is set; otherwise it expires after `duration` when one is given, with or without actions; with no `duration`, a toast with an action stays and one without expires after 6 s (`FUSE_MS`)
- `notices.tsx:createNoticeStore`: a `key` dedupes a notice by toast id
- `notices.tsx:createNoticeStore`: a single action renders inline through Ark's toast `action`; several ride the toast's `meta` and wrap to a row under the text; each runs its action and dismisses the notice
- `notices.tsx:createNoticeStore`: a success notice with no icon shows the lucide `check`; a loading notice shows the kit `Loader` in the icon slot
- `notice-context.tsx:useNotices`: throws outside `NoticeContextProvider`
- `engine-notice.tsx:EngineStaleNotice`: one standing notice per engine `fingerprint`; cleared when the engine reports not stale and when the component unmounts
- `engine-notice.tsx:EngineUnreachableNotice`: shown only while `sustainedOffline()`, and removed when the component unmounts; Retry calls the connection's `reset()` at once, then re-runs the login check and `router.invalidate()`
- `../router.tsx:defaultErrorComponent`: runs its Retry when it mounts on a refused (`UNAUTHORIZED`) error while the engine already trusts this browser, and on a trust flip from untrusted or revoked to trusted while it is shown
- `rpc-error-message.ts:classifyRpcError`: reachability errors map to the transport message, otherwise the error message or the generic one
- `refresh-button.tsx:RefreshButton`: disabled while a run is in progress or a refresh is running

## Side Effects

- `pip.ts:openPipWindow`: `window.open('', 'conciv-pip', 'width=480,height=620,popup')`, writes the popup document, attaches a shadow root and delegates events to it
- `engine-notice.tsx:EngineStaleNotice`: reads `meta.engine` while connected and again on window refocus and on every reconnect of the engine socket (`refetchOnReconnect: 'always'`), never on a timer; reachability itself comes from the socket's open and close
- `engine-notice.tsx:EngineUnreachableNotice`: Retry re-runs the login check and resets the browser rpc connection

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=@internal/frontend-defaults` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
