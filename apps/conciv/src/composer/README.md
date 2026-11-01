# composer

## Overview

Composer toolbar: element grab, new session, compact and terminal launch actions, a per-session model selector, a session combobox, and a typed rpc client for the terminal extension.

## Interface

- `ComposerActions` (`actions.tsx`): grab element, new session, compact, `LaunchMenu`, `SessionModelSelector`
- `LaunchMenu` (`launch-menu.tsx`): `Open in <harness>`, `Copy command`, or a retry item when failed
- `ModelSelectorView` (`model-selector.tsx`): presentational model picker with groups, search and effort
- `SessionModelSelector` (`model-selector.tsx`): switches a session's model through `rpc.sessions.model`
- `SessionSelector` (`session-selector.tsx`): session combobox (`pill` | `bar`) with Today/Yesterday/Earlier groups, search, rename, new session
- `terminalRpc`, `TerminalRpc` (`terminal-rpc.ts`): `makeExtRpcClient<TerminalRouter>(resolveApiBase(), 'terminal')`

## Invariants

- `actions.tsx:ComposerActions`: `LaunchMenu` renders only while meta is loading or `meta.data.harness.canLaunch` is true; the grab button is disabled when `grab.grabbable()` is false
- `actions.tsx:openExternal`: tries `terminal.launch`; on `ok: false` falls back to `terminal.connectCommand` and copies the command
- `actions.tsx:launchFailure`: error code `NO_CONNECT` maps to `<harness> can’t be opened in a terminal.`
- `model-selector.tsx:SessionModelSelector`: selecting a disabled model does nothing; shown value falls back session model, then `meta.defaultModel`, then null
- `session-selector.tsx:commitRename`: no rename when the trimmed draft is empty or unchanged
- `session-selector.tsx:select`: selecting the active id or an empty id does nothing

## Side Effects

- `actions.tsx:openExternal`, `copyConnect`: terminal extension rpc `launch` and `connectCommand`
- `actions.tsx:copyCommand`: writes the clipboard through `writeClipboardText`
- `model-selector.tsx:SessionModelSelector`: `rpc.sessions.model` mutation, invalidates sessions, announces the change
- `session-selector.tsx:SessionSelector`: `rpc.sessions.rename` mutation, `sessions.list` query, module-level `instanceSeq` counter

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
