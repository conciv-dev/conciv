# composer

## Overview

Composer toolbar: element grab, new session, compact and terminal launch actions, a per-session harness switcher and model selector, a session combobox, and a typed rpc client for the terminal extension.

## Interface

- `LaunchMenu` (`launch-menu.tsx`): `Open in <harness>`, `Copy command`, or a retry item when failed
- `useModelMenu(onClose)`, `SessionModelPrompt({sessionId, menu})` (`model-selector.tsx`): the model menu machine (`useMenu` from ui-kit-system, so the pane can open it for `/model`; `onClose` runs whenever it closes) and the composer prompt (`opus 5.5 · high ❯`) that renders it through `Menu.RootProvider`: one radio row per model of the first group, later groups as submenus, and below a separator an `Effort` row of `menuitemradio` segments (`default`, then the current model's `efforts`; `medium` reads `med`)
- `ComposerActions` (`actions.tsx`): grab element, new session, compact, `LaunchMenu`, `SessionHarnessSwitcher`
- `SessionHarnessSwitcher` (`model-selector.tsx`): overflow items `Harness: <name>` that switch a session's harness through `rpc.sessions.switchHarness`
- `SessionSelector` (`session-selector.tsx`): session combobox (`pill` | `bar`) with Today/Yesterday/Earlier groups, search, rename, new session
- `terminalRpc`, `TerminalRpc` (`terminal-rpc.ts`): `makeExtRpcClient<TerminalRouter>(resolveApiBase(), 'terminal')`

## Invariants

- `actions.tsx:ComposerActions`: `LaunchMenu` renders only while meta is loading or `meta.data.harness.canLaunch` is true; the grab button is disabled when `grab.grabbable()` is false
- `actions.tsx:openExternal`: tries `terminal.launch`; on `ok: false` falls back to `terminal.connectCommand` and copies the command
- `actions.tsx:launchFailure`: error code `NO_CONNECT` maps to `<harness> can’t be opened in a terminal.`
- `model-selector.tsx:SessionModelPrompt`: shown model falls back session model, then `meta.defaultModel`, then null; the prompt shows ` · <effort>` only when the session effort is one the current model lists; the Effort row is hidden when the current model has no `efforts`; picking an effort keeps the menu open (`closeOnSelect={false}`), picking a model closes it; `default` clears the effort to null
- `model-selector.tsx:SessionHarnessSwitcher`: renders only when `meta.harnesses` lists more than one harness; disabled while a run is in progress or a switch is pending; an empty chat switches at once, a chat with messages first confirms with the history size (session context tokens, else text length / 4)
- `session-selector.tsx:SessionSelector`: rows name their harness only when more than one harness is available
- `session-selector.tsx:commitRename`: no rename when the trimmed draft is empty or unchanged
- `session-selector.tsx:select`: selecting the active id or an empty id does nothing

## Side Effects

- `actions.tsx:openExternal`, `copyConnect`: terminal extension rpc `launch` and `connectCommand`
- `actions.tsx:copyCommand`: writes the clipboard through `writeClipboardText`
- `model-selector.tsx:SessionModelPrompt`: `rpc.sessions.model` and `rpc.sessions.effort` mutations, each invalidates sessions and announces a failure
- `model-selector.tsx:SessionHarnessSwitcher`: `rpc.sessions.switchHarness` mutation, refetches the session's `meta.models`, `meta.commands` and `sessions.list`, re-hydrates the chat, announces `Switched to <name>.`, failures go to the notice surface
- `session-selector.tsx:SessionSelector`: `rpc.sessions.rename` mutation, `sessions.list` query, module-level `instanceSeq` counter

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
