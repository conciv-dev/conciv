# ui-kit-chat src

## Overview

Source root of `@conciv/ui-kit-chat`. `index.tsx` is the main entry (store, primitives, behaviors, styled components); `tools.tsx` is the `./tools` entry (tool primitives, tool cards, trace components, fixtures).

## Interface

- `index.tsx` - re-exports `ChatProvider`, `useChatContext`, `useThread`, `useComposer`, grouping and page-session helpers, every primitive (renamed `*Primitive` where a styled twin exists, for example `ThreadPrimitive`, `ComposerPrimitive`), draft behaviors, and styled `Thread`, `Composer`, `Markdown`, `Group`, `ModelSelector`, `Activity`, `NowLine`, `MorphLabel`, `VirtualLines`; also re-exports `chatBusy` from `@conciv/protocol/chat-busy`.
- `tools.tsx` - re-exports `toolStatus`, `defineToolkit`, `ToolCard`, `CardShell`, `ToolFallback`, `MetaToolCard`, `ToolCallCard`, `Permission`, `PermissionCard`, `Trace*` components, `Chip`, `CodeBlock`, `ElementPreview`, tool utilities and the `ELEMENT_CAPTURE_FIXTURE_*` samples. `CollapsibleCard` is not exported.
- Subdirectories: [store](./store/README.md), [behaviors](./behaviors/README.md), [primitives](./primitives/README.md), [styled](./styled/README.md), [tools](./tools/README.md), [theme](./theme/README.md).

## Invariants

- `vite.config.ts` builds exactly four entries from here: `index`, `tools`, `theme/fonts`, `theme/code-theme`; anything not re-exported from them is internal.

## Side Effects

- None: the entry files only re-export.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
