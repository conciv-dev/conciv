# terminal/src/client

## Overview

`TerminalPanelView` remounts a `TerminalSurface` whenever the session changes or `respawnTick` is bumped. On a respawn it closes the old server pty first. `TerminalSurface` builds a `createTerminalModel` whose `beforeConnect` calls RPC `open`, then connects to the `tty` WebSocket. It also handles Escape-to-interrupt, focus restoration, theme tokens, and pasting staged grabs on Enter. `TerminalActions` provides element grab, a model selector (persisted in localStorage), a new-session button, and an open-externally action that falls back to copying the connect command.

## Interface

- `TerminalPanelView` (`terminal-panel-view.tsx`): the view component; keys `TerminalSurface` on `openKey` and respawns when the session or `store.respawnTick` changes
- `TerminalActions` (`terminal-actions.tsx`): toolbar with grab, a `ModelSelector` over `rpc.meta.models`, 'Start a new session', and 'Open externally'
- `createTerminalStore` / `TerminalStore` (`terminal-store.ts`): signals `spawnModel`, `respawnTick`/`bumpRespawn`, `busy`, `respawning`
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
- A stored model is kept only if it appears in the server's model list; otherwise `spawnModel` is set to null (`terminal-actions.tsx`)
- The `opening()` guard prevents concurrent `openExternally` calls; an ORPC `NO_CONNECT` error maps to a specific toast (`terminal-actions.tsx`)
- `launch` falls back to `connectCommand` plus a clipboard copy when `launch` returns `ok:false` (`terminal-actions.tsx`)

## Side Effects

- `TerminalSurface` (`terminal-panel-view.tsx`) opens a WebSocket to the `tty` endpoint and calls RPC `open`; `respawn` calls RPC `close`
- `TerminalSurface` (`terminal-panel-view.tsx`) adds a capture-phase `keydown` listener on the window and a `focusout` listener on the root node, and calls `setViewLocked`/`store.setBusy` from `model.busy()`
- `readStoredModel`/`writeStoredModel` (`terminal-actions.tsx`) read and write localStorage key `conciv-model`
- `copyCommand` (`terminal-actions.tsx`) writes to the clipboard via `writeClipboardText`; `launch` calls RPCs `launch` and `connectCommand`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-terminal` from the repo root (turbo builds the package and its dependencies first)
