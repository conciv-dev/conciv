# frontend-defaults/src/app

## Overview

Solid contexts and hooks for app-wide and per-pane state: app context accessors, pane context and provider, panel chrome and composer focus, engine reachability, live-sessions registry, per-session chat and a warm-session query.

## Interface

- `context.ts`: the app context and its accessor hooks.
- `live-sessions.ts`: owns one chat client per session (`useChatSession` keyed on session id and connection generation) and the activity each session shows; a pane is handed the client of its session, never builds one.
- `pane-context.ts`, `pane-provider.tsx`: the per-session pane context (chat, refresh, attachments, `newSession`, `replaceSession`).
- `start-session.ts`: the one new-session action every caller uses; on a failure it logs, shows the danger notice `Could not start a new session. Check that the engine is running, then try again.` and rejects, so each caller only handles success.
- `browser-engine.ts`: `createBrowserEngine`, the engine connection a host hands the shell as `Platform.engine`.
- `engine-login.tsx`, `reachability.ts`: login, trust and engine reachability.
- `panel-chrome.ts`, `panel-focus.ts`: the panel close handle and frame ref, and the active composer input.
- `warm-session.ts`: resolves the most recently updated session.

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
- `warm-session.ts:createWarmSession`: queries the first `sessions.list` page with `limit: 1` (the newest session) and `sessions.resolve`
- `live-sessions.ts:makeLiveSessions`: opens chat sessions through `useChatSession` (`@conciv/client`) against `apiBase`; a terminal run lifecycle (streamed, or hydrated for the watched run) invalidates `sessions.list`, `sessions.search` and, for that session only, `sessions.get` and `markers.list` (`invalidateSession` in `data/app-data.ts`) and, for `completed`, announces the reply, whichever tab or session is showing

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=@internal/frontend-defaults` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
