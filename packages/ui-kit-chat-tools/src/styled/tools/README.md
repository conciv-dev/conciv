# ui-kit-chat-tools/src/styled/tools

## Overview

Styled Solid tool cards. Each card wraps a primitive Root, renders a `ToolCard` with icon, title, meta and body, and exports a `ToolCardEntry` with the tool names it handles. `builtin-tool-cards.ts` collects every entry; `inline-tool.tsx` has single-row renderers; `search-matches.tsx` groups grep-style `file:line:snippet` output by file.

## Interface

- `builtinToolCards` (`builtin-tool-cards.ts`): [bashTool, applyPatchTool, discoveredApisTool, fileEditTool, fileReadTool, searchTool, todoTool, toolLookupTool]
- `BashCard` / `bashTool` (`bash-card.tsx`): names ['Bash']
- `ApplyPatchDiff` / `applyPatchTool` (`apply-patch-diff.tsx`): names ['apply_patch']
- `DiscoveredApisCard` / `discoveredApisTool` (`discovered-apis-card.tsx`): names ['catalog']
- `FileEditCard` / `fileEditTool` (`file-edit-card.tsx`): names ['Edit', 'MultiEdit', 'Write']
- `FileReadCard` / `fileReadTool` (`file-read-card.tsx`): names ['Read', 'open']
- `SearchCard` / `searchTool` (`search-card.tsx`): names ['Grep', 'Glob']
- `TodoCard` / `todoTool` (`todo-card.tsx`): names ['TodoWrite']
- `ToolLookupCard` / `toolLookupTool` (`tool-lookup-card.tsx`): names ['ToolSearch']
- `inlineTool(argKeys, format)` and presets `ReadInline`, `EditInline`, `WriteInline`, `GrepInline`, `GlobInline`, `WebSearchInline`, `WebFetchInline`, `ToolCallInline` (`inline-tool.tsx`)
- `parseSearchMatches` / `groupSearchMatches` / `SearchMatches` (`search-matches.tsx`)

## Invariants

- `hasEmbeddedBody`: true for every entry except `applyPatchTool`, which is true only when the patch has parsed blocks
- `BashCard` (`bash-card.tsx`): status forced to 'error' when `isError()`
- `DiscoveredApisCard` (`discovered-apis-card.tsx`): validates with zod `CatalogList`, then `CatalogDetail`, then falls back to `ShellCard`
- `SearchCard` (`search-card.tsx`): grouped results only when `useEmbeddedCard()` is true; raw text when no records parse

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat-tools && pnpm test`
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck && pnpm lint`
