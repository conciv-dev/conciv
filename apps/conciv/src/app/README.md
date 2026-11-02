# app

## Overview

Solid contexts and hooks for app-wide and per-pane state: app context accessors, pane context and provider, panel chrome and composer focus, engine reachability, live-sessions registry, per-session chat and a warm-session query.

## Interface

- `AppContext`, `AppContextValue` (`context.ts`): app-wide context
- `useRpc`, `useSettings`, `useAppData`, `useEnvironment`, `useAppQueryClient`, `useAnnounce`, `useLayers`, `useInstances`, `useConnected`, `useApiBase`, `useLiveSessions`, `useWarmSession` and further accessors (`context.ts`)
- `makeLiveSessions`, `LiveSessions`, `PaneActivity` (`live-sessions.ts`): registry of mounted panes; `activityIn` returns `unmounted` | `idle` | `running`
- `PaneContext`, `usePane`, `makePendingAttachmentQueue` (`pane-context.ts`): per-session pane context and a File queue
- `PaneProvider` (`pane-provider.tsx`): builds the pane context for a `sessionId` (chat, refresh, grab staging, attachments, `newSession`)
- `PanelChromeContext`, `usePanelChrome` (`panel-chrome.ts`): panel close handle
- `makePanelComposerFocus`, `usePanelComposerFocus` (`panel-focus.ts`): tracks the active composer input
- `EngineReachabilityContext`, `makeEngineReachability`, `useEngineReachability` (`reachability.ts`): `online` and `sustainedOffline` accessors
- `HubShellProvider`, `useHubShell`, `HubShell`, `HubLink`, `CommandPalette` (`devframe-overlays.tsx`): one Devframe client runtime per trusted hub client, the hub's dock list, hub `notify` messages as toasts, and the Mod+K command palette over the hub's palette commands
- `usePaneChat` (`use-pane-chat.ts`): `useChatSession` keyed on session id and connection generation
- `createWarmSession`, `WarmSession` (`warm-session.ts`): resolves the most recently updated session

## Invariants

- `context.ts:useAppScope`: throws `<hook> called outside the app provider` when `AppContext` is missing
- `pane-context.ts:usePane`, `panel-chrome.ts:usePanelChrome`, `reachability.ts:useEngineReachability`: throw when used outside their provider
- `panel-focus.ts:makePanelComposerFocus.release`: clears the handle only if it is still the current one
- `live-sessions.ts:activityIn`: a null id or no registered pane gives `unmounted`; `running` if any registered pane for that id is working
- `warm-session.ts:createWarmSession`: the warm id latches once set; queries run only while `connected()`
- `devframe-overlays.tsx:watchLink`: a new hub client aborts the previous runtime; the runtime starts only after `ensureTrusted(0)` resolves true
- `devframe-overlays.tsx:watchMessages`: the first (full) message delta never toasts; later entries with `notify` toast once per id and level maps to tone (`error` to `danger`, `debug` to `info`)
- `devframe-overlays.tsx:CommandPalette`: commands are read when the palette opens; a failed command shows a danger toast
- `pane-provider.tsx:PaneProvider`: `newSession` calls `props.onNewSession` if given, otherwise creates a session over rpc and navigates to it

## Side Effects

- `pane-provider.tsx:openNewSession`: `rpc.sessions.create`, invalidates the sessions cache, navigates to `/panel/$sessionId`
- `pane-provider.tsx:PaneProvider`: grab staging calls `rpc.page.symbolicate`
- `warm-session.ts:createWarmSession`: queries `sessions.list` and `sessions.resolve`
- `devframe-overlays.tsx`: hub RPC `devframes:plugin:messages:list` on each `messagesUpdated` broadcast, serialized through an `AsyncQueuer`; `Mod+K` hotkey while the panel is open
- `use-pane-chat.ts:usePaneChat`: opens a chat session through `useChatSession` (`@conciv/client`) against `apiBase`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
