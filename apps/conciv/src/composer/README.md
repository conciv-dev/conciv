# composer

## Overview

Composer toolbar: element grab, new session, compact and terminal launch actions, a per-session model selector, a session combobox, and a typed rpc client for the terminal extension.

## Interface

- `ComposerActions` (`actions.tsx`): grab element, new session, compact, `LaunchMenu`
- `LaunchMenu` (`launch-menu.tsx`): `Open in <harness>`, `Copy command`, or a retry item when failed
- `useModelMenu(onClose)`, `SessionModelPrompt({sessionId, menu})` (`model-selector.tsx`): the model popover machine (`usePopover` from ui-kit-system, so the pane can open it for `/model`; `onClose` runs whenever it closes) and the composer trigger (model name, effort bars and level, chevron) that renders it through `Popover.RootProvider` (`lazyMount`, `unmountOnExit`): a `Listbox` of the first group's models (name and description, check on the selected one), each later group as a `Collapsible` section with its own `Listbox`, and below a separator an `Effort` section: a `SegmentGroup` of the current model's `efforts` in order (`xhigh` reads `High+`) and a fixed-height note for the chosen level
- `SessionSelector` (`session-selector.tsx`): session combobox (`pill` | `bar`) with Today/Yesterday/Earlier groups, search, rename, new session
- `terminalRpc`, `TerminalRpc` (`terminal-rpc.ts`): `makeExtRpcClient<TerminalRouter>(resolveApiBase(), 'terminal')`

## Invariants

- `actions.tsx:ComposerActions`: `LaunchMenu` renders only while meta is loading or `meta.data.harness.canLaunch` is true; the grab button is disabled when `grab.grabbable()` is false
- `actions.tsx:openExternal`: tries `terminal.launch`; on `ok: false` falls back to `terminal.connectCommand` and copies the command
- `actions.tsx:launchFailure`: error code `NO_CONNECT` maps to `<harness> can’t be opened in a terminal.`
- `model-selector.tsx:SessionModelPrompt`: shown model falls back session model, then `meta.defaultModel`, then null; the trigger shows the effort only when the session effort is one the current model lists; the Effort section is hidden when the current model has no `efforts`; picking an effort keeps the popover open, picking a model (click or Enter, even the current one) closes it; a null effort leaves no segment checked and the note reads the model default
- `session-selector.tsx:commitRename`: no rename when the trimmed draft is empty or unchanged
- `session-selector.tsx:select`: selecting the active id or an empty id does nothing

## Side Effects

- `actions.tsx:openExternal`, `copyConnect`: terminal extension rpc `launch` and `connectCommand`
- `actions.tsx:copyCommand`: writes the clipboard through `writeClipboardText`
- `model-selector.tsx:SessionModelPrompt`: `rpc.sessions.model` and `rpc.sessions.effort` mutations, each invalidates sessions and announces a failure
- `session-selector.tsx:SessionSelector`: `rpc.sessions.rename` mutation, `sessions.list` query, module-level `instanceSeq` counter

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
