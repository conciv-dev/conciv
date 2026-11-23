# app

## Overview

Solid contexts and hooks for app-wide and per-pane state: app context accessors, pane context and provider, panel chrome and composer focus, engine reachability, live-sessions registry, per-session chat and a warm-session query.

## Interface

- `AppContext`, `AppContextValue` (`context.ts`): app-wide context
- `useRpc`, `useSettings`, `useAppData`, `useEnvironment`, `useAppQueryClient`, `useAnnounce`, `useLayers`, `useConnected`, `useApiBase`, `useLiveSessions`, `usePaneChat`, `useWarmSession` and further accessors (`context.ts`)
- `makeLiveSessions(deps)`, `LiveSessions`, `PaneActivity` (`live-sessions.ts`): owns one chat client per session (`useChatSession` keyed on session id and connection generation; each chat subscribes to its api base trust and, when trust flips from untrusted or revoked to trusted, rebuilds the chat the way `reopen` does if its load had failed, else re-hydrates in place); `open(sessionId)` hands a pane that client; `reopen(sessionId)` retires that client and builds a fresh one, so the library's mount load runs again and joins a run still in flight; `activityIn` returns `unmounted` | `idle` | `running`; `waitingIn` is true while that session's chat has a pending approval; `receiveDraftReturns(sessionId, {queue, steered})` registers the mounted pane's two sinks, and `returnSteered(sessionId, item)` puts a refused Steer back through `steered`, or through `draftCacheSink` with `prependDraft` when no pane of that session is mounted; the `queue` sink lets the mounted pane take that session's queue when the chat stream fails: the library calls `onError` while its queue is still full and drops it only afterwards (`@tanstack/ai-client` `chat-client.js` `reportStreamError`, then `flushQueue` in `streamResponse`'s `finally`), so the session's `onError` hands the queue to `returnQueueToDraft` with the pane's sink, or with `draftCacheSink` when no pane of that session is mounted. The pane registers from inside its composer's `Suspense` boundary (`chat-pane.tsx` `DraftReturnReceiver`, beside `DraftRestore`), so it registers only once the composer input is mounted; until then the queue goes to `draftCacheSink`, and the composer reads that draft from the cache when it mounts. Not covered: an `AbortError` raised by the transport rather than by Stop makes the library call `stop()` and drop the queue without `onError` (`chat-client.js` around `:1683-1689`), so that queue is still lost. On the rejoin path (a run joined at mount) the library would keep the queue after a failure; it comes back to the composer there too, and leaves the queue
- `PaneContext`, `usePane`, `makePendingAttachmentQueue` (`pane-context.ts`): per-session pane context and a File queue
- `PaneProvider` (`pane-provider.tsx`): builds the pane context for a `sessionId` (chat, refresh, grab staging, attachments, `newSession`, `replaceSession`)
- `useStartSession` (`start-session.ts`): the one new-session action every caller uses (the deleted panel, the panel and view routes, `PaneProvider`, the quick terminal split); it creates a session and, when that fails, logs it, shows the danger notice `Could not start a new session. Check that the engine is running, then try again.` and rejects, so each caller only handles success
- `PanelChromeContext`, `usePanelChrome` (`panel-chrome.ts`): panel close handle and the `frame` ref the panel hands to the root, which measures it for the launcher robot
- `makePanelComposerFocus`, `usePanelComposerFocus` (`panel-focus.ts`): tracks the active composer input
- `EngineReachabilityContext`, `makeEngineReachability(apiBase, timings?)`, `useEngineReachability` (`reachability.ts`): `online`, `sustainedOffline` and `locked` accessors; `locked` is `engineLock(status)` over its own `createEngineLogin({apiBase, timings})` on the same connection, released with the owner
- `createWarmSession`, `WarmSession` (`warm-session.ts`): resolves the most recently updated session

## Invariants

- `context.ts:useAppScope`: throws `<hook> called outside the app provider` when `AppContext` is missing
- `pane-context.ts:usePane`, `panel-chrome.ts:usePanelChrome`, `reachability.ts:useEngineReachability`: throw when used outside their provider
- `panel-focus.ts:makePanelComposerFocus.release`: clears the handle only if it is still the current one
- `live-sessions.ts:activityIn`: a null id or no live chat gives `unmounted`; `running` if that session's chat has a run in progress
- `live-sessions.ts:makeLiveSessions`: the active session's chat (`deps.active`) is always alive, so an approval asked while the panel is closed still reaches the launcher; any other session's chat stays alive while a pane has it open, while its last run lifecycle (from hydration or the stream) is not terminal, or while its chat still has client-side work (`clientWorking`: status `submitted` or `streaming`, or status `ready` with a queued follow-up about to drain), so a session left mid-turn or right after Send keeps its client until its work settles; a queued message that is removed never holds it
- `live-sessions.ts:clientWorking`: only `status` is tracked and the queue is read untracked; status is already `ready` when the chat splices a queued follow-up off the queue and stays `ready` until that follow-up is delivered, so the instant with an empty queue and an idle status never re-runs the keep rule
- `live-sessions.ts:hydrated`: a terminal `lastRun` settles the run only when it is the run this registry is watching, so a run that ended while the connection was down still settles once a replacement client hydrates, and older terminal runs are ignored
- `warm-session.ts:createWarmSession`: the warm id latches once set; queries run only while `connected()`
- `pane-provider.tsx:PaneProvider`: `newSession` calls `props.onNewSession` if given, otherwise creates a session over rpc and navigates to it
- `pane-provider.tsx:PaneProvider`: `replaceSession(sessionId)` calls `props.onReplaceSession` if given (the quick terminal swaps that pane's id in place), otherwise navigates to `/panel/$sessionId`; `replaceSession` is required on every pane context, and the panel route's own pane context navigates to `/panel/$sessionId` with it

## Side Effects

- `pane-provider.tsx:openNewSession`: `rpc.sessions.create` through `useStartSession`, invalidates the sessions cache, navigates to `/panel/$sessionId`
- `start-session.ts:useStartSession`: on a failed create, `console.error` and a danger notice
- `pane-provider.tsx:PaneProvider`: grab staging calls the page plugin's `symbolicate` through `rpc.plugin.call`
- `warm-session.ts:createWarmSession`: queries the first `sessions.list` page with `limit: 1` (the newest session) and `sessions.resolve`
- `live-sessions.ts:makeLiveSessions`: opens chat sessions through `useChatSession` (`@conciv/client`) against `apiBase`; a terminal run lifecycle (streamed, or hydrated for the watched run) invalidates `sessions.list`, `sessions.search` and, for that session only, `sessions.get`, `markers.list` and the page plugin's `captures.list` (`plugin.call` to `experimental.page`, `sessionCapturesCall` in `data/app-data.ts`) and, for `completed`, announces the reply, whichever tab or session is showing

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
