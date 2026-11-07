# app

## Overview

Solid contexts and hooks for app-wide and per-pane state: app context accessors, pane context and provider, panel chrome and composer focus, engine reachability, live-sessions registry, per-session chat and a warm-session query.

## Interface

- `AppContext`, `AppContextValue` (`context.ts`): app-wide context
- `useRpc`, `useSettings`, `useAppData`, `useEnvironment`, `useAppQueryClient`, `useAnnounce`, `useLayers`, `useInstances`, `useConnected`, `useApiBase`, `useLiveSessions`, `usePaneChat`, `useWarmSession` and further accessors (`context.ts`)
- `makeLiveSessions(deps)`, `LiveSessions`, `PaneActivity` (`live-sessions.ts`): owns one chat client per session (`useChatSession` keyed on session id and connection generation; each chat subscribes to its api base trust and re-hydrates in place when trust flips from untrusted or revoked to trusted); `open(sessionId)` hands a pane that client; `activityIn` returns `unmounted` | `idle` | `running`
- `PaneContext`, `usePane`, `makePendingAttachmentQueue` (`pane-context.ts`): per-session pane context and a File queue
- `PaneProvider` (`pane-provider.tsx`): builds the pane context for a `sessionId` (chat, refresh, grab staging, attachments, `newSession`)
- `PanelChromeContext`, `usePanelChrome` (`panel-chrome.ts`): panel close handle
- `makePanelComposerFocus`, `usePanelComposerFocus` (`panel-focus.ts`): tracks the active composer input
- `EngineReachabilityContext`, `makeEngineReachability`, `useEngineReachability` (`reachability.ts`): `online` and `sustainedOffline` accessors
- `createWarmSession`, `WarmSession` (`warm-session.ts`): resolves the most recently updated session

## Invariants

- `context.ts:useAppScope`: throws `<hook> called outside the app provider` when `AppContext` is missing
- `pane-context.ts:usePane`, `panel-chrome.ts:usePanelChrome`, `reachability.ts:useEngineReachability`: throw when used outside their provider
- `panel-focus.ts:makePanelComposerFocus.release`: clears the handle only if it is still the current one
- `live-sessions.ts:activityIn`: a null id or no live chat gives `unmounted`; `running` if that session's chat has a run in progress
- `live-sessions.ts:makeLiveSessions`: a session's chat stays alive while a pane has it open, while its last run lifecycle (from hydration or the stream) is not terminal, or while its chat still has client-side work (`clientWorking`: status `submitted` or `streaming`, or status `ready` with a queued follow-up about to drain), so a session left mid-turn or right after Send keeps its client until its work settles; a queued message that is removed never holds it
- `live-sessions.ts:clientWorking`: only `status` is tracked and the queue is read untracked; status is already `ready` when the chat splices a queued follow-up off the queue and stays `ready` until that follow-up is delivered, so the instant with an empty queue and an idle status never re-runs the keep rule
- `live-sessions.ts:hydrated`: a terminal `lastRun` settles the run only when it is the run this registry is watching, so a run that ended while the connection was down still settles once a replacement client hydrates, and older terminal runs are ignored
- `warm-session.ts:createWarmSession`: the warm id latches once set; queries run only while `connected()`
- `pane-provider.tsx:PaneProvider`: `newSession` calls `props.onNewSession` if given, otherwise creates a session over rpc and navigates to it

## Side Effects

- `pane-provider.tsx:openNewSession`: `rpc.sessions.create`, invalidates the sessions cache, navigates to `/panel/$sessionId`
- `pane-provider.tsx:PaneProvider`: grab staging calls `rpc.page.symbolicate`
- `warm-session.ts:createWarmSession`: queries the first `sessions.list` page with `limit: 1` (the newest session) and `sessions.resolve`
- `live-sessions.ts:makeLiveSessions`: opens chat sessions through `useChatSession` (`@conciv/client`) against `apiBase`; a terminal run lifecycle (streamed, or hydrated for the watched run) invalidates `sessions.list`, `sessions.get`, `markers.list` and `captures.list` and, for `completed`, announces the reply, whichever tab or session is showing

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
