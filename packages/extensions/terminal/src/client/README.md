# terminal/src/client

## Overview

`TerminalPanelView` remounts a `TerminalSurface` whenever the session changes or `respawnTick` is bumped. On a respawn it closes the old server pty first. `TerminalSurface` builds a `createTerminalModel` whose `beforeConnect` calls RPC `open`, then connects to the `tty` WebSocket. It also handles Escape-to-interrupt, focus restoration, theme tokens, and pasting staged grabs on Enter. `TerminalActions` provides element grab, a model selector (persisted in localStorage), and a new-session button.

## Interface

- `TerminalPanelView` (`terminal-panel-view.tsx`): the view component; keys `TerminalSurface` on `openKey` and respawns when the session or `store.respawnTick` changes
- `TerminalActions` (`terminal-actions.tsx`): toolbar with grab, a `ModelSelector` over the models query, and 'Start a new session'
- `useTerminalModels` (`terminal-models.ts`): `useQuery` over `meta.models` with the widget's oRPC query key, so the terminal and the composer share one cached read; returns the query, its model `list`, the validated `spawnModel`, and `choose(id)`
- `createTerminalStore` / `TerminalStore` (`terminal-store.ts`): signals `spawnModel` (the picked model id), `respawnTick`/`bumpRespawn`, `busy`, `respawning`
- `useTerminalContext` (`terminal-context.ts`): `getExtensionApi(TERMINAL_NAME).useContext`
- `terminalClient(apiBase)` (`rpc.ts`): `makeExtRpcClient<TerminalRouter>(apiBase, TERMINAL_NAME)`
- `terminalUrl(apiBase, path)` (`rpc.ts`): returns `${apiBase}/api/ext/terminal/${path}`

## Invariants

- `wsUrl` throws if `sessionId` is null, and rewrites the protocol to `wss:`/`ws:` to match the page scheme (`terminal-panel-view.tsx`)
- `openTerminal` throws 'Couldn’t open the terminal.' when there is no session id; an ORPC `BUSY` error maps to 'Session is busy...' (`terminal-panel-view.tsx`)
- The Escape keydown is captured and turned into an ESC byte only while `model.busy()` is true (`terminal-panel-view.tsx`)
- Plain Enter (no modifiers) pastes the staged grabs, sends a carriage return, and swallows the key; when nothing is staged it passes through (`terminal-panel-view.tsx`)
- The `respawning.current` guard prevents concurrent respawns, and the effect skips the first run (`prev !== undefined`) (`terminal-panel-view.tsx`)
- `pickModel` ignores the choice while busy or when it equals the current model (`terminal-actions.tsx`)
- The spawn model is the picked id, else the stored one, and only while it appears in the server's model list; otherwise it is null (`terminal-models.ts`)

## Side Effects

- `TerminalSurface` (`terminal-panel-view.tsx`) opens a WebSocket to the `tty` endpoint and calls RPC `open`; `respawn` calls RPC `close`
- `TerminalSurface` (`terminal-panel-view.tsx`) adds a capture-phase `keydown` listener on the window and a `focusout` listener on the root node, and calls `setViewLocked`/`store.setBusy` from `model.busy()`
- `readStoredModel`/`writeStoredModel` (`terminal-models.ts`) read and write localStorage key `conciv-model`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-terminal` from the repo root (turbo builds the package and its dependencies first)
